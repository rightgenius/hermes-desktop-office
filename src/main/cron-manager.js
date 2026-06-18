const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const {
  CronLogStore,
  normalizeCronLogMaxMb,
  DEFAULT_CRON_LOG_MAX_MB,
} = require('./cron-log-store');
const { CronPolicy } = require('./cron-policy');
const { CronLogFiles } = require('./cron-log-files');

/**
 * Format a Date as "YYYY-MM-DD HH:MM" in the local timezone. Used as the
 * `display` text for `kind: "once"` schedules so it matches hermes-agent's
 * own `parse_schedule` rendering.
 */
function formatLocalYmdHm(dt) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ` +
    `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
  );
}

/**
 * CronManager — GUI-side observer and CRUD layer for cron jobs.
 *
 * Scheduling authority lives in hermes-agent's own `cron.scheduler`
 * (ticked by the gateway process). This class:
 *   - reads/writes `~/.hermes/cron/jobs.json` so the GUI stays in sync
 *     with the same source of truth the gateway reads;
 *   - exposes a CRUD surface (list / create / update / delete / pause / resume);
 *   - exposes an audit log surface (list / get / clear / settings) backed by
 *     `CronLogStore` writing JSONL under `~/.hermes/cron/logs/`;
 *   - when start()ed, polls the disk every 2s to:
 *       a) detect jobs whose `last_run_at` just changed and emit `run_start`;
 *       b) detect new `output/<jobId>/*.md` files and emit `run_end` with the
 *          markdown as the `output` field;
 *       c) tail `~/.hermes/logs/agent.log` for new lines matching
 *          `[cron_<knownJobId>_*]` and emit them as `console` / `agent_output`
 *          events.
 *
 * It does NOT spawn subprocesses, run a tick loop, or talk to AgentManager —
 * those responsibilities belong to the gateway. The trigger button simply
 * updates `next_run_at` on `jobs.json`; the gateway's next tick (≤60s later)
 * picks it up and runs the job; the watcher then captures the run.
 */
class CronManager {
  constructor(agentManager, mainWindow, options = {}) {
    this.agentManager = agentManager; // retained for backward-compat / status checks
    this.mainWindow = mainWindow;
    this.isRunning = false;
    this._cronDir = options.cronDir || path.join(this._home(), '.hermes', 'cron');
    this._jobsFile = path.join(this._cronDir, 'jobs.json');
    this._outputDir = path.join(this._cronDir, 'output');
    this.logger = options.logger || console;
    this.configStore = options.configStore || null;
    this.logStore = options.logStore || new CronLogStore({
      baseDir: path.join(this._cronDir, 'logs'),
      getMaxBytes: () => this._getLogMaxMb() * 1024 * 1024,
    });
    // GUI-side denylist policy. Mirrors the bridge.py Python policy so the
    // GUI can preview / test / permission-audit decisions, even though the
    // watcher itself never executes commands (gateway does). When the GUI
    // *does* run a job (rare; mostly user-initiated triggers during dev),
    // bridge.py is the authoritative enforcement layer.
    this.policy = options.policy || new CronPolicy({
      configProvider: this.configStore,
    });
    // Active runs being tracked by the watcher, keyed by `${jobId}:${startedAt}`
    // so a single job can have multiple in-flight runs across scans.
    this._watchedRuns = new Map(); // key -> { jobId, startedAt, logRun, outputFile? }
    // Per-job memory of the last `last_run_at` we observed, so we can detect
    // a new run on the next scan. Seeded on first scan from disk.
    this._lastSeenRunAt = new Map(); // jobId -> ISO string
    // Per-job memory of the last `output/<jobId>/*.md` we observed, so we can
    // detect a new file on the next scan.
    this._lastSeenOutputFile = new Map(); // jobId -> absolute path
    // agent.log tail offset
    this._agentLogOffset = 0;
    this._agentLogPath = options.agentLogPath || path.join(
      this._home(), '.hermes', 'logs', 'agent.log',
    );
    // Polling interval
    this._pollIntervalMs = options.pollIntervalMs || 2000;
    this._pollTimer = null;
    // Skill inlining throttle: post-processor reads SKILL.md from disk
    // and rewrites jobs.json; we don't want to do it on every 2s tick.
    this._lastInlineAt = 0;
    this._inlineThrottleMs = options.inlineThrottleMs || 5000;
    // Stuck-run reconciliation: any `.jsonl.active` file older than this is
    // force-finalized as 'interrupted' on startup.
    this._staleRunMs = options.staleRunMs || 30 * 60 * 1000;
    // File aggregation for the file-view panel: pairs audit + output + global
    // logs filtered by session/explicit/time-window confidence.
    this.logFiles = options.logFiles || new CronLogFiles({
      logsDir: path.join(this._cronDir, 'logs'),
      outputDir: this._outputDir,
      globalLogsDir: path.join(this._home(), '.hermes', 'logs'),
    });
  }

  // ---------- helpers ----------

  _home() {
    if (app && typeof app.getPath === 'function') {
      try { return app.getPath('home'); } catch (_) { /* noop */ }
    }
    return os.homedir();
  }

  // ---------- lifecycle ----------

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._reconcileStaleActiveRuns();
    // Initial seed: read jobs.json once to populate _lastSeenRunAt /
    // _lastSeenOutputFile so the first poll doesn't fire a phantom
    // "new run" for runs that happened before the GUI started.
    this._seedWatchState();
    this._pollTimer = setInterval(() => this._pollOnce(), this._pollIntervalMs);
    this._pollTimer.unref?.();
    // Run once immediately so a write-jobs-then-start-watch scenario picks
    // up the new state on the same tick (setInterval doesn't fire instantly).
    this._pollOnce();
    this._sendStatusUpdate();
  }

  async stop() {
    if (!this.isRunning) return;
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
    this.isRunning = false;
    this._sendStatusUpdate();
  }

  _sendStatusUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('cron-status', { isRunning: this.isRunning });
    }
  }

  // ---------- Skill resolution (inlined into cron prompt) ----------

  /**
   * Return the list of skill directories that could contain a SKILL.md,
   * in priority order. Used by `resolveSkills()` to look up a skill by
   * bare name. Mirrors the search order in `agent/skill_utils.py`
   * (hermes-agent scheduler) plus the GUI's bundled office skills.
   *
   * Order matters: the FIRST directory that contains a matching
   * `<name>/SKILL.md` wins.
   */
  _skillSearchDirs() {
    const home = this._home();
    const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
    const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
    const appDir = path.join(__dirname, '..');
    const devHermesAgent = path.join(appDir, 'hermes-agent');
    const dirs = [];

    // 1) Bundled office skills (ship with the app, dev + prod)
    const officeCandidates = [
      path.join(unpackedDir, 'skills', 'office'),
      path.join(resourcesDir, 'skills', 'office'),
      path.join(appDir, '..', 'skills', 'office'),
    ];
    for (const cand of officeCandidates) {
      if (!dirs.includes(cand) && fs.existsSync(cand)) dirs.push(cand);
    }

    // 2) hermes-agent submodule skills (dev: src/hermes-agent, prod: Resources/hermes-agent)
    const hermesAgentCandidates = [
      devHermesAgent,
      path.join(resourcesDir, 'hermes-agent'),
    ];
    for (const cand of hermesAgentCandidates) {
      if (!dirs.includes(cand) && fs.existsSync(cand)) {
        dirs.push(path.join(cand, 'skills'));
        dirs.push(path.join(cand, 'optional-skills'));
      }
    }

    // 3) User-installed skills (only if present)
    const userDirs = [
      path.join(home, '.agents', 'skills'),
      path.join(home, '.hermes', 'skills'),
    ];
    for (const d of userDirs) {
      if (!dirs.includes(d) && fs.existsSync(d)) dirs.push(d);
    }
    return dirs;
  }

  /**
   * Resolve a list of skill names to their on-disk SKILL.md content.
   * Returns a map of `{name: {found, content, path, source, sizeBytes, error}}`.
   *
   * Used by the GUI to inline skill content into cron prompts at job-save
   * time, so the cron job becomes self-contained and doesn't depend on
   * the hermes-agent scheduler being able to find the skills at runtime.
   */
  async resolveSkills(names) {
    const result = {};
    const seen = new Set();
    const searchDirs = this._skillSearchDirs();

    for (const rawName of names || []) {
      const name = String(rawName || '').trim();
      if (!name) continue;
      // Dedupe: if user passes the same name twice, only resolve once
      if (seen.has(name)) continue;
      seen.add(name);

      if (!/^[A-Za-z0-9_.\-/]+$/.test(name)) {
        result[name] = { found: false, error: 'invalid skill name', path: null, source: null, content: null, sizeBytes: 0 };
        continue;
      }

      // 1) Direct hit: <root>/<name>/SKILL.md
      // 2) Category-scoped: <root>/<cat>/<name>/SKILL.md (hermes-agent layout)
      let resolved = null;
      for (const root of searchDirs) {
        const direct = path.join(root, name, 'SKILL.md');
        if (fs.existsSync(direct)) {
          resolved = { path: direct, source: this._classifySource(root) };
          break;
        }
        try {
          const entries = fs.readdirSync(root, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isDirectory()) continue;
            const nested = path.join(root, e.name, name, 'SKILL.md');
            if (fs.existsSync(nested)) {
              resolved = { path: nested, source: this._classifySource(root) };
              break;
            }
          }
        } catch { /* ignore unreadable roots */ }
        if (resolved) break;
      }

      if (!resolved) {
        result[name] = { found: false, error: 'SKILL.md not found in any known skills directory', path: null, source: null, content: null, sizeBytes: 0 };
        continue;
      }

      try {
        const content = fs.readFileSync(resolved.path, 'utf-8');
        result[name] = {
          found: true,
          content,
          path: resolved.path,
          source: resolved.source,
          sizeBytes: Buffer.byteLength(content, 'utf-8'),
        };
      } catch (err) {
        result[name] = { found: false, error: `read failed: ${err.message}`, path: resolved.path, source: resolved.source, content: null, sizeBytes: 0 };
      }
    }
    return result;
  }

  _classifySource(rootDir) {
    const home = this._home();
    if (rootDir.startsWith(path.join(home, '.agents', 'skills'))) return 'user';
    if (rootDir.startsWith(path.join(home, '.hermes', 'skills'))) return 'agent';
    if (rootDir.endsWith(path.join('skills', 'office'))) return 'bundled-office';
    if (rootDir.endsWith(path.sep + 'skills') || rootDir.endsWith(path.sep + 'optional-skills')) return 'hermes-agent';
    return 'unknown';
  }

  /**
   * Assemble a final cron prompt by inlining the selected skills' content
   * ahead of the user's task prompt. The format mirrors what
   * `hermes-agent/cron/scheduler.py::_build_job_prompt` produces when it
   * successfully resolves `job.skills` — so the inlined prompt reads the
   * same to the agent whether the content was inlined at save time or at
   * run time.
   *
   * If a skill is not `found`, an inline `⚠️` notice is emitted instead of
   * the content, so the agent can mention it in its report (matches the
   * scheduler's own behaviour).
   */
  async buildInlinedPrompt(taskPrompt, skillNames) {
    const trimmedTask = String(taskPrompt || '').trim();
    const names = (skillNames || []).map((n) => String(n || '').trim()).filter(Boolean);
    if (names.length === 0) {
      return { prompt: trimmedTask, resolved: {}, missing: [] };
    }
    const resolved = await this.resolveSkills(names);
    const parts = [];
    const missing = [];
    for (const name of names) {
      const entry = resolved[name];
      if (entry && entry.found) {
        parts.push(
          `[IMPORTANT: The user has invoked the "${name}" skill, indicating they want you to follow its instructions. The full skill content is loaded below.]\n`,
          '',
          entry.content,
          ''
        );
      } else {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      parts.unshift(
        `[IMPORTANT: The following skill(s) were listed for this job but could not be found and were skipped: ${missing.join(', ')}. Start your response with a brief notice so the user is aware, e.g.: '⚠️ Skill(s) not found and skipped: ${missing.join(', ')}']\n`
      );
    }
    if (trimmedTask) {
      parts.push('', `# === User task ===`, '', trimmedTask);
    }
    return { prompt: parts.join('\n'), resolved, missing };
  }

  // ---------- Skill inlining post-processor (jobs.json) ----------

  /**
   * Check whether `job.skills` has already been inlined into `job.prompt`.
   * Returns true when the inlined marker matches the skills list AND a
   * non-empty prompt is present, false when re-inlining is required.
   *
   * Treats `null` / `undefined` `inlinedSkills` as "not inlined yet". A
   * mismatch (e.g. user added or removed a skill) triggers re-inlining.
   */
  _skillsAreInlined(job) {
    const skills = Array.isArray(job.skills) ? job.skills.filter(Boolean) : [];
    const inlined = Array.isArray(job.inlinedSkills) ? job.inlinedSkills.filter(Boolean) : [];
    if (skills.length === 0 && inlined.length === 0) return true;
    if (skills.length !== inlined.length) return false;
    const a = new Set(skills);
    const b = new Set(inlined);
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  /**
   * Post-process jobs.json: for any job whose `skills` field lists names
   * that haven't been inlined into `prompt` yet, read each SKILL.md from
   * the same paths the GUI form uses and rewrite the job's `prompt` with
   * the inlined content. This guarantees the cron prompt is
   * self-contained regardless of who created the job (GUI form, chat
   * agent via `cronjob` tool, TUI, or `hermes cron add`).
   *
   * Throttled to run at most every `inlineThrottleMs` (default 5s) so
   * heavy `readFile` work doesn't dominate the watcher loop.
   */
  async _maybeInlineSkills() {
    const now = Date.now();
    if (now - (this._lastInlineAt || 0) < (this._inlineThrottleMs || 5000)) return;
    this._lastInlineAt = now;

    const jobs = this._loadJobs();
    if (jobs.length === 0) return;

    const dirty = [];
    for (const job of jobs) {
      if (this._skillsAreInlined(job)) continue;
      dirty.push(job);
    }
    if (dirty.length === 0) return;

    for (const job of dirty) {
      try {
        const skillList = (job.skills || []).filter(Boolean);
        // If the user prompt already has inlined content (e.g. the GUI
        // form assembled it), don't double-inline. The form sets
        // `inlinedSkills` so this branch normally doesn't fire — it's
        // the chat-agent path that hits this.
        const { prompt, missing } = await this.buildInlinedPrompt(job.prompt || '', skillList);
        // Preserve the user's original input as taskPrompt so the edit
        // form can round-trip back to the same source text. If the chat
        // agent has already supplied taskPrompt, leave it alone.
        if (!job.taskPrompt) job.taskPrompt = job.prompt || '';
        job.prompt = prompt;
        job.inlinedSkills = skillList.slice();
        job.inlinedSkillsAt = new Date().toISOString();
        if (missing.length > 0) {
          job.inlinedSkillsMissing = missing;
          this.logger.warn(
            `[cron] job '${job.name || job.id}' inlined ${skillList.length - missing.length}/${skillList.length} skills; missing: ${missing.join(', ')}`
          );
        } else {
          delete job.inlinedSkillsMissing;
          this.logger.info(
            `[cron] job '${job.name || job.id}' auto-inlined ${skillList.length} skill(s) into prompt`
          );
        }
      } catch (err) {
        this.logger.error(
          `[cron] job '${job.name || job.id}' auto-inline failed: ${err.message}`
        );
      }
    }
    this._saveJobs(jobs);
  }

  // ---------- CRUD on jobs.json (GUI's read/write of the shared source of truth) ----------

  _ensureDirs() {
    if (!fs.existsSync(this._cronDir)) fs.mkdirSync(this._cronDir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this._outputDir)) fs.mkdirSync(this._outputDir, { recursive: true, mode: 0o700 });
  }

  _loadJobs() {
    this._ensureDirs();
    if (!fs.existsSync(this._jobsFile)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this._jobsFile, 'utf-8'));
      return data.jobs || [];
    } catch {
      return [];
    }
  }

  _saveJobs(jobs) {
    this._ensureDirs();
    const tmp = this._jobsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ jobs, updated_at: new Date().toISOString() }, null, 2), 'utf-8');
    fs.renameSync(tmp, this._jobsFile);
  }

  async listJobs(includeDisabled = true) {
    let jobs = this._loadJobs();
    if (!includeDisabled) jobs = jobs.filter((j) => j.enabled !== false);
    // Read-only normalize schedule for UI display. We don't migrate to disk
    // here — `updateJob` / `createJob` will rewrite as a structured object the
    // next time the job is saved, and the gateway can read legacy strings via
    // hermes-agent's own `parse_schedule()`.
    return jobs.map((j) => this._normalizeJobForRead(j));
  }

  async createJob(data) {
    const jobs = this._loadJobs();
    const schedule = this.parseCronScheduleInput(data.schedule);
    // Use `taskPrompt` (the user's original input) as the name seed when
    // the GUI pre-inlined skill content into `prompt`. Falling back to
    // `prompt` keeps the legacy path working.
    const nameSeed = data.taskPrompt || data.prompt || '';
    const job = {
      id: Math.random().toString(36).substring(2, 14),
      name: data.name || nameSeed.substring(0, 50),
      // `prompt` is the final, self-contained prompt (skills inlined).
      prompt: data.prompt,
      // `taskPrompt` is the user's original input (without inlined skill
      // content). The renderer reads this back to populate the form on
      // edit. May be `null` for legacy jobs created before this feature.
      taskPrompt: data.taskPrompt ?? null,
      // Names of skills that were inlined into `prompt` at save time.
      // Empty array when the user didn't select any. Persisted as a hint
      // for the GUI but not used by the hermes-agent scheduler (which
      // sees only the inlined `prompt`).
      inlinedSkills: Array.isArray(data.inlinedSkills) ? data.inlinedSkills : [],
      skills: data.skills || [],
      skill: (data.skills && data.skills[0]) || null,
      schedule,
      schedule_display: schedule.display,
      repeat: { times: data.repeat || null, completed: 0 },
      enabled: true,
      state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: this._computeNextRun(schedule, null),
      last_run_at: null,
      last_status: null,
      last_error: null,
      deliver: data.deliver || 'local',
      origin: data.origin || null,
      enabled_toolsets: data.enabled_toolsets || null,
      workdir: data.workdir || null,
      script: data.script || null,
      no_agent: data.no_agent || false,
      context_from: data.context_from || null,
      model: data.model || null,
      provider: data.provider || null,
      base_url: data.base_url || null,
    };
    jobs.push(job);
    this._saveJobs(jobs);
    return job;
  }

  async updateJob(jobId, updates) {
    const jobs = this._loadJobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return null;
    const merged = { ...jobs[idx], ...updates };
    // Defensive: when the caller (e.g. a non-GUI scheduler) sends a partial
    // update without these new fields, preserve whatever was persisted
    // before rather than wiping them to undefined.
    for (const k of ['taskPrompt', 'inlinedSkills']) {
      if (!Object.prototype.hasOwnProperty.call(updates, k)) {
        merged[k] = jobs[idx][k];
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'schedule')) {
      // Caller is touching the schedule — always normalize whatever they passed
      // (string or already-structured). The legacy persisted schedule, if any,
      // is preserved only if the caller didn't pass `schedule` at all.
      merged.schedule = this.parseCronScheduleInput(updates.schedule);
      merged.schedule_display = merged.schedule.display;
      merged.next_run_at = this._computeNextRun(merged.schedule, merged.last_run_at);
    } else if (merged.schedule && typeof merged.schedule === 'string') {
      // Legacy: persisted schedule was still a string but the caller didn't
      // pass a new one. Normalize for the in-memory job and the next run
      // computation; rewrite to disk in structured form so the gateway stops
      // seeing a raw string. Don't touch next_run_at if the caller already
      // supplied one (e.g. triggerJob sets it to "now").
      const normalized = this.parseCronScheduleInput(merged.schedule);
      merged.schedule = normalized;
      merged.schedule_display = normalized.display;
      if (!Object.prototype.hasOwnProperty.call(updates, 'next_run_at')) {
        merged.next_run_at = this._computeNextRun(normalized, merged.last_run_at);
      }
    }
    jobs[idx] = merged;
    this._saveJobs(jobs);
    return jobs[idx];
  }

  // ---------- Schedule parsing (GUI-side equivalent of hermes-agent parse_schedule) ----------

  /**
   * Parse a free-form schedule input into a structured object compatible with
   * hermes-agent's `cron.jobs.parse_schedule` output. The GUI is intentionally
   * limited to the input shapes the renderer can produce — see
   * `docs/cron-schedule-editing-spec.md`. The function is pure / synchronous
   * so it can be used both at write time (createJob / updateJob) and at read
   * time (listJobs / edit-form prefill).
   *
   * Accepts either a structured schedule (returned as-is, with display filled
   * in if missing) or a string in one of these shapes:
   *   - "every <N>m|h|d"   → recurring interval
   *   - "<N>m|h|d"         → one-shot, N minutes/hours/days from now
   *   - "0 9 * * *"        → 5-field cron expression
   *   - "2026-06-16T15:30" → ISO-ish local timestamp (one-shot)
   *   - 6-field cron       → accepted and passed through (matches hermes-agent)
   *
   * Throws on truly unparseable input — caller (GUI form) is expected to
   * validate before reaching this code path. We do not silently fall back to
   * "30m" anymore, because that was the bug spec documents: it would
   * overwrite the original schedule on every edit.
   */
  parseCronScheduleInput(scheduleInput) {
    if (scheduleInput === null || scheduleInput === undefined) {
      throw new Error('schedule is required');
    }
    if (typeof scheduleInput === 'object') {
      return this.normalizeCronSchedule(scheduleInput);
    }
    if (typeof scheduleInput !== 'string') {
      throw new Error(`schedule must be string or object, got ${typeof scheduleInput}`);
    }
    const original = scheduleInput;
    const schedule = scheduleInput.trim();
    if (!schedule) {
      throw new Error('schedule is empty');
    }
    const scheduleLower = schedule.toLowerCase();

    // "every X" → recurring interval
    if (scheduleLower.startsWith('every ')) {
      const duration = schedule.slice(6).trim();
      const minutes = this._parseDurationMinutes(duration);
      return {
        kind: 'interval',
        minutes,
        display: `every ${minutes}m`,
      };
    }

    // 5/6-field cron: all parts made of digits, *, -, comma, slash
    const parts = schedule.split(/\s+/);
    if (parts.length >= 5 && parts.length <= 6 && parts.slice(0, 5).every((p) => /^[0-9*\-,/]+$/.test(p))) {
      return {
        kind: 'cron',
        expr: schedule,
        display: schedule,
      };
    }

    // ISO-like timestamp
    if (schedule.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(schedule)) {
      // datetime-local produces "2026-06-16T15:30" without timezone. We treat
      // naive timestamps as the local zone and store ISO with offset, matching
      // hermes-agent's `parse_schedule` behavior.
      const dt = new Date(schedule);
      if (Number.isNaN(dt.getTime())) {
        throw new Error(`Invalid timestamp '${original}'`);
      }
      const display = `once at ${formatLocalYmdHm(dt)}`;
      return {
        kind: 'once',
        run_at: dt.toISOString(),
        display,
      };
    }

    // "30m" / "2h" / "1d" — one-shot relative offset
    const minutes = this._parseDurationMinutes(schedule);
    const runAt = new Date(Date.now() + minutes * 60_000);
    return {
      kind: 'once',
      run_at: runAt.toISOString(),
      display: `once in ${scheduleLower}`,
    };
  }

  /**
   * Normalize an already-structured schedule so it always has a `display`
   * field. Pass-through for legacy strings — they get parsed.
   */
  normalizeCronSchedule(schedule) {
    if (!schedule) return schedule;
    if (typeof schedule === 'string') {
      return this.parseCronScheduleInput(schedule);
    }
    const kind = schedule.kind;
    if (kind === 'interval') {
      const minutes = Number(schedule.minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error(`Invalid interval minutes: ${schedule.minutes}`);
      }
      return {
        kind: 'interval',
        minutes,
        display: schedule.display || `every ${minutes}m`,
      };
    }
    if (kind === 'cron') {
      const expr = String(schedule.expr || '').trim();
      if (!expr) throw new Error('cron schedule requires expr');
      return {
        kind: 'cron',
        expr,
        display: schedule.display || expr,
      };
    }
    if (kind === 'once') {
      const runAt = schedule.run_at;
      if (!runAt) throw new Error('once schedule requires run_at');
      const dt = new Date(runAt);
      if (Number.isNaN(dt.getTime())) {
        throw new Error(`Invalid run_at: ${runAt}`);
      }
      return {
        kind: 'once',
        run_at: dt.toISOString(),
        display: schedule.display || `once at ${formatLocalYmdHm(dt)}`,
      };
    }
    throw new Error(`Unknown schedule kind: ${kind}`);
  }

  _parseDurationMinutes(s) {
    const trimmed = String(s).trim().toLowerCase();
    const match = /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/.exec(trimmed);
    if (!match) {
      throw new Error(`Invalid duration '${s}'. Use '30m', '2h', or '1d'`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2][0]; // m / h / d
    const multipliers = { m: 1, h: 60, d: 1440 };
    return value * multipliers[unit];
  }

  _normalizeJobForRead(job) {
    if (!job || !job.schedule) return job;
    if (typeof job.schedule === 'object') {
      // Make sure `display` is filled in for legacy structured schedules
      try {
        job.schedule = this.normalizeCronSchedule(job.schedule);
      } catch (_) { /* leave as-is */ }
      return job;
    }
    // Legacy string schedule — keep the original for display, but also fill
    // in a best-effort structured view so the edit form can prefill its
    // controls. We do NOT save the structured form until the user actually
    // edits the job (spec §"历史数据兼容").
    try {
      const parsed = this.parseCronScheduleInput(job.schedule);
      return { ...job, _parsedSchedule: parsed };
    } catch (_) {
      return job;
    }
  }

  async deleteJob(jobId) {
    const jobs = this._loadJobs();
    const filtered = jobs.filter((j) => j.id !== jobId);
    if (filtered.length === jobs.length) return false;
    this._saveJobs(filtered);
    // Drop watcher memory for this job
    this._lastSeenRunAt.delete(jobId);
    this._lastSeenOutputFile.delete(jobId);
    return true;
  }

  async pauseJob(jobId) {
    return this.updateJob(jobId, { enabled: false, state: 'paused', paused_at: new Date().toISOString() });
  }

  async resumeJob(jobId) {
    const jobs = this._loadJobs();
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return null;
    return this.updateJob(jobId, {
      enabled: true,
      state: 'scheduled',
      paused_at: null,
      next_run_at: this._computeNextRun(job.schedule, job.last_run_at),
    });
  }

  _computeNextRun(schedule, lastRunAt) {
    if (!schedule) return null;
    let normalized = schedule;
    if (typeof normalized === 'string') {
      try {
        normalized = this.parseCronScheduleInput(normalized);
      } catch (_) {
        return null;
      }
    }
    const now = new Date();
    if (normalized.kind === 'once') {
      return normalized.run_at;
    }
    if (normalized.kind === 'interval') {
      const base = lastRunAt ? new Date(lastRunAt) : now;
      return new Date(base.getTime() + (normalized.minutes || 0) * 60_000).toISOString();
    }
    if (normalized.kind === 'cron') {
      // GUI doesn't bundle a cron parser (avoiding a croniter dep for the
      // desktop app). The gateway has the real parser; it'll recompute
      // next_run_at on its next tick. We just need to make sure the
      // schedule itself is structured so that works.
      return null;
    }
    return null;
  }

  // ---------- Trigger: just bump next_run_at. The gateway's tick does the rest. ----------

  /**
   * Mark a job as due-now by setting `next_run_at` to the current time. The
   * gateway's cron.scheduler (which is already running, ticked every 60s)
   * will pick it up on its next tick. The watcher detects the resulting
   * `last_run_at` change and the new `output/<jobId>/*.md` and writes the
   * audit log entries. Returns immediately.
   *
   * Returns a synthetic runId that the renderer can use for optimistic
   * feedback. The real audit-log run is created by the watcher when the
   * gateway's last_run_at change is detected; the synthetic runId is
   * *intentionally distinct* from the eventual real runId.
   */
  async triggerJob(jobId) {
    const job = await this.updateJob(jobId, {
      enabled: true,
      state: 'scheduled',
      paused_at: null,
      next_run_at: new Date().toISOString(),
    });
    if (!job) {
      return { success: false, error: '任务不存在' };
    }
    return {
      success: true,
      job,
      runId: null,
      note: '已加入调度队列，由 Gateway 执行；GUI 将自动捕获执行结果。',
    };
  }

  // ---------- Watcher ----------

  _seedWatchState() {
    const jobs = this._loadJobs();
    for (const job of jobs) {
      // Seed existing last_run_at values so restarting the GUI watcher does
      // not synthesize a fresh audit run for historical executions. Only a
      // later disk change to last_run_at represents a new gateway run.
      if (job.last_run_at) this._lastSeenRunAt.set(job.id, job.last_run_at);
      const outFile = this._latestOutputFile(job.id);
      if (outFile) this._lastSeenOutputFile.set(job.id, outFile);
    }
    // Initialize agent.log offset to current end so we don't replay history
    try {
      if (fs.existsSync(this._agentLogPath)) {
        this._agentLogOffset = fs.statSync(this._agentLogPath).size;
      }
    } catch (_) { /* noop */ }
  }

  _latestOutputFile(jobId) {
    const dir = path.join(this._outputDir, jobId);
    if (!fs.existsSync(dir)) return null;
    let best = null;
    let bestMtime = 0;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const full = path.join(dir, name);
      try {
        const m = fs.statSync(full).mtimeMs;
        if (m > bestMtime) { best = full; bestMtime = m; }
      } catch (_) { /* skip */ }
    }
    return best;
  }

  _pollOnce() {
    try { this._scanJobStates(); } catch (e) { this.logger.error('scanJobStates:', e.message); }
    try { this._scanOutputDir(); } catch (e) { this.logger.error('scanOutputDir:', e.message); }
    try { this._scanAgentLog(); } catch (e) { this.logger.error('scanAgentLog:', e.message); }
    // Fire-and-forget: rewrite jobs.json with inlined skill content for any
    // job that has a `skills` field but no `inlinedSkills` marker. Throttled
    // inside `_maybeInlineSkills` so it doesn't run on every tick.
    this._maybeInlineSkills().catch((e) => this.logger.error('inlineSkills:', e.message));
  }

  _scanJobStates() {
    const jobs = this._loadJobs();
    if (process.env.CRON_WATCHER_DEBUG) {
      process.stderr.write(`[cron-watcher] scanJobStates: ${jobs.length} jobs; cache: ${JSON.stringify([...this._lastSeenRunAt.entries()])}\n`);
    }
    for (const job of jobs) {
      const lastRun = job.last_run_at || null;
      const seen = this._lastSeenRunAt.get(job.id) || null;
      if (lastRun && lastRun !== seen) {
        if (process.env.CRON_WATCHER_DEBUG) {
          process.stderr.write(`[cron-watcher] NEW run for ${job.id}: ${seen} -> ${lastRun}\n`);
        }
        this._onNewRunObserved(job, lastRun);
        this._lastSeenRunAt.set(job.id, lastRun);
      } else if (!lastRun && seen) {
        this._lastSeenRunAt.delete(job.id);
      }
    }
  }

  _onNewRunObserved(job, startedAt) {
    // A job can report a new last_run_at while an older watcher-created run
    // is still waiting for output. Keep each gateway run in its own audit
    // file; otherwise detail views merge two executions and associate the
    // wrong output Markdown.
    let ctx = null;
    let ctxKey = null;
    for (const [key, c] of this._watchedRuns.entries()) {
      if (c.jobId === job.id) { ctx = c; ctxKey = key; break; }
    }
    if (ctx) {
      if (ctx.startedAt === startedAt) {
        this._sendLogUpdate(job.id, ctx.runId);
        return;
      }
      try {
        this.logStore.finishRun(ctx.logRun, {
          status: 'interrupted',
          error: 'superseded by a newer cron run before output file was observed',
        });
      } catch (err) {
        this.logger.warn('finish superseded run failed:', err.message);
      }
      ctx.finalized = true;
      this._watchedRuns.delete(ctxKey);
      this._sendLogUpdate(ctx.jobId, ctx.runId);
    }

    let logRun;
    try { logRun = this.logStore.startRun(job); }
    catch (err) { this.logger.warn('startRun failed:', err.message); return; }
    this._appendEvent(logRun, {
      type: 'run_start',
      runId: logRun.runId,
      jobId: job.id,
      jobName: job.name || job.id,
      startedAt,
      prompt: job.prompt || '',
    });
    this._appendPolicyApplied(logRun, job);
    ctx = { jobId: job.id, runId: logRun.runId, logRun, startedAt, jobName: job.name || job.id };
    this._watchedRuns.set(`${job.id}:${startedAt}`, ctx);
    this._sendLogUpdate(job.id, ctx.runId);
  }

  _scanOutputDir() {
    const jobs = this._loadJobs();
    for (const job of jobs) {
      const latest = this._latestOutputFile(job.id);
      if (!latest) continue;
      const seen = this._lastSeenOutputFile.get(job.id);
      if (latest === seen) continue;
      this._lastSeenOutputFile.set(job.id, latest);
      // New output file means the run is complete. Find the matching
      // watched run (most recent one for this job) and finalize it.
      let ctx = null;
      let ctxKey = null;
      for (const [key, c] of this._watchedRuns.entries()) {
        if (c.jobId === job.id && !c.finalized) { ctx = c; ctxKey = key; break; }
      }
      if (!ctx) {
        // No matching in-memory run — synthesize one from the file.
        let logRun;
        try { logRun = this.logStore.startRun(job); }
        catch (err) { this.logger.warn('startRun failed:', err.message); continue; }
        this._appendEvent(logRun, {
          type: 'run_start',
          runId: logRun.runId,
          jobId: job.id,
          jobName: job.name || job.id,
          startedAt: job.last_run_at,
          prompt: job.prompt || '',
        });
        this._appendPolicyApplied(logRun, job);
        ctx = { jobId: job.id, runId: logRun.runId, logRun, startedAt: job.last_run_at, jobName: job.name || job.id };
        this._watchedRuns.set(`${job.id}:${job.last_run_at}`, ctx);
        this._sendLogUpdate(job.id, logRun.runId);
      }
      if (ctx.finalized) continue;
      // Read the markdown and stream it
      let md = '';
      try { md = fs.readFileSync(latest, 'utf8'); } catch (_) { /* noop */ }
      // Stream chunks line-by-line to renderer (live feed); also save as run_end output
      const lines = md.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        this._appendEvent(ctx.logRun, { type: 'agent_output', content: line + '\n' });
      }
      const finishedAt = new Date().toISOString();
      const status = job.last_status === 'ok' ? 'success' : (job.last_status === 'error' ? 'error' : 'success');
      const error = job.last_error || null;
      try { this.logStore.finishRun(ctx.logRun, { status, error, output: md }); }
      catch (err) { this.logger.error('finishRun:', err.message); }
      ctx.finalized = true;
      this._watchedRuns.delete(ctxKey);
      this._sendLogUpdate(ctx.jobId, ctx.runId);
    }
    // After scan, also finalize any watched runs whose job's last_run_at
    // has changed but no new output file appeared within a reasonable
    // window — e.g. an errored run that produced no .md. We detect this by
    // checking whether the watched run is older than 10 minutes and the job
    // has moved to a new last_run_at.
    const now = Date.now();
    for (const [key, c] of this._watchedRuns.entries()) {
      if (c.finalized) continue;
      const ageMs = now - new Date(c.startedAt || 0).getTime();
      if (ageMs > 10 * 60 * 1000) {
        const job = this._loadJobs().find((j) => j.id === c.jobId);
        if (job && job.last_run_at && job.last_run_at !== c.startedAt) {
          // The job moved on; mark this run as interrupted
          try { this.logStore.finishRun(c.logRun, { status: 'interrupted', error: 'no output file produced' }); }
          catch (_) { /* noop */ }
          c.finalized = true;
          this._watchedRuns.delete(key);
          this._sendLogUpdate(c.jobId, c.runId);
        }
      }
    }
  }

  _scanAgentLog() {
    let stat;
    try { stat = fs.statSync(this._agentLogPath); }
    catch (_) { return; }
    if (stat.size < this._agentLogOffset) {
      // File was truncated/rotated; reset
      this._agentLogOffset = 0;
    }
    if (stat.size === this._agentLogOffset) return;
    // Read the new chunk
    const fd = fs.openSync(this._agentLogPath, 'r');
    try {
      const len = stat.size - this._agentLogOffset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this._agentLogOffset);
      this._agentLogOffset = stat.size;
      const text = buf.toString('utf8');
      this._processAgentLogChunk(text);
    } finally {
      fs.closeSync(fd);
    }
  }

  _processAgentLogChunk(text) {
    // Look for lines matching the cron job's session id pattern. Format
    // is `2026-06-15 16:14:31,728 INFO [cron_<jobId>_<timestamp>] ...`
    // We only keep lines for jobs we know about, and only for runs that
    // are still being watched (haven't been finalized).
    const knownJobIds = new Set(this._loadJobs().map((j) => j.id));
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const m = line.match(/\[(cron_([A-Za-z0-9_-]+)_\d{8}_\d{6})\]/);
      if (!m) continue;
      const jobId = m[2];
      if (!knownJobIds.has(jobId)) continue;
      // Find the active watched run for this job (most recent un-finalized)
      let ctx = null;
      for (const c of this._watchedRuns.values()) {
        if (c.jobId === jobId && !c.finalized) { ctx = c; break; }
      }
      if (!ctx) continue;
      // Strip the timestamp/level prefix; keep the rest
      const cleaned = line.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:,\d+)?\s+\w+\s+/, '').trim();
      const isTool = /^tools\./.test(cleaned) || /tool_executor/.test(cleaned);
      const isWarn = /^WARNING/.test(cleaned) || /ERROR/.test(cleaned);
      this._appendEvent(ctx.logRun, {
        type: isTool ? 'console' : 'agent_output',
        level: isWarn ? 'warn' : 'info',
        content: isTool ? undefined : cleaned,
        message: isTool ? cleaned : undefined,
      });
    }
  }

  _appendEvent(logRun, event) {
    try {
      this.logStore.appendEvent(logRun, { timestamp: new Date().toISOString(), ...event });
    } catch (err) {
      this.logger.error('appendEvent:', err.message);
    }
  }

  /**
   * Emit a `policy_applied` audit event right after `run_start`, declaring
   * which policy regime this run is operating under. The Permission Audit
   * tab reads these to show the user "this run used the denylist regime,
   * these are the active rules" — the same shape the GUI self-tick flow
   * used to write.
   *
   * `decision` events are NOT emitted by the watcher: the watcher never
   * executes commands, so there are no bridge.py `cron_decision` events
   * to forward. Real cron command execution happens in the gateway
   * process where bridge.py applies the denylist authoritatively. The
   * Permission Audit tab will show 0 decisions for observer-only runs;
   * that's the honest state.
   */
  _appendPolicyApplied(logRun, job) {
    const mode = (job && job.autoAuthorize) || 'denylist';
    let rulesCount = 0;
    try {
      const builtin = (this.policy && typeof this.policy.listBuiltinRules === 'function')
        ? this.policy.listBuiltinRules() : [];
      const extra = Array.isArray(this.configStore?.get?.()?.cronExtraDenylist)
        ? this.configStore.get().cronExtraDenylist : [];
      rulesCount = builtin.length + extra.length;
    } catch (_) { /* config unavailable, count stays 0 */ }
    this._appendEvent(logRun, {
      type: 'policy_applied',
      policy: 'denylist_auto_authorize',
      mode,
      hardline_protected: true,
      rules_loaded: rulesCount,
      note: 'GUI observer only; bridge.py enforces denylist authoritatively when GUI runs commands',
    });
  }

  _sendLogUpdate(jobId, runId) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('cron-log-updated', { jobId, runId });
    }
  }

  // ---------- Stuck-run reconciliation ----------

  _reconcileStaleActiveRuns() {
    const baseDir = path.join(this._cronDir, 'logs');
    if (!fs.existsSync(baseDir)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(baseDir)) {
      if (!name.endsWith('.jsonl.active')) continue;
      const full = path.join(baseDir, name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs < this._staleRunMs) continue;
        // Walk the JSONL events to find the run_start so we can finalize.
        let events = [];
        try {
          events = fs.readFileSync(full, 'utf8')
            .split(/\r?\n/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
        } catch (_) { /* noop */ }
        const runStart = events.find((e) => e.type === 'run_start');
        if (!runStart) continue;
        // Append a synthetic run_end to the .active file, then rename to .jsonl
        const finishedAt = new Date().toISOString();
        const endLine = JSON.stringify({
          timestamp: finishedAt,
          type: 'run_end',
          status: 'interrupted',
          error: 'app restarted before run completed',
          output: '',
          durationMs: 0,
        });
        try { fs.appendFileSync(full, endLine + '\n', 'utf8'); } catch (_) { /* noop */ }
        const finalPath = full.replace(/\.jsonl\.active$/, '.jsonl');
        try { fs.renameSync(full, finalPath); }
        catch (err) { this.logger.warn('Reconcile rename failed:', err.message); continue; }
        this._sendLogUpdate(runStart.jobId, runStart.runId);
      } catch (err) {
        this.logger.warn('Reconcile scan error:', err.message);
      }
    }
  }

  // ---------- Audit log surface ----------

  _getLogMaxMb() {
    const configured = this.configStore?.get()?.cronLogMaxMb;
    try {
      return normalizeCronLogMaxMb(configured);
    } catch {
      return DEFAULT_CRON_LOG_MAX_MB;
    }
  }

  listExecutionLogs(options = {}) {
    return this.logStore.listRuns(options);
  }

  getExecutionLog(runId) {
    return this.logStore.getRun(runId);
  }

  clearExecutionLogs() {
    const result = this.logStore.clear();
    this._sendLogUpdate(null, null);
    return result;
  }

  getLogSettings() {
    return {
      maxMb: this._getLogMaxMb(),
      ...this.logStore.getUsage(),
    };
  }

  updateLogSettings(maxMb) {
    const normalized = normalizeCronLogMaxMb(maxMb);
    if (!this.configStore) {
      throw new Error('配置存储不可用');
    }
    this.configStore.save({ cronLogMaxMb: normalized });
    const usage = this.logStore.enforceLimit();
    this._sendLogUpdate(null, null);
    return { maxMb: normalized, ...usage };
  }

  // ---------- File-view surface ----------

  /**
   * 列出与某个 run 相关的所有日志文件（审计 JSONL / 最终输出 / 全局日志过滤视图）。
   * 默认不返回按时间窗口推断的虚拟文件；includeInferred=true 时追加。
   *
   * @param {string} runId
   * @param {object} [options]
   * @param {boolean} [options.includeInferred=false]
   */
  listExecutionLogFiles(runId, options = {}) {
    if (!runId || typeof runId !== 'string') {
      return { success: false, error: 'runId 必须是非空字符串' };
    }
    if (!this.logFiles) {
      return { success: false, error: '日志文件聚合器不可用' };
    }
    try {
      return this.logFiles.listFiles(runId, options);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 读取某个 fileId 对应的文件内容。fileId 必须来自 listExecutionLogFiles。
   *
   * @param {string} fileId
   * @param {object} [options]
   * @param {number} [options.offset]
   * @param {number} [options.limitBytes]
   * @param {boolean} [options.tail]
   */
  readExecutionLogFile(fileId, options = {}) {
    if (!fileId || typeof fileId !== 'string') {
      return { success: false, error: 'fileId 必须是非空字符串' };
    }
    if (!this.logFiles) {
      return { success: false, error: '日志文件聚合器不可用' };
    }
    try {
      return this.logFiles.readFile(fileId, options);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { CronManager };
