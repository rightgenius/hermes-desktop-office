const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AgentManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
  }

  async start(config = {}) {
    if (this.running) return { success: false, error: 'Agent 已在运行中' };

    const hermesPath = path.join(__dirname, '../../hermes-agent');
    if (!fs.existsSync(path.join(hermesPath, 'cli.py'))) {
      return { success: false, error: 'Hermes Agent 未安装，请确保 hermes-agent submodule 已正确初始化' };
    }

    const workspacePath = config.workspacePath || '';
    const env = { ...process.env, HERMES_WORKSPACE: workspacePath };
    if (config.apiToken) env.HERMES_API_TOKEN = config.apiToken;
    if (config.gatewayUrl) env.HERMES_GATEWAY_URL = config.gatewayUrl;

    try {
      this.process = spawn('python3', ['cli.py'], { cwd: hermesPath, env, stdio: ['pipe', 'pipe', 'pipe'] });
      this.running = true;
      this.sendStatusUpdate();

      this.process.stdout.on('data', (d) => this.emitLog('info', d.toString().trim()));
      this.process.stderr.on('data', (d) => this.emitLog('error', d.toString().trim()));
      this.process.on('close', (code) => {
        this.running = false; this.process = null;
        this.emitLog('info', `Agent 进程退出，退出码: ${code}`);
        this.sendStatusUpdate();
      });
      this.process.on('error', (err) => {
        this.running = false; this.process = null;
        this.emitLog('error', `Agent 启动失败: ${err.message}`);
        this.sendStatusUpdate();
      });
      return { success: true };
    } catch (err) {
      this.running = false; this.process = null;
      return { success: false, error: err.message };
    }
  }

  async stop() {
    if (!this.running || !this.process) return { success: false, error: 'Agent 未运行' };
    return new Promise((resolve) => {
      this.process.on('close', () => {
        this.running = false; this.process = null;
        this.emitLog('info', 'Agent 已停止'); this.sendStatusUpdate();
        resolve({ success: true });
      });
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL'); this.running = false; this.process = null;
          this.emitLog('info', 'Agent 已强制停止'); this.sendStatusUpdate();
          resolve({ success: true });
        }
      }, 5000);
    });
  }

  emitLog(level, message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent-log', { level, message });
    }
  }

  sendStatusUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent-status', { running: this.running });
    }
  }
}

module.exports = { AgentManager };
