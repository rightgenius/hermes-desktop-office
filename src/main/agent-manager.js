const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Simple YAML merge helper for skills.external_dirs (avoids full YAML dependency)
function ensureExternalSkillsDirInConfig(hermesHome, skillsPath) {
  const configPath = path.join(hermesHome, 'config.yaml');
  const normalizedSkillsPath = skillsPath.replace(/\\/g, '/');

  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath,
        `skills:\n  external_dirs:\n    - "${normalizedSkillsPath}"\n`,
        'utf-8'
      );
      return;
    }

    const content = fs.readFileSync(configPath, 'utf-8');

    // Already configured with this exact path
    if (content.includes(normalizedSkillsPath)) {
      return;
    }

    // Check if external_dirs section exists but is empty or doesn't contain our path
    const externalDirsMatch = content.match(/(  external_dirs:\s*\n)((?:\s+- .+\n)*)/);
    if (externalDirsMatch) {
      // external_dirs exists but doesn't have our path - add it
      const insertPoint = externalDirsMatch.index + externalDirsMatch[0].length;
      const before = content.substring(0, insertPoint);
      const after = content.substring(insertPoint);
      const updated = before + `    - "${normalizedSkillsPath}"\n` + after;
      fs.writeFileSync(configPath, updated, 'utf-8');
      return;
    }

    // Check if skills section exists with any nested keys
    const skillsSectionMatch = content.match(/^(skills:\n(?:  .+\n)*)/m);
    if (skillsSectionMatch) {
      // Insert external_dirs at the end of the skills section
      const insertPoint = skillsSectionMatch[0].length;
      const before = content.substring(0, insertPoint);
      const after = content.substring(insertPoint);
      const updated = before + `  external_dirs:\n    - "${normalizedSkillsPath}"\n` + after;
      fs.writeFileSync(configPath, updated, 'utf-8');
    } else {
      // Append skills section
      fs.writeFileSync(configPath,
        content + `\nskills:\n  external_dirs:\n    - "${normalizedSkillsPath}"\n`,
        'utf-8'
      );
    }
  } catch (err) {
    console.error('Failed to configure external skills dir:', err.message);
  }
}

class AgentManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.process = null;
    this.running = false;
    // Track per-session generation state
    this.sessionStates = new Map(); // sessionId -> { isGenerating: boolean }
    // Runtime deps management
    this._pythonCmd = null;
    this._userDepsPath = null;
  }

  // Install additional Python dependencies at runtime
  async installSkillDeps(packages) {
    if (!this._pythonCmd) {
      const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
      const isWin = process.platform === 'win32';
      const bundledPython = path.join(resourcesDir, 'python-runtime', isWin ? 'python.exe' : path.join('bin', 'python3'));
      if (fs.existsSync(bundledPython)) {
        this._pythonCmd = bundledPython;
      } else {
        this._pythonCmd = isWin ? 'python' : 'python3';
      }
    }
    if (!this._userDepsPath) {
      this._userDepsPath = path.join(require('os').homedir(), '.hermes', 'skills-deps');
      if (!fs.existsSync(this._userDepsPath)) {
        fs.mkdirSync(this._userDepsPath, { recursive: true });
      }
    }

    return new Promise((resolve) => {
      const args = ['-m', 'pip', 'install', '--target', this._userDepsPath, ...packages];
      const child = execFile(this._pythonCmd, args, { timeout: 300000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: stderr || err.message });
        } else {
          resolve({ success: true, output: stdout });
        }
      });
    });
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
    let userDepsPath = null;

    if (isProduction) {
      // Production: use bundled Python runtime
      const isWin = process.platform === 'win32';
      const bundledPython = path.join(resourcesDir, 'python-runtime', isWin ? 'python.exe' : path.join('bin', 'python3'));
      if (fs.existsSync(bundledPython)) {
        pythonCmd = bundledPython;
        const bundledDeps = path.join(hermesPath, 'deps');
        // User-writable deps directory for runtime-installed packages
        userDepsPath = path.join(app.getPath('home'), '.hermes', 'skills-deps');
        if (!fs.existsSync(userDepsPath)) {
          fs.mkdirSync(userDepsPath, { recursive: true });
        }
        // PYTHONPATH: user deps first (override), then bundled deps, then hermes-agent
        pythonPathEnv = [userDepsPath, bundledDeps, hermesPath].filter(p => fs.existsSync(p)).join(path.delimiter);
      }
    } else {
      // Development: use venv python
      const isWin = process.platform === 'win32';
      const pythonExe = isWin ? 'python.exe' : 'python3';
      const scriptsDir = isWin ? 'Scripts' : 'bin';
      const venvPython = path.join(hermesPath, 'venv', scriptsDir, pythonExe);
      const dotVenvPython = path.join(hermesPath, '.venv', scriptsDir, pythonExe);
      pythonCmd = fs.existsSync(venvPython) ? venvPython
                : fs.existsSync(dotVenvPython) ? dotVenvPython
                : null;
    }

    if (!pythonCmd) {
      return {
        success: false,
        error: isProduction
          ? 'Python 运行时未正确打包，请重新构建应用'
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

    // Set HERMES_BUNDLED_SKILLS to include office skills
    // This ensures the Agent can discover skills bundled with the desktop app
    const officeSkillsPath = this._resolveOfficeSkillsPath(resourcesDir, isProduction);
    if (officeSkillsPath) {
      env.HERMES_BUNDLED_SKILLS = officeSkillsPath;
      // Also configure skills.external_dirs in ~/.hermes/config.yaml so the
      // Agent's skill discovery finds office skills at runtime
      const hermesHome = path.join(app.getPath('home'), '.hermes');
      if (!fs.existsSync(hermesHome)) {
        fs.mkdirSync(hermesHome, { recursive: true });
      }
      ensureExternalSkillsDirInConfig(hermesHome, officeSkillsPath);
    }

    try {
      // Find bridge script: production unpacked path first, then development
      const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked', 'src', 'main');
      const prodBridge = path.join(unpackedDir, 'agent-bridge.py');
      const devBridge = path.join(__dirname, 'agent-bridge.py');
      
      // Check unpacked path first (production), then asar-internal (development only)
      const bridgeScript = fs.existsSync(prodBridge) ? prodBridge
                       : (fs.existsSync(devBridge) && !__dirname.includes('app.asar')) ? devBridge
                       : null;
      
      if (!bridgeScript) {
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
      // Windows doesn't support SIGTERM, use process.kill() which sends
      // SIGTERM on POSIX and terminates on Windows
      if (process.platform === 'win32') {
        this.process.kill();
      } else {
        this.process.kill('SIGTERM');
      }
      setTimeout(() => {
        if (this.process) {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', this.process.pid, '/f', '/t']);
          } else {
            this.process.kill('SIGKILL');
          }
          this.running = false; this.process = null;
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
      case 'approval_request':
        this.emitResponse('approval_request', {
          request_id: msg.request_id,
          command: msg.command || '',
          description: msg.description || '',
          allow_permanent: msg.allow_permanent !== false,
        }, sessionId);
        break;
      case 'sudo_request':
        this.emitResponse('sudo_request', {
          request_id: msg.request_id,
        }, sessionId);
        break;
      case 'secret_request':
        this.emitResponse('secret_request', {
          request_id: msg.request_id,
          env_var: msg.env_var || '',
          prompt: msg.prompt || '',
          metadata: msg.metadata || null,
        }, sessionId);
        break;
      case 'status':
        this.emitResponse('status', { kind: msg.kind, text: msg.text }, sessionId);
        break;
      case 'background_review': {
        const text = msg.text || '';
        this.emitResponse('background_review', text, sessionId);
        if (text) this.emitLog('info', text);
        break;
      }
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

  _resolveOfficeSkillsPath(resourcesDir, isProduction) {
    const appDir = path.join(__dirname, '..');
    const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

    // Try multiple possible locations for office skills
    const candidates = [
      path.join(unpackedDir, 'skills'),           // Production: Resources/app.asar.unpacked/skills
      path.join(resourcesDir, 'skills'),          // Alternative: Resources/skills
      path.join(appDir, '..', 'skills'),          // Development: project root/skills
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}

module.exports = { AgentManager };
