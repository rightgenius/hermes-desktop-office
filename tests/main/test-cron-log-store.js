const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CronLogStore, normalizeCronLogMaxMb } = require('../../src/main/cron-log-store');

describe('CronLogStore', () => {
  let tempDir;
  let clock;
  let sequence;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cron-logs-'));
    clock = Date.parse('2026-06-15T01:00:00.000Z');
    sequence = 0;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createStore(options = {}) {
    return new CronLogStore({
      baseDir: tempDir,
      getMaxBytes: () => options.maxBytes || 1024 * 1024,
      now: () => new Date(clock),
      createId: () => `run-${++sequence}`,
      endReserveBytes: options.endReserveBytes || 256,
    });
  }

  function startRunWithStartEvent(store, job) {
    const run = store.startRun(job);
    store.appendEvent(run, {
      timestamp: new Date(clock).toISOString(),
      type: 'run_start',
      runId: run.runId,
      jobId: job.id,
      jobName: job.name || job.id,
      prompt: job.prompt || '',
    });
    return run;
  }

  function finishRun(store, jobId, jobName, status = 'success') {
    const run = startRunWithStartEvent(store, { id: jobId, name: jobName, prompt: `prompt ${jobId}` });
    store.appendEvent(run, {
      type: 'console',
      level: 'info',
      message: `console ${jobId}`,
    });
    clock += 1500;
    store.finishRun(run, {
      status,
      error: status === 'error' ? 'failed' : null,
      output: `output ${jobId}`,
    });
    clock += 1000;
    return run;
  }

  test('streams a run, lists summaries, reads detail, and filters by job', () => {
    const store = createStore();
    const first = finishRun(store, 'job-1', '日报');
    finishRun(store, 'job-2', '周报', 'error');

    const all = store.listRuns({ limit: 20 });
    assert.strictEqual(all.runs.length, 2);
    assert.strictEqual(all.runs[0].jobId, 'job-2');
    assert.strictEqual(all.runs[0].status, 'error');
    assert.strictEqual(all.runs[0].error, 'failed');
    assert.ok(all.usageBytes > 0);
    assert.strictEqual(all.maxBytes, 1024 * 1024);

    const filtered = store.listRuns({ jobId: 'job-1' });
    assert.deepStrictEqual(filtered.runs.map((run) => run.jobId), ['job-1']);

    const detail = store.getRun(first.runId);
    assert.strictEqual(detail.summary.jobName, '日报');
    assert.deepStrictEqual(
      detail.events.map((event) => event.type),
      ['run_start', 'console', 'run_end']
    );
    assert.strictEqual(detail.events[2].output, 'output job-1');
  });

  test('shows orphaned active files as interrupted after restart', () => {
    const store = createStore();
    const run = startRunWithStartEvent(store, { id: 'job-1', name: '未完成任务', prompt: 'work' });
    store.appendEvent(run, { type: 'console', level: 'error', message: 'last line' });

    const restartedStore = createStore();
    const result = restartedStore.listRuns({});

    assert.strictEqual(result.runs.length, 1);
    assert.strictEqual(result.runs[0].status, 'interrupted');
    assert.strictEqual(restartedStore.getRun(run.runId).events[1].message, 'last line');
  });

  test('deletes the oldest finalized runs before exceeding the global limit', () => {
    const store = createStore({ maxBytes: 1500, endReserveBytes: 128 });
    const first = startRunWithStartEvent(store, { id: 'job-1', name: '旧任务', prompt: 'old' });
    store.appendEvent(first, { type: 'console', message: 'x'.repeat(420) });
    clock += 1000;
    store.finishRun(first, { status: 'success', output: 'old output' });

    clock += 1000;
    const second = startRunWithStartEvent(store, { id: 'job-2', name: '新任务', prompt: 'new' });
    store.appendEvent(second, { type: 'console', message: 'y'.repeat(420) });
    clock += 1000;
    store.finishRun(second, { status: 'success', output: 'new output' });

    const result = store.listRuns({});
    assert.deepStrictEqual(result.runs.map((run) => run.runId), [second.runId]);
    assert.ok(result.usageBytes <= 1500);
  });

  test('truncates an oversized active run and still records its final status', () => {
    const store = createStore({ maxBytes: 900, endReserveBytes: 240 });
    const run = startRunWithStartEvent(store, { id: 'job-1', name: '大日志', prompt: 'large' });

    const appended = store.appendEvent(run, {
      type: 'console',
      level: 'info',
      message: 'z'.repeat(2000),
    });
    clock += 1000;
    store.finishRun(run, { status: 'success', output: 'done' });

    assert.strictEqual(appended, false);
    const detail = store.getRun(run.runId);
    assert.ok(detail.events.some((event) => event.type === 'log_truncated'));
    assert.strictEqual(detail.events.at(-1).type, 'run_end');
    assert.strictEqual(detail.events.at(-1).status, 'success');
    assert.ok(store.listRuns({}).usageBytes <= 900);
  });

  test('clear removes completed and orphaned logs but preserves active handles', () => {
    const store = createStore();
    finishRun(store, 'job-complete', '完成任务');
    const orphan = startRunWithStartEvent(store, { id: 'job-orphan', name: '遗留任务', prompt: 'orphan' });

    const restartedStore = createStore();
    const active = startRunWithStartEvent(restartedStore, { id: 'job-active', name: '活动任务', prompt: 'active' });
    const result = restartedStore.clear();

    assert.strictEqual(result.deleted, 2);
    assert.deepStrictEqual(
      restartedStore.listRuns({}).runs.map((run) => run.runId),
      [active.runId]
    );
    restartedStore.finishRun(active, { status: 'success', output: '' });
    assert.ok(fs.existsSync(active.finalPath));
    assert.ok(!fs.existsSync(orphan.activePath));
  });
});

describe('normalizeCronLogMaxMb', () => {
  test('defaults to 100 MB and accepts integer values from 10 through 10240', () => {
    assert.strictEqual(normalizeCronLogMaxMb(undefined), 100);
    assert.strictEqual(normalizeCronLogMaxMb('250'), 250);
    assert.strictEqual(normalizeCronLogMaxMb(10), 10);
    assert.strictEqual(normalizeCronLogMaxMb(10240), 10240);
  });

  test('rejects non-numeric, fractional, and out-of-range values', () => {
    for (const value of ['abc', 9, 10.5, 10241]) {
      assert.throws(() => normalizeCronLogMaxMb(value), /10.*10240/);
    }
  });
});
