const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CronManager } = require('../../src/main/cron-manager');
const { CronLogStore } = require('../../src/main/cron-log-store');

class FakeAgentManager extends EventEmitter {
  constructor() {
    super();
    this.running = true;
  }
}

describe('CronManager (observer + disk watcher)', () => {
  let tempDir;
  let mainWindow;
  let sent;
  let idSequence;
  let agent;
  let logStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cron-manager-'));
    sent = [];
    idSequence = 0;
    mainWindow = {
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
    };
    agent = new FakeAgentManager();
    logStore = new CronLogStore({
      baseDir: path.join(tempDir, 'logs'),
      getMaxBytes: () => 1024 * 1024,
      createId: () => `run-${++idSequence}`,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeManager(extra = {}) {
    return new CronManager(agent, mainWindow, {
      cronDir: tempDir,
      logStore,
      agentLogPath: path.join(tempDir, 'agent.log'),
      pollIntervalMs: 50, // fast for tests
      ...extra,
    });
  }

  function writeJobs(jobs) {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'jobs.json'),
      JSON.stringify({ jobs, updated_at: new Date().toISOString() }, null, 2),
    );
  }

  function writeOutputFile(jobId, ts, content) {
    const dir = path.join(tempDir, 'output', jobId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${ts.replace(/[:.]/g, '-')}.md`;
    fs.writeFileSync(path.join(dir, filename), content);
    return path.join(dir, filename);
  }

  test('triggerJob only mutates jobs.json — no subprocess', async () => {
    const job = {
      id: 'job-1',
      name: '测试任务',
      prompt: '执行测试',
      skills: [], skill: null,
      schedule: { kind: 'interval', minutes: 5, display: 'every 5m' },
      schedule_display: 'every 5m',
      repeat: { times: null, completed: 0 },
      enabled: true, state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_run_at: null, last_status: null, last_error: null,
    };
    writeJobs([job]);

    const m = makeManager();
    // Spy that any spawn would have been called — we use agentManager here as
    // a sentinel; in the new architecture, triggerJob doesn't even touch it.
    const sendSpy = [];
    agent.sendMessage = (...args) => { sendSpy.push(args); return { success: true }; };

    const result = await m.triggerJob('job-1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(sendSpy.length, 0, 'agent.sendMessage must not be called');
    // triggerJob doesn't pre-allocate a runId; the watcher creates the real
    // audit run when the gateway's last_run_at change is observed.
    assert.strictEqual(result.runId, null);
    assert.match(result.note, /Gateway/);

    const jobs = JSON.parse(fs.readFileSync(path.join(tempDir, 'jobs.json'), 'utf-8')).jobs;
    const updated = jobs[0];
    assert.ok(updated.next_run_at, 'next_run_at should be set');
    assert.ok(new Date(updated.next_run_at) <= new Date(), 'next_run_at should be in the past (due now)');
  });

  test('watcher detects new run when jobs.json last_run_at changes', async () => {
    writeJobs([]);
    const m = makeManager();
    await m.start();
    try {
      // After the gateway runs the job, it would update last_run_at. Simulate
      // that by writing jobs.json with a new last_run_at.
      const job = {
        id: 'job-2', name: 'J2', prompt: 'p',
        skills: [], skill: null,
        schedule: { kind: 'interval', minutes: 1, display: 'every 1m' },
        schedule_display: 'every 1m',
        repeat: { times: null, completed: 0 },
        enabled: true, state: 'scheduled',
        created_at: new Date().toISOString(),
        next_run_at: null, last_run_at: null, last_status: null, last_error: null,
      };
      writeJobs([job]);
      // Wait for the polling cycle to pick it up (no last_run_at, so no event yet)
      await new Promise((r) => setTimeout(r, 80));
      const beforeCount = logStore.listRuns({}).runs.length;
      assert.strictEqual(beforeCount, 0);

      // Simulate gateway having just run it
      const after = { ...job, last_run_at: new Date().toISOString(), last_status: 'ok' };
      writeJobs([after]);
      await new Promise((r) => setTimeout(r, 80));
      const runs = logStore.listRuns({}).runs;
      assert.strictEqual(runs.length, 1, 'a run_start should have been recorded');
      const detail = logStore.getRun(runs[0].runId);
      const types = detail.events.map((e) => e.type);
      assert.ok(types.includes('run_start'));
    } finally {
      await m.stop();
    }
  });

  test('start seeds existing last_run_at without creating phantom active run', async () => {
    const job = {
      id: 'job-existing', name: 'Existing', prompt: 'p',
      skills: [], skill: null,
      schedule: { kind: 'interval', minutes: 1, display: 'every 1m' },
      schedule_display: 'every 1m',
      repeat: { times: null, completed: 0 },
      enabled: true, state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: null,
      last_run_at: '2026-06-16T07:03:02.878Z',
      last_status: 'ok',
      last_error: null,
    };
    writeJobs([job]);

    const m = makeManager();
    await m.start();
    try {
      await new Promise((r) => setTimeout(r, 120));
      assert.deepStrictEqual(logStore.listRuns({}).runs, []);
      assert.strictEqual(m._lastSeenRunAt.get('job-existing'), job.last_run_at);
    } finally {
      await m.stop();
    }
  });

  test('watcher emits policy_applied event after each new run_start', async () => {
    writeJobs([]);
    const m = makeManager();
    await m.start();
    try {
      const job = {
        id: 'job-policy', name: 'Policy Test', prompt: 'p',
        skills: [], skill: null,
        schedule: { kind: 'interval', minutes: 1, display: 'every 1m' },
        schedule_display: 'every 1m',
        repeat: { times: null, completed: 0 },
        enabled: true, state: 'scheduled',
        created_at: new Date().toISOString(),
        next_run_at: null, last_run_at: null, last_status: null, last_error: null,
        autoAuthorize: 'denylist',
      };
      writeJobs([job]);
      await new Promise((r) => setTimeout(r, 80));
      const after = { ...job, last_run_at: new Date().toISOString(), last_status: 'ok' };
      writeJobs([after]);
      await new Promise((r) => setTimeout(r, 80));
      const runs = logStore.listRuns({}).runs;
      assert.strictEqual(runs.length, 1);
      const detail = logStore.getRun(runs[0].runId);
      const policyEvent = detail.events.find((e) => e.type === 'policy_applied');
      assert.ok(policyEvent, 'policy_applied event should be emitted');
      assert.strictEqual(policyEvent.policy, 'denylist_auto_authorize');
      assert.strictEqual(policyEvent.mode, 'denylist');
      assert.strictEqual(policyEvent.hardline_protected, true);
      assert.ok(typeof policyEvent.rules_loaded === 'number', 'rules_loaded is a number');
      // run_start must come before policy_applied (declaration follows start)
      const startIdx = detail.events.findIndex((e) => e.type === 'run_start');
      const policyIdx = detail.events.findIndex((e) => e.type === 'policy_applied');
      assert.ok(startIdx < policyIdx, 'run_start should precede policy_applied');
    } finally {
      await m.stop();
    }
  });

  test('watcher emits run_end with .md content when a new output file appears', async () => {
    writeJobs([]);
    const m = makeManager();
    await m.start();
    try {
      const job = {
        id: 'job-3', name: 'J3', prompt: 'p',
        skills: [], skill: null,
        schedule: { kind: 'interval', minutes: 1, display: 'every 1m' },
        schedule_display: 'every 1m',
        repeat: { times: null, completed: 0 },
        enabled: true, state: 'scheduled',
        created_at: new Date().toISOString(),
        next_run_at: null,
        last_run_at: null, last_status: null, last_error: null,
      };
      writeJobs([job]);
      await new Promise((r) => setTimeout(r, 80));
      writeJobs([{ ...job, last_run_at: new Date().toISOString(), last_status: 'ok' }]);
      // Wait for run_start to be emitted (no .md yet)
      await new Promise((r) => setTimeout(r, 80));
      const runsAfterStart = logStore.listRuns({}).runs;
      assert.strictEqual(runsAfterStart.length, 1, 'run_start should be recorded');

      // Now simulate the gateway writing the .md
      writeOutputFile('job-3', new Date().toISOString(), '# Done\n\nResult: 42\n');
      await new Promise((r) => setTimeout(r, 80));
      const finalRuns = logStore.listRuns({}).runs;
      assert.strictEqual(finalRuns.length, 1);
      const detail = logStore.getRun(finalRuns[0].runId);
      const runEnd = detail.events.find((e) => e.type === 'run_end');
      assert.ok(runEnd, 'run_end should be recorded');
      assert.strictEqual(detail.events.filter((e) => e.type === 'run_end').length, 1);
      assert.match(runEnd.output, /Result: 42/);
      const agentOutputs = detail.events.filter((e) => e.type === 'agent_output');
      assert.ok(agentOutputs.length > 0, 'agent_output events should be appended for streamed .md lines');
    } finally {
      await m.stop();
    }
  });

  test('new last_run_at while prior run is open creates a separate audit run', async () => {
    writeJobs([]);
    const m = makeManager();
    await m.start();
    try {
      const job = {
        id: 'job-overlap', name: 'Overlap', prompt: 'p',
        skills: [], skill: null,
        schedule: { kind: 'interval', minutes: 1, display: 'every 1m' },
        schedule_display: 'every 1m',
        repeat: { times: null, completed: 0 },
        enabled: true, state: 'scheduled',
        created_at: new Date().toISOString(),
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
      };
      writeJobs([job]);
      await new Promise((r) => setTimeout(r, 80));
      writeJobs([{ ...job, last_run_at: '2026-06-17T05:28:10.255Z', last_status: 'ok' }]);
      await new Promise((r) => setTimeout(r, 80));
      writeJobs([{ ...job, last_run_at: '2026-06-17T05:34:14.979Z', last_status: 'ok' }]);
      await new Promise((r) => setTimeout(r, 120));

      const runs = logStore.listRuns({}).runs;
      assert.strictEqual(runs.length, 2);
      const details = runs.map((run) => logStore.getRun(run.runId));
      assert.ok(details.some((detail) => detail.summary.status === 'interrupted'));
      assert.ok(details.some((detail) => detail.summary.status === 'running'));
      for (const detail of details) {
        assert.strictEqual(
          detail.events.filter((event) => event.type === 'run_start').length,
          1,
          'each audit file should contain one run_start',
        );
        if (detail.summary.status === 'interrupted') {
          assert.strictEqual(detail.events.filter((event) => event.type === 'run_end').length, 1);
        }
      }
    } finally {
      await m.stop();
    }
  });


  test('watcher tails agent.log for [cron_<jobId>_*] lines', async () => {
    const job = {
      id: 'job-4', name: 'J4', prompt: 'p',
      skills: [], skill: null,
      schedule: { kind: 'interval', minutes: 1, display: 'every 1m' },
      schedule_display: 'every 1m',
      repeat: { times: null, completed: 0 },
      enabled: true, state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: null,
      last_run_at: null, last_status: null, last_error: null,
    };
    writeJobs([job]);
    // Pre-create agent.log empty so the watcher has a file to tail
    fs.writeFileSync(path.join(tempDir, 'agent.log'), '');

    const m = makeManager();
    await m.start();
    try {
      writeJobs([{ ...job, last_run_at: new Date().toISOString(), last_status: 'ok' }]);
      // Wait for the watcher to register the new run_start
      await new Promise((r) => setTimeout(r, 100));
      // Now append a cron-related line and an unrelated line
      fs.appendFileSync(
        path.join(tempDir, 'agent.log'),
        [
          '2026-06-15 16:00:00,001 INFO [cron_job-4_20260615_160000] agent.conversation_loop: API call #1',
          '2026-06-15 16:00:00,999 INFO [cron_job-4_20260615_160000] tools.terminal_tool: tool terminal completed',
          '2026-06-15 16:00:01,000 INFO [cron_some-other-job_20260615_160000] agent.conversation_loop: unrelated',
        ].join('\n') + '\n',
      );
      await new Promise((r) => setTimeout(r, 150));
      const runs = logStore.listRuns({}).runs;
      assert.ok(runs.length >= 1, 'watcher should have at least one run for job-4');
      const detail = logStore.getRun(runs[0].runId);
      const types = detail.events.map((e) => e.type);
      // We expect at least one agent_output (for the API call line) and one
      // console event (for the tool line, since it starts with "tools.")
      assert.ok(types.includes('agent_output') || types.includes('console'),
        `expected streamed events; got ${JSON.stringify(types)}`);
    } finally {
      await m.stop();
    }
  });

  test('reconcileStaleActiveRuns finalizes .active files older than threshold', () => {
    // Pre-create a stale .active file with a run_start event
    const logsDir = path.join(tempDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const staleName = '2026-06-15T07-00-00-000Z_run-stale.jsonl.active';
    const stalePath = path.join(logsDir, staleName);
    const runStart = {
      timestamp: '2026-06-15T07:00:00.000Z',
      type: 'run_start', runId: 'run-stale',
      jobId: 'job-stale', jobName: 'Stale', prompt: 'p',
    };
    fs.writeFileSync(stalePath, JSON.stringify(runStart) + '\n');
    // Set mtime to 31 minutes ago
    const oldMtime = new Date(Date.now() - 31 * 60_000);
    fs.utimesSync(stalePath, oldMtime, oldMtime);

    const m = makeManager({ staleRunMs: 30 * 60_000 });
    m._reconcileStaleActiveRuns();

    // The .active should have been finalized to .jsonl with a run_end
    const renamedPath = stalePath.replace(/\.jsonl\.active$/, '.jsonl');
    assert.ok(fs.existsSync(renamedPath), 'stale .active should be renamed to .jsonl');
    const events = fs.readFileSync(renamedPath, 'utf8')
      .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    const runEnd = events.find((e) => e.type === 'run_end');
    assert.ok(runEnd);
    assert.strictEqual(runEnd.status, 'interrupted');
    assert.match(runEnd.error, /app restarted/);
  });

  test('start/stop toggle watcher without touching subprocess state', async () => {
    const m = makeManager();
    await m.start();
    assert.strictEqual(m.isRunning, true);
    assert.ok(m._pollTimer, 'start should register a poll timer');
    await m.stop();
    assert.strictEqual(m.isRunning, false);
    assert.strictEqual(m._pollTimer, null);
  });

  test('persists validated log limits and applies them to storage usage', () => {
    let config = { cronLogMaxMb: 100 };
    const configStore = {
      get: () => ({ ...config }),
      save: (updates) => { config = { ...config, ...updates }; return { ...config }; },
    };
    const unlimitedStore = new CronLogStore({
      baseDir: path.join(tempDir, 'logs-unlimited'),
      getMaxBytes: () => 100 * 1024 * 1024,
    });
    const m = new CronManager(agent, mainWindow, {
      cronDir: tempDir,
      logStore: unlimitedStore,
      configStore,
      logger: { error() {} },
    });
    assert.strictEqual(m.getLogSettings().maxMb, 100);
    assert.strictEqual(m.getLogSettings().maxBytes, 100 * 1024 * 1024);
    const updated = m.updateLogSettings('250');
    assert.strictEqual(updated.maxMb, 250);
    assert.strictEqual(config.cronLogMaxMb, 250);
    assert.throws(() => m.updateLogSettings(5), /10.*10240/);
  });
});
