const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_MB = 100;
const MIN_MAX_MB = 10;
const MAX_MAX_MB = 10240;

function normalizeCronLogMaxMb(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_MAX_MB;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_MAX_MB || parsed > MAX_MAX_MB) {
    throw new Error(`定时任务日志上限必须是 ${MIN_MAX_MB} 到 ${MAX_MAX_MB} MB 之间的整数`);
  }
  return parsed;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

class CronLogStore {
  constructor(options = {}) {
    if (!options.baseDir) throw new Error('CronLogStore baseDir is required');
    this.baseDir = options.baseDir;
    this.getMaxBytes = options.getMaxBytes || (() => DEFAULT_MAX_MB * 1024 * 1024);
    this.now = options.now || (() => new Date());
    this.createId = options.createId || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    this.endReserveBytes = options.endReserveBytes || 2048;
    this._activeRuns = new Map();
  }

  _ensureDir() {
    fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
  }

  _maxBytes() {
    const value = Number(this.getMaxBytes());
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_MB * 1024 * 1024;
  }

  _files() {
    this._ensureDir();
    return fs.readdirSync(this.baseDir)
      .filter((name) => name.endsWith('.jsonl') || name.endsWith('.jsonl.active'))
      .map((name) => {
        const filePath = path.join(this.baseDir, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          path: filePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          active: name.endsWith('.active'),
        };
      });
  }

  _usageBytes() {
    return this._files().reduce((total, file) => total + file.size, 0);
  }

  getUsage() {
    return {
      usageBytes: this._usageBytes(),
      maxBytes: this._maxBytes(),
    };
  }

  enforceLimit() {
    this._removeOldestFinalized(0, 0);
    return this.getUsage();
  }

  _removeOldestFinalized(requiredBytes = 0, reserveBytes = 0) {
    const maxBytes = this._maxBytes();
    let files = this._files();
    let usageBytes = files.reduce((total, file) => total + file.size, 0);
    const finalized = files
      .filter((file) => !file.active)
      .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));

    while (usageBytes + requiredBytes + reserveBytes > maxBytes && finalized.length > 0) {
      const oldest = finalized.shift();
      fs.rmSync(oldest.path, { force: true });
      usageBytes -= oldest.size;
    }
    return usageBytes + requiredBytes + reserveBytes <= maxBytes;
  }

  _eventLine(event) {
    let json;
    try {
      json = JSON.stringify(event);
    } catch {
      json = JSON.stringify({
        timestamp: event.timestamp || this.now().toISOString(),
        type: event.type || 'unknown',
        message: '[无法序列化的日志事件]',
      });
    }
    return `${json}\n`;
  }

  _appendLine(filePath, line) {
    fs.appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600 });
  }

  startRun(job) {
    this._ensureDir();
    const runId = this.createId();
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
      throw new Error('Invalid cron run id');
    }
    const startedAt = this.now().toISOString();
    const filePrefix = `${startedAt.replace(/[:.]/g, '-')}_${runId}`;
    const activePath = path.join(this.baseDir, `${filePrefix}.jsonl.active`);
    const finalPath = path.join(this.baseDir, `${filePrefix}.jsonl`);
    const handle = {
      runId,
      jobId: job.id,
      activePath,
      finalPath,
      startedAt,
      truncated: false,
    };
    const startEvent = {
      timestamp: startedAt,
      type: 'run_start',
      runId,
      jobId: job.id,
      jobName: job.name || job.id,
      prompt: job.prompt || '',
      schedule: job.schedule_display || job.schedule || null,
      workdir: job.workdir || null,
    };
    const line = this._eventLine(startEvent);
    if (!this._removeOldestFinalized(byteLength(line), this.endReserveBytes)) {
      throw new Error('定时任务日志容量不足，无法创建执行记录');
    }
    this._appendLine(activePath, line);
    this._activeRuns.set(runId, handle);
    return handle;
  }

  _writeTruncationMarker(handle) {
    if (handle.truncated) return;
    handle.truncated = true;
    const line = this._eventLine({
      timestamp: this.now().toISOString(),
      type: 'log_truncated',
      level: 'warn',
      message: '日志已达到存储上限，后续执行输出未记录。',
    });
    if (this._removeOldestFinalized(byteLength(line), this.endReserveBytes)) {
      this._appendLine(handle.activePath, line);
    }
  }

  appendEvent(handle, event) {
    if (!handle || !this._activeRuns.has(handle.runId) || !fs.existsSync(handle.activePath)) {
      return false;
    }
    if (handle.truncated) return false;
    const line = this._eventLine({
      timestamp: event.timestamp || this.now().toISOString(),
      ...event,
    });
    if (!this._removeOldestFinalized(byteLength(line), this.endReserveBytes)) {
      this._writeTruncationMarker(handle);
      return false;
    }
    this._appendLine(handle.activePath, line);
    return true;
  }

  finishRun(handle, result = {}) {
    if (!handle || !this._activeRuns.has(handle.runId) || !fs.existsSync(handle.activePath)) {
      return null;
    }
    const finishedAt = this.now().toISOString();
    const baseEvent = {
      timestamp: finishedAt,
      type: 'run_end',
      status: result.status || 'success',
      error: result.error || null,
      output: result.output || '',
      durationMs: Math.max(0, new Date(finishedAt) - new Date(handle.startedAt)),
      truncated: handle.truncated,
    };
    let line = this._eventLine(baseEvent);
    if (!this._removeOldestFinalized(byteLength(line), 0)) {
      line = this._eventLine({
        ...baseEvent,
        output: baseEvent.output ? '[最终输出因日志容量限制被截断]' : '',
        outputTruncated: Boolean(baseEvent.output),
      });
    }
    if (!this._removeOldestFinalized(byteLength(line), 0)) {
      line = this._eventLine({
        timestamp: finishedAt,
        type: 'run_end',
        status: baseEvent.status,
        error: baseEvent.error ? '[错误信息因日志容量限制被截断]' : null,
        output: '',
        durationMs: baseEvent.durationMs,
        truncated: true,
      });
    }
    this._appendLine(handle.activePath, line);
    fs.renameSync(handle.activePath, handle.finalPath);
    this._activeRuns.delete(handle.runId);
    this._removeOldestFinalized(0, 0);
    return this.getRun(handle.runId);
  }

  _readEvents(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const events = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // Keep the remaining valid audit events readable.
      }
    }
    return events;
  }

  _summaryForFile(file) {
    const events = this._readEvents(file.path);
    const start = events.find((event) => event.type === 'run_start') || {};
    const end = [...events].reverse().find((event) => event.type === 'run_end');
    const isCurrent = start.runId && this._activeRuns.has(start.runId);
    const status = end?.status || (isCurrent ? 'running' : 'interrupted');
    return {
      runId: start.runId || null,
      jobId: start.jobId || null,
      jobName: start.jobName || start.jobId || '未知任务',
      startedAt: start.timestamp || new Date(file.mtimeMs).toISOString(),
      finishedAt: end?.timestamp || null,
      durationMs: end?.durationMs ?? null,
      status,
      error: end?.error || null,
      truncated: Boolean(end?.truncated || events.some((event) => event.type === 'log_truncated')),
      sizeBytes: file.size,
    };
  }

  listRuns(options = {}) {
    const limit = Math.max(1, Math.min(1000, Number(options.limit) || 100));
    const runs = this._files()
      .map((file) => this._summaryForFile(file))
      .filter((run) => run.runId && (!options.jobId || run.jobId === options.jobId))
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, limit);
    const usage = this.getUsage();
    return { runs, ...usage };
  }

  _findRunFile(runId) {
    if (!/^[A-Za-z0-9_-]+$/.test(runId || '')) {
      throw new Error('Invalid cron run id');
    }
    return this._files().find((file) => (
      file.name.endsWith(`_${runId}.jsonl`) ||
      file.name.endsWith(`_${runId}.jsonl.active`)
    ));
  }

  getRun(runId) {
    const file = this._findRunFile(runId);
    if (!file) return null;
    return {
      summary: this._summaryForFile(file),
      events: this._readEvents(file.path),
    };
  }

  clear() {
    const preserved = new Set(
      [...this._activeRuns.values()].map((handle) => path.resolve(handle.activePath))
    );
    let deleted = 0;
    for (const file of this._files()) {
      if (preserved.has(path.resolve(file.path))) continue;
      fs.rmSync(file.path, { force: true });
      deleted += 1;
    }
    return { deleted, ...this.getUsage() };
  }
}

module.exports = {
  CronLogStore,
  normalizeCronLogMaxMb,
  DEFAULT_CRON_LOG_MAX_MB: DEFAULT_MAX_MB,
};
