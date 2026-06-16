const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CronManager } = require('../../src/main/cron-manager');

class FakeAgentManager extends EventEmitter {
  constructor() { super(); this.running = true; }
}

function makeManager(cronDir) {
  const sent = [];
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
  };
  return { m: new CronManager(new FakeAgentManager(), mainWindow, {
    cronDir,
    agentLogPath: path.join(cronDir, 'agent.log'),
    pollIntervalMs: 50,
  }), sent };
}

function readJobs(cronDir) {
  return JSON.parse(fs.readFileSync(path.join(cronDir, 'jobs.json'), 'utf-8')).jobs;
}

describe('CronManager.parseCronScheduleInput', () => {
  let m;
  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-sched-parse-'));
    m = makeManager(tmp).m;
  });
  afterEach(() => { /* tmp cleaned by parent describe if needed */ });

  test('"every 10m" → interval { kind, minutes: 10, display }', () => {
    const out = m.parseCronScheduleInput('every 10m');
    assert.deepStrictEqual(out, {
      kind: 'interval', minutes: 10, display: 'every 10m',
    });
  });

  test('"every 2h" → 120 minutes', () => {
    const out = m.parseCronScheduleInput('every 2h');
    assert.strictEqual(out.kind, 'interval');
    assert.strictEqual(out.minutes, 120);
    assert.strictEqual(out.display, 'every 120m');
  });

  test('"1d" → one-shot, kind:once, run_at = now + 1d', () => {
    const out = m.parseCronScheduleInput('1d');
    assert.strictEqual(out.kind, 'once');
    const expected = Date.now() + 24 * 60 * 60_000;
    const got = new Date(out.run_at).getTime();
    assert.ok(Math.abs(got - expected) < 5_000, `expected run_at near ${expected}, got ${got}`);
    assert.strictEqual(out.display, 'once in 1d');
  });

  test('"0 9 * * *" → cron { kind:cron, expr, display }', () => {
    const out = m.parseCronScheduleInput('0 9 * * *');
    assert.deepStrictEqual(out, {
      kind: 'cron', expr: '0 9 * * *', display: '0 9 * * *',
    });
  });

  test('5-field cron with mixed operators (1,15 * * * *)', () => {
    const out = m.parseCronScheduleInput('1,15 * * * *');
    assert.strictEqual(out.kind, 'cron');
    assert.strictEqual(out.expr, '1,15 * * * *');
  });

  test('"30m" → one-shot, kind:once', () => {
    const out = m.parseCronScheduleInput('30m');
    assert.strictEqual(out.kind, 'once');
    const expected = Date.now() + 30 * 60_000;
    const got = new Date(out.run_at).getTime();
    assert.ok(Math.abs(got - expected) < 5_000);
  });

  test('ISO-like timestamp "2026-06-16T15:30" → once { run_at, display }', () => {
    const out = m.parseCronScheduleInput('2026-06-16T15:30');
    assert.strictEqual(out.kind, 'once');
    const dt = new Date(out.run_at);
    assert.strictEqual(dt.getFullYear(), 2026);
    assert.strictEqual(dt.getMonth(), 5);
    assert.strictEqual(dt.getDate(), 16);
    // display uses local YYYY-MM-DD HH:mm
    assert.match(out.display, /^once at 2026-06-16 15:30$/);
  });

  test('passes through already-structured schedule with display fill-in', () => {
    const out = m.parseCronScheduleInput({ kind: 'interval', minutes: 5 });
    assert.strictEqual(out.kind, 'interval');
    assert.strictEqual(out.minutes, 5);
    assert.strictEqual(out.display, 'every 5m');
  });

  test('trims whitespace and accepts uppercase "EVERY 10M"', () => {
    const out = m.parseCronScheduleInput('  EVERY 10M  ');
    assert.strictEqual(out.kind, 'interval');
    assert.strictEqual(out.minutes, 10);
    assert.strictEqual(out.display, 'every 10m');
  });

  test('rejects garbage input', () => {
    assert.throws(() => m.parseCronScheduleInput('not a schedule'));
    assert.throws(() => m.parseCronScheduleInput(''));
    assert.throws(() => m.parseCronScheduleInput(null));
    assert.throws(() => m.parseCronScheduleInput(undefined));
  });
});

describe('CronManager.normalizeCronSchedule', () => {
  let m;
  beforeEach(() => { m = makeManager(fs.mkdtempSync(path.join(os.tmpdir(), 'cron-norm-'))).m; });

  test('keeps structured schedule and adds display', () => {
    const out = m.normalizeCronSchedule({ kind: 'interval', minutes: 5 });
    assert.deepStrictEqual(out, { kind: 'interval', minutes: 5, display: 'every 5m' });
  });

  test('parses string legacy schedule', () => {
    const out = m.normalizeCronSchedule('every 30m');
    assert.deepStrictEqual(out, { kind: 'interval', minutes: 30, display: 'every 30m' });
  });

  test('rejects interval with non-positive minutes', () => {
    assert.throws(() => m.normalizeCronSchedule({ kind: 'interval', minutes: 0 }));
    assert.throws(() => m.normalizeCronSchedule({ kind: 'interval', minutes: -5 }));
  });

  test('rejects cron with empty expr', () => {
    assert.throws(() => m.normalizeCronSchedule({ kind: 'cron', expr: '' }));
  });
});

describe('CronManager._computeNextRun (structured schedule)', () => {
  let m;
  beforeEach(() => { m = makeManager(fs.mkdtempSync(path.join(os.tmpdir(), 'cron-next-'))).m; });

  test('interval with no last_run_at → now + minutes', () => {
    const out = m._computeNextRun({ kind: 'interval', minutes: 10 }, null);
    const expected = Date.now() + 10 * 60_000;
    assert.ok(Math.abs(new Date(out).getTime() - expected) < 5_000, `got ${out}`);
  });

  test('interval with last_run_at → last + minutes', () => {
    const last = new Date('2026-06-16T10:00:00Z').toISOString();
    const out = m._computeNextRun({ kind: 'interval', minutes: 30 }, last);
    const expected = new Date('2026-06-16T10:30:00Z').getTime();
    assert.strictEqual(new Date(out).getTime(), expected);
  });

  test('once → returns run_at verbatim', () => {
    const runAt = '2026-06-16T15:30:00.000Z';
    const out = m._computeNextRun({ kind: 'once', run_at: runAt }, null);
    assert.strictEqual(out, runAt);
  });

  test('cron → returns null (gateway rehydrates via hermes-agent)', () => {
    const out = m._computeNextRun({ kind: 'cron', expr: '0 9 * * *' }, null);
    assert.strictEqual(out, null);
  });

  test('legacy string interval "every 10m" works', () => {
    const out = m._computeNextRun('every 10m', null);
    const expected = Date.now() + 10 * 60_000;
    assert.ok(Math.abs(new Date(out).getTime() - expected) < 5_000);
  });
});

describe('CronManager persistence: structured schedule on disk', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-persist-'));
  });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

  test('createJob stores structured schedule and next_run_at', async () => {
    const { m } = makeManager(tmp);
    const job = await m.createJob({
      name: 't1', prompt: 'p',
      schedule: 'every 10m',
    });
    assert.strictEqual(job.schedule.kind, 'interval');
    assert.strictEqual(job.schedule.minutes, 10);
    assert.strictEqual(job.schedule_display, 'every 10m');
    assert.ok(job.next_run_at, 'next_run_at should be set');
    const onDisk = readJobs(tmp);
    assert.strictEqual(onDisk.length, 1);
    assert.strictEqual(typeof onDisk[0].schedule, 'object');
    assert.strictEqual(onDisk[0].schedule.kind, 'interval');
    assert.strictEqual(onDisk[0].schedule.minutes, 10);
  });

  test('createJob("0 9 * * *") stores cron schedule; next_run_at is null', async () => {
    const { m } = makeManager(tmp);
    const job = await m.createJob({
      prompt: 'p', schedule: '0 9 * * *',
    });
    assert.strictEqual(job.schedule.kind, 'cron');
    assert.strictEqual(job.schedule.expr, '0 9 * * *');
    assert.strictEqual(job.next_run_at, null);
    const onDisk = readJobs(tmp);
    assert.strictEqual(onDisk[0].schedule.kind, 'cron');
  });

  test('createJob with structured object pass-through', async () => {
    const { m } = makeManager(tmp);
    const job = await m.createJob({
      prompt: 'p',
      schedule: { kind: 'once', run_at: '2026-06-16T15:30:00.000Z' },
    });
    assert.strictEqual(job.schedule.kind, 'once');
    assert.strictEqual(job.next_run_at, '2026-06-16T15:30:00.000Z');
  });

  test('updateJob with new schedule string → structured + next_run_at updated', async () => {
    const { m } = makeManager(tmp);
    const created = await m.createJob({ prompt: 'p', schedule: 'every 10m' });
    const updated = await m.updateJob(created.id, { schedule: 'every 30m' });
    assert.strictEqual(updated.schedule.kind, 'interval');
    assert.strictEqual(updated.schedule.minutes, 30);
    const expected = Date.now() + 30 * 60_000;
    assert.ok(Math.abs(new Date(updated.next_run_at).getTime() - expected) < 5_000);
  });

  test('updateJob without schedule leaves schedule and next_run_at untouched', async () => {
    const { m } = makeManager(tmp);
    const created = await m.createJob({ prompt: 'p', schedule: 'every 10m' });
    const originalNext = created.next_run_at;
    const updated = await m.updateJob(created.id, { name: 'renamed' });
    assert.strictEqual(updated.name, 'renamed');
    assert.strictEqual(updated.schedule.kind, 'interval');
    assert.strictEqual(updated.schedule.minutes, 10);
    assert.strictEqual(updated.next_run_at, originalNext, 'next_run_at must not change when schedule is not touched');
  });

  test('updateJob on a legacy string schedule normalizes on save', async () => {
    // Simulate a job that pre-existed in jobs.json with a raw string schedule
    const initial = [{
      id: 'legacy-1', name: 'legacy', prompt: 'p',
      skills: [], skill: null,
      schedule: 'every 15m',  // LEGACY string
      schedule_display: 'every 15m',
      repeat: { times: null, completed: 0 },
      enabled: true, state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: null, last_run_at: null, last_status: null, last_error: null,
    }];
    fs.writeFileSync(path.join(tmp, 'jobs.json'), JSON.stringify({ jobs: initial, updated_at: new Date().toISOString() }, null, 2));
    const { m } = makeManager(tmp);

    // Touch only `name` — should still rewrite the schedule on disk in
    // structured form so the gateway stops seeing a raw string.
    const updated = await m.updateJob('legacy-1', { name: 'renamed' });
    assert.strictEqual(updated.name, 'renamed');
    assert.strictEqual(typeof updated.schedule, 'object', 'schedule should be normalized to object on save');
    assert.strictEqual(updated.schedule.kind, 'interval');
    assert.strictEqual(updated.schedule.minutes, 15);
    assert.ok(updated.next_run_at, 'next_run_at should be recomputed');
  });

  test('triggerJob does not change schedule (only bumps next_run_at to now)', async () => {
    const { m } = makeManager(tmp);
    const created = await m.createJob({ prompt: 'p', schedule: 'every 10m' });
    const result = await m.triggerJob(created.id);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job.schedule.kind, 'interval');
    assert.strictEqual(result.job.schedule.minutes, 10);
    assert.ok(new Date(result.job.next_run_at) <= new Date(), 'next_run_at should be in the past (due now)');
  });

  test('listJobs returns _parsedSchedule for legacy string jobs (read-only)', async () => {
    const initial = [{
      id: 'legacy-2', name: 'legacy', prompt: 'p',
      skills: [], skill: null,
      schedule: 'every 45m',
      schedule_display: 'every 45m',
      repeat: { times: null, completed: 0 },
      enabled: true, state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: null, last_run_at: null, last_status: null, last_error: null,
    }];
    fs.writeFileSync(path.join(tmp, 'jobs.json'), JSON.stringify({ jobs: initial, updated_at: new Date().toISOString() }, null, 2));
    const { m } = makeManager(tmp);
    const jobs = await m.listJobs();
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].schedule, 'every 45m', 'original schedule string should still be present');
    assert.ok(jobs[0]._parsedSchedule, '_parsedSchedule should be set');
    assert.strictEqual(jobs[0]._parsedSchedule.kind, 'interval');
    assert.strictEqual(jobs[0]._parsedSchedule.minutes, 45);
  });
});
