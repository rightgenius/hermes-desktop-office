const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

class AgentManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    this.messageQueue = [];
    this.isGenerating = false;
    this.responseBuffer = '';
    this.currentResponseCallback = null;
  }

  async start(config = {}) {
    if (this.running) return { success: false, error: 'Agent 已在运行中' };

    const hermesPath = path.join(__dirname, '../hermes-agent');
    if (!fs.existsSync(path.join(hermesPath, 'cli.py'))) {
      return { success: false, error: 'Hermes Agent 未安装，请确保 hermes-agent submodule 已正确初始化' };
    }

    // Find Python interpreter: prefer venv, fallback to system python3
    const venvPython = path.join(hermesPath, 'venv', 'bin', 'python3');
    const dotVenvPython = path.join(hermesPath, '.venv', 'bin', 'python3');
    let pythonCmd = 'python3';

    if (fs.existsSync(venvPython)) {
      pythonCmd = venvPython;
    } else if (fs.existsSync(dotVenvPython)) {
      pythonCmd = dotVenvPython;
    } else {
      // No venv — create one using uv
      try {
        const { execFileSync } = require('child_process');
        const uv = execFileSync('which', ['uv'], { encoding: 'utf-8' }).trim();
        if (uv) {
          this.emitLog('info', '首次启动：正在创建 Python 虚拟环境...');
          execFileSync(uv, ['venv'], { cwd: hermesPath });
          this.emitLog('info', '正在安装依赖（首次可能需要几分钟）...');
          execFileSync(uv, ['pip', 'install', '-e', '.[all]'], { cwd: hermesPath, timeout: 300000 });
          pythonCmd = venvPython;
          this.emitLog('info', '依赖安装完成');
        }
      } catch (setupErr) {
        this.emitLog('error', `自动安装 venv 失败: ${setupErr.message}`);
        this.emitLog('info', '请手动运行: cd src/hermes-agent && uv venv && uv pip install -e .[all]');
        pythonCmd = 'python3';
      }
    }

    const workspacePath = config.workspacePath || '';
    const env = { ...process.env, HERMES_WORKSPACE: workspacePath };
    if (config.apiKey) env.OPENAI_API_KEY = config.apiKey;
    if (config.baseUrl) env.OPENROUTER_BASE_URL = config.baseUrl;
    if (config.provider && config.provider !== 'auto') env.HERMES_INFERENCE_PROVIDER = config.provider;
    if (config.model) env.HERMES_INFERENCE_MODEL = config.model;

    try {
      this.process = spawn(pythonCmd, ['cli.py'], { cwd: hermesPath, env, stdio: ['pipe', 'pipe', 'pipe'] });
      this.running = true;
      this.sendStatusUpdate();

      const stdoutRL = readline.createInterface({ input: this.process.stdout });
      stdoutRL.on('line', (line) => this.handleStdoutLine(line));

      this.process.stderr.on('data', (d) => this.emitLog('error', d.toString().trim()));
      this.process.on('close', (code) => {
        this.running = false; this.process = null;
        this.isGenerating = false;
        this.emitLog('info', `Agent 进程退出，退出码: ${code}`);
        this.sendStatusUpdate();
      });
      this.process.on('error', (err) => {
        this.running = false; this.process = null;
        this.isGenerating = false;
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
        this.isGenerating = false;
        this.emitLog('info', 'Agent 已停止'); this.sendStatusUpdate();
        resolve({ success: true });
      });
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL'); this.running = false; this.process = null;
          this.isGenerating = false;
          this.emitLog('info', 'Agent 已强制停止'); this.sendStatusUpdate();
          resolve({ success: true });
        }
      }, 5000);
    });
  }

  handleStdoutLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    this.emitLog('info', trimmed);

    if (trimmed.startsWith('[RESPONSE_START]')) {
      this.isGenerating = true;
      this.responseBuffer = '';
      this.emitResponse('start', '');
      return;
    }

    if (trimmed.startsWith('[RESPONSE_END]')) {
      this.isGenerating = false;
      this.emitResponse('complete', this.responseBuffer);
      this.responseBuffer = '';
      return;
    }

    if (trimmed.startsWith('[RESPONSE_CHUNK]')) {
      const chunk = trimmed.replace('[RESPONSE_CHUNK]', '').trim();
      this.responseBuffer += chunk;
      this.emitResponse('chunk', chunk);
      return;
    }

    if (trimmed.startsWith('[RESPONSE_ERROR]')) {
      const errorMsg = trimmed.replace('[RESPONSE_ERROR]', '').trim();
      this.isGenerating = false;
      this.emitResponse('error', errorMsg);
      this.responseBuffer = '';
      return;
    }
  }

  sendMessage(text) {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }
    if (this.isGenerating) {
      return { success: false, error: 'Agent 正在生成响应中' };
    }

    try {
      const message = JSON.stringify({ type: 'user_message', content: text }) + '\n';
      this.process.stdin.write(message);
      this.isGenerating = true;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  stopGeneration() {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }
    if (!this.isGenerating) {
      return { success: false, error: '没有正在进行的生成' };
    }

    try {
      this.process.kill('SIGINT');
      this.isGenerating = false;
      this.responseBuffer = '';
      this.emitResponse('stopped', '');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  emitResponse(event, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent-response', { event, data });
    }
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
