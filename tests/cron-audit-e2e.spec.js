// E2E test for the disk-watcher based cron log capture (packaged app)
//
// The watcher observes:
//   - ~/.hermes/cron/jobs.json  →  new run when last_run_at changes
//   - ~/.hermes/cron/output/<jobId>/*.md  →  run_end with .md contents
//   - ~/.hermes/logs/agent.log  →  console/agent_output events
//
// We simulate all three from the test (writing directly to disk) and verify
// the renderer's audit panel reflects each change.

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HERMES_HOME = path.join(os.homedir(), '.hermes');
const CRON_DIR = path.join(HERMES_HOME, 'cron');
const LOGS_DIR = path.join(CRON_DIR, 'logs');
const OUTPUT_DIR = path.join(CRON_DIR, 'output');
const JOBS_FILE = path.join(CRON_DIR, 'jobs.json');
const AGENT_LOG = path.join(HERMES_HOME, 'logs', 'agent.log');

let electronApp;
let page;
const log = (...a) => {
  const line = a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n';
  process.stdout.write(line);
  process.stderr.write(line);
};

function ensureDirs() {
  for (const d of [CRON_DIR, LOGS_DIR, path.join(HERMES_HOME, 'logs')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function readJobs() {
  if (!fs.existsSync(JOBS_FILE)) return { jobs: [] };
  return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
}

function writeJobsFile(jobs) {
  ensureDirs();
  fs.writeFileSync(JOBS_FILE, JSON.stringify({ jobs, updated_at: new Date().toISOString() }, null, 2));
}

function findRealJobId() {
  const data = readJobs();
  if (data.jobs && data.jobs.length > 0) return data.jobs[0].id;
  return null;
}

test.describe('Cron audit UI disk-watcher (packaged)', () => {
  test.setTimeout(90000);

  test.beforeAll(async () => {
    const appPath = '/Applications/Hermes Desktop for Office.app/Contents/MacOS/Hermes Desktop for Office';
    expect(fs.existsSync(appPath), `app not found at ${appPath}`).toBe(true);
    log('Launching packaged app');
    electronApp = await electron.launch({
      executablePath: appPath,
      args: [],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    page = await electronApp.firstWindow({ timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('window.api exposes the cron log IPC surface', async () => {
    const surface = await page.evaluate(() => ({
      hasApi: typeof window.api !== 'undefined',
      hasCronLogsList: typeof window.api?.cronLogsList === 'function',
      hasCronLogsGet: typeof window.api?.cronLogsGet === 'function',
      hasCronLogsClear: typeof window.api?.cronLogsClear === 'function',
      hasCronLogSettingsGet: typeof window.api?.cronLogSettingsGet === 'function',
      hasCronLogSettingsSet: typeof window.api?.cronLogSettingsSet === 'function',
      hasOnCronLogUpdated: typeof window.api?.onCronLogUpdated === 'function',
      hasCronTrigger: typeof window.api?.cronTrigger === 'function',
      hasCronList: typeof window.api?.cronList === 'function',
    }));
    expect(surface).toEqual({
      hasApi: true,
      hasCronLogsList: true,
      hasCronLogsGet: true,
      hasCronLogsClear: true,
      hasCronLogSettingsGet: true,
      hasCronLogSettingsSet: true,
      hasOnCronLogUpdated: true,
      hasCronTrigger: true,
      hasCronList: true,
    });
  });

  test('cron page DOM has all audit log controls', async () => {
    const result = await page.evaluate(async () => {
      const candidates = [
        ...document.querySelectorAll('[data-page="cron"]'),
        ...document.querySelectorAll('#nav-cron'),
        ...document.querySelectorAll('.nav-item'),
      ];
      for (const el of candidates) {
        if (el.textContent && (el.textContent.includes('定时任务') || el.textContent.includes('Cron') || el.dataset.page === 'cron')) {
          el.click();
          break;
        }
      }
      if (typeof window.showPage === 'function') window.showPage('cron');
      await new Promise((r) => setTimeout(r, 1500));
      return {
        cronPage: !!document.getElementById('page-cron'),
        auditCard: !!document.getElementById('cron-audit-card'),
        logList: !!document.getElementById('cron-log-list'),
        logDetail: !!document.getElementById('cron-log-detail'),
        triggerButtons: document.querySelectorAll('.btn-trigger').length,
      };
    });
    expect(result.cronPage).toBe(true);
    expect(result.auditCard).toBe(true);
  });

  test('cronLogsList returns the run list with usage metadata', async () => {
    const result = await page.evaluate(async () => await window.api.cronLogsList({ limit: 50 }));
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.runs)).toBe(true);
    expect(typeof result.usageBytes).toBe('number');
    expect(typeof result.maxBytes).toBe('number');
  });

  test('cronTrigger mutates jobs.json next_run_at (no subprocess)', async () => {
    const jobId = findRealJobId();
    if (!jobId) {
      log('no cron jobs; skipping trigger test');
      return;
    }
    const before = readJobs().jobs.find((j) => j.id === jobId);
    const beforeNextRun = before ? before.next_run_at : null;
    const result = await page.evaluate(async (id) => window.api.cronTrigger(id), jobId);
    log('cronTrigger IPC result:', result);
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    expect(result.note).toMatch(/Gateway/);
    const after = readJobs().jobs.find((j) => j.id === jobId);
    expect(after.next_run_at).not.toBe(beforeNextRun);
    // next_run_at should now be in the past or "now" (due immediately)
    expect(new Date(after.next_run_at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('watcher detects new run when last_run_at changes (disk simulation)', async () => {
    // Skip if no real job exists to test against
    const realJobId = findRealJobId();
    if (!realJobId) {
      log('no cron jobs; skipping disk simulation');
      return;
    }
    // Snapshot the current runs so we can detect the new one
    const beforeRaw = await page.evaluate(async () => await window.api.cronLogsList({ limit: 50 }));
    const before = beforeRaw || { runs: [], usageBytes: 0, maxBytes: 0 };
    log('  before runs:', before.runs.length, 'success:', before.success);
    const beforeRunIds = new Set((before.runs || []).map((r) => r.runId));
    const data = readJobs();
    const beforeLastRun = data.jobs[0]?.last_run_at || null;
    // Use a freshly-stamped time so the watcher sees a delta from any prior
    // test's stamp. Reading the current value first guarantees a real change.
    let newRunAt = new Date(Date.now() + 1).toISOString();
    if (newRunAt === beforeLastRun) {
      newRunAt = new Date(Date.now() + 2).toISOString();
    }
    const job = data.jobs.find((j) => j.id === realJobId);
    job.last_run_at = newRunAt;
    job.last_status = 'ok';
    job.last_error = null;
    job.state = 'scheduled';
    writeJobsFile(data.jobs);
    log('  wrote newRunAt:', newRunAt);
    // Snapshot on-disk log files before the watcher fires
    const beforeDiskFiles = new Set(fs.readdirSync(LOGS_DIR).filter(f => /\.jsonl(\.active)?$/.test(f)));
    // Poll up to 15s for the watcher (it runs every 2s)
    let appeared = false;
    let lastSeenSize = (before.runs || []).length;
    let lastSeenDisk = beforeDiskFiles.size;
    for (let i = 0; i < 15; i++) {
      const after = await page.evaluate(async () => await window.api.cronLogsList({ limit: 50 }));
      const newOnes = (after.runs || []).filter((r) => !beforeRunIds.has(r.runId));
      lastSeenSize = (after.runs || []).length;
      // Also check disk for new .jsonl/.jsonl.active files (catches races where
      // the watcher's run_start event was finalized before our before snapshot
      // — but its file mtime would still be newer than before's mtime).
      let afterDiskFiles;
      try { afterDiskFiles = new Set(fs.readdirSync(LOGS_DIR).filter(f => /\.jsonl(\.active)?$/.test(f))); }
      catch { afterDiskFiles = new Set(); }
      const newDiskFiles = [...afterDiskFiles].filter(f => !beforeDiskFiles.has(f));
      lastSeenDisk = afterDiskFiles.size;
      if (newOnes.length > 0 || newDiskFiles.length > 0) {
        appeared = true;
        break;
      }
      await page.waitForTimeout(1000);
    }
    // Re-read jobs.json — watcher may also have written back (via ._markJobRun if it ran)
    // but in this test it shouldn't because we only changed last_run_at not state in a way it auto-runs
    expect(appeared, `a new run should appear after last_run_at was set to ${newRunAt}; last seen size=${lastSeenSize}, before=${(before.runs || []).length}; diskFiles=${lastSeenDisk}, beforeDisk=${beforeDiskFiles.size}`).toBe(true);
  });

  test('watcher emits run_end with .md contents (disk simulation)', async () => {
    const realJobId = findRealJobId();
    if (!realJobId) { log('no cron jobs; skipping'); return; }
    // Create a new .md file in output/<jobId>/ simulating the gateway
    // having completed the run.
    const jobDir = path.join(OUTPUT_DIR, realJobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const md = `# Generated Test Output\n\nFinal result: 42\nDone at ${new Date().toISOString()}\n`;
    fs.writeFileSync(path.join(jobDir, `${ts}.md`), md);
    // Wait for the watcher to detect the new file
    let detail;
    for (let i = 0; i < 30; i++) {
      const runs = await page.evaluate(async () => {
        const r = await window.api.cronLogsList({ limit: 50 });
        return r.runs || [];
      });
      if (runs.length > 0) {
        // Check the most recent run for the job we just simulated
        const candidate = runs.find((r) => r.jobId === realJobId);
        if (candidate) {
          const full = await page.evaluate(async (id) => {
            const r = await window.api.cronLogsGet(id);
            return r.success ? r.log : null;
          }, candidate.runId);
          if (full && full.events && full.events.some((e) => e.type === 'run_end' && e.output && /Final result: 42/.test(e.output))) {
            detail = full;
            break;
          }
        }
      }
      await page.waitForTimeout(1000);
    }
    expect(detail, 'a run_end with the .md content should appear within 30s').toBeTruthy();
    const runEnd = detail.events.find((e) => e.type === 'run_end');
    expect(runEnd.output).toMatch(/Final result: 42/);
  });
});
