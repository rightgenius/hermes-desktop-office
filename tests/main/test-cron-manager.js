const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CronManager } = require('../../src/main/cron-manager');
const { CronLogStore } = require('../../src/main/cron-log-store');

class FakeAgentManager extends EventEmitter {
  constructor(runBehavior) {
    super();
    this.running = true;
    this.runBehavior = runBehavior;
  }

  sendMessage(sessionId, prompt, history) {
    return this.runBehavior({ manager: this, sessionId, prompt, history });
  }
}

describe('CronManager execution logging', () => {
  let tempDir;
  let sent;
  let mainWindow;
  let idSequence;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cron-manager-'));
    sent = [];
    idSequence = 0;
    mainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => sent.push({ channel, payload }),
      },
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeLogStore() {
    return new CronLogStore({
      baseDir: path.join(tempDir, 'logs'),
      getMaxBytes: () => 1024 * 1024,
      createId: () => `run-${++idSequence}`,
    });
  }

  test('records agent output, tool events, and console logs for a successful run', async () => {
    const agent = new FakeAgentManager(({ manager, sessionId }) => {
      queueMicrotask(() => {
        manager.emit('response', {
          event: 'chunk',
          data: '生成结果',
          sessionId,
          timestamp: '2026-06-15T01:00:01.000Z',
        });
        manager.emit('response', {
          event: 'tool_start',
          data: { tool_id: 'tool-1', name: 'terminal', args: { command: 'echo ok' } },
          sessionId,
          timestamp: '2026-06-15T01:00:02.000Z',
        });
        manager.emit('log', {
          level: 'info',
          message: 'terminal: ok',
          timestamp: '2026-06-15T01:00:03.000Z',
        });
        manager.emit('response', {
          event: 'tool_complete',
          data: { tool_id: 'tool-1', name: 'terminal', result: 'ok' },
          sessionId,
          timestamp: '2026-06-15T01:00:04.000Z',
        });
        manager.emit('response', {
          event: 'complete',
          data: '',
          sessionId,
          timestamp: '2026-06-15T01:00:05.000Z',
        });
      });
      return { success: true };
    });
    const logStore = makeLogStore();
    const manager = new CronManager(agent, mainWindow, {
      cronDir: tempDir,
      logStore,
      logger: { error() {} },
    });
    const job = await manager.createJob({
      name: '审计任务',
      prompt: '执行测试',
      schedule: null,
    });

    await manager._runJob(job);

    const runs = logStore.listRuns({});
    assert.strictEqual(runs.runs.length, 1);
    assert.strictEqual(runs.runs[0].status, 'success');
    const detail = logStore.getRun(runs.runs[0].runId);
    assert.ok(detail.events.some((event) => event.type === 'agent_output' && event.content === '生成结果'));
    assert.ok(detail.events.some((event) => event.type === 'tool_start' && event.name === 'terminal'));
    assert.ok(detail.events.some((event) => event.type === 'console' && event.message === 'terminal: ok'));
    assert.ok(detail.events.some((event) => event.type === 'tool_complete' && event.result === 'ok'));
    assert.strictEqual(detail.events.at(-1).output, '生成结果');
    assert.strictEqual(agent.listenerCount('response'), 0);
    assert.strictEqual(agent.listenerCount('log'), 0);
    assert.ok(sent.some(({ channel }) => channel === 'cron-log-updated'));

    const savedJob = (await manager.listJobs())[0];
    assert.strictEqual(savedJob.last_status, 'ok');
  });

  test('records failed dispatches and removes listeners', async () => {
    const agent = new FakeAgentManager(() => ({ success: false, error: 'bridge unavailable' }));
    const logStore = makeLogStore();
    const manager = new CronManager(agent, mainWindow, {
      cronDir: tempDir,
      logStore,
      logger: { error() {} },
    });
    const job = await manager.createJob({
      name: '失败任务',
      prompt: '执行失败测试',
      schedule: null,
    });

    await manager._runJob(job);

    const run = logStore.listRuns({}).runs[0];
    assert.strictEqual(run.status, 'error');
    assert.strictEqual(run.error, 'bridge unavailable');
    const detail = logStore.getRun(run.runId);
    assert.strictEqual(detail.events.at(-1).status, 'error');
    assert.strictEqual(agent.listenerCount('response'), 0);
    assert.strictEqual(agent.listenerCount('log'), 0);

    const savedJob = (await manager.listJobs())[0];
    assert.strictEqual(savedJob.last_status, 'error');
    assert.strictEqual(savedJob.last_error, 'bridge unavailable');
  });

  test('does not change a successful task result when audit log finalization fails', async () => {
    const agent = new FakeAgentManager(({ manager, sessionId }) => {
      queueMicrotask(() => {
        manager.emit('response', {
          event: 'complete',
          data: 'completed',
          sessionId,
          timestamp: '2026-06-15T01:00:05.000Z',
        });
      });
      return { success: true };
    });
    const logStore = {
      startRun: () => ({ runId: 'run-broken' }),
      appendEvent: () => true,
      finishRun: () => {
        throw new Error('disk full');
      },
    };
    const manager = new CronManager(agent, mainWindow, {
      cronDir: tempDir,
      logStore,
      logger: { error() {} },
    });
    const job = await manager.createJob({
      name: '日志失败任务',
      prompt: '任务本身成功',
      schedule: null,
    });

    await manager._runJob(job);

    const savedJob = (await manager.listJobs())[0];
    assert.strictEqual(savedJob.last_status, 'ok');
    assert.strictEqual(savedJob.last_error, null);
    assert.strictEqual(agent.listenerCount('response'), 0);
    assert.strictEqual(agent.listenerCount('log'), 0);
  });
});
