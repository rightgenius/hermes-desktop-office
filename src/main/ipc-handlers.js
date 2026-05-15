const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const ConfigStore = require('./config-store');
const { AgentManager } = require('./agent-manager');

const configStore = new ConfigStore();
let agentManager = null;

function getCLIBinaryPath(cliName) {
  const platform = process.platform;
  const arch = process.arch;
  const assetsDir = path.join(__dirname, '../../assets');
  if (cliName === 'lark-cli') {
    if (platform === 'darwin') return path.join(assetsDir, 'feishu-cli', `darwin-${arch}`, 'lark-cli');
    if (platform === 'win32') return path.join(assetsDir, 'feishu-cli', 'windows-amd64', 'lark-cli.exe');
    return path.join(assetsDir, 'feishu-cli', 'linux-amd64', 'lark-cli');
  }
  if (cliName === 'dws') {
    if (platform === 'darwin') return path.join(assetsDir, 'dws-cli', `darwin-${arch}`, 'dws');
    if (platform === 'win32') return path.join(assetsDir, 'dws-cli', 'windows-amd64', 'dws.exe');
    return path.join(assetsDir, 'dws-cli', 'linux-amd64', 'dws');
  }
}

function runCLI(cliName, args, timeout = 30000, maxBuffer = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const binaryPath = getCLIBinaryPath(cliName);
    execFile(binaryPath, args, { timeout, maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(stderr || error.message);
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function getCLIVersion(cliName) {
  return new Promise((resolve) => {
    runCLI(cliName, ['--version'], 5000).then(r => {
      // lark-cli: "lark-cli version 1.0.26"
      // dws: "dws version v1.0.26 (2ba1dcd, ...)"
      const match = r.stdout.match(/version\s+([v\d.]+)/i);
      resolve(match ? match[1].replace(/^v/, '') : '');
    }).catch(() => resolve(''));
  });
}

function runCLISpawn(cliName, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const binaryPath = getCLIBinaryPath(cliName);
    const proc = spawn(binaryPath, args);
    let stdout = '';
    let stderr = '';
    let urlOpened = false;

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      if (!urlOpened) {
        const urlMatch = stderr.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
          shell.openExternal(urlMatch[0]);
          urlOpened = true;
        }
      }
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, timedOut: true });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function setupIPCHandlers(mainWindow) {
  agentManager = new AgentManager(mainWindow);

  ipcMain.handle('config-get', () => configStore.get());
  ipcMain.handle('config-save', (_, data) => configStore.save(data));

  ipcMain.handle('config-browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '选择工作空间路径' });
    if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
    return null;
  });

  // First-run check
  ipcMain.handle('is-first-run', () => {
    const config = configStore.get();
    return !config.gatewayUrl && !config.apiToken;
  });

  // Auth handlers
  ipcMain.handle('auth-feishu', async () => {
    try {
      const result = await runCLI('lark-cli', ['auth', 'login', '--recommend', '--no-wait', '--json']);
      const auth = JSON.parse(result.stdout);
      if (auth.device_code && auth.verification_url) {
        shell.openExternal(auth.verification_url);
        // Must run --device-code in a single process (restart invalidates device code)
        // CLI buffers output until exit, so execFile works fine with large buffer
        try {
          const waitResult = await runCLI('lark-cli', ['auth', 'login', '--device-code', auth.device_code, '--json'], 600000, 10 * 1024 * 1024);
          // Feishu CLI outputs JSON to stderr
          const combined = (waitResult.stderr || '') + (waitResult.stdout || '');
          const jsonMatch = combined.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const status = JSON.parse(jsonMatch[0]);
            if (status.ok || status.already_granted) {
              const version = await getCLIVersion('lark-cli');
              return { success: true, userName: status.userName || '', version };
            }
            if (status.error) return { success: false, error: status.error.message || '授权失败' };
          }
        } catch (err) {
          // execFile rejects on non-zero exit, but stderr may still contain JSON
          const combined = (err.stderr || '') + (err.stdout || '');
          const jsonMatch = combined.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const status = JSON.parse(jsonMatch[0]);
              if (status.ok || status.already_granted) {
                const version = await getCLIVersion('lark-cli');
                return { success: true, userName: status.userName || '', version };
              }
              if (status.error) return { success: false, error: status.error.message || '授权失败' };
            } catch {}
          }
        }
        return { success: false, error: '授权未完成' };
      }
      return { success: false, error: '未获取到授权码' };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('auth-dingtalk', async () => {
    try {
      // DingTalk CLI uses device flow: outputs URL to stderr, then waits for auth
      const result = await runCLISpawn('dws', ['auth', 'login', '--device', '--format', 'json'], 600000);
      try {
        const auth = JSON.parse(result.stdout);
        if (auth.success) {
          const version = await getCLIVersion('dws');
          return { success: true, userName: auth.corp_id || '已认证', version };
        }
        if (auth.error) return { success: false, error: auth.error.message || '授权失败' };
      } catch {}
      // Try to extract URL from stderr if not already opened
      const urlMatch = result.stderr?.match(/https:\/\/login\.dingtalk\.com\/oauth2\/device\/verify\.htm[^ \n]*/);
      if (urlMatch && !result.stderr?.includes('Please open')) {
        shell.openExternal(urlMatch[0]);
      }
      return { success: false, error: '授权未完成' };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('check-auth-status', async () => {
    const status = { feishu: { authed: false, userName: '', version: '' }, dingtalk: { authed: false, userName: '', version: '' } };
    const [larkVersion, dwsVersion] = await Promise.all([getCLIVersion('lark-cli'), getCLIVersion('dws')]);
    try {
      const r = await runCLI('lark-cli', ['auth', 'status'], 5000);
      const data = JSON.parse(r.stdout);
      // Accept both 'valid' and 'needs_refresh' as authenticated
      if (data.tokenStatus === 'valid' || data.tokenStatus === 'needs_refresh') {
        status.feishu = { authed: true, userName: data.userName || '', version: larkVersion };
      }
    } catch (e) { /* not authed */ }
    try {
      const r = await runCLI('dws', ['auth', 'status', '--format', 'json'], 5000);
      const data = JSON.parse(r.stdout);
      if (data.success || data.authenticated) {
        // DingTalk CLI doesn't return userName, use corp_id as identifier
        status.dingtalk = { authed: true, userName: data.corp_id || '已认证', version: dwsVersion };
      }
    } catch (e) { /* not authed */ }
    return status;
  });

  ipcMain.handle('get-auth-permissions', async (_, { cli, page = 1, pageSize = 5, search = '' }) => {
    if (!['feishu', 'dingtalk'].includes(cli)) {
      return { success: false, error: 'Invalid CLI type' };
    }

    page = Math.max(1, page);
    pageSize = Math.max(1, Math.min(50, pageSize));

    const cliName = cli === 'feishu' ? 'lark-cli' : 'dws';
    // Feishu CLI outputs JSON by default, doesn't support --format flag
    const statusArgs = cli === 'feishu' ? ['auth', 'status'] : ['auth', 'status', '--format', 'json'];
    try {
      const result = await runCLI(cliName, statusArgs, 10000);
      let data;
      try {
        data = JSON.parse(result.stdout);
      } catch {
        return { success: false, error: 'CLI returned invalid JSON response' };
      }

      let permissions = [];
      if (data.permissions && Array.isArray(data.permissions)) {
        permissions = data.permissions;
      } else if (data.scopes && Array.isArray(data.scopes)) {
        permissions = data.scopes.map(s => ({ name: s, scope: s, status: 'granted' }));
      } else if (data.scope && typeof data.scope === 'string') {
        // Feishu uses space-separated scope string
        permissions = data.scope.split(' ').filter(s => s).map(s => ({ name: s, scope: s, status: 'granted' }));
      } else if (cli === 'dingtalk') {
        // DingTalk doesn't expose individual scopes, show auth status as single permission
        permissions = [{ name: '认证访问', scope: 'authenticated', status: data.authenticated ? 'granted' : 'denied' }];
      } else {
        return { success: false, error: 'No permissions or scopes found in CLI response' };
      }

      if (search) {
        const lower = search.toLowerCase();
        permissions = permissions.filter(p =>
          (p.name || '').toLowerCase().includes(lower) ||
          (p.scope || '').toLowerCase().includes(lower)
        );
      }

      const total = permissions.length;
      const start = (page - 1) * pageSize;
      const paged = permissions.slice(start, start + pageSize);

      return { success: true, permissions: paged, total, page, pageSize };
    } catch (err) {
      return { success: false, error: err.message, permissions: [], total: 0, page, pageSize };
    }
  });

  ipcMain.handle('run-diagnostic', async () => {
    const [lark, dws] = await Promise.allSettled([runCLI('lark-cli', ['doctor']), runCLI('dws', ['doctor'])]);
    let output = '=== 诊断结果 ===\n\n--- 飞书 CLI (lark-cli) ---\n';
    output += lark.status === 'fulfilled' ? lark.value.stdout : `错误: ${lark.reason.message}\n`;
    output += '\n--- 钉钉 CLI (dws) ---\n';
    output += dws.status === 'fulfilled' ? dws.value.stdout : `错误: ${dws.reason.message}\n`;
    return { output };
  });

  // Agent handlers
  ipcMain.handle('agent-start', (_, config) => agentManager.start(config));
  ipcMain.handle('agent-stop', () => agentManager.stop());
  ipcMain.handle('agent-restart', async () => {
    const config = configStore.get();
    await agentManager.stop();
    return agentManager.start(config);
  });
  ipcMain.handle('agent-stop-generation', (_, sessionId) => agentManager.stopGeneration(sessionId));
  ipcMain.handle('agent-respond', (_, { sessionId, requestId, answer }) => agentManager.respondToPrompt(sessionId, requestId, answer));

  // Test API connection from main process (no CORS issues)
  ipcMain.handle('test-api-connection', async (_, { baseUrl, apiKey, model }) => {
    const https = require('https');
    const url = new URL(baseUrl + '/chat/completions');
    const cleanApiKey = (apiKey || '').trim().replace(/[^\x20-\x7E]/g, '');
    if (!cleanApiKey) {
      return { success: false, error: 'API Key 为空或包含无效字符', hint: '请确保只包含 ASCII 可见字符' };
    }
    const payload = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 10
    });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${cleanApiKey}`
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              resolve({
                success: true,
                model: data.model || 'unknown',
                response: data.choices?.[0]?.message?.content || '(no content)',
                raw: body.substring(0, 500)
              });
            } catch {
              resolve({ success: true, raw: body.substring(0, 500) });
            }
          } else {
            resolve({
              success: false,
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              error: body.substring(0, 1000),
              headers: Object.fromEntries(Object.entries(res.headers).slice(0, 5))
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message, code: err.code });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timed out after 15s' });
      });
      req.write(payload);
      req.end();
    });
  });

  // Try starting agent and report result
  ipcMain.handle('try-start-agent', async () => {
    const config = configStore.get();
    const result = await agentManager.start(config);

    // Wait briefly to catch early startup errors
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (result.success && agentManager.running) {
      return {
        success: true,
        message: 'Agent 启动成功',
        pid: agentManager.process?.pid || null
      };
    } else {
      return {
        success: false,
        message: result.error || 'Agent 启动失败',
        details: agentManager.running ? '已启动但响应异常' : '未运行'
      };
    }
  });

  ipcMain.handle('agent-send-message', (_, { sessionId, text, history }) => agentManager.sendMessage(sessionId, text, history));

  ipcMain.handle('session-export', async (event, { filename, content }) => {
    const fs = require('fs').promises;
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: '保存会话',
      defaultPath: filename,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled) return { success: false, cancelled: true };
    await fs.writeFile(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  });

  const fsWorkspace = require('fs').promises;

  const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'json', 'yaml', 'yml', 'py', 'js', 'ts', 'tsx', 'jsx',
    'html', 'css', 'scss', 'xml', 'sql', 'sh', 'bash', 'zsh', 'gitignore',
    'dockerfile', 'makefile', 'cfg', 'ini', 'toml', 'env', 'log', 'csv',
    'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'swift', 'kt',
    'php', 'pl', 'lua', 'r', 'm', 'mm', 'vue', 'svelte', 'astro',
  ]);

  function isTextFile(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    return TEXT_EXTENSIONS.has(ext) ||
           TEXT_EXTENSIONS.has(basename) ||
           basename === 'dockerfile' ||
           basename === 'makefile' ||
           basename === 'gitignore' ||
           basename === 'env';
  }

  ipcMain.handle('workspace-list', async (_, { dirPath, recursive = false }) => {
    try {
      if (!dirPath || !path.isAbsolute(dirPath)) {
        return { success: false, error: 'Invalid directory path' };
      }
      const stat = await fsWorkspace.stat(dirPath);
      if (!stat.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }
      const entries = await fsWorkspace.readdir(dirPath, { withFileTypes: true });
      const files = entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
          size: null,
          modified: null,
        }));
      return { success: true, files, dirPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace-read', async (_, { filePath }) => {
    try {
      if (!filePath || !path.isAbsolute(filePath)) {
        return { success: false, error: 'Invalid file path' };
      }
      if (!isTextFile(filePath)) {
        return { success: false, error: 'File is not a text file' };
      }
      const stat = await fsWorkspace.stat(filePath);
      if (stat.isDirectory()) {
        return { success: false, error: 'Path is a directory, not a file' };
      }
      if (stat.size > 1024 * 1024) {
        return { success: false, error: 'File too large (max 1MB)' };
      }
      const content = await fsWorkspace.readFile(filePath, 'utf-8');
      return { success: true, content, filePath, size: stat.size };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace-open', async (_, { filePath }) => {
    try {
      if (!filePath || !path.isAbsolute(filePath)) {
        return { success: false, error: 'Invalid file path' };
      }
      shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace-browse', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 Workspace 目录'
    });
    if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
    return null;
  });
}

// Expose agentManager for graceful shutdown on app quit
module.exports = { setupIPCHandlers, getAgentManager: () => agentManager };
