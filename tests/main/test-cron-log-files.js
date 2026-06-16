const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CronLogFiles,
  DEFAULT_READ_LIMIT_BYTES,
  TAIL_FILE_THRESHOLD_BYTES,
  HIGH_CONF_FILTER_LIMIT_BYTES,
  INFERRED_FILTER_LIMIT_BYTES,
  DESCRIPTOR_TTL_MS,
  _internal,
} = require('../../src/main/cron-log-files');

function writeRunAudit(logsDir, runId, startedAt, events, { active = false } = {}) {
  const filePrefix = `${startedAt.replace(/[:.]/g, '-')}_${runId}`;
  const ext = active ? '.jsonl.active' : '.jsonl';
  const full = path.join(logsDir, `${filePrefix}${ext}`);
  fs.writeFileSync(full, events.map((e) => JSON.stringify({ timestamp: startedAt, ...e })).join('\n') + '\n');
  return full;
}

function writeOutputMd(outputDir, jobId, name, content) {
  const dir = path.join(outputDir, jobId);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, name);
  fs.writeFileSync(full, content);
  return full;
}

function writeAgentLog(logsDir, lines) {
  const full = path.join(logsDir, 'agent.log');
  fs.writeFileSync(full, lines.join('\n') + '\n');
  return full;
}

function writeErrorsLog(logsDir, lines) {
  const full = path.join(logsDir, 'errors.log');
  fs.writeFileSync(full, lines.join('\n') + '\n');
  return full;
}

function writeGatewayLog(logsDir, lines) {
  const full = path.join(logsDir, 'gateway.log');
  fs.writeFileSync(full, lines.join('\n') + '\n');
  return full;
}

describe('CronLogFiles (file aggregation for run detail view)', () => {
  let tempDir;
  let logsDir;
  let outputDir;
  let globalLogsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cron-log-files-'));
    logsDir = path.join(tempDir, 'cron-logs');
    outputDir = path.join(tempDir, 'cron-output');
    globalLogsDir = path.join(tempDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(globalLogsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeAggregator(options = {}) {
    return new CronLogFiles({
      logsDir,
      outputDir,
      globalLogsDir,
      now: options.now || (() => Date.parse('2026-06-16T07:03:30.000Z')),
    });
  }

  test('rejects unknown runId and returns empty file list', () => {
    const agg = makeAggregator();
    const result = agg.listFiles('not-a-real-run');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.files, []);
    assert.strictEqual(result.reason, 'no-audit');
  });

  test('lists audit + output + agent session matches for a finished run', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-abc';
    const runId = '1781593386700-qm7tykpd';
    const auditPath = writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: '日报', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: 'done', timestamp: finishedAt },
    ]);
    // output 在时间窗口内
    const outputName = '2026-06-16T07-03-04-963Z.md';
    const outputPath = writeOutputMd(outputDir, jobId, outputName, '# output\n');
    // 给 output 一个 startedAt 之前 + 4 秒的 mtime（在窗口内）
    const outputMtime = new Date(startedAt).getTime() + 1500;
    fs.utimesSync(outputPath, outputMtime / 1000, outputMtime / 1000);
    // agent.log 一行 session 标记匹配、一行无关
    const sessionTag = `[cron_${jobId}_20260616_070300]`;
    writeAgentLog(globalLogsDir, [
      `2026-06-16 07:03:07,100 INFO ${sessionTag} working...`,
      `2026-06-16 07:03:08,200 INFO other noise`,
    ]);

    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    assert.strictEqual(result.success, true);
    const kinds = result.files.map((f) => f.kind);
    assert.deepStrictEqual(kinds, ['audit-jsonl', 'output-md', 'agent-log-filtered']);
    // audit 是 exact
    assert.strictEqual(result.files[0].id, `audit:${runId}`);
    assert.strictEqual(result.files[0].confidence, 'exact');
    assert.strictEqual(result.files[0].path, auditPath);
    // output 是 time-near
    assert.strictEqual(result.files[1].kind, 'output-md');
    assert.strictEqual(result.files[1].confidence, 'time-near');
    assert.strictEqual(result.files[1].path, outputPath);
    // agent 是 session
    assert.strictEqual(result.files[2].kind, 'agent-log-filtered');
    assert.strictEqual(result.files[2].confidence, 'session');
    assert.match(result.files[2].filterDescription, /session/i);
  });

  test('does not include inferred time-window files unless includeInferred=true', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-timewindow';
    const runId = 'tw-run-1234';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    // agent.log 一行时间在窗口内但没有 session 标记
    writeAgentLog(globalLogsDir, [
      `2026-06-16 07:03:08,100 INFO some unrelated entry that matches window`,
    ]);
    const agg = makeAggregator();

    // 默认不含
    const def = agg.listFiles(runId);
    assert.strictEqual(def.success, true);
    assert.deepStrictEqual(def.files.map((f) => f.kind), ['audit-jsonl']);

    // includeInferred=true 才出现
    const inf = agg.listFiles(runId, { includeInferred: true });
    const infKinds = inf.files.map((f) => f.kind);
    assert.ok(infKinds.includes('inferred-agent'));
    const inferred = inf.files.find((f) => f.kind === 'inferred-agent');
    assert.strictEqual(inferred.confidence, 'time-window');
    assert.match(inferred.filterDescription, /时间窗口/);
  });

  test('no session/explicit match ⇒ no agent/errors/gateway default tab', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-unrelated';
    const runId = 'unrelated-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    // agent.log 完全无关
    writeAgentLog(globalLogsDir, [
      `2026-06-16 09:00:00,000 INFO not related at all`,
    ]);
    writeErrorsLog(globalLogsDir, [
      `2026-06-16 09:00:00,000 INFO also not related`,
    ]);
    writeGatewayLog(globalLogsDir, [
      `2026-06-16 09:00:00,000 INFO gateway boot`,
    ]);
    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    assert.deepStrictEqual(
      result.files.map((f) => f.kind),
      ['audit-jsonl'],
    );
  });

  test('output .md is associated by jobId + time-near window', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-output-near';
    const runId = 'output-near-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    // output 在 startedAt - 1s（窗口内）
    const outputPath = writeOutputMd(outputDir, jobId, '2026-06-16T07-03-05-700Z.md', 'body');
    const mtime = new Date(startedAt).getTime() - 1000;
    fs.utimesSync(outputPath, mtime / 1000, mtime / 1000);
    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    const outputFile = result.files.find((f) => f.kind === 'output-md');
    assert.ok(outputFile, 'should associate output file in time window');
    assert.strictEqual(outputFile.confidence, 'time-near');
  });

  test('output file outside window is not associated', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-output-far';
    const runId = 'output-far-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    // output 比窗口早 5 分钟
    const outputPath = writeOutputMd(outputDir, jobId, 'old.md', 'old');
    const mtime = new Date(startedAt).getTime() - 5 * 60 * 1000;
    fs.utimesSync(outputPath, mtime / 1000, mtime / 1000);
    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    assert.ok(!result.files.some((f) => f.kind === 'output-md'));
  });

  test('readFile refuses unknown fileId with a clear error', () => {
    const agg = makeAggregator();
    const r = agg.readFile('audit:not-real');
    assert.strictEqual(r.success, false);
    assert.match(r.error, /非法|过期/);
  });

  test('readFile returns truncated content for large physical files (> 1MB)', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-large';
    const runId = 'large-run';
    const big = 'x'.repeat(TAIL_FILE_THRESHOLD_BYTES + 100);
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: big, timestamp: finishedAt },
    ]);
    const agg = makeAggregator();
    const list = agg.listFiles(runId);
    const auditFile = list.files.find((f) => f.kind === 'audit-jsonl');
    const r = agg.readFile(auditFile.id, { limitBytes: 100 * 1024 });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.truncatedBefore, true);
    assert.strictEqual(r.sizeBytes, 100 * 1024);
  });

  test('readFile respects limitBytes offset for physical files', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-offset';
    const runId = 'offset-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    const agg = makeAggregator();
    const list = agg.listFiles(runId);
    const auditFile = list.files.find((f) => f.kind === 'audit-jsonl');
    const r1 = agg.readFile(auditFile.id, { offset: 0, limitBytes: 32 });
    const r2 = agg.readFile(auditFile.id, { offset: r1.nextOffset, limitBytes: 32 });
    assert.strictEqual(r1.sizeBytes, 32);
    assert.strictEqual(r1.truncatedBefore, false);
    assert.ok(r2.sizeBytes > 0);
    assert.notStrictEqual(r1.content, r2.content);
  });

  test('readFile returns virtual file content (filtered agent log)', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-virtual';
    const runId = 'virtual-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    writeAgentLog(globalLogsDir, [
      `2026-06-16 07:03:07,100 INFO [cron_${jobId}_20260616_070300] working`,
      `2026-06-16 07:03:08,100 INFO noise`,
    ]);
    const agg = makeAggregator();
    const list = agg.listFiles(runId);
    const agentFile = list.files.find((f) => f.kind === 'agent-log-filtered');
    assert.ok(agentFile, 'should produce agent-log-filtered descriptor');
    const r = agg.readFile(agentFile.id);
    assert.strictEqual(r.success, true);
    assert.match(r.content, /cron_job-virtual_20260616_070300/);
    assert.doesNotMatch(r.content, /\bnoise\b/);
  });

  test('virtual file content caps to limitBytes (default 256 KB)', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-vcap';
    const runId = 'vcap-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    // 写 1.5 MB 的 session-tagged 行
    const bigLines = [];
    for (let i = 0; i < 3000; i++) {
      bigLines.push(`2026-06-16 07:03:07,100 INFO [cron_${jobId}_20260616_070300] line ${i} ${'x'.repeat(500)}`);
    }
    writeAgentLog(globalLogsDir, bigLines);
    const agg = makeAggregator();
    const list = agg.listFiles(runId);
    const agentFile = list.files.find((f) => f.kind === 'agent-log-filtered');
    const r = agg.readFile(agentFile.id, {});
    // 默认 256 KB
    assert.ok(r.sizeBytes <= DEFAULT_READ_LIMIT_BYTES + 100, `sizeBytes=${r.sizeBytes} should be capped`);
  });

  test('descriptor cache TTL — entries expire after DESCRIPTOR_TTL_MS', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-ttl';
    const runId = 'ttl-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    let nowMs = Date.parse('2026-06-16T07:03:30.000Z');
    const agg = makeAggregator({ now: () => nowMs });
    const list = agg.listFiles(runId);
    const auditFile = list.files.find((f) => f.kind === 'audit-jsonl');
    assert.strictEqual(agg.readFile(auditFile.id).success, true);

    // 推进到 TTL 之后，但不要重新调用 listFiles（那会刷新 createdAtMs）。
    nowMs += DESCRIPTOR_TTL_MS + 1000;
    const expired = agg.readFile(auditFile.id);
    assert.strictEqual(expired.success, false);
    assert.match(expired.error, /过期/);
  });

  test('fileId from listFiles cannot be hijacked to read arbitrary paths', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-sec';
    const runId = 'sec-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    const agg = makeAggregator();
    const list = agg.listFiles(runId);
    const auditFile = list.files.find((f) => f.kind === 'audit-jsonl');
    // 尝试伪造一个 audit:xxx 让它指向别的文件
    const forged = 'audit:../../etc/passwd';
    const r = agg.readFile(forged);
    assert.strictEqual(r.success, false);
  });

  test('active run gets an active flag and time-window logic uses current time', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const jobId = 'job-active';
    const runId = 'active-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
    ], { active: true });
    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    const audit = result.files.find((f) => f.kind === 'audit-jsonl');
    assert.strictEqual(audit.active, true);
  });

  test('gateway.log filtered by explicit match (jobId in line)', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const finishedAt = '2026-06-16T07:03:09.300Z';
    const jobId = 'job-gw';
    const runId = 'gw-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
      { type: 'run_end', runId, status: 'success', output: '', timestamp: finishedAt },
    ]);
    writeGatewayLog(globalLogsDir, [
      `2026-06-16 07:03:07,100 INFO dispatching cron_${jobId} request`,
      `2026-06-16 07:03:08,200 INFO unrelated gateway noise`,
    ]);
    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    const gw = result.files.find((f) => f.kind === 'gateway-log-filtered');
    assert.ok(gw, 'should produce gateway-log-filtered descriptor');
    assert.strictEqual(gw.confidence, 'explicit');
    const r = agg.readFile(gw.id);
    assert.match(r.content, /cron_job-gw/);
    assert.doesNotMatch(r.content, /unrelated gateway/);
  });

  test('output .md mtime in last_run_at ±30s for active run → time-near fallback', () => {
    const startedAt = '2026-06-16T07:03:06.700Z';
    const jobId = 'job-active-out';
    const runId = 'active-out-run';
    writeRunAudit(logsDir, runId, startedAt, [
      { type: 'run_start', runId, jobId, jobName: 'x', prompt: 'p' },
    ], { active: true });
    // output 文件 mtime 比 startedAt 早 25 秒 —— 在 ±30s 内，但不在 [-10, +15min] 窗口内
    const outputPath = writeOutputMd(outputDir, jobId, 'fallback.md', 'fallback body');
    const mtime = new Date(startedAt).getTime() - 25 * 1000;
    fs.utimesSync(outputPath, mtime / 1000, mtime / 1000);
    const agg = makeAggregator();
    const result = agg.listFiles(runId);
    const out = result.files.find((f) => f.kind === 'output-md');
    assert.ok(out, 'should still associate by last_run_at ±30s fallback');
    assert.strictEqual(out.confidence, 'time-near');
  });
});