const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AgentManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    // Track per-session generation state
    this.sessionStates = new Map(); // sessionId -> { isGenerating: boolean }
  }

  async start(config = {}) {
    if (this.running) return { success: false, error: 'Agent 已在运行中' };

    // Find hermes-agent path: development or production
    const devPath = path.join(__dirname, '../hermes-agent');
    const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
    const prodPath = path.join(resourcesDir, 'hermes-agent');
    
    const hermesPath = fs.existsSync(path.join(devPath, 'cli.py')) ? devPath
                     : fs.existsSync(path.join(prodPath, 'cli.py')) ? prodPath
                     : null;
    const isProduction = hermesPath === prodPath;

    if (!hermesPath) {
      return { success: false, error: 'Hermes Agent 未安装，请确保 hermes-agent submodule 已正确初始化' };
    }

    // Find Python interpreter
    let pythonCmd = null;
    let pythonPathEnv = null;

    if (isProduction) {
      // Production: use system python3 + PYTHONPATH
      const systemPython = '/usr/bin/python3';
      if (fs.existsSync(systemPython)) {
        pythonCmd = systemPython;
        const depsPath = path.join(hermesPath, 'deps');
        pythonPathEnv = [hermesPath, depsPath].filter(p => fs.existsSync(p)).join(path.delimiter);
      }
    } else {
      // Development: use venv python
      const venvPython = path.join(hermesPath, 'venv', 'bin', 'python3');
      const dotVenvPython = path.join(hermesPath, '.venv', 'bin', 'python3');
      pythonCmd = fs.existsSync(venvPython) ? venvPython
                : fs.existsSync(dotVenvPython) ? dotVenvPython
                : null;
    }

    if (!pythonCmd) {
      return {
        success: false,
        error: isProduction
          ? '系统未安装 Python3，请先安装 Python3'
          : 'Hermes Agent 依赖未安装。请运行以下命令安装依赖：\n' +
            'cd src/hermes-agent && uv venv && uv pip install .\n\n' +
            '或使用项目脚本：bash scripts/setup-agent.sh'
      };
    }

    // Use workspacePath from config, fallback to defaultWorkspacePath
    // Only set TERMINAL_CWD if we have a valid non-empty path
    const workspacePath = config.workspacePath || config.defaultWorkspacePath || '';
    this._defaultWorkspace = workspacePath;
    const env = { ...process.env };
    if (workspacePath && workspacePath.trim()) {
      env.TERMINAL_CWD = workspacePath.trim();
    }
    if (config.apiKey) env.OPENAI_API_KEY = config.apiKey;
    if (config.baseUrl) env.OPENROUTER_BASE_URL = config.baseUrl;
    if (config.provider && config.provider !== 'auto') env.HERMES_INFERENCE_PROVIDER = config.provider;
    if (config.model) env.HERMES_INFERENCE_MODEL = config.model;

    // Set PYTHONPATH for production builds
    if (pythonPathEnv) {
      env.PYTHONPATH = pythonPathEnv;
    }

    try {
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
        this._buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            this._handleBridgeMessage(msg);
          } catch {
            this.emitLog('info', line.trim());
          }
        }
      });

      this.process.stderr.on('data', (d) => this.emitLog('error', d.toString().trim()));
      this.process.on('close', (code) => {
        this.running = false; this.process = null;
        this.sessionStates.clear();
        this.emitLog('info', `Agent 进程退出，退出码: ${code}`);
        this.sendStatusUpdate();
      });
      this.process.on('error', (err) => {
        this.running = false; this.process = null;
        this.sessionStates.clear();
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
        this.sessionStates.clear();
        this.emitLog('info', 'Agent 已停止'); this.sendStatusUpdate();
        resolve({ success: true });
      });
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL'); this.running = false; this.process = null;
          this.sessionStates.clear();
          this.emitLog('info', 'Agent 已强制停止'); this.sendStatusUpdate();
          resolve({ success: true });
        }
      }, 5000);
    });
  }

  sendMessage(sessionId, text, history = []) {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }

    // Check per-session generation state
    const sessionState = this.sessionStates.get(sessionId);
    if (sessionState && sessionState.isGenerating) {
      return { success: false, error: '该会话正在生成响应中' };
    }

    // Get workspace path for this session
    const workspacePath = (sessionState && sessionState.workspacePath) || this._defaultWorkspace || '';

    try {
      const message = JSON.stringify({ 
        type: 'message', 
        session_id: sessionId, 
        content: text, 
        history,
        workspace_path: workspacePath
      }) + '\n';
      this.process.stdin.write(message);
      // Mark session as generating
      this.sessionStates.set(sessionId, { isGenerating: true, workspacePath });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  setWorkspacePath(sessionId, workspacePath) {
    const sessionState = this.sessionStates.get(sessionId) || {};
    sessionState.workspacePath = workspacePath;
    this.sessionStates.set(sessionId, sessionState);
    
    // Also update default workspace for new sessions
    if (workspacePath) {
      this._defaultWorkspace = workspacePath;
    }
    
    // Update TERMINAL_CWD in bridge if agent is running
    if (this.running && this.process) {
      const message = JSON.stringify({ 
        type: 'set_workspace', 
        session_id: sessionId,
        workspace_path: workspacePath 
      }) + '\n';
      this.process.stdin.write(message);
    }
    
    return { success: true };
  }

  stopGeneration(sessionId) {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }

    try {
      this.process.stdin.write(JSON.stringify({ type: 'stop', session_id: sessionId }) + '\n');
      this.sessionStates.set(sessionId, { isGenerating: false });
      this.emitResponse('stopped', '', sessionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  respondToPrompt(sessionId, requestId, answer) {
    if (!this.running || !this.process) {
      return { success: false, error: 'Agent 未运行' };
    }
    try {
      const message = JSON.stringify({ type: 'respond', session_id: sessionId, request_id: requestId, answer }) + '\n';
      this.process.stdin.write(message);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  _handleBridgeMessage(msg) {
    const sessionId = msg.session_id || '';
    switch (msg.type) {
      case 'ready':
        this.emitLog('info', 'Agent 已就绪，等待消息...');
        break;
      case 'start':
        this.emitResponse('start', '', sessionId);
        break;
      case 'chunk':
        this.emitResponse('chunk', msg.text || '', sessionId);
        break;
      case 'done':
        this._setSessionGenerating(sessionId, false);
        this.emitResponse('complete', msg.text || '', sessionId);
        break;
      case 'error':
        this._setSessionGenerating(sessionId, false);
        this.emitResponse('error', msg.message || '未知错误', sessionId);
        this.emitLog('error', `Agent 错误: ${msg.message}`);
        break;
      case 'stopped':
        this._setSessionGenerating(sessionId, false);
        this.emitResponse('stopped', '', sessionId);
        break;
      case 'reasoning':
        this.emitResponse('reasoning', msg.text || '', sessionId);
        break;
      case 'thinking':
        this.emitResponse('thinking', msg.text || '', sessionId);
        break;
      case 'tool_gen':
        this.emitResponse('tool_gen', { name: msg.name }, sessionId);
        break;
      case 'tool_progress':
        this.emitResponse('tool_progress', {
          event: msg.event,
          name: msg.name,
          preview: msg.preview,
          duration: msg.duration,
          is_error: msg.is_error,
        }, sessionId);
        break;
      case 'tool_start':
        this.emitResponse('tool_start', {
          tool_id: msg.tool_id,
          name: msg.name,
          args: msg.args,
        }, sessionId);
        break;
      case 'tool_complete':
        this.emitResponse('tool_complete', {
          tool_id: msg.tool_id,
          name: msg.name,
          args: msg.args,
          result: msg.result,
        }, sessionId);
        break;
      case 'clarify_request':
        this.emitResponse('clarify_request', {
          request_id: msg.request_id,
          question: msg.question,
          choices: msg.choices ? JSON.parse(msg.choices) : null,
        }, sessionId);
        break;
      case 'status':
        this.emitResponse('status', { kind: msg.kind, text: msg.text }, sessionId);
        break;
      default:
        this.emitLog('info', `[bridge] ${JSON.stringify(msg)}`);
    }
  }

  _setSessionGenerating(sessionId, isGenerating) {
    if (sessionId) {
      this.sessionStates.set(sessionId, { isGenerating });
    }
  }

  emitResponse(event, data, sessionId = '') {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('agent-response', { event, data, sessionId });
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
