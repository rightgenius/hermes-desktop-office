const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class CronManager {
  constructor(agentManager, mainWindow) {
    this.agentManager = agentManager;
    this.mainWindow = mainWindow;
    this.tickInterval = null;
    this.isRunning = false;
    this._cronDir = path.join(app.getPath('home'), '.hermes', 'cron');
    this._jobsFile = path.join(this._cronDir, 'jobs.json');
    this._outputDir = path.join(this._cronDir, 'output');
    this._chunkBuffers = new Map();
  }

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

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickInterval = setInterval(() => this._tick(), 60000);
    this._sendStatusUpdate();
  }

  async stop() {
    if (!this.isRunning) return;
    clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.isRunning = false;
    this._sendStatusUpdate();
  }

  _sendStatusUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('cron-status', { isRunning: this.isRunning });
    }
  }

  async _tick() {
    if (!this.agentManager.running) return;
    const jobs = this._loadJobs();
    const now = new Date();
    const dueJobs = jobs.filter(j => {
      if (!j.enabled || j.state === 'paused' || !j.next_run_at) return false;
      return new Date(j.next_run_at) <= now;
    });
    for (const job of dueJobs) {
      await this._runJob(job);
    }
  }

  async _runJob(job) {
    const jobs = this._loadJobs();
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx === -1) return;
    jobs[idx].state = 'running';
    this._saveJobs(jobs);

    try {
      const sessionId = `cron_${job.id}_${Date.now()}`;
      const prompt = this._buildJobPrompt(job);
      const result = await this._executeViaBridge(sessionId, prompt);
      this._saveJobOutput(job.id, result);
      this._markJobRun(job.id, true, null);
    } catch (err) {
      this._markJobRun(job.id, false, err.message);
    }
  }

  _buildJobPrompt(job) {
    let prompt = job.prompt || '';
    const skills = job.skills || (job.skill ? [job.skill] : []);
    if (skills.length > 0) {
      prompt = `[Skill: ${skills.join(', ')}]\n\n${prompt}`;
    }
    return `[CRON JOB: ${job.name || job.id}]\n\n${prompt}`;
  }

  async _executeViaBridge(sessionId, prompt) {
    return new Promise((resolve, reject) => {
      if (!this.agentManager.running) {
        reject(new Error('Agent 未运行'));
        return;
      }
      const result = this.agentManager.sendMessage(sessionId, prompt, []);
      if (!result.success) {
        reject(new Error(result.error));
        return;
      }
      const handler = (_, data) => {
        if (data.session_id === sessionId) {
          if (data.type === 'chunk') {
            const buf = this._chunkBuffers.get(sessionId) || '';
            this._chunkBuffers.set(sessionId, buf + data.content);
          } else if (data.type === 'done') {
            this.mainWindow.removeListener('agent-response', handler);
            const content = this._chunkBuffers.get(sessionId) || '';
            this._chunkBuffers.delete(sessionId);
            resolve(content);
          } else if (data.type === 'error') {
            this.mainWindow.removeListener('agent-response', handler);
            this._chunkBuffers.delete(sessionId);
            reject(new Error(data.error));
          }
        }
      };
      this._chunkBuffers.set(sessionId, '');
      this.mainWindow.on('agent-response', handler);
    });
  }

  _saveJobOutput(jobId, content) {
    const jobOutputDir = path.join(this._outputDir, jobId);
    if (!fs.existsSync(jobOutputDir)) fs.mkdirSync(jobOutputDir, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(jobOutputDir, `${timestamp}.md`);
    fs.writeFileSync(outputFile, `# Cron Job\n\n${content}`, 'utf-8');
  }

  _markJobRun(jobId, success, error) {
    const jobs = this._loadJobs();
    const idx = jobs.findIndex(j => j.id === jobId);
    if (idx === -1) return;
    const job = jobs[idx];
    job.last_run_at = new Date().toISOString();
    job.last_status = success ? 'ok' : 'error';
    job.last_error = error || null;
    job.state = 'scheduled';

    if (job.repeat && job.repeat.times) {
      job.repeat.completed = (job.repeat.completed || 0) + 1;
      if (job.repeat.completed >= job.repeat.times) {
        jobs.splice(idx, 1);
        this._saveJobs(jobs);
        return;
      }
    }

    job.next_run_at = this._computeNextRun(job.schedule, job.last_run_at);
    this._saveJobs(jobs);
  }

  _computeNextRun(schedule, lastRunAt) {
    if (!schedule) return null;
    const now = new Date();
    if (schedule.kind === 'once') return null;
    if (schedule.kind === 'interval') {
      const base = lastRunAt ? new Date(lastRunAt) : now;
      base.setMinutes(base.getMinutes() + schedule.minutes);
      return base.toISOString();
    }
    if (schedule.kind === 'cron') {
      return null;
    }
    return null;
  }

  async listJobs(includeDisabled = false) {
    let jobs = this._loadJobs();
    if (!includeDisabled) jobs = jobs.filter(j => j.enabled !== false);
    return jobs;
  }

  async createJob(data) {
    const jobs = this._loadJobs();
    const job = {
      id: Math.random().toString(36).substring(2, 14),
      name: data.name || (data.prompt || '').substring(0, 50),
      prompt: data.prompt,
      skills: data.skills || [],
      skill: (data.skills && data.skills[0]) || null,
      schedule: data.schedule,
      schedule_display: data.schedule_display || data.schedule,
      repeat: { times: data.repeat || null, completed: 0 },
      enabled: true,
      state: 'scheduled',
      created_at: new Date().toISOString(),
      next_run_at: this._computeNextRun(data.schedule),
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
    const idx = jobs.findIndex(j => j.id === jobId);
    if (idx === -1) return null;
    jobs[idx] = { ...jobs[idx], ...updates };
    if (updates.schedule) {
      jobs[idx].next_run_at = this._computeNextRun(updates.schedule, jobs[idx].last_run_at);
    }
    this._saveJobs(jobs);
    return jobs[idx];
  }

  async deleteJob(jobId) {
    const jobs = this._loadJobs();
    const filtered = jobs.filter(j => j.id !== jobId);
    if (filtered.length === jobs.length) return false;
    this._saveJobs(filtered);
    return true;
  }

  async pauseJob(jobId) {
    return this.updateJob(jobId, { enabled: false, state: 'paused', paused_at: new Date().toISOString() });
  }

  async resumeJob(jobId) {
    const jobs = this._loadJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;
    return this.updateJob(jobId, {
      enabled: true,
      state: 'scheduled',
      paused_at: null,
      next_run_at: this._computeNextRun(job.schedule, job.last_run_at),
    });
  }

  async triggerJob(jobId) {
    return this.updateJob(jobId, {
      enabled: true,
      state: 'scheduled',
      paused_at: null,
      next_run_at: new Date().toISOString(),
    });
  }
}

module.exports = { CronManager };
