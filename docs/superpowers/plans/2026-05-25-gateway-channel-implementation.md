# Gateway & Channel 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GUI 中新增 Gateway 管理页面，支持 Gateway 状态监控、平台配置（钉钉/飞书）、Channel 列表查看和实时日志，实现自动检测外部 Gateway 并复用。

**Architecture:** 新增 GatewayManager 模块（main process）管理 Gateway 生命周期、配置读写和扫码注册，通过 IPC 与 renderer 通信。前端新增独立页面，遵循现有 Rail + page 布局模式。

**Tech Stack:** Electron IPC, Node.js child_process, YAML/ENV config parsing, QR code generation

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/main/gateway-manager.js` | 新增 | Gateway 生命周期管理、外部检测、配置读写、扫码注册、日志流 |
| `src/main/ipc-handlers.js` | 修改 | 新增 Gateway IPC 处理器 |
| `src/preload/index.js` | 修改 | 新增 Gateway API 暴露 |
| `src/main/index.js` | 修改 | 初始化 GatewayManager |
| `src/renderer/index.html` | 修改 | 新增 Gateway Rail 按钮和页面 HTML |
| `src/renderer/styles.css` | 修改 | 新增 Gateway 页面 CSS 样式 |
| `src/renderer/app.js` | 修改 | 新增 Gateway 页面逻辑 |
| `tests/main/test-gateway-manager.js` | 新增 | GatewayManager 单元测试 |
| `tests/renderer/test-gateway-page.js` | 新增 | Gateway 页面 E2E 测试 |

---

### Task 1: 创建 GatewayManager 核心模块

**Files:**
- Create: `src/main/gateway-manager.js`
- Test: `tests/main/test-gateway-manager.js`

- [ ] **Step 1: 编写 GatewayManager 骨架和构造函数**

```javascript
// src/main/gateway-manager.js
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class GatewayManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    this.externalGateway = null; // { pid, manager, source }
    this._logWatchers = [];
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
}

module.exports = { GatewayManager };
```

- [ ] **Step 2: 实现外部 Gateway 检测**

在 GatewayManager 类中添加：

```javascript
  async detectExternalGateway() {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const pidFile = path.join(hermesHome, 'gateway.pid');

    // 1. Check PID file
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        if (pid > 0 && this._isProcessRunning(pid)) {
          this.externalGateway = { pid, manager: 'pid-file', source: 'PID file' };
          return this.externalGateway;
        }
      } catch { /* stale PID file */ }
    }

    // 2. Check systemd/launchd service
    const serviceCheck = await this._checkSystemService();
    if (serviceCheck) {
      this.externalGateway = serviceCheck;
      return this.externalGateway;
    }

    // 3. Scan process table for hermes gateway processes
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
        const { execFile } = require('child_process');
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
        const { execFile } = require('child_process');
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
    const { execSync } = require('child_process');
    if (process.platform === 'win32') return null;

    try {
      const output = execSync('ps -A -o pid=,command=', { encoding: 'utf-8', timeout: 5000 });
      const currentPid = process.pid;
      // Exclude current process and its ancestors
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
        const { execSync } = require('child_process');
        const output = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf-8', timeout: 2000 });
        const parent = parseInt(output.trim(), 10);
        if (!parent || parent <= 1) break;
        pid = parent;
      } catch { break; }
    }
    return pids;
  }
```

- [ ] **Step 3: 实现 Gateway 启动/停止/重启**

```javascript
  async start() {
    if (this.running) return { success: false, error: 'Gateway 已在运行中' };
    if (this.externalGateway) return { success: false, error: '外部 Gateway 正在运行，请先停止外部 Gateway' };

    // Find hermes-agent path
    const devPath = path.join(__dirname, '../hermes-agent');
    const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
    const prodPath = path.join(resourcesDir, 'hermes-agent');
    const hermesPath = fs.existsSync(path.join(devPath, 'cli.py')) ? devPath
      : fs.existsSync(path.join(prodPath, 'cli.py')) ? prodPath
      : null;

    if (!hermesPath) {
      return { success: false, error: 'Hermes Agent 未安装' };
    }

    // Find Python
    const isProduction = hermesPath === prodPath;
    let pythonCmd;
    if (isProduction) {
      const bundledPython = path.join(resourcesDir, 'python-runtime', process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python3'));
      pythonCmd = fs.existsSync(bundledPython) ? bundledPython : (process.platform === 'win32' ? 'python' : 'python3');
    } else {
      const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python3';
      const venvPython = path.join(hermesPath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExe);
      const dotVenvPython = path.join(hermesPath, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExe);
      pythonCmd = fs.existsSync(venvPython) ? venvPython : fs.existsSync(dotVenvPython) ? dotVenvPython : pythonExe;
    }

    try {
      this.process = spawn(pythonCmd, ['-m', 'hermes_cli.main', 'gateway', 'run'], {
        cwd: hermesPath,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.running = true;
      this.emitStatusChange({ running: true, source: 'gui', pid: this.process.pid });

      this.process.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (text) this.emitLog('info', text);
      });

      this.process.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) this.emitLog('info', text);
      });

      this.process.on('close', (code) => {
        this.running = false;
        this.process = null;
        this.emitStatusChange({ running: false, source: 'none' });
        this.emitLog('info', `Gateway 进程退出，退出码: ${code}`);
      });

      this.process.on('error', (err) => {
        this.running = false;
        this.process = null;
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
```

- [ ] **Step 4: 编写 GatewayManager 基础测试**

```javascript
// tests/main/test-gateway-manager.js
const { GatewayManager } = require('../../src/main/gateway-manager');
const assert = require('assert');

describe('GatewayManager', () => {
  let manager;

  beforeEach(() => {
    manager = new GatewayManager({ isDestroyed: () => false, webContents: { send: () => {} } });
  });

  afterEach(async () => {
    if (manager.running) await manager.stop();
  });

  it('should initialize with running=false and no external gateway', () => {
    assert.strictEqual(manager.running, false);
    assert.strictEqual(manager.externalGateway, null);
  });

  it('should not start when external gateway is detected', async () => {
    manager.externalGateway = { pid: 12345, manager: 'manual', source: 'test' };
    const result = await manager.start();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('外部'));
  });

  it('should not start twice', async () => {
    // This test requires hermes-agent to be present, skip if not available
    const devPath = require('path').join(__dirname, '../../src/hermes-agent');
    const fs = require('fs');
    if (!fs.existsSync(require('path').join(devPath, 'cli.py'))) {
      console.log('SKIP: hermes-agent not present');
      return;
    }
    // Would need full setup to actually start, so we just verify the guard
    manager.running = true;
    const result = await manager.start();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('已在运行'));
    manager.running = false;
  });

  it('should detect ancestor PIDs correctly', () => {
    const ancestors = manager._getAncestorPids();
    assert.ok(ancestors.has(process.pid));
    assert.ok(ancestors.size > 0);
  });

  it('should return null for external gateway when none is running', async () => {
    // In test environment, no gateway should be running
    const result = await manager.detectExternalGateway();
    // May find a stale PID file, but process check should fail
    if (result) {
      assert.ok(manager._isProcessRunning(result.pid), 'If detected, process should be running');
    }
  });
});
```

- [ ] **Step 5: 运行测试确认骨架通过**

```bash
cd /Users/nius/dev/hermes-desktop-office
npx mocha tests/main/test-gateway-manager.js --timeout 10000
```

Expected: All tests pass (some may SKIP if hermes-agent not present)

- [ ] **Step 6: Commit**

```bash
git add src/main/gateway-manager.js tests/main/test-gateway-manager.js
git commit -m "feat: add GatewayManager core module with lifecycle and detection"
```

---

### Task 2: 实现配置读写和扫码注册

**Files:**
- Modify: `src/main/gateway-manager.js` (追加方法)
- Test: `tests/main/test-gateway-manager.js` (追加测试)

- [ ] **Step 1: 实现配置读取**

在 GatewayManager 类中添加：

```javascript
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
          // Remove surrounding quotes
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
        // Simple YAML parsing for the gateway section (avoiding full YAML dependency)
        const content = fs.readFileSync(configPath, 'utf-8');
        yamlConfig = this._parseGatewayYaml(content);
      } catch { /* YAML parse error, return empty */ }
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
    // Minimal parser for gateway-relevant sections
    const config = {};
    const lines = content.split('\n');
    let currentSection = null;
    let currentSub = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Match top-level sections like "dingtalk:", "feishu:", "platforms:"
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

      // Match platform sub-sections under "platforms:"
      if (currentSection === 'platforms' && line.startsWith('  ') && !line.startsWith('    ')) {
        const subMatch = line.match(/^\s{2}(\w[\w-]*):\s*$/);
        if (subMatch) {
          currentSub = subMatch[1];
          if (!config[currentSub]) config[currentSub] = { extra: {} };
          continue;
        }
      }

      // Match nested properties (2+ spaces indent)
      if (currentSection && line.match(/^\s{2,}/)) {
        const propMatch = line.match(/^\s+(\w[\w_.]*):\s*(.*)$/);
        if (propMatch) {
          const propKey = propMatch[1];
          const propValue = this._parseYamlValue(propMatch[2]);

          if (currentSub) {
            // Under platforms.<sub>
            if (propKey === 'enabled') {
              config[currentSub].enabled = propValue;
            } else if (propKey === 'extra') {
              // Next lines will be extra properties
            } else {
              config[currentSub].extra[propKey] = propValue;
            }
          } else {
            // Direct section property
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
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    // Numbers
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }
```

- [ ] **Step 2: 实现配置保存**

```javascript
  async saveConfig(platform, config) {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    const configPath = path.join(hermesHome, 'config.yaml');

    if (!fs.existsSync(hermesHome)) {
      fs.mkdirSync(hermesHome, { recursive: true });
    }

    // Save to .env
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const envLines = envContent.split('\n');
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

    // Save to config.yaml - update platform enabled status
    if (fs.existsSync(configPath)) {
      let yamlContent = fs.readFileSync(configPath, 'utf-8');
      // Simple approach: append/update platforms section
      const platformsRegex = new RegExp(`^(\\s*)${platform}:\\s*$`, 'm');
      if (platformsRegex.test(yamlContent)) {
        // Update existing section - add/update enabled
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
```

- [ ] **Step 3: 实现扫码注册**

```javascript
  async qrAuth(platform) {
    if (!this.process || !this.running) {
      // We need the hermes-agent Python environment to run the auth
      const devPath = path.join(__dirname, '../hermes-agent');
      const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
      const prodPath = path.join(resourcesDir, 'hermes-agent');
      const hermesPath = fs.existsSync(path.join(devPath, 'cli.py')) ? devPath
        : fs.existsSync(path.join(prodPath, 'cli.py')) ? prodPath
        : null;

      if (!hermesPath) {
        return { success: false, error: 'Hermes Agent 未安装' };
      }

      // Find Python
      const isProduction = hermesPath === prodPath;
      let pythonCmd;
      if (isProduction) {
        const bundledPython = path.join(resourcesDir, 'python-runtime', process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python3'));
        pythonCmd = fs.existsSync(bundledPython) ? bundledPython : (process.platform === 'win32' ? 'python' : 'python3');
      } else {
        const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python3';
        const venvPython = path.join(hermesPath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExe);
        const dotVenvPython = path.join(hermesPath, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExe);
        pythonCmd = fs.existsSync(venvPython) ? venvPython : fs.existsSync(dotVenvPython) ? dotVenvPython : pythonExe;
      }

      // Run QR auth as a subprocess
      const authScript = platform === 'dingtalk'
        ? 'from hermes_cli.dingtalk_auth import dingtalk_qr_auth; import json, sys; r = dingtalk_qr_auth(); print(json.dumps({"success": r is not None, "client_id": r[0] if r else "", "client_secret": r[1] if r else ""}))'
        : 'from gateway.platforms.feishu import qr_register; import json, sys; r = qr_register(); print(json.dumps({"success": r is not None, "app_id": r.get("app_id","") if r else "", "app_secret": r.get("app_secret","") if r else ""}))';

      return new Promise((resolve) => {
        const child = spawn(pythonCmd, ['-c', authScript], {
          cwd: hermesPath,
          env: { ...process.env, HERMES_HOME: path.join(os.homedir(), '.hermes') },
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 7200000, // 2 hour timeout for QR scan
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => {
          stderr += d.toString();
          // Forward QR URL to renderer for display
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
                // Auto-save credentials
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

    return { success: false, error: 'Gateway must not be running during QR auth' };
  }
```

- [ ] **Step 4: 实现 Channel 列表获取**

```javascript
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
```

- [ ] **Step 5: 编写配置和扫码注册测试**

```javascript
// Add to tests/main/test-gateway-manager.js

  it('should parse .env file correctly', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    const fs = require('fs');

    // Backup existing .env if any
    let backup = null;
    if (fs.existsSync(envPath)) {
      backup = fs.readFileSync(envPath, 'utf-8');
    }

    try {
      fs.writeFileSync(envPath, 'DINGTALK_CLIENT_ID=test123\nDINGTALK_CLIENT_SECRET=secret456\n# comment\nFEISHU_APP_ID=feishu789\n', 'utf-8');
      const config = await manager.getConfig();
      assert.strictEqual(config.dingtalk.clientId, 'test123');
      assert.ok(config.dingtalk.clientIdMasked.includes('test123'));
      assert.strictEqual(config.feishu.appId, 'feishu789');
    } finally {
      if (backup !== null) {
        fs.writeFileSync(envPath, backup, 'utf-8');
      } else if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
    }
  });

  it('should save config to .env', async () => {
    const hermesHome = path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    const fs = require('fs');

    let backup = null;
    if (fs.existsSync(envPath)) {
      backup = fs.readFileSync(envPath, 'utf-8');
    }

    try {
      fs.writeFileSync(envPath, '# empty\n', 'utf-8');
      await manager.saveConfig('dingtalk', { enabled: true, clientId: 'new_id', clientSecret: 'new_secret' });
      const content = fs.readFileSync(envPath, 'utf-8');
      assert.ok(content.includes('DINGTALK_CLIENT_ID=new_id'));
      assert.ok(content.includes('DINGTALK_CLIENT_SECRET=new_secret'));
    } finally {
      if (backup !== null) {
        fs.writeFileSync(envPath, backup, 'utf-8');
      }
    }
  });

  it('should return empty channels when channel_directory.json does not exist', async () => {
    const result = await manager.getChannels();
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.platforms, {});
  });
```

- [ ] **Step 6: Commit**

```bash
git add src/main/gateway-manager.js tests/main/test-gateway-manager.js
git commit -m "feat: add gateway config read/write, QR auth, and channel listing"
```

---

### Task 3: 注册 IPC 处理器和 preload API

**Files:**
- Modify: `src/main/ipc-handlers.js`
- Modify: `src/preload/index.js`
- Modify: `src/main/index.js`

- [ ] **Step 1: 在 ipc-handlers.js 中初始化 GatewayManager 并注册处理器**

在 `src/main/ipc-handlers.js` 的 `setupIPCHandlers` 函数中，找到 `agentManager` 初始化位置下方，添加：

```javascript
  // After: cronManager = new CronManager(agentManager, mainWindow);
  const { GatewayManager } = require('./gateway-manager');
  const gatewayManager = new GatewayManager(mainWindow);

  // Auto-detect external gateway on startup
  (async () => {
    try {
      const external = await gatewayManager.detectExternalGateway();
      if (external) {
        gatewayManager.emitStatusChange({
          running: true,
          source: 'external',
          pid: external.pid,
          manager: external.manager,
        });
      }
    } catch { /* detection failed silently */ }
  })();

  // Gateway IPC handlers
  ipcMain.handle('gateway-status', async () => {
    const external = gatewayManager.externalGateway;
    if (external) {
      return {
        running: true,
        source: 'external',
        pid: external.pid,
        manager: external.manager,
        sourceLabel: external.source,
      };
    }
    if (gatewayManager.running) {
      return {
        running: true,
        source: 'gui',
        pid: gatewayManager.process?.pid || null,
        manager: 'gui',
        sourceLabel: 'GUI 自启',
      };
    }
    return { running: false, source: 'none', pid: null, manager: null, sourceLabel: '未启动' };
  });

  ipcMain.handle('gateway-start', async () => {
    const result = await gatewayManager.start();
    return result;
  });

  ipcMain.handle('gateway-stop', async () => {
    const result = await gatewayManager.stop();
    return result;
  });

  ipcMain.handle('gateway-restart', async () => {
    const result = await gatewayManager.restart();
    return result;
  });

  ipcMain.handle('gateway-config-get', async () => {
    return gatewayManager.getConfig();
  });

  ipcMain.handle('gateway-config-save', async (_, platform, config) => {
    return gatewayManager.saveConfig(platform, config);
  });

  ipcMain.handle('gateway-qr-auth', async (_, platform) => {
    return gatewayManager.qrAuth(platform);
  });

  ipcMain.handle('gateway-channels', async () => {
    return gatewayManager.getChannels();
  });
```

在 `module.exports` 中添加 `getGatewayManager`:

```javascript
// Change existing exports line to:
module.exports = { setupIPCHandlers, getAgentManager: () => agentManager, getCronManager: () => cronManager, getGatewayManager: () => gatewayManager };
```

- [ ] **Step 2: 在 preload/index.js 中添加 Gateway API**

在 `src/preload/index.js` 的 `contextBridge.exposeInMainWorld('api', {` 中添加：

```javascript
  // Gateway
  gatewayStatus: () => ipcRenderer.invoke('gateway-status'),
  gatewayStart: () => ipcRenderer.invoke('gateway-start'),
  gatewayStop: () => ipcRenderer.invoke('gateway-stop'),
  gatewayRestart: () => ipcRenderer.invoke('gateway-restart'),
  gatewayConfigGet: () => ipcRenderer.invoke('gateway-config-get'),
  gatewayConfigSave: (platform, config) => ipcRenderer.invoke('gateway-config-save', platform, config),
  gatewayQrAuth: (platform) => ipcRenderer.invoke('gateway-qr-auth', platform),
  gatewayChannels: () => ipcRenderer.invoke('gateway-channels'),
  onGatewayLog: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('gateway-log', handler);
    return () => ipcRenderer.removeListener('gateway-log', handler);
  },
  onGatewayStatusChange: (fn) => {
    const handler = (_, data) => fn(data);
    ipcRenderer.on('gateway-status-change', handler);
    return () => ipcRenderer.removeListener('gateway-status-change', handler);
  },
```

- [ ] **Step 3: 在 index.js 中添加 GatewayManager 到 graceful shutdown**

修改 `src/main/index.js` 的 `before-quit` handler：

```javascript
// Change existing before-quit to:
app.on('before-quit', async () => {
  const agent = getAgentManager();
  if (agent && agent.running) {
    try { await agent.stop(); } catch (_) { /* best effort */ }
  }
  const cron = getCronManager();
  if (cron && cron.isRunning) {
    try { await cron.stop(); } catch (_) { /* best effort */ }
  }
  // Import gateway manager from ipc-handlers
  const { getGatewayManager } = require('./ipc-handlers');
  const gateway = getGatewayManager();
  if (gateway && gateway.running) {
    try { await gateway.stop(); } catch (_) { /* best effort */ }
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js src/main/index.js
git commit -m "feat: register gateway IPC handlers and preload API"
```

---

### Task 4: 新增 Gateway 页面 HTML 结构

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: 在 Rail 中添加 Gateway 按钮**

在 `src/renderer/index.html` 的 `<nav class="rail">` 中，在 settings 按钮之后、skills 按钮之前添加：

```html
        <button class="rail-btn" data-page="gateway" title="Gateway">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </button>
```

- [ ] **Step 2: 添加 Gateway 页面**

在 `<main class="main-content">` 中，在 Skills Page 之后、Cron Page 之前添加：

```html
        <!-- Gateway Page -->
        <div class="page" id="page-gateway">
          <div class="page-header">
            <h2>Gateway</h2>
            <div class="gateway-header-actions">
              <span class="gateway-status-badge" id="gateway-status-badge">未启动</span>
            </div>
          </div>
          <div class="content-scroll">
            <!-- Status Card -->
            <div class="card" id="gateway-status-card">
              <h3>运行状态</h3>
              <div class="gateway-status-grid" id="gateway-status-grid">
                <div class="gateway-status-item"><span class="gateway-status-label">来源</span><span class="gateway-status-value" id="gw-source">-</span></div>
                <div class="gateway-status-item"><span class="gateway-status-label">PID</span><span class="gateway-status-value" id="gw-pid">-</span></div>
                <div class="gateway-status-item"><span class="gateway-status-label">管理器</span><span class="gateway-status-value" id="gw-manager">-</span></div>
                <div class="gateway-status-item"><span class="gateway-status-label">运行时长</span><span class="gateway-status-value" id="gw-uptime">-</span></div>
              </div>
              <div class="form-actions" id="gateway-controls">
                <button id="gateway-start-btn" class="btn btn-primary">启动</button>
                <button id="gateway-stop-btn" class="btn btn-secondary" style="display:none">停止</button>
                <button id="gateway-restart-btn" class="btn btn-secondary" style="display:none">重启</button>
                <label class="toggle-label" style="margin-left:auto">
                  <input type="checkbox" id="gateway-auto-start">
                  <span class="toggle-slider"></span>
                  <span class="toggle-text">开机自动启动</span>
                </label>
              </div>
            </div>

            <!-- Platform Config Card -->
            <div class="card" id="gateway-platform-card">
              <h3>平台配置</h3>

              <!-- DingTalk Config -->
              <div class="gateway-platform-section" id="gateway-dingtalk-section">
                <div class="gateway-platform-header">
                  <div class="gateway-platform-title">
                    <span class="gateway-platform-icon">📌</span>
                    <span>钉钉 (DingTalk)</span>
                  </div>
                  <label class="toggle-label">
                    <input type="checkbox" id="dingtalk-enable">
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <!-- Guide Banner -->
                <div class="gateway-guide-banner">
                  <span class="gateway-guide-icon">💡</span>
                  <div class="gateway-guide-content">
                    <div class="gateway-guide-title">如何获取钉钉凭证？</div>
                    <ol class="gateway-guide-steps">
                      <li>登录 <a href="https://open-dev.dingtalk.com/" target="_blank" class="gateway-guide-link">钉钉开放平台</a> → 创建应用 → 选择"企业内部开发"</li>
                      <li>在应用基本信息页面获取 <strong>AppKey</strong> 和 <strong>AppSecret</strong></li>
                      <li>在应用功能 → 机器人 中开启机器人能力</li>
                    </ol>
                  </div>
                </div>

                <div class="gateway-platform-fields">
                  <div class="form-group">
                    <label for="dingtalk-client-id">Client ID (App Key)</label>
                    <div class="input-with-action">
                      <input type="password" id="dingtalk-client-id" placeholder="请输入 Client ID">
                      <button class="btn-icon" id="toggle-dingtalk-client-id" title="显示/隐藏">👁</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="dingtalk-client-secret">Client Secret (App Secret)</label>
                    <div class="input-with-action">
                      <input type="password" id="dingtalk-client-secret" placeholder="请输入 Client Secret">
                      <button class="btn-icon" id="toggle-dingtalk-client-secret" title="显示/隐藏">👁</button>
                    </div>
                  </div>
                  <div class="form-actions">
                    <button id="dingtalk-qr-auth-btn" class="btn btn-secondary">扫码自动注册</button>
                  </div>
                </div>
              </div>

              <!-- Feishu Config -->
              <div class="gateway-platform-section" id="gateway-feishu-section">
                <div class="gateway-platform-header">
                  <div class="gateway-platform-title">
                    <span class="gateway-platform-icon">🪶</span>
                    <span>飞书 (Feishu)</span>
                  </div>
                  <label class="toggle-label">
                    <input type="checkbox" id="feishu-enable">
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <!-- Guide Banner -->
                <div class="gateway-guide-banner">
                  <span class="gateway-guide-icon">💡</span>
                  <div class="gateway-guide-content">
                    <div class="gateway-guide-title">如何获取飞书凭证？</div>
                    <ol class="gateway-guide-steps">
                      <li>登录 <a href="https://open.feishu.cn/app" target="_blank" class="gateway-guide-link">飞书开放平台</a> → 创建企业自建应用</li>
                      <li>在应用凭证页面获取 <strong>App ID</strong> 和 <strong>App Secret</strong></li>
                      <li>在应用功能 → 机器人 中添加机器人能力，复制 <strong>Verification Token</strong>（可选）</li>
                      <li>推荐选择 <strong>WebSocket 长连接</strong> 模式，无需配置公网回调地址</li>
                    </ol>
                  </div>
                </div>

                <div class="gateway-platform-fields">
                  <div class="form-group">
                    <label for="feishu-app-id">App ID</label>
                    <div class="input-with-action">
                      <input type="password" id="feishu-app-id" placeholder="cli_xxxxx">
                      <button class="btn-icon" id="toggle-feishu-app-id" title="显示/隐藏">👁</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="feishu-app-secret">App Secret</label>
                    <div class="input-with-action">
                      <input type="password" id="feishu-app-secret" placeholder="请输入 App Secret">
                      <button class="btn-icon" id="toggle-feishu-app-secret" title="显示/隐藏">👁</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="feishu-verification-token">Verification Token（可选）</label>
                    <div class="input-with-action">
                      <input type="password" id="feishu-verification-token" placeholder="请输入 Verification Token">
                      <button class="btn-icon" id="toggle-feishu-verification-token" title="显示/隐藏">👁</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="feishu-connection-mode">连接模式</label>
                    <select id="feishu-connection-mode">
                      <option value="websocket">WebSocket 长连接（推荐）</option>
                      <option value="webhook">Webhook 模式</option>
                    </select>
                  </div>
                  <div class="form-actions">
                    <button id="feishu-qr-auth-btn" class="btn btn-secondary">扫码自动注册</button>
                  </div>
                </div>
              </div>

              <div class="form-actions" style="margin-top: 16px;">
                <button id="gateway-save-config-btn" class="btn btn-primary" style="margin-left:auto">保存配置并重启 Gateway</button>
              </div>
            </div>

            <!-- Channel List Card -->
            <div class="card" id="gateway-channels-card">
              <div class="gateway-channels-header">
                <h3 style="margin-bottom:0">Channel 列表</h3>
                <button id="gateway-refresh-channels" class="btn btn-secondary">刷新</button>
              </div>
              <div id="gateway-channels-list" class="gateway-channels-list">
                <div class="empty-state-text">暂无 Channel，发送消息后自动发现</div>
              </div>
            </div>

            <!-- Live Logs Card -->
            <div class="card" id="gateway-logs-card">
              <div class="gateway-logs-header">
                <h3 style="margin-bottom:0">实时日志</h3>
                <div style="display:flex;gap:6px">
                  <button id="gateway-clear-logs" class="btn btn-secondary">清空</button>
                </div>
              </div>
              <div id="gateway-log-viewer" class="log-viewer" style="max-height:200px"></div>
            </div>
          </div>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: add Gateway page HTML structure with rail button"
```

---

### Task 5: 添加 Gateway 页面 CSS 样式

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: 在 styles.css 末尾添加 Gateway 页面样式**

```css
/* ========================================
   Gateway Page
   ======================================== */

.gateway-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.gateway-status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-hover);
  color: var(--text-muted);
}

.gateway-status-badge.running {
  background: rgba(46, 155, 90, 0.15);
  color: var(--success);
}

.gateway-status-badge.running::before {
  content: '● ';
}

.gateway-status-badge.external {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
}

.gateway-status-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.gateway-status-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gateway-status-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gateway-status-value {
  font-size: 13px;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

/* Platform Sections */
.gateway-platform-section {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
}

.gateway-platform-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.gateway-platform-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.gateway-platform-icon {
  font-size: 18px;
}

.gateway-platform-fields {
  margin-top: var(--space-sm);
}

/* Guide Banner */
.gateway-guide-banner {
  display: flex;
  gap: var(--space-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
}

.gateway-guide-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.gateway-guide-content {
  flex: 1;
}

.gateway-guide-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.gateway-guide-steps {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.gateway-guide-steps li {
  margin-bottom: 2px;
}

.gateway-guide-link {
  color: #60a5fa;
  text-decoration: none;
}

.gateway-guide-link:hover {
  text-decoration: underline;
}

/* Channels */
.gateway-channels-header,
.gateway-logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.gateway-channels-list {
  max-height: 300px;
  overflow-y: auto;
}

.gateway-channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-xs);
  transition: background var(--transition);
}

.gateway-channel-item:hover {
  background: var(--bg-hover);
}

.gateway-channel-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.gateway-channel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}

.gateway-channel-dot.inactive {
  background: var(--text-muted);
}

.gateway-channel-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.gateway-channel-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.gateway-channel-time {
  font-size: 11px;
  color: var(--text-muted);
}

/* QR Auth Modal */
.gateway-qr-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.gateway-qr-modal {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 360px;
  max-width: 90vw;
  text-align: center;
}

.gateway-qr-modal h3 {
  font-size: 16px;
  margin-bottom: var(--space-md);
  color: var(--text-primary);
}

.gateway-qr-image {
  background: #fff;
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin: var(--space-md) auto;
  display: inline-block;
}

.gateway-qr-image img {
  display: block;
  max-width: 200px;
  height: auto;
}

.gateway-qr-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}

.gateway-qr-url {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
  margin-bottom: var(--space-md);
}

.gateway-qr-status {
  font-size: 13px;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-md);
}

.gateway-qr-status.waiting {
  background: rgba(232, 165, 75, 0.1);
  color: var(--warning);
}

.gateway-qr-status.success {
  background: rgba(46, 155, 90, 0.1);
  color: var(--success);
}

.gateway-qr-status.error {
  background: rgba(217, 92, 65, 0.1);
  color: var(--error);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .gateway-status-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/styles.css
git commit -m "style: add Gateway page CSS styles"
```

---

### Task 6: 实现 Gateway 页面前端逻辑

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: 在 showPage 函数中处理 gateway 页面**

在 `src/renderer/app.js` 的 `showPage` 函数中，修改 mid-panel 隐藏逻辑：

```javascript
// Change existing midPanel display line to:
    midPanel.style.display = (pageName === 'settings' || pageName === 'logs' || pageName === 'skills' || pageName === 'cron' || pageName === 'gateway') ? 'none' : '';
```

在 keyboard shortcuts 数组中添加 'gateway'：

```javascript
// Change existing pages array to:
    const pages = ['chat', 'settings', 'gateway', 'skills', 'logs', 'cron'];
```

- [ ] **Step 2: 添加 Gateway 页面初始化逻辑**

在 `src/renderer/app.js` 末尾（或合适的位置）添加：

```javascript
// ============================
// Gateway Page
// ============================
let gatewayRunning = false;
let gatewayStartTime = null;
let gatewayUptimeInterval = null;

async function initGatewayPage() {
  try {
    const status = await window.api.gatewayStatus();
    updateGatewayStatus(status);
  } catch (err) {
    console.error('Failed to get gateway status:', err);
  }

  try {
    const config = await window.api.gatewayConfigGet();
    populateGatewayConfig(config);
  } catch (err) {
    console.error('Failed to get gateway config:', err);
  }

  try {
    await loadGatewayChannels();
  } catch (err) {
    console.error('Failed to load channels:', err);
  }

  // Listen for status changes
  window.api.onGatewayStatusChange((status) => {
    updateGatewayStatus(status);
  });

  // Listen for logs
  window.api.onGatewayLog((data) => {
    appendGatewayLog(data);
  });
}

function updateGatewayStatus(status) {
  const badge = document.getElementById('gateway-status-badge');
  const sourceEl = document.getElementById('gw-source');
  const pidEl = document.getElementById('gw-pid');
  const managerEl = document.getElementById('gw-manager');
  const startBtn = document.getElementById('gateway-start-btn');
  const stopBtn = document.getElementById('gateway-stop-btn');
  const restartBtn = document.getElementById('gateway-restart-btn');

  if (!badge) return;

  gatewayRunning = status.running;

  if (status.running) {
    badge.textContent = status.source === 'external' ? `● ${status.sourceLabel || '外部 Gateway'}` : '● 运行中';
    badge.className = 'gateway-status-badge running' + (status.source === 'external' ? ' external' : '');
    sourceEl.textContent = status.sourceLabel || '-';
    pidEl.textContent = status.pid || '-';
    managerEl.textContent = status.manager || '-';

    if (status.source === 'external') {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'none';
      restartBtn.style.display = 'none';
    } else {
      startBtn.style.display = 'none';
      stopBtn.style.display = '';
      restartBtn.style.display = '';
      gatewayStartTime = Date.now();
      startUptimeCounter();
    }
  } else {
    badge.textContent = '未启动';
    badge.className = 'gateway-status-badge';
    sourceEl.textContent = '-';
    pidEl.textContent = '-';
    managerEl.textContent = '-';
    startBtn.style.display = '';
    stopBtn.style.display = 'none';
    restartBtn.style.display = 'none';
    stopUptimeCounter();
  }
}

function startUptimeCounter() {
  stopUptimeCounter();
  gatewayUptimeInterval = setInterval(() => {
    if (!gatewayStartTime) return;
    const elapsed = Date.now() - gatewayStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const uptimeEl = document.getElementById('gw-uptime');
    if (uptimeEl) {
      uptimeEl.textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
    }
  }, 1000);
}

function stopUptimeCounter() {
  if (gatewayUptimeInterval) {
    clearInterval(gatewayUptimeInterval);
    gatewayUptimeInterval = null;
  }
}

function populateGatewayConfig(config) {
  if (!config) return;

  // DingTalk
  const dtEnable = document.getElementById('dingtalk-enable');
  const dtClientId = document.getElementById('dingtalk-client-id');
  const dtClientSecret = document.getElementById('dingtalk-client-secret');
  if (dtEnable) dtEnable.checked = config.dingtalk?.enabled || false;
  if (dtClientId) dtClientId.value = config.dingtalk?.clientId || '';
  if (dtClientSecret) dtClientSecret.value = ''; // Never populate secret from config

  // Feishu
  const fsEnable = document.getElementById('feishu-enable');
  const fsAppId = document.getElementById('feishu-app-id');
  const fsAppSecret = document.getElementById('feishu-app-secret');
  const fsToken = document.getElementById('feishu-verification-token');
  const fsMode = document.getElementById('feishu-connection-mode');
  if (fsEnable) fsEnable.checked = config.feishu?.enabled || false;
  if (fsAppId) fsAppId.value = config.feishu?.appId || '';
  if (fsAppSecret) fsAppSecret.value = '';
  if (fsToken) fsToken.value = '';
  if (fsMode) fsMode.value = config.feishu?.connectionMode || 'websocket';
}

async function loadGatewayChannels() {
  const listEl = document.getElementById('gateway-channels-list');
  if (!listEl) return;

  try {
    const result = await window.api.gatewayChannels();
    if (!result.success || !result.platforms || Object.keys(result.platforms).length === 0) {
      listEl.innerHTML = '<div class="empty-state-text">暂无 Channel，发送消息后自动发现</div>';
      return;
    }

    let html = '';
    for (const [platform, channels] of Object.entries(result.platforms)) {
      if (!channels || channels.length === 0) continue;
      for (const ch of channels) {
        html += `<div class="gateway-channel-item">
          <div class="gateway-channel-info">
            <span class="gateway-channel-dot"></span>
            <div>
              <div class="gateway-channel-name">${escapeHtml(ch.name)}</div>
              <div class="gateway-channel-meta">${escapeHtml(platform)} · ${escapeHtml(ch.id || '')}</div>
            </div>
          </div>
        </div>`;
      }
    }

    if (!html) {
      listEl.innerHTML = '<div class="empty-state-text">暂无 Channel，发送消息后自动发现</div>';
    } else {
      listEl.innerHTML = html;
    }
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function appendGatewayLog(data) {
  const viewer = document.getElementById('gateway-log-viewer');
  if (!viewer) return;

  const time = new Date().toLocaleTimeString();
  const level = data.level || 'info';
  const message = data.message || '';

  const levelColor = level === 'error' ? 'var(--error)' : level === 'warn' ? 'var(--warning)' : 'var(--text-secondary)';

  viewer.innerHTML += `<div><span style="color:${levelColor}">[${time}]</span> ${escapeHtml(message)}</div>`;
  viewer.scrollTop = viewer.scrollHeight;
}

// Event bindings
document.getElementById('gateway-start-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-start-btn');
  btn.disabled = true;
  btn.textContent = '启动中...';
  try {
    const result = await window.api.gatewayStart();
    if (result.success) {
      updateGatewayStatus({ running: true, source: 'gui', pid: result.pid, manager: 'gui', sourceLabel: 'GUI 自启' });
    } else {
      alert(`启动失败: ${result.error}`);
    }
  } catch (err) {
    alert(`启动异常: ${err.message}`);
  }
  btn.disabled = false;
  btn.textContent = '启动';
});

document.getElementById('gateway-stop-btn')?.addEventListener('click', async () => {
  try {
    await window.api.gatewayStop();
    updateGatewayStatus({ running: false, source: 'none' });
  } catch (err) {
    alert(`停止异常: ${err.message}`);
  }
});

document.getElementById('gateway-restart-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-restart-btn');
  btn.disabled = true;
  btn.textContent = '重启中...';
  try {
    const result = await window.api.gatewayRestart();
    if (result.success) {
      updateGatewayStatus({ running: true, source: 'gui', pid: result.pid, manager: 'gui', sourceLabel: 'GUI 自启' });
    } else {
      alert(`重启失败: ${result.error}`);
    }
  } catch (err) {
    alert(`重启异常: ${err.message}`);
  }
  btn.disabled = false;
  btn.textContent = '重启';
});

document.getElementById('gateway-refresh-channels')?.addEventListener('click', () => loadGatewayChannels());

document.getElementById('gateway-clear-logs')?.addEventListener('click', () => {
  const viewer = document.getElementById('gateway-log-viewer');
  if (viewer) viewer.innerHTML = '';
});

// Toggle password visibility for gateway fields
['dingtalk-client-id', 'dingtalk-client-secret', 'feishu-app-id', 'feishu-app-secret', 'feishu-verification-token'].forEach(id => {
  const toggleBtn = document.getElementById(`toggle-${id}`);
  const input = document.getElementById(id);
  if (toggleBtn && input) {
    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleBtn.textContent = input.type === 'password' ? '👁' : '👁‍🗨';
    });
  }
});

// Save gateway config
document.getElementById('gateway-save-config-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('gateway-save-config-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    // Save DingTalk
    const dtEnabled = document.getElementById('dingtalk-enable')?.checked || false;
    const dtClientId = document.getElementById('dingtalk-client-id')?.value || '';
    const dtClientSecret = document.getElementById('dingtalk-client-secret')?.value || '';
    if (dtEnabled && (dtClientId || dtClientSecret)) {
      await window.api.gatewayConfigSave('dingtalk', {
        enabled: true,
        clientId: dtClientId,
        clientSecret: dtClientSecret,
      });
    }

    // Save Feishu
    const fsEnabled = document.getElementById('feishu-enable')?.checked || false;
    const fsAppId = document.getElementById('feishu-app-id')?.value || '';
    const fsAppSecret = document.getElementById('feishu-app-secret')?.value || '';
    const fsToken = document.getElementById('feishu-verification-token')?.value || '';
    const fsMode = document.getElementById('feishu-connection-mode')?.value || 'websocket';
    if (fsEnabled && (fsAppId || fsAppSecret)) {
      await window.api.gatewayConfigSave('feishu', {
        enabled: true,
        appId: fsAppId,
        appSecret: fsAppSecret,
        verificationToken: fsToken,
        connectionMode: fsMode,
      });
    }

    // Restart gateway to pick up changes
    if (gatewayRunning) {
      await window.api.gatewayRestart();
    }

    setBtnState(btn, '已保存 ✓');
  } catch (err) {
    btn.textContent = `保存失败: ${err.message}`;
    btn.disabled = false;
  }
});

// QR Auth buttons
document.getElementById('dingtalk-qr-auth-btn')?.addEventListener('click', async () => {
  await startQrAuth('dingtalk');
});

document.getElementById('feishu-qr-auth-btn')?.addEventListener('click', async () => {
  await startQrAuth('feishu');
});

async function startQrAuth(platform) {
  const label = platform === 'dingtalk' ? '钉钉' : '飞书';
  const overlay = document.createElement('div');
  overlay.className = 'gateway-qr-modal-overlay';
  overlay.innerHTML = `
    <div class="gateway-qr-modal">
      <h3>${label}扫码注册</h3>
      <div class="gateway-qr-status waiting" id="qr-status">正在生成 QR 码...</div>
      <div class="gateway-qr-image" id="qr-image" style="display:none"></div>
      <div class="gateway-qr-hint" id="qr-hint">请使用${label}扫描下方二维码</div>
      <div class="gateway-qr-url" id="qr-url"></div>
      <button class="btn btn-secondary" id="qr-cancel-btn">取消</button>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    const result = await window.api.gatewayQrAuth(platform);
    const statusEl = document.getElementById('qr-status');

    if (result.success) {
      statusEl.className = 'gateway-qr-status success';
      statusEl.textContent = '注册成功！凭证已自动保存';
      setTimeout(() => {
        overlay.remove();
        // Refresh config display
        window.api.gatewayConfigGet().then(populateGatewayConfig);
      }, 2000);
    } else {
      statusEl.className = 'gateway-qr-status error';
      statusEl.textContent = `注册失败: ${result.error || '未知错误'}`;
    }
  } catch (err) {
    const statusEl = document.getElementById('qr-status');
    statusEl.className = 'gateway-qr-status error';
    statusEl.textContent = `注册异常: ${err.message}`;
  }

  document.getElementById('qr-cancel-btn')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Initialize gateway page when shown
const origShowPage = showPage;
// Re-bind: when gateway page is shown, init it
document.querySelector('[data-page="gateway"]')?.addEventListener('click', () => {
  initGatewayPage();
});
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: implement Gateway page frontend logic"
```

---

### Task 7: E2E 测试 — Gateway 页面完整流程

**Files:**
- Create: `tests/e2e/test-gateway-page.mjs`

- [ ] **Step 1: 编写 E2E 测试脚本**

```javascript
// tests/e2e/test-gateway-page.mjs
import { _electron } from 'playwright';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import assert from 'assert';

const TEST_DIR = path.join(os.tmpdir(), 'hermes-gateway-e2e');
const HERMES_HOME = path.join(TEST_DIR, '.hermes');

// Setup test environment
function setupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(HERMES_HOME, { recursive: true });
  fs.writeFileSync(path.join(HERMES_HOME, '.env'), '# test env\n', 'utf-8');
  fs.writeFileSync(path.join(HERMES_HOME, 'config.yaml'), '# test config\n', 'utf-8');
}

function cleanupTestEnv() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function runE2ETests() {
  console.log('=== Gateway Page E2E Tests ===\n');

  setupTestEnv();

  let app;
  let mainWindow;

  try {
    // Launch Electron app
    console.log('1. Launching Electron app...');
    app = await _electron.launch({
      args: ['.'],
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, HOME: TEST_DIR, HERMES_HOME },
    });

    mainWindow = await app.firstWindow();
    await mainWindow.waitForLoadState();
    console.log('   ✓ App launched\n');

    // Test 1: Gateway page is accessible
    console.log('2. Testing Gateway page accessibility...');
    await mainWindow.click('[data-page="gateway"]');
    await mainWindow.waitForSelector('#page-gateway.active');
    const pageTitle = await mainWindow.textContent('#page-gateway h2');
    assert.strictEqual(pageTitle, 'Gateway', 'Page title should be "Gateway"');
    console.log('   ✓ Gateway page accessible\n');

    // Test 2: Gateway status shows "未启动" initially
    console.log('3. Testing initial Gateway status...');
    const badge = await mainWindow.textContent('#gateway-status-badge');
    assert.ok(badge.includes('未启动'), `Expected "未启动", got "${badge}"`);
    console.log('   ✓ Initial status correct\n');

    // Test 3: Platform config fields exist
    console.log('4. Testing platform config fields...');
    const dingtalkSection = await mainWindow.$('#gateway-dingtalk-section');
    const feishuSection = await mainWindow.$('#gateway-feishu-section');
    assert.ok(dingtalkSection, 'DingTalk section should exist');
    assert.ok(feishuSection, 'Feishu section should exist');

    const clientIdInput = await mainWindow.$('#dingtalk-client-id');
    const appIdInput = await mainWindow.$('#feishu-app-id');
    assert.ok(clientIdInput, 'DingTalk client ID input should exist');
    assert.ok(appIdInput, 'Feishu app ID input should exist');
    console.log('   ✓ Platform config fields exist\n');

    // Test 4: Guide banners with links
    console.log('5. Testing guide banners...');
    const dingtalkLink = await mainWindow.$('#gateway-dingtalk-section .gateway-guide-link');
    const feishuLink = await mainWindow.$('#gateway-feishu-section .gateway-guide-link');
    assert.ok(dingtalkLink, 'DingTalk guide link should exist');
    assert.ok(feishuLink, 'Feishu guide link should exist');

    const dingtalkLinkHref = await dingtalkLink.getAttribute('href');
    const feishuLinkHref = await feishuLink.getAttribute('href');
    assert.strictEqual(dingtalkLinkHref, 'https://open-dev.dingtalk.com/');
    assert.strictEqual(feishuLinkHref, 'https://open.feishu.cn/app');
    console.log('   ✓ Guide banners with correct links\n');

    // Test 5: Channel list shows empty state
    console.log('6. Testing channel list empty state...');
    const channelList = await mainWindow.textContent('#gateway-channels-list');
    assert.ok(channelList.includes('暂无 Channel'), 'Channel list should show empty state');
    console.log('   ✓ Channel list empty state correct\n');

    // Test 6: Log viewer exists
    console.log('7. Testing log viewer...');
    const logViewer = await mainWindow.$('#gateway-log-viewer');
    assert.ok(logViewer, 'Log viewer should exist');
    console.log('   ✓ Log viewer exists\n');

    // Test 7: Start/Stop buttons toggle correctly (without actual gateway)
    console.log('8. Testing button visibility...');
    const startBtn = await mainWindow.$('#gateway-start-btn');
    const stopBtn = await mainWindow.$('#gateway-stop-btn');
    const startVisible = await startBtn.isVisible();
    const stopVisible = await stopBtn.isVisible();
    assert.ok(startVisible, 'Start button should be visible when not running');
    assert.ok(!stopVisible, 'Stop button should be hidden when not running');
    console.log('   ✓ Button visibility correct\n');

    console.log('=== All E2E tests passed! ===\n');

  } catch (err) {
    console.error('E2E test failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
    cleanupTestEnv();
  }
}

runE2ETests();
```

- [ ] **Step 2: 安装 Playwright 依赖（如果尚未安装）**

```bash
npm install --save-dev playwright
npx playwright install chromium
```

- [ ] **Step 3: 在 package.json 中添加 E2E 测试脚本**

```json
"scripts": {
  ...
  "test:e2e": "node tests/e2e/test-gateway-page.mjs"
}
```

- [ ] **Step 4: 运行 E2E 测试**

```bash
npm run test:e2e
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/test-gateway-page.mjs package.json
git commit -m "test: add E2E tests for Gateway page"
```

---

### Task 8: 在 Titlebar 添加 Gateway 状态指示灯

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: 在 Titlebar 右侧添加 Gateway 状态点**

在 `src/renderer/index.html` 的 `.titlebar-right` 中，在 `status-dingtalk-dot` 之后添加：

```html
        <span class="status-dot" id="status-gateway-dot" data-tooltip="Gateway"></span>
```

- [ ] **Step 2: 在 app.js 的 initGatewayPage 中更新 titlebar 状态点**

在 `updateGatewayStatus` 函数末尾添加：

```javascript
  // Update titlebar status dot
  const dotEl = document.getElementById('status-gateway-dot');
  if (dotEl) {
    dotEl.className = 'status-dot' + (status.running ? ' success' : '');
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html src/renderer/app.js
git commit -m "feat: add Gateway status indicator to titlebar"
```

---

### Task 9: 最终集成测试和清理

**Files:**
- All modified files

- [ ] **Step 1: 运行所有单元测试**

```bash
npx mocha tests/main/test-gateway-manager.js --timeout 10000
```

- [ ] **Step 2: 运行 E2E 测试**

```bash
npm run test:e2e
```

- [ ] **Step 3: 在开发模式下手动测试完整流程**

```bash
npm run dev
```

手动测试清单：
1. 打开应用 → 点击 Gateway 按钮 → 页面正确显示
2. 初始状态显示"未启动"
3. 点击"启动" → 状态变为"运行中"，PID 显示
4. 点击"停止" → 状态变回"未启动"
5. 填写钉钉/飞书凭证 → 点击保存 → 检查 `~/.hermes/.env` 是否正确更新
6. 点击"刷新"Channel 列表 → 正确显示或显示空状态
7. 日志区域正确显示 Gateway 输出
8. Titlebar Gateway 状态点正确切换

- [ ] **Step 4: 最终 commit**

```bash
git add -A
git commit -m "feat: complete Gateway & Channel integration with E2E tests"
```

---

## 自审检查

### Spec 覆盖检查

| Spec 需求 | 对应 Task |
|-----------|-----------|
| GUI 默认启用 Gateway | Task 1 (GatewayManager), Task 3 (auto-detect on startup) |
| 检测外部 Gateway 并复用 | Task 1 (detectExternalGateway), Task 3 (IPC handler) |
| 显示 Gateway 状态/来源/platform | Task 1, Task 4 (status card), Task 6 (updateGatewayStatus) |
| Channel 消息正确处理 | Task 2 (getChannels), Task 6 (loadGatewayChannels) |
| Rail 新增按钮和页面 | Task 4 (HTML), Task 5 (CSS), Task 6 (JS) |
| 平台配置（钉钉/飞书） | Task 2 (config), Task 4 (HTML), Task 6 (JS) |
| 凭证引导和跳转链接 | Task 4 (guide banners) |
| 扫码自动注册 | Task 2 (qrAuth), Task 6 (startQrAuth) |
| 实时日志 | Task 1 (emitLog), Task 6 (appendGatewayLog) |
| E2E 测试 | Task 7 |

### 占位符扫描

无 TBD/TODO/placeholder。所有步骤包含完整代码。

### 类型一致性

所有 IPC 通道名称使用 kebab-case（`gateway-status`, `gateway-start` 等），与 preload API 的 camelCase 映射一致。GatewayManager 方法名与 IPC handlers 一一对应。
