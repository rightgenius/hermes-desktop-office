const { app } = require('electron');
const { spawn, execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HEALTH_CHECK_INTERVAL_MS = 30000;
const STARTUP_VERIFY_DELAY_MS = 1500;
const GATEWAY_CMDLINE_PATTERNS = [
  'hermes_cli.main gateway',
  'hermes_cli.main --profile',
  'hermes_cli.main -p',
  'hermes_cli/main.py gateway',
  'hermes_cli/main.py --profile',
  'hermes_cli/main.py -p',
  'hermes gateway',
  'gateway/run.py',
];

class GatewayManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    this.externalGateway = null;
    this._logWatchers = [];
    this._startTime = null;
    this._healthTimer = null;
    this._healthCheckInFlight = false;
  }

  emitStatusChange(status) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('gateway-status-change', status);
    }
  }

  emitLog(level, message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('gateway-log', { level, message });
    }
  }

  startHealthCheck(intervalMs = HEALTH_CHECK_INTERVAL_MS) {
    this.stopHealthCheck();
    this._healthTimer = setInterval(() => {
      this._runHealthCheck();
    }, intervalMs);
  }

  stopHealthCheck() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  async _runHealthCheck() {
    if (this._healthCheckInFlight) return;
    this._healthCheckInFlight = true;
    try {
      if (this.running) {
        const alive = this.process && this.process.pid && this._isProcessRunning(this.process.pid);
        if (!alive) {
          this.emitLog('warn', '健康检查：GUI 启动的 Gateway 进程已退出');
          this.running = false;
          this.process = null;
          this._startTime = null;
          this.emitStatusChange({ running: false, source: 'none' });
        }
        return;
      }

      if (this.externalGateway) {
        const stillAlive = await this._verifyExternalGateway(this.externalGateway);
        if (!stillAlive) {
          this.emitLog('warn', `健康检查：外部 Gateway (${this.externalGateway.source}, PID ${this.externalGateway.pid}) 已不可用`);
          this.externalGateway = null;
          this.emitStatusChange({ running: false, source: 'none' });
        }
      }
    } catch (err) {
      this.emitLog('error', `健康检查异常: ${err.message}`);
    } finally {
      this._healthCheckInFlight = false;
    }
  }

  _isManagedPid(pid) {
    // A PID is "managed by us" if it matches the gateway process the GUI
    // itself started. Such a PID must never be classified as external — even
    // when it ends up recorded in ~/.hermes/gateway.pid (hermes-agent writes
    // that file on every start, including GUI-spawned ones).
    return this.running && this.process && this.process.pid === pid;
  }

  async detectExternalGateway() {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');

    const pidFileResult = await this._detectViaPidFile(pidFile);
    if (pidFileResult) {
      if (this._isManagedPid(pidFileResult.pid)) {
        this.emitLog('debug', `PID file 指向 GUI 自己的 Gateway (PID ${pidFileResult.pid})，不归类为外部`);
      } else {
        this.externalGateway = pidFileResult;
        return this.externalGateway;
      }
    }

    const serviceCheck = await this._checkSystemService();
    if (serviceCheck) {
      if (this._isManagedPid(serviceCheck.pid)) {
        this.emitLog('debug', `system service 指向 GUI 自己的 Gateway (PID ${serviceCheck.pid})，不归类为外部`);
      } else {
        this.externalGateway = serviceCheck;
        return this.externalGateway;
      }
    }

    const scannedPid = this._scanGatewayProcesses();
    if (scannedPid) {
      if (this._isManagedPid(scannedPid)) {
        this.emitLog('debug', `进程扫描命中 GUI 自己的 Gateway (PID ${scannedPid})，不归类为外部`);
      } else {
        this.externalGateway = { pid: scannedPid, manager: 'manual', source: '终端前台运行' };
        return this.externalGateway;
      }
    }

    this.externalGateway = null;
    return null;
  }

  async _detectViaPidFile(pidFile) {
    if (!fs.existsSync(pidFile)) return null;

    let parsed;
    try {
      const content = fs.readFileSync(pidFile, 'utf-8').trim();
      parsed = JSON.parse(content);
    } catch {
      try {
        parsed = { pid: parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10) };
      } catch {
        return null;
      }
    }

    const pid = parsed?.pid;
    if (!pid || pid <= 0) return null;
    if (!this._isProcessRunning(pid)) return null;

    const cmdline = this._getProcessCommandLine(pid);
    if (!this._isGatewayCommandLine(cmdline)) {
      this.emitLog('warn', `PID 文件记录的 PID ${pid} 不是 Gateway 进程 (cmdline: ${cmdline || 'unknown'})，忽略`);
      return null;
    }

    return { pid, manager: 'pid-file', source: 'PID 文件' };
  }

  async _verifyExternalGateway(external) {
    if (!external || !external.pid) return false;
    if (!this._isProcessRunning(external.pid)) return false;

    if (external.manager === 'pid-file') {
      const cmdline = this._getProcessCommandLine(external.pid);
      if (!this._isGatewayCommandLine(cmdline)) {
        this.emitLog('warn', `外部 Gateway PID ${external.pid} 已被回收为其它进程 (cmdline: ${cmdline || 'unknown'})`);
        return false;
      }
    }
    return true;
  }

  _isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  _getProcessCommandLine(pid) {
    if (!pid || pid <= 0) return '';
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const output = execSync(`ps -o command= -p ${pid}`, { encoding: 'utf-8', timeout: 2000 });
        return output.trim();
      }
      if (process.platform === 'win32') {
        const output = execSync(`wmic process where "ProcessId=${pid}" get CommandLine /VALUE`, { encoding: 'utf-8', timeout: 2000 });
        const match = output.match(/CommandLine=(.+)/);
        return match ? match[1].trim() : '';
      }
    } catch { /* process gone or ps unavailable */ }
    return '';
  }

  _isGatewayCommandLine(cmdline) {
    if (!cmdline) return false;
    return GATEWAY_CMDLINE_PATTERNS.some(p => cmdline.includes(p));
  }

  async _checkSystemService() {
    const isMacos = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    if (isMacos) {
      try {
        const result = await new Promise((resolve) => {
          execFile('launchctl', ['list', 'hermes-gateway'], { timeout: 5000 }, (err, stdout) => {
            resolve({ ok: !err, stdout });
          });
        });
        if (result.ok) {
          const match = result.stdout.match(/^(\d+)/m);
          if (match) {
            const pid = parseInt(match[1], 10);
            const cmdline = this._getProcessCommandLine(pid);
            if (this._isGatewayCommandLine(cmdline) || !cmdline) {
              return { pid, manager: 'launchd', source: 'launchd 后台服务' };
            }
          }
        }
      } catch { /* service not installed */ }
    }

    if (isLinux) {
      try {
        const result = await new Promise((resolve) => {
          execFile('systemctl', ['--user', 'is-active', 'hermes-gateway'], { timeout: 5000 }, (err, stdout) => {
            resolve({ active: stdout.trim() === 'active' });
          });
        });
        if (result.active) {
          const pidResult = await new Promise((resolve) => {
            execFile('systemctl', ['--user', 'show', 'hermes-gateway.service', '--property=MainPID', '--value'], { timeout: 5000 }, (err, stdout) => {
              resolve(parseInt(stdout.trim(), 10));
            });
          });
          if (pidResult > 0) {
            return { pid: pidResult, manager: 'systemd', source: 'systemd 后台服务' };
          }
        }
      } catch { /* service not installed */ }
    }

    return null;
  }

  _scanGatewayProcesses() {
    if (process.platform === 'win32') return null;

    try {
      const output = execSync('ps -A -o pid=,command=', { encoding: 'utf-8', timeout: 5000 });
      const ancestors = this._getAncestorPids();
      ancestors.add(process.pid);

      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.includes('grep')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const pid = parseInt(parts[0], 10);
        const cmd = parts.slice(1).join(' ');
        if (ancestors.has(pid)) continue;
        if (this._isGatewayCommandLine(cmd)) {
          return pid;
        }
      }
    } catch { /* ps not available */ }
    return null;
  }

  _getAncestorPids() {
    const pids = new Set();
    let pid = process.pid;
    for (let i = 0; i < 64; i++) {
      pids.add(pid);
      try {
        if (process.platform === 'win32') break;
        const output = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf-8', timeout: 2000 });
        const parent = parseInt(output.trim(), 10);
        if (!parent || parent <= 1) break;
        pid = parent;
      } catch { break; }
    }
    return pids;
  }

  _findHermesPath() {
    const devPath = path.join(__dirname, '../hermes-agent');
    const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
    const prodPath = path.join(resourcesDir, 'hermes-agent');
    return fs.existsSync(path.join(devPath, 'cli.py')) ? devPath
      : fs.existsSync(path.join(prodPath, 'cli.py')) ? prodPath
      : null;
  }

  _findPythonCmd(hermesPath) {
    const isProduction = hermesPath === path.join(process.resourcesPath || path.join(process.execPath, '..', 'Resources'), 'hermes-agent');
    const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
    if (isProduction) {
      const bundledPython = path.join(resourcesDir, 'python-runtime', process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python3'));
      return fs.existsSync(bundledPython) ? bundledPython : (process.platform === 'win32' ? 'python' : 'python3');
    } else {
      const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python3';
      const venvPython = path.join(hermesPath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExe);
      const dotVenvPython = path.join(hermesPath, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExe);
      return fs.existsSync(venvPython) ? venvPython : fs.existsSync(dotVenvPython) ? dotVenvPython : pythonExe;
    }
  }

  _loadHermesEnv() {
    const envPath = path.join(os.homedir(), '.hermes', '.env');
    const envVars = {};
    if (!fs.existsSync(envPath)) return envVars;

    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) continue;
        const key = line.substring(0, eqIndex).trim();
        let value = line.substring(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      }
    } catch { /* unparseable .env */ }
    return envVars;
  }

  _buildChildEnv(extra = {}) {
    return {
      ...process.env,
      ...this._loadHermesEnv(),
      HERMES_HOME: path.join(os.homedir(), '.hermes'),
      ...extra,
    };
  }

  _cleanStaleGatewayArtifacts() {
    // Remove PID/lock files left over from a gateway that died without cleanup.
    // Only removes files whose recorded PID is actually dead (or unparseable),
    // never removes files belonging to a live gateway.
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');
    const lockFile = path.join(hermesHome, 'gateway.lock');

    const safeUnlink = (file) => {
      if (!fs.existsSync(file)) return false;
      try {
        const content = fs.readFileSync(file, 'utf-8').trim();
        let recordedPid = null;
        try {
          const parsed = JSON.parse(content);
          recordedPid = parsed?.pid;
        } catch {
          recordedPid = parseInt(content, 10);
        }
        if (recordedPid && recordedPid > 0 && this._isProcessRunning(recordedPid)) {
          return false; // PID is alive - don't touch
        }
      } catch { /* unparseable - treat as stale */ }
      try { fs.unlinkSync(file); return true; } catch { return false; }
    };

    const pidRemoved = safeUnlink(pidFile);
    const lockRemoved = safeUnlink(lockFile);
    if (pidRemoved || lockRemoved) {
      this.emitLog('info', `已清理过期的 Gateway 文件: ${[
        pidRemoved && 'gateway.pid',
        lockRemoved && 'gateway.lock',
      ].filter(Boolean).join(', ')}`);
    }
  }

  async start() {
    if (this.running) return { success: false, error: 'Gateway 已在运行中' };
    if (this.externalGateway) {
      return { success: false, error: '检测到外部 Gateway 正在运行，请使用「重启外部 Gateway」或「由 GUI 接管」后再启动' };
    }

    const hermesPath = this._findHermesPath();
    if (!hermesPath) {
      return { success: false, error: 'Hermes Agent 未安装' };
    }

    const pythonCmd = this._findPythonCmd(hermesPath);

    // Pre-clean stale PID/lock files from a previous run that crashed/was killed
    // manually. Without this, the new gateway would refuse to start because it
    // sees the dead PID still recorded. Combined with --replace below, this
    // makes the GUI robust to "I closed the CLI gateway, now GUI start fails".
    this._cleanStaleGatewayArtifacts();

    let child;
    try {
      child = spawn(pythonCmd, ['-m', 'hermes_cli.main', 'gateway', 'run', '--replace'], {
        cwd: hermesPath,
        env: this._buildChildEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      return { success: false, error: `启动失败: ${err.message}` };
    }

    this.process = child;
    this.running = true;
    this._startTime = Date.now();
    this.emitStatusChange({ running: true, source: 'gui', pid: child.pid });

    this._buffer = '';
    child.stderr.on('data', (d) => {
      this._buffer += d.toString();
      const lines = this._buffer.split('\n');
      this._buffer = lines.pop() || '';
      for (const line of lines) {
        const text = line.trim();
        if (text) this.emitLog('info', text);
      }
    });

    child.stdout.on('data', (d) => {
      const text = d.toString().trim();
      if (text) this.emitLog('info', text);
    });

    let crashed = false;
    child.on('close', (code) => {
      const wasOurProcess = this.process === child;
      this.emitLog('info', `Gateway 进程退出，退出码: ${code}${wasOurProcess ? '' : ' (stale)'}`);
      if (wasOurProcess) {
        this.running = false;
        this.process = null;
        this._startTime = null;
        crashed = true;
        this.emitStatusChange({ running: false, source: 'none' });
      }
    });

    child.on('error', (err) => {
      const wasOurProcess = this.process === child;
      this.emitLog('error', `Gateway 启动失败: ${err.message}`);
      if (wasOurProcess) {
        this.running = false;
        this.process = null;
        this._startTime = null;
        crashed = true;
        this.emitStatusChange({ running: false, source: 'none' });
      }
    });

    await new Promise((resolve) => setTimeout(resolve, STARTUP_VERIFY_DELAY_MS));
    if (crashed || !this.running || !this.process || !this._isProcessRunning(child.pid)) {
      this.running = false;
      this.process = null;
      this._startTime = null;
      this.emitStatusChange({ running: false, source: 'none' });
      return { success: false, error: 'Gateway 启动后立即退出，请查看日志' };
    }

    return { success: true, pid: child.pid };
  }

  async stop() {
    if (this.externalGateway) {
      return { success: false, error: '无法停止外部 Gateway，请在终端中运行 hermes gateway stop' };
    }
    if (!this.running || !this.process) return { success: false, error: 'Gateway 未运行' };

    const child = this.process;

    return new Promise((resolve) => {
      const finish = () => {
        if (this.process === child) {
          this.running = false;
          this.process = null;
          this._startTime = null;
          this.emitStatusChange({ running: false, source: 'none' });
          this.emitLog('info', 'Gateway 已停止');
        }
        resolve({ success: true });
      };

      let settled = false;
      const onClose = () => {
        if (settled) return;
        settled = true;
        finish();
      };
      child.once('close', onClose);

      try {
        child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      } catch { /* already dead */ }

      setTimeout(() => {
        if (settled) return;
        try {
          if (this._isProcessRunning(child.pid)) {
            child.kill('SIGKILL');
          }
        } catch { /* gone */ }
        if (!settled) {
          settled = true;
          finish();
        }
      }, 5000);
    });
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  async restartExternal() {
    if (!this.externalGateway) {
      await this.detectExternalGateway();
      if (!this.externalGateway) {
        return { success: false, error: '没有检测到外部 Gateway' };
      }
    }

    const hermesPath = this._findHermesPath();
    if (!hermesPath) {
      return { success: false, error: 'Hermes Agent 未安装' };
    }
    const pythonCmd = this._findPythonCmd(hermesPath);

    this.emitLog('info', `正在重启外部 Gateway (${this.externalGateway.source}, PID ${this.externalGateway.pid})`);

    return new Promise((resolve) => {
      const child = spawn(pythonCmd, ['-m', 'hermes_cli.main', 'gateway', 'restart'], {
        cwd: hermesPath,
        env: this._buildChildEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); this.emitLog('info', `[restart] ${d.toString().trim()}`); });
      child.stderr.on('data', (d) => { stderr += d.toString(); this.emitLog('info', `[restart] ${d.toString().trim()}`); });

      child.on('close', async (code) => {
        this.emitLog('info', `hermes gateway restart 退出码: ${code}`);
        const previous = this.externalGateway;
        this.externalGateway = null;
        await new Promise((r) => setTimeout(r, 1500));
        const fresh = await this.detectExternalGateway();
        if (fresh) {
          this.emitLog('info', `外部 Gateway 已重启 (新 PID: ${fresh.pid})`);
          this.emitStatusChange({
            running: true,
            source: 'external',
            pid: fresh.pid,
            manager: fresh.manager,
            sourceLabel: fresh.source,
          });
          resolve({ success: true, previousPid: previous?.pid, newPid: fresh.pid });
        } else {
          this.emitLog('warn', 'hermes gateway restart 退出但未检测到新的 Gateway 进程');
          this.emitStatusChange({ running: false, source: 'none' });
          resolve({ success: false, error: 'restart 命令执行完成，但未检测到新的 Gateway 进程', exitCode: code, stdout, stderr });
        }
      });

      child.on('error', (err) => {
        this.emitLog('error', `hermes gateway restart 启动失败: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  async takeover() {
    if (this.running) {
      return { success: false, error: 'GUI 启动的 Gateway 已在运行，请先停止' };
    }
    if (!this.externalGateway) {
      await this.detectExternalGateway();
      if (!this.externalGateway) {
        return { success: false, error: '没有检测到外部 Gateway 可接管' };
      }
    }

    const external = this.externalGateway;
    this.emitLog('info', `正在接管外部 Gateway (${external.source}, PID ${external.pid})`);

    if (external.manager === 'launchd') {
      try {
        await new Promise((resolve) => {
          execFile('launchctl', ['bootout', `gui/${process.getuid ? process.getuid() : 501}/${external.source === 'launchd 后台服务' ? 'com.hermes.gateway' : 'hermes-gateway'}`], { timeout: 10000 }, () => resolve());
        });
        this.emitLog('info', '已通过 launchctl bootout 停止 launchd 服务');
      } catch (err) {
        this.emitLog('warn', `launchctl bootout 失败: ${err.message}，尝试发送 SIGTERM`);
        try { process.kill(external.pid, 'SIGTERM'); } catch {}
      }
    } else if (external.manager === 'systemd') {
      try {
        await new Promise((resolve) => {
          execFile('systemctl', ['--user', 'stop', 'hermes-gateway'], { timeout: 15000 }, () => resolve());
        });
        this.emitLog('info', '已通过 systemctl stop 停止 systemd 服务');
      } catch (err) {
        this.emitLog('warn', `systemctl stop 失败: ${err.message}，尝试发送 SIGTERM`);
        try { process.kill(external.pid, 'SIGTERM'); } catch {}
      }
    } else {
      try {
        process.kill(external.pid, 'SIGTERM');
        this.emitLog('info', `已向 PID ${external.pid} 发送 SIGTERM`);
      } catch (err) {
        if (err.code !== 'ESRCH') {
          this.emitLog('error', `停止外部 Gateway 失败: ${err.message}`);
          return { success: false, error: `停止外部 Gateway 失败: ${err.message}` };
        }
      }
    }

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (!this._isProcessRunning(external.pid)) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    if (this._isProcessRunning(external.pid)) {
      try {
        process.kill(external.pid, 'SIGKILL');
        this.emitLog('warn', `外部 Gateway 未响应 SIGTERM，已发送 SIGKILL`);
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        if (err.code !== 'ESRCH') {
          return { success: false, error: `强制停止失败: ${err.message}` };
        }
      }
    }

    this.externalGateway = null;
    this.emitStatusChange({ running: false, source: 'none' });

    const startResult = await this.start();
    if (!startResult.success) {
      return { success: false, error: `已停止外部 Gateway，但 GUI 启动失败: ${startResult.error}` };
    }
    return { success: true, killedPid: external.pid, newPid: startResult.pid };
  }

  async getConfig() {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    const configPath = path.join(hermesHome, 'config.yaml');

    const envVars = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          envVars[key] = value;
        }
      }
    }

    let yamlConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        yamlConfig = this._parseGatewayYaml(content);
      } catch { /* YAML parse error */ }
    }

    const maskSecret = (val) => val ? val.substring(0, 8) + '•'.repeat(Math.max(0, val.length - 8)) : '';

    return {
      dingtalk: {
        enabled: !!(envVars.DINGTALK_CLIENT_ID || yamlConfig.dingtalk?.enabled),
        clientId: envVars.DINGTALK_CLIENT_ID || yamlConfig.dingtalk?.extra?.client_id || '',
        clientIdMasked: maskSecret(envVars.DINGTALK_CLIENT_ID || yamlConfig.dingtalk?.extra?.client_id || ''),
        clientSecretMasked: maskSecret(envVars.DINGTALK_CLIENT_SECRET || ''),
        requireMention: yamlConfig.dingtalk?.extra?.require_mention ?? true,
      },
      feishu: {
        enabled: !!(envVars.FEISHU_APP_ID || yamlConfig.feishu?.enabled),
        appId: envVars.FEISHU_APP_ID || yamlConfig.feishu?.extra?.app_id || '',
        appIdMasked: maskSecret(envVars.FEISHU_APP_ID || yamlConfig.feishu?.extra?.app_id || ''),
        appSecretMasked: maskSecret(envVars.FEISHU_APP_SECRET || ''),
        verificationTokenMasked: maskSecret(envVars.FEISHU_VERIFICATION_TOKEN || ''),
        connectionMode: envVars.FEISHU_CONNECTION_MODE || 'websocket',
      },
    };
  }

  _parseGatewayYaml(content) {
    const config = {};
    const lines = content.split('\n');
    let currentSection = null;
    let currentSub = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const topLevelMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (topLevelMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
        const key = topLevelMatch[1];
        const value = topLevelMatch[2].trim();
        if (['dingtalk', 'feishu'].includes(key)) {
          currentSection = key;
          currentSub = null;
          if (!config[key]) config[key] = {};
          if (value && value !== 'null') {
            config[key]._value = this._parseYamlValue(value);
          }
        } else if (key === 'platforms') {
          currentSection = 'platforms';
          currentSub = null;
        } else {
          currentSection = null;
        }
        continue;
      }

      if (currentSection === 'platforms' && line.startsWith('  ') && !line.startsWith('    ')) {
        const subMatch = line.match(/^\s{2}(\w[\w-]*):\s*$/);
        if (subMatch) {
          currentSub = subMatch[1];
          if (!config[currentSub]) config[currentSub] = { extra: {} };
          continue;
        }
      }

      if (currentSection && line.match(/^\s{2,}/)) {
        const propMatch = line.match(/^\s+(\w[\w_.]*):\s*(.*)$/);
        if (propMatch) {
          const propKey = propMatch[1];
          const propValue = this._parseYamlValue(propMatch[2]);

          if (currentSub) {
            if (propKey === 'enabled') {
              config[currentSub].enabled = propValue;
            } else if (propKey !== 'extra') {
              config[currentSub].extra[propKey] = propValue;
            }
          } else {
            const parts = propKey.split('.');
            let obj = config[currentSection];
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj[parts[i]]) obj[parts[i]] = {};
              obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = propValue;
          }
        }
      }
    }

    return config;
  }

  _parseYamlValue(value) {
    if (!value || value === 'null' || value === '~') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === '""' || value === "''") return '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  async saveConfig(platform, config) {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    const configPath = path.join(hermesHome, 'config.yaml');

    if (!fs.existsSync(hermesHome)) {
      fs.mkdirSync(hermesHome, { recursive: true });
    }

    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const envUpdates = {};

    if (platform === 'dingtalk') {
      if (config.clientId) envUpdates.DINGTALK_CLIENT_ID = config.clientId;
      if (config.clientSecret) envUpdates.DINGTALK_CLIENT_SECRET = config.clientSecret;
    } else if (platform === 'feishu') {
      if (config.appId) envUpdates.FEISHU_APP_ID = config.appId;
      if (config.appSecret) envUpdates.FEISHU_APP_SECRET = config.appSecret;
      if (config.verificationToken) envUpdates.FEISHU_VERIFICATION_TOKEN = config.verificationToken;
      if (config.connectionMode) envUpdates.FEISHU_CONNECTION_MODE = config.connectionMode;
    }

    for (const [key, value] of Object.entries(envUpdates)) {
      const escapedValue = value.includes(' ') || value.includes('=') ? `"${value}"` : value;
      const regex = new RegExp(`^${key}\\s*=`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${escapedValue}`);
      } else {
        envContent += `\n${key}=${escapedValue}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');

    if (fs.existsSync(configPath)) {
      let yamlContent = fs.readFileSync(configPath, 'utf-8');
      const platformsRegex = new RegExp(`^(\\s*)${platform}:\\s*$`, 'm');
      if (platformsRegex.test(yamlContent)) {
        const sectionRegex = new RegExp(`(${platform}:\\n)(\\s*)(enabled:.*\\n)?`, 'm');
        if (sectionRegex.test(yamlContent)) {
          yamlContent = yamlContent.replace(sectionRegex, `$1$2enabled: ${config.enabled}\n`);
        }
      } else {
        yamlContent += `\n${platform}:\n  enabled: ${config.enabled}\n`;
      }
      fs.writeFileSync(configPath, yamlContent, 'utf-8');
    } else {
      fs.writeFileSync(configPath, `${platform}:\n  enabled: ${config.enabled}\n`, 'utf-8');
    }

    return { success: true };
  }

  async qrAuth(platform) {
    const hermesPath = this._findHermesPath();
    if (!hermesPath) {
      return { success: false, error: 'Hermes Agent 未安装' };
    }

    const pythonCmd = this._findPythonCmd(hermesPath);

    const authScript = platform === 'dingtalk'
      ? 'from hermes_cli.dingtalk_auth import dingtalk_qr_auth; import json, sys; r = dingtalk_qr_auth(); print(json.dumps({"success": r is not None, "client_id": r[0] if r else "", "client_secret": r[1] if r else ""}))'
      : 'from gateway.platforms.feishu import qr_register; import json, sys; r = qr_register(); print(json.dumps({"success": r is not None, "app_id": r.get("app_id","") if r else "", "app_secret": r.get("app_secret","") if r else ""}))';

    return new Promise((resolve) => {
      const child = spawn(pythonCmd, ['-c', authScript], {
        cwd: hermesPath,
        env: this._buildChildEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 7200000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
        const urlMatch = d.toString().match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          this.emitLog('info', `QR URL: ${urlMatch[0]}`);
        }
      });

      child.on('close', (code) => {
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.success) {
              this.saveConfig(platform, {
                enabled: true,
                ...(platform === 'dingtalk'
                  ? { clientId: result.client_id, clientSecret: result.client_secret }
                  : { appId: result.app_id, appSecret: result.app_secret }),
              });
            }
            resolve(result);
          } else {
            resolve({ success: false, error: stderr || 'QR auth failed' });
          }
        } catch {
          resolve({ success: false, error: 'Failed to parse QR auth result' });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  async getChannels() {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const channelDirPath = path.join(hermesHome, 'channel_directory.json');

    if (!fs.existsSync(channelDirPath)) {
      return { success: true, platforms: {}, updated_at: null };
    }

    try {
      const data = JSON.parse(fs.readFileSync(channelDirPath, 'utf-8'));
      return {
        success: true,
        platforms: data.platforms || {},
        updated_at: data.updated_at || null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getGatewayRuntimeStatus() {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const statePath = path.join(hermesHome, 'gateway_state.json');

    if (!fs.existsSync(statePath)) {
      return { available: false, state: null };
    }

    try {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      return {
        available: true,
        state: data.gateway_state || null,
        exitReason: data.exit_reason || null,
        activeAgents: data.active_agents ?? 0,
        restartRequested: !!data.restart_requested,
        platforms: data.platforms || {},
        updatedAt: data.updated_at || null,
        pid: data.pid || null,
      };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }
}

module.exports = { GatewayManager };
