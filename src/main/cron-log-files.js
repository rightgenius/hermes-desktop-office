// cron-log-files.js
// 聚合「一次 cron run」相关的多个日志文件，输出给前端做文件视图。
//
// 数据源：
//   - 审计 JSONL：~/.hermes/cron/logs/*.jsonl(.active)  (exact)
//   - 最终输出： ~/.hermes/cron/output/<jobId>/*.md    (time-near)
//   - agent.log：~/.hermes/logs/agent.log[.1..5]      (session / explicit / time-window)
//   - errors.log：~/.hermes/logs/errors.log[.1..5]     (session / explicit / time-window)
//   - gateway.log：~/.hermes/logs/gateway.log          (explicit / time-window)
//
// 置信度分层（参考 docs/cron-log-viewer-spec.md）：
//   exact      — 审计 JSONL，按 runId 精确匹配
//   time-near  — output .md，在 run 时间窗口内
//   session    — agent/errors 日志含 [cron_<jobId>_YYYYMMDD_HHMMSS] session 标记
//   explicit   — gateway 日志含 jobId / cron_<jobId> / 关联 output 路径 / session 标记
//   time-window— 全局日志落在 run 时间窗口内（默认不返回，需 includeInferred: true）
//
// 安全约束：
//   - 不接受任意前端路径读取。fileId 必须由本模块生成并落入 descriptorCache。
//   - descriptorCache TTL 10 分钟，过期或不存在视为非法。
//   - 全局日志只返回过滤后的虚拟内容；不返回整文件。
//   - 默认每次最多 256 KB；>1 MB 默认 tail；高置信度虚拟文件最多 2 MB；
//     time-window 推断虚拟文件最多 512 KB。

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// --------------------------------------------------------------------------
// 常量
// --------------------------------------------------------------------------

const DEFAULT_READ_LIMIT_BYTES = 256 * 1024;          // 256 KB
const TAIL_FILE_THRESHOLD_BYTES = 1 * 1024 * 1024;    // 1 MB
const HIGH_CONF_FILTER_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MB
const INFERRED_FILTER_LIMIT_BYTES = 512 * 1024;       // 512 KB
const DESCRIPTOR_TTL_MS = 10 * 60 * 1000;             // 10 min

const SESSION_MARKER_RE = /\[(cron_([A-Za-z0-9_-]+)_\d{8}_\d{6})\]/g;
const ACTIVE_TIMESTAMP_RE = /\.jsonl\.active$/;
const TIME_WINDOW_PRE_PAD_MS = 10 * 1000;
const TIME_WINDOW_POST_PAD_MS = 10 * 1000;
const ACTIVE_WINDOW_POST_MS = 15 * 60 * 1000;
const OUTPUT_TIME_NEAR_MS = 30 * 1000;

// 文件 kind 排序：tab 显示顺序
const KIND_ORDER = [
  'audit-jsonl',
  'output-md',
  'agent-log-filtered',
  'error-log-filtered',
  'gateway-log-filtered',
  'inferred-agent',
  'inferred-error',
  'inferred-gateway',
];

const GLOBAL_LOG_NAMES = {
  agent: ['agent.log', 'agent.log.1', 'agent.log.2', 'agent.log.3', 'agent.log.4', 'agent.log.5'],
  errors: ['errors.log', 'errors.log.1', 'errors.log.2', 'errors.log.3', 'errors.log.4', 'errors.log.5'],
  gateway: ['gateway.log'],
};

// --------------------------------------------------------------------------
// 工具函数
// --------------------------------------------------------------------------

function safeStat(filePath) {
  try { return fs.statSync(filePath); } catch { return null; }
}

function readJsonl(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

function parseTimestampMs(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function sessionRegexForJob(jobId) {
  return new RegExp(`\\[cron_${jobId}_\\d{8}_\\d{6}\\]`);
}

function listAuditFiles(logsDir) {
  let entries = [];
  try { entries = fs.readdirSync(logsDir); } catch { return []; }
  return entries
    .filter((n) => n.endsWith('.jsonl') || n.endsWith('.jsonl.active'))
    .map((n) => ({ name: n, path: path.join(logsDir, n) }))
    .filter((f) => safeStat(f.path));
}

function findAuditFileForRun(logsDir, runId) {
  if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) return null;
  for (const f of listAuditFiles(logsDir)) {
    if (f.name.endsWith(`_${runId}.jsonl`) || f.name.endsWith(`_${runId}.jsonl.active`)) {
      return f;
    }
  }
  return null;
}

function summarizeRun(auditFile) {
  const events = readJsonl(auditFile.path);
  const end = [...events].reverse().find((e) => e.type === 'run_end');
  const start = selectSummaryStartEvent(events, end);
  const isActive = ACTIVE_TIMESTAMP_RE.test(auditFile.name);
  return {
    runId: start.runId || null,
    jobId: start.jobId || null,
    jobName: start.jobName || null,
    startedAt: start.startedAt || start.timestamp || null,
    observedAt: start.timestamp || null,
    finishedAt: end?.timestamp || null,
    output: end?.output || '',
    status: end?.status || (isActive ? 'running' : 'interrupted'),
    active: isActive,
    events,
  };
}

function selectSummaryStartEvent(events, end) {
  const starts = events.filter((e) => e.type === 'run_start');
  if (starts.length === 0) return {};
  if (!end?.timestamp) return starts[starts.length - 1];
  const endMs = parseTimestampMs(end.timestamp);
  if (endMs == null) return starts[starts.length - 1];
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const startMs = parseTimestampMs(starts[i].timestamp || starts[i].startedAt);
    if (startMs == null || startMs <= endMs) return starts[i];
  }
  return starts[starts.length - 1];
}

// 时间窗口（毫秒）
function timeWindow(summary) {
  const startMs = parseTimestampMs(summary.startedAt);
  if (!startMs) return null;
  if (summary.active) {
    const postMs = Math.min(Date.now(), startMs + ACTIVE_WINDOW_POST_MS);
    return { fromMs: startMs - TIME_WINDOW_PRE_PAD_MS, toMs: postMs };
  }
  const endMs = parseTimestampMs(summary.finishedAt) || startMs;
  return {
    fromMs: startMs - TIME_WINDOW_PRE_PAD_MS,
    toMs: endMs + TIME_WINDOW_POST_PAD_MS,
  };
}

// --------------------------------------------------------------------------
// 全局日志过滤
// --------------------------------------------------------------------------

function listGlobalFiles(globalLogsDir, kind) {
  const names = GLOBAL_LOG_NAMES[kind] || [];
  const out = [];
  for (const n of names) {
    const full = path.join(globalLogsDir, n);
    const stat = safeStat(full);
    if (!stat) continue;
    out.push({ name: n, path: full, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return out;
}

// 返回 { content: string, matched: boolean }
function filterAgentOrError({ files, jobId, sessionTag, summary, window: win, limitBytes, allowInferred }) {
  const sessionRe = sessionRegexForJob(jobId);
  const lines = [];
  let totalBytes = 0;
  let matched = false;

  const wantSession = (line) => sessionRe.test(line);
  const wantExplicit = (line) => {
    // explicit：对 agent/errors 日志，如果包含 session tag 或者 current runId 都算
    // 注意：agent.log 大部分匹配都走 session；explicit 给一个稍宽的口（行里出现 jobId 字符串）
    if (!jobId) return false;
    return line.includes(jobId) || line.includes(`cron_${jobId}`);
  };
  const wantWindow = (line, tsMs) => {
    if (!win) return false;
    if (tsMs == null) return false;
    return tsMs >= win.fromMs && tsMs <= win.toMs;
  };

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f.path, 'utf8'); } catch { continue; }
    const fileLines = text.split(/\r?\n/);
    for (const line of fileLines) {
      if (!line) continue;
      const isSession = wantSession(line);
      const isExplicit = wantExplicit(line);
      let inWindow = false;
      if (!isSession && !isExplicit) {
        const m = line.match(LINE_TS_RE);
        const tsMs = m ? normalizeTs(m[1]) : null;
        inWindow = wantWindow(line, tsMs);
      }
      if (!isSession && !isExplicit && !(allowInferred && inWindow)) continue;
      const stamp = isSession ? 'session' : (isExplicit ? 'explicit' : 'time-window');
      const entry = `[${f.name}|${stamp}] ${line}\n`;
      const bytes = Buffer.byteLength(entry, 'utf8');
      if (totalBytes + bytes > limitBytes) {
        // 高置信度：保留尾部；time-window：始终保留尾部并截断
        // 这里简化：直接 break（已经是顺序处理，前面的更早）
        // 但我们想保留尾部，所以改为：先丢弃前面已收集的，重新从当前位置开始
        lines.length = 0;
        totalBytes = 0;
      }
      lines.push(entry);
      totalBytes += bytes;
      matched = true;
    }
  }
  return { content: lines.join(''), matched, totalBytes };
}

function filterGateway({ files, summary, jobId, outputPath, window: win, limitBytes, allowInferred }) {
  const lines = [];
  let totalBytes = 0;
  let matched = false;
  const alternatives = [jobId, jobId ? `cron_${jobId}` : null, outputPath || null].filter(Boolean);
  const explicitRe = alternatives.length > 0 ? new RegExp(`(${alternatives.map(escapeRegex).join('|')})`) : null;

  const wantExplicit = (line) => explicitRe ? explicitRe.test(line) : false;
  const wantSession = jobId ? sessionRegexForJob(jobId) : null;
  const wantWindow = (line, tsMs) => {
    if (!win) return false;
    if (tsMs == null) return false;
    return tsMs >= win.fromMs && tsMs <= win.toMs;
  };

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f.path, 'utf8'); } catch { continue; }
    const fileLines = text.split(/\r?\n/);
    for (const line of fileLines) {
      if (!line) continue;
      const isExplicit = wantExplicit(line);
      const isSession = wantSession ? wantSession.test(line) : false;
      let inWindow = false;
      if (!isExplicit && !isSession) {
        const m = line.match(LINE_TS_RE);
        const tsMs = m ? normalizeTs(m[1]) : null;
        inWindow = wantWindow(line, tsMs);
      }
      if (!isExplicit && !(allowInferred && inWindow)) continue;
      const stamp = isExplicit ? 'explicit' : 'time-window';
      const entry = `[${f.name}|${stamp}] ${line}\n`;
      const bytes = Buffer.byteLength(entry, 'utf8');
      if (totalBytes + bytes > limitBytes) {
        lines.length = 0;
        totalBytes = 0;
      }
      lines.push(entry);
      totalBytes += bytes;
      matched = true;
    }
  }
  return { content: lines.join(''), matched, totalBytes };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 行首时间戳：2026-06-15 16:14:31,728 或 2026-06-15T16:14:31.728Z（也支持带时区的变体）。
// normalizeTs 把任意形态转成 UTC 毫秒，无时缀则视为 UTC。
const LINE_TS_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)/;
function normalizeTs(raw) {
  if (!raw) return null;
  let s = raw.replace(' ', 'T').replace(',', '.');
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

// --------------------------------------------------------------------------
// output .md 关联
// --------------------------------------------------------------------------

function findOutputFiles({ outputDir, jobId, win, summary }) {
  if (!jobId) return [];
  const dir = path.join(outputDir, jobId);
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return []; }
  const candidates = [];
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    const stat = safeStat(full);
    if (!stat) continue;
    candidates.push({ name, path: full, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  // 1) 时间窗口内的文件 → confidence: time-near
  const inWindow = candidates.filter((c) => win && c.mtimeMs >= win.fromMs && c.mtimeMs <= win.toMs);
  if (inWindow.length > 0) {
    // 选 mtime 离 startedAt 最近的
    const startMs = parseTimestampMs(summary.startedAt) || 0;
    inWindow.sort((a, b) => Math.abs(a.mtimeMs - startMs) - Math.abs(b.mtimeMs - startMs));
    return [{ ...inWindow[0], confidence: 'time-near' }];
  }
  // 2) active run 没在窗口内 → 选 jobId 最新 mtime 在 last_run_at ± 30s 的
  const lastRunMs = parseTimestampMs(summary.startedAt) || 0;
  const near = candidates.filter((c) => Math.abs(c.mtimeMs - lastRunMs) <= OUTPUT_TIME_NEAR_MS);
  if (near.length > 0) {
    near.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return [{ ...near[0], confidence: 'time-near' }];
  }
  return [];
}

// --------------------------------------------------------------------------
// CronLogFiles —— 主类
// --------------------------------------------------------------------------

class CronLogFiles {
  /**
   * @param {object} options
   * @param {string} options.logsDir   - ~/.hermes/cron/logs
   * @param {string} options.outputDir - ~/.hermes/cron/output
   * @param {string} options.globalLogsDir - ~/.hermes/logs
   */
  constructor(options = {}) {
    if (!options.logsDir) throw new Error('CronLogFiles logsDir is required');
    if (!options.outputDir) throw new Error('CronLogFiles outputDir is required');
    if (!options.globalLogsDir) throw new Error('CronLogFiles globalLogsDir is required');
    this.logsDir = options.logsDir;
    this.outputDir = options.outputDir;
    this.globalLogsDir = options.globalLogsDir;
    this.now = options.now || (() => Date.now());
    // fileId -> { descriptor, createdAtMs }
    this._cache = new Map();
  }

  // ---- 公共 API ----

  /**
   * 列出与某个 run 相关的所有文件。
   * @param {string} runId
   * @param {object} options
   * @param {boolean} [options.includeInferred=false]
   * @returns {{ success: boolean, runId: string, files: Array }}
   */
  listFiles(runId, options = {}) {
    const includeInferred = Boolean(options.includeInferred);
    const audit = findAuditFileForRun(this.logsDir, runId);
    if (!audit) {
      return { success: true, runId, files: [], reason: 'no-audit' };
    }
    const summary = summarizeRun(audit);
    if (!summary.runId) {
      return { success: true, runId, files: [], reason: 'no-run-start' };
    }
    const win = timeWindow(summary);
    const files = [];

    // 1) 审计 JSONL — exact
    files.push(this._makeDescriptor({
      id: `audit:${runId}`,
      kind: 'audit-jsonl',
      label: '审计 JSONL',
      path: audit.path,
      confidence: 'exact',
      active: summary.active,
      mtimeMs: safeStat(audit.path)?.mtimeMs || 0,
      sizeBytes: safeStat(audit.path)?.size || 0,
      summary,
      win,
    }));

    // 2) output .md — time-near
    const outputFiles = findOutputFiles({
      outputDir: this.outputDir,
      jobId: summary.jobId,
      win,
      summary,
    });
    for (const o of outputFiles) {
      files.push(this._makeDescriptor({
        id: `output:${summary.jobId}:${o.name}`,
        kind: 'output-md',
        label: '最终输出',
        path: o.path,
        confidence: o.confidence,
        active: false,
        mtimeMs: o.mtimeMs,
        sizeBytes: o.size,
        summary,
        win,
      }));
    }

    // 3) agent / errors / gateway 全局日志 —— 高置信度优先
    const highConfidence = [];
    const inferred = [];

    // agent.log
    {
      const files2 = listGlobalFiles(this.globalLogsDir, 'agent');
      const r = filterAgentOrError({
        files: files2,
        jobId: summary.jobId,
        summary,
        window: win,
        limitBytes: HIGH_CONF_FILTER_LIMIT_BYTES,
        allowInferred: false,
      });
      if (r.matched) {
        highConfidence.push(this._makeVirtualDescriptor({
          id: `agent:${summary.jobId}:session`,
          kind: 'agent-log-filtered',
          label: 'Agent 日志',
          path: path.join(this.globalLogsDir, 'agent.log'),
          confidence: 'session',
          summary,
          win,
          content: r.content,
          filterDescription: '仅显示包含 [cron_<jobId>_YYYYMMDD_HHMMSS] session 标记的行',
          active: files2.some((f) => f.mtimeMs >= this.now() - 60 * 1000),
          mtimeMs: Math.max(0, ...files2.map((f) => f.mtimeMs)),
          sizeBytes: files2.reduce((s, f) => s + f.size, 0),
        }));
      } else if (includeInferred && win) {
        const r2 = filterAgentOrError({
          files: files2,
          jobId: summary.jobId,
          summary,
          window: win,
          limitBytes: INFERRED_FILTER_LIMIT_BYTES,
          allowInferred: true,
        });
        if (r2.matched) {
          inferred.push(this._makeVirtualDescriptor({
            id: `inferred-agent:${summary.jobId}`,
            kind: 'inferred-agent',
            label: 'Agent 日志 (推断)',
            path: path.join(this.globalLogsDir, 'agent.log'),
            confidence: 'time-window',
            summary,
            win,
            content: r2.content,
            filterDescription: '按时间窗口推断，可能包含无关日志',
            active: files2.some((f) => f.mtimeMs >= this.now() - 60 * 1000),
            mtimeMs: Math.max(0, ...files2.map((f) => f.mtimeMs)),
            sizeBytes: files2.reduce((s, f) => s + f.size, 0),
          }));
        }
      }
    }

    // errors.log
    {
      const files2 = listGlobalFiles(this.globalLogsDir, 'errors');
      const r = filterAgentOrError({
        files: files2,
        jobId: summary.jobId,
        summary,
        window: win,
        limitBytes: HIGH_CONF_FILTER_LIMIT_BYTES,
        allowInferred: false,
      });
      if (r.matched) {
        highConfidence.push(this._makeVirtualDescriptor({
          id: `error:${summary.jobId}:session`,
          kind: 'error-log-filtered',
          label: '错误日志',
          path: path.join(this.globalLogsDir, 'errors.log'),
          confidence: 'session',
          summary,
          win,
          content: r.content,
          filterDescription: '仅显示包含 [cron_<jobId>_YYYYMMDD_HHMMSS] session 标记的行',
          active: files2.some((f) => f.mtimeMs >= this.now() - 60 * 1000),
          mtimeMs: Math.max(0, ...files2.map((f) => f.mtimeMs)),
          sizeBytes: files2.reduce((s, f) => s + f.size, 0),
        }));
      } else if (includeInferred && win) {
        const r2 = filterAgentOrError({
          files: files2,
          jobId: summary.jobId,
          summary,
          window: win,
          limitBytes: INFERRED_FILTER_LIMIT_BYTES,
          allowInferred: true,
        });
        if (r2.matched) {
          inferred.push(this._makeVirtualDescriptor({
            id: `inferred-error:${summary.jobId}`,
            kind: 'inferred-error',
            label: '错误日志 (推断)',
            path: path.join(this.globalLogsDir, 'errors.log'),
            confidence: 'time-window',
            summary,
            win,
            content: r2.content,
            filterDescription: '按时间窗口推断，可能包含无关日志',
            active: files2.some((f) => f.mtimeMs >= this.now() - 60 * 1000),
            mtimeMs: Math.max(0, ...files2.map((f) => f.mtimeMs)),
            sizeBytes: files2.reduce((s, f) => s + f.size, 0),
          }));
        }
      }
    }

    // gateway.log
    {
      const files2 = listGlobalFiles(this.globalLogsDir, 'gateway');
      const outputPath = outputFiles[0]?.path || null;
      const r = filterGateway({
        files: files2,
        jobId: summary.jobId,
        outputPath,
        summary,
        window: win,
        limitBytes: HIGH_CONF_FILTER_LIMIT_BYTES,
        allowInferred: false,
      });
      if (r.matched) {
        highConfidence.push(this._makeVirtualDescriptor({
          id: `gateway:${summary.jobId}:explicit`,
          kind: 'gateway-log-filtered',
          label: 'Gateway 诊断',
          path: path.join(this.globalLogsDir, 'gateway.log'),
          confidence: 'explicit',
          summary,
          win,
          content: r.content,
          filterDescription: '仅显示明确包含当前 jobId / cron_<jobId> / 关联 output 路径的行',
          active: files2.some((f) => f.mtimeMs >= this.now() - 60 * 1000),
          mtimeMs: Math.max(0, ...files2.map((f) => f.mtimeMs)),
          sizeBytes: files2.reduce((s, f) => s + f.size, 0),
        }));
      } else if (includeInferred && win) {
        const r2 = filterGateway({
          files: files2,
          jobId: summary.jobId,
          outputPath,
          summary,
          window: win,
          limitBytes: INFERRED_FILTER_LIMIT_BYTES,
          allowInferred: true,
        });
        if (r2.matched) {
          inferred.push(this._makeVirtualDescriptor({
            id: `inferred-gateway:${summary.jobId}`,
            kind: 'inferred-gateway',
            label: 'Gateway 诊断 (推断)',
            path: path.join(this.globalLogsDir, 'gateway.log'),
            confidence: 'time-window',
            summary,
            win,
            content: r2.content,
            filterDescription: '按时间窗口推断，可能包含无关日志',
            active: files2.some((f) => f.mtimeMs >= this.now() - 60 * 1000),
            mtimeMs: Math.max(0, ...files2.map((f) => f.mtimeMs)),
            sizeBytes: files2.reduce((s, f) => s + f.size, 0),
          }));
        }
      }
    }

    // 排序：exact → time-near → 高置信度 → inferred
    const ordered = [...files, ...highConfidence, ...inferred];
    ordered.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

    // 缓存描述符
    const nowMs = this.now();
    this._gcCache(nowMs);
    for (const d of ordered) {
      // 仅在新条目上设置 createdAtMs；已存在的条目保留原始时间戳，
      // 这样 TTL 是「第一次被授权之后的有效期」，而不是「每次刷新都续命」。
      if (!this._cache.has(d.id)) {
        this._cache.set(d.id, { descriptor: d, createdAtMs: nowMs });
      }
    }

    return {
      success: true,
      runId,
      files: ordered.map(this._publicView),
    };
  }

  /**
   * 读取文件内容。
   * @param {string} fileId
   * @param {object} options
   * @param {number} [options.offset=0]
   * @param {number} [options.limitBytes=262144]
   * @param {boolean} [options.tail=false]
   * @returns {{ success, fileId, content, offset, nextOffset, sizeBytes, mtimeMs, truncatedBefore, truncatedAfter, active }}
   */
  readFile(fileId, options = {}) {
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const requestedLimit = Math.max(0, Math.floor(Number(options.limitBytes) || 0));
    const tail = Boolean(options.tail);
    const nowMs = this.now();
    const entry = this._cache.get(fileId);
    if (!entry) {
      return { success: false, error: 'fileId 非法或已过期' };
    }
    if (nowMs - entry.createdAtMs > DESCRIPTOR_TTL_MS) {
      this._cache.delete(fileId);
      return { success: false, error: 'fileId 非法或已过期' };
    }
    const d = entry.descriptor;
    // 虚拟文件
    if (d.virtual) {
      const fullText = d.content || '';
      const total = Buffer.byteLength(fullText, 'utf8');
      const limitBytes = requestedLimit > 0 ? requestedLimit : Math.min(total, DEFAULT_READ_LIMIT_BYTES);
      let slice;
      let truncatedBefore = false;
      let truncatedAfter = false;
      if (tail || total > TAIL_FILE_THRESHOLD_BYTES) {
        // 默认 tail 末尾 limitBytes
        const start = Math.max(0, total - limitBytes);
        slice = fullText.slice(start);
        truncatedBefore = start > 0;
      } else if (offset >= total) {
        slice = '';
      } else {
        slice = fullText.slice(offset, offset + limitBytes);
        truncatedBefore = offset > 0;
        truncatedAfter = offset + slice.length < total;
      }
      const sizeBytes = Buffer.byteLength(slice, 'utf8');
      return {
        success: true,
        fileId,
        content: slice,
        offset,
        nextOffset: offset + sizeBytes,
        sizeBytes,
        mtimeMs: d.mtimeMs || 0,
        truncatedBefore,
        truncatedAfter,
        active: d.active || false,
      };
    }
    // 物理文件
    if (!d.path) return { success: false, error: 'fileId 描述符无效' };
    const stat = safeStat(d.path);
    if (!stat) {
      return { success: false, error: '文件已不存在', fileId };
    }
    const total = stat.size;
    const limitBytes = requestedLimit > 0 ? requestedLimit : DEFAULT_READ_LIMIT_BYTES;
    let readStart = offset;
    let readEnd = Math.min(total, offset + limitBytes);
    let truncatedBefore = false;
    let truncatedAfter = false;
    if (tail || total > TAIL_FILE_THRESHOLD_BYTES) {
      readStart = Math.max(0, total - limitBytes);
      readEnd = total;
      truncatedBefore = readStart > 0;
    } else if (offset >= total) {
      return {
        success: true, fileId, content: '',
        offset, nextOffset: total, sizeBytes: 0, mtimeMs: stat.mtimeMs,
        truncatedBefore: false, truncatedAfter: false, active: false,
      };
    } else {
      truncatedBefore = offset > 0;
      truncatedAfter = readEnd < total;
    }
    const len = Math.max(0, readEnd - readStart);
    const fd = fs.openSync(d.path, 'r');
    let buf;
    try {
      buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, readStart);
    } finally {
      fs.closeSync(fd);
    }
    const content = buf.toString('utf8');
    return {
      success: true,
      fileId,
      content,
      offset: readStart,
      nextOffset: readStart + len,
      sizeBytes: len,
      mtimeMs: stat.mtimeMs,
      truncatedBefore,
      truncatedAfter,
      active: false,
    };
  }

  // ---- 内部 ----

  _makeDescriptor({ id, kind, label, path: filePath, confidence, active, mtimeMs, sizeBytes, summary, win }) {
    return {
      id, kind, label, path: filePath, confidence, active, mtimeMs, sizeBytes,
      virtual: false, summary, win,
    };
  }

  _makeVirtualDescriptor({ id, kind, label, path: filePath, confidence, active, mtimeMs, sizeBytes, summary, win, content, filterDescription }) {
    return {
      id, kind, label, path: filePath, confidence, active, mtimeMs, sizeBytes,
      virtual: true, summary, win, content, filterDescription,
    };
  }

  _publicView(d) {
    return {
      id: d.id,
      kind: d.kind,
      label: d.label,
      path: d.path,
      confidence: d.confidence,
      active: Boolean(d.active),
      mtimeMs: d.mtimeMs || 0,
      sizeBytes: d.sizeBytes || 0,
      ...(d.virtual ? { filterDescription: d.filterDescription } : {}),
    };
  }

  _gcCache(nowMs) {
    for (const [id, entry] of this._cache) {
      if (nowMs - entry.createdAtMs > DESCRIPTOR_TTL_MS) {
        this._cache.delete(id);
      }
    }
  }
}

module.exports = {
  CronLogFiles,
  DEFAULT_READ_LIMIT_BYTES,
  TAIL_FILE_THRESHOLD_BYTES,
  HIGH_CONF_FILTER_LIMIT_BYTES,
  INFERRED_FILTER_LIMIT_BYTES,
  DESCRIPTOR_TTL_MS,
  // 暴露给测试用
  _internal: {
    timeWindow,
    summarizeRun,
    findAuditFileForRun,
    findOutputFiles,
    selectSummaryStartEvent,
    listGlobalFiles,
    filterAgentOrError,
    filterGateway,
  },
};
