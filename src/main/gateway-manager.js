const { app } = require('electron');
const { spawn, execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class GatewayManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    this.externalGateway = null;
    this._logWatchers = [];
    this._startTime = null;
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

  async detectExternalGateway() {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');

    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        if (pid > 0 && this._isProcessRunning(pid)) {
          this.externalGateway = { pid, manager: 'pid-file', source: 'PID file' };
          return this.externalGateway;
        }
      } catch { /* stale PID file */ }
    }

    const serviceCheck = await this._checkSystemService();
    if (serviceCheck) {
      this.externalGateway = serviceCheck;
      return this.externalGateway;
    }

    const scannedPid = this._scanGatewayProcesses();
    if (scannedPid) {
      this.externalGateway = { pid: scannedPid, manager: 'manual', source: 'Process scan' };
      return this.externalGateway;
    }

    this.externalGateway = null;
    return null;
  }

  _isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
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
            return { pid: parseInt(match[1], 10), manager: 'launchd', source: 'launchd service' };
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
            return { pid: pidResult, manager: 'systemd', source: 'systemd user service' };
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
      const currentPid = process.pid;
      const ancestors = this._getAncestorPids();
      ancestors.add(currentPid);

      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.includes('grep')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const pid = parseInt(parts[0], 10);
        const cmd = parts.slice(1).join(' ');
        if (ancestors.has(pid)) continue;
        if (
          cmd.includes('hermes_cli.main gateway') ||
          cmd.includes('hermes_cli/main.py gateway') ||
          cmd.includes('hermes gateway') ||
          cmd.includes('gateway/run.py')
        ) {
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

  async start() {
    if (this.running) return { success: false, error: 'Gateway 已在运行中' };
    if (this.externalGateway) return { success: false, error: '外部 Gateway 正在运行，请先停止外部 Gateway' };

    const hermesPath = this._findHermesPath();
    if (!hermesPath) {
      return { success: false, error: 'Hermes Agent 未安装' };
    }

    const pythonCmd = this._findPythonCmd(hermesPath);

    try {
      this.process = spawn(pythonCmd, ['-m', 'hermes_cli.main', 'gateway', 'run'], {
        cwd: hermesPath,
        env: { ...process.env, HERMES_HOME: path.join(os.homedir(), '.hermes') },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.running = true;
      this._startTime = Date.now();
      this.emitStatusChange({ running: true, source: 'gui', pid: this.process.pid });

      this._buffer = '';
      this.process.stderr.on('data', (d) => {
        this._buffer += d.toString();
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() || '';
        for (const line of lines) {
          const text = line.trim();
          if (text) this.emitLog('info', text);
        }
      });

      this.process.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) this.emitLog('info', text);
      });

      this.process.on('close', (code) => {
        this.running = false;
        this.process = null;
        this._startTime = null;
        this.emitStatusChange({ running: false, source: 'none' });
        this.emitLog('info', `Gateway 进程退出，退出码: ${code}`);
      });

      this.process.on('error', (err) => {
        this.running = false;
        this.process = null;
        this._startTime = null;
        this.emitStatusChange({ running: false, source: 'none' });
        this.emitLog('error', `Gateway 启动失败: ${err.message}`);
      });

      return { success: true, pid: this.process.pid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async stop() {
    if (this.externalGateway) {
      return { success: false, error: '无法停止外部 Gateway，请在终端中运行 hermes gateway stop' };
    }
    if (!this.running || !this.process) return { success: false, error: 'Gateway 未运行' };

    return new Promise((resolve) => {
      this.process.on('close', () => {
        this.running = false;
        this.process = null;
        this._startTime = null;
        this.emitStatusChange({ running: false, source: 'none' });
        this.emitLog('info', 'Gateway 已停止');
        resolve({ success: true });
      });
      this.process.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
          this.running = false;
          this.process = null;
          this._startTime = null;
          this.emitStatusChange({ running: false, source: 'none' });
          resolve({ success: true });
        }
      }, 5000);
    });
  }

  async restart() {
    await this.stop();
    return this.start();
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
        env: { ...process.env, HERMES_HOME: path.join(os.homedir(), '.hermes') },
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
}

module.exports = { GatewayManager };
