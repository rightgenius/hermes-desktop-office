const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

class AgentManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    this.isGenerating = false;
  }

  async start(config = {}) {
    if (this.running) return { success: false, error: 'Agent 已在运行中' };

    const hermesPath = path.join(__dirname, '../hermes-agent');
    if (!fs.existsSync(path.join(hermesPath, 'cli.py'))) {
      return { success: false, error: 'Hermes Agent 未安装，请确保 hermes-agent submodule 已正确初始化' };
    }

    // Find Python interpreter: check dev venv, packaged venv, then fail
    const venvPython = path.join(hermesPath, 'venv', 'bin', 'python3');
    const dotVenvPython = path.join(hermesPath, '.venv', 'bin', 'python3');
    // In packaged Electron app, resources are in Resources/ (mac) or similar
    const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
    const packagedVenv = path.join(resourcesDir, 'hermes-agent', 'venv', 'bin', 'python3');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython
                    : fs.existsSync(dotVenvPython) ? dotVenvPython
                    : fs.existsSync(packagedVenv) ? packagedVenv
                    : null;

    if (!pythonCmd) {
      return {
        success: false,
        error: 'Hermes Agent 依赖未安装。请运行以下命令安装依赖：\n' +
          'cd src/hermes-agent && uv venv && uv pip install .\n\n' +
          '或使用项目脚本：bash scripts/setup-agent.sh'
      };
    }

    const workspacePath = config.workspacePath || '';
    const env = { ...process.env, HERMES_WORKSPACE: workspacePath };
    if (config.apiKey) env.OPENAI_API_KEY = config.apiKey;
    if (config.baseUrl) env.OPENROUTER_BASE_URL = config.baseUrl;
    if (config.provider && config.provider !== 'auto') env.HERMES_INFERENCE_PROVIDER = config.provider;
    if (config.model) env.HERMES_INFERENCE_MODEL = config.model;

    try {
      // Use bridge.py for JSON-based GUI communication instead of cli.py
      const bridgeScript = path.join(__dirname, 'agent-bridge.py');
      if (!fs.existsSync(bridgeScript)) {
        return { success: false, error: 'agent-bridge.py 未找到' };
      }

      this.process = spawn(pythonCmd, [bridgeScript, hermesPath], { cwd: hermesPath, env, stdio: ['pipe', 'pipe', 'pipe'] });
      this.running = true;
      this.sendStatusUpdate();

      // Read JSON responses from bridge
      this._buffer = '';
      this.process.stdout.on('data', (d) => {
        this._buffer += d.toString();
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() || ''; // Keep incomplete line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            this._handleBridgeMessage(msg);
          } catch {
            // Non-JSON output (warnings, etc.) - treat as log
            this.emitLog('info', line.trim());
          }
        }
      });

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

  sendMessage(text) {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }
    if (this.isGenerating) {
      return { success: false, error: 'Agent 正在生成响应中' };
    }

    try {
      const message = JSON.stringify({ type: 'message', content: text }) + '\n';
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
      this.process.stdin.write(JSON.stringify({ type: 'stop' }) + '\n');
      this.isGenerating = false;
      this.emitResponse('stopped', '');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  _handleBridgeMessage(msg) {
    switch (msg.type) {
      case 'ready':
        this.emitLog('info', 'Agent 已就绪，等待消息...');
        break;
      case 'start':
        this.emitResponse('start', '');
        break;
      case 'chunk':
        this.emitResponse('chunk', msg.text || '');
        break;
      case 'done':
        this.isGenerating = false;
        this.emitResponse('complete', msg.text || '');
        break;
      case 'error':
        this.isGenerating = false;
        this.emitResponse('error', msg.message || '未知错误');
        this.emitLog('error', `Agent 错误: ${msg.message}`);
        break;
      case 'stopped':
        this.isGenerating = false;
        this.emitResponse('stopped', '');
        break;
      default:
        this.emitLog('info', `[bridge] ${JSON.stringify(msg)}`);
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
