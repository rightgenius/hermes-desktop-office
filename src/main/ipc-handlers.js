const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const ConfigStore = require('./config-store');
const { AgentManager } = require('./agent-manager');
const { CronManager } = require('./cron-manager');
const skillScanner = require('./skill-scanner');

const fsPromises = fs.promises;

const configStore = new ConfigStore();
let agentManager = null;
let cronManager = null;

function getCLIBinaryPath(cliName) {
  const platform = process.platform;
  const arch = process.arch;
  
  // In production, use unpacked path (CLI binaries can't run from asar)
  const resourcesDir = process.resourcesPath || path.join(process.execPath, '..', 'Resources');
  const unpackedAssets = path.join(resourcesDir, 'app.asar.unpacked', 'assets');
  const devAssets = path.join(__dirname, '../../assets');
  const assetsDir = fs.existsSync(path.join(unpackedAssets, 'feishu-cli')) ? unpackedAssets : devAssets;
  
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
  cronManager = new CronManager(agentManager, mainWindow);

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
    return !config.apiKey && (!config.provider || config.provider === 'auto');
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
  ipcMain.handle('agent-start', async (_, config) => {
    const result = await agentManager.start(config);
    if (result.success && cronManager) cronManager.start();
    return result;
  });
  ipcMain.handle('agent-stop', async () => {
    if (cronManager) cronManager.stop();
    return agentManager.stop();
  });
  ipcMain.handle('agent-restart', async () => {
    const config = configStore.get();
    await agentManager.stop();
    if (cronManager) cronManager.stop();
    const result = await agentManager.start(config);
    if (result.success && cronManager) cronManager.start();
    return result;
  });
  ipcMain.handle('agent-install-deps', (_, packages) => agentManager.installSkillDeps(packages));
  ipcMain.handle('agent-stop-generation', (_, sessionId) => agentManager.stopGeneration(sessionId));
  ipcMain.handle('agent-respond', (_, { sessionId, requestId, answer }) => agentManager.respondToPrompt(sessionId, requestId, answer));

  // Test API connection from main process (no CORS issues)
  // Supports both OpenAI-compatible (/chat/completions) and Anthropic (/v1/messages) formats
  // Simulates Agent behavior by using the same request format and provider-specific headers
  ipcMain.handle('test-api-connection', async (_, { baseUrl, apiKey, model, apiFormat, provider }) => {
    const https = require('https');
    const http = require('http');
    const cleanApiKey = (apiKey || '').trim();
    if (!cleanApiKey) {
      return { success: false, error: 'API Key 为空', hint: '请输入你的 API Key' };
    }

    const format = apiFormat || 'openai';
    let requestUrl, headers, payload;

    if (format === 'anthropic') {
      const cleanBase = baseUrl.replace(/\/$/, '');
      const urlObj = new URL(cleanBase);
      const messagesPath = urlObj.pathname && urlObj.pathname !== '/'
        ? cleanBase + '/messages'
        : cleanBase + '/v1/messages';
      requestUrl = new URL(messagesPath);
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': cleanApiKey,
        'anthropic-version': '2023-06-01',
      };
      payload = JSON.stringify({
        model: model || 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
    } else {
      // OpenAI-compatible format - simulate Agent behavior
      const cleanBase = baseUrl.replace(/\/$/, '');
      const completionsPath = cleanBase.includes('/chat/completions') ? cleanBase : cleanBase + '/chat/completions';
      requestUrl = new URL(completionsPath);
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanApiKey}`,
      };

      // Add provider-specific headers like hermes-agent does
      const baseUrlLower = baseUrl.toLowerCase();

      // DashScope / Qwen headers
      if (baseUrlLower.includes('dashscope') || baseUrlLower.includes('qwen')) {
        headers['User-Agent'] = 'HermesAgent/1.0.0';
        headers['X-DashScope-CacheControl'] = 'enable';
        headers['X-DashScope-UserAgent'] = 'HermesAgent/1.0.0';
        headers['X-DashScope-AuthType'] = 'api-key';
      }

      // OpenRouter attribution headers
      if (baseUrlLower.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://hermes-agent.nousresearch.com';
        headers['X-Title'] = 'Hermes Agent';
        headers['X-OpenRouter-Categories'] = 'productivity,cli-agent';
      }

      // Kimi headers
      if (baseUrlLower.includes('api.kimi.com')) {
        headers['User-Agent'] = 'claude-code/0.1.0';
      }

      const testModel = model || 'gpt-4o-mini';
      payload = JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });

      // Add extra_body for providers that need it
      if (baseUrlLower.includes('openrouter.ai')) {
        payload.extra_body = {
          reasoning: { enabled: true, effort: 'medium' },
        };
      }
    }

    // Debug info
    const keyPreview = cleanApiKey.length > 20
      ? cleanApiKey.substring(0, 8) + '...' + cleanApiKey.substring(cleanApiKey.length - 4)
      : cleanApiKey;
    const debugInfo = {
      fullUrl: requestUrl.href,
      method: 'POST',
      authHeader: format === 'anthropic'
        ? `x-api-key: ${keyPreview}`
        : `Authorization: Bearer ${keyPreview}`,
      authLength: cleanApiKey.length,
      model: format === 'anthropic' ? (model || 'claude-sonnet-4.6') : (model || 'gpt-4o-mini'),
      extraHeaders: Object.keys(headers).filter(k => !['Content-Type', 'Authorization', 'x-api-key'].includes(k)),
      body: payload,
    };

    const isHttp = requestUrl.protocol === 'http:';
    const requestLib = isHttp ? http : https;

    return new Promise((resolve) => {
      const req = requestLib.request({
        hostname: requestUrl.hostname,
        port: requestUrl.port || (isHttp ? 80 : 443),
        path: requestUrl.pathname + requestUrl.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              let responseText = '';
              if (format === 'anthropic') {
                responseText = data.content?.[0]?.text || '(no content)';
              } else {
                responseText = data.choices?.[0]?.message?.content || '(no content)';
              }
              resolve({
                success: true,
                model: data.model || data.id?.split('-')[0] || 'unknown',
                response: responseText,
                raw: body.substring(0, 500),
                debug: debugInfo,
              });
            } catch {
              resolve({ success: true, raw: body.substring(0, 500), debug: debugInfo });
            }
          } else {
            resolve({
              success: false,
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              error: body.substring(0, 1000),
              headers: Object.fromEntries(Object.entries(res.headers).slice(0, 8)),
              debug: debugInfo,
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message, code: err.code, debug: debugInfo });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: '请求超时 (15s)', debug: debugInfo });
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
  ipcMain.handle('agent-set-workspace', (_, { sessionId, workspacePath }) => agentManager.setWorkspacePath(sessionId, workspacePath));

  ipcMain.handle('session-export', async (event, { filename, content }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: '保存会话',
      defaultPath: filename,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled) return { success: false, cancelled: true };
    await fsPromises.writeFile(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle('select-attachments', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: '选择附件',
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled) return { success: true, filePaths: [] };
    return { success: true, filePaths: result.filePaths || [] };
  });

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
    return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(basename);
  }

  ipcMain.handle('workspace-list', async (_, { dirPath }) => {
    try {
      if (!dirPath || !path.isAbsolute(dirPath)) {
        return { success: false, error: 'Invalid directory path' };
      }
      const stat = await fsPromises.stat(dirPath);
      if (!stat.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const filtered = entries.filter(e => !e.name.startsWith('.'));
      const files = await Promise.all(filtered.map(async e => {
        const fullPath = path.join(dirPath, e.name);
        try {
          const stat = await fsPromises.stat(fullPath);
          return {
            name: e.name,
            path: fullPath,
            isDirectory: e.isDirectory(),
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        } catch {
          return {
            name: e.name,
            path: fullPath,
            isDirectory: e.isDirectory(),
            size: null,
            modified: null,
          };
        }
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
      const stat = await fsPromises.stat(filePath);
      if (stat.isDirectory()) {
        return { success: false, error: 'Path is a directory, not a file' };
      }
      if (stat.size > 1024 * 1024) {
        return { success: false, error: 'File too large (max 1MB)' };
      }
      const content = await fsPromises.readFile(filePath, 'utf-8');
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
      await shell.openPath(filePath);
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
  // Skills management handlers
  function validateSkillPath(filePath) {
    if (!filePath || !path.isAbsolute(filePath)) {
      return { valid: false, error: 'Invalid path: must be absolute' };
    }
    const hermesSkills = path.join(skillScanner.getHermesHome(), 'skills');
    const agentsSkills = path.join(skillScanner.getAgentsHome(), 'skills');
    const appDir = path.join(__dirname, '..');
    const builtinSkills = path.join(appDir, 'hermes-agent', 'skills');
    const builtinOptional = path.join(appDir, 'hermes-agent', 'optional-skills');
    const normalized = path.normalize(filePath);
    const allowed = [hermesSkills, agentsSkills, builtinSkills, builtinOptional];
    const isAllowed = allowed.some(dir => normalized.startsWith(path.normalize(dir)));
    if (!isAllowed) {
      return { valid: false, error: 'Invalid path: not in allowed skills directory' };
    }
    return { valid: true };
  }

  ipcMain.handle('skills:list', async () => {
    try {
      const builtin = await skillScanner.scanBuiltinSkills();
      const user = await skillScanner.scanUserSkills();
      const agent = await skillScanner.scanAgentSkills();
      return { success: true, builtin, user, agent };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:get-detail', async (_, skillPath) => {
    const validation = validateSkillPath(skillPath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      const files = await skillScanner.listSkillFiles(skillPath);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:set-enabled', async (_, skillName, enabled) => {
    try {
      const hermesHome = skillScanner.getHermesHome();
      const configPath = path.join(hermesHome, 'config.yaml');
      let content = '';
      
      try {
        content = fs.readFileSync(configPath, 'utf-8');
      } catch {
        content = 'skills:\n  enabled: []\n  disabled: []\n';
      }
      
      const enabledMatch = content.match(/(skills:\s*\n\s+enabled:\s*\[)([^\]]*)(\])/);
      const disabledMatch = content.match(/(skills:\s*\n(?:.*\n)*?\s+disabled:\s*\[)([^\]]*)(\])/);
      
      let enabledList = enabledMatch ? enabledMatch[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
      let disabledList = disabledMatch ? disabledMatch[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
      
      if (enabled) {
        enabledList = [...new Set([...enabledList, skillName])];
        disabledList = disabledList.filter(n => n !== skillName);
      } else {
        disabledList = [...new Set([...disabledList, skillName])];
        enabledList = enabledList.filter(n => n !== skillName);
      }
      
      const enabledStr = enabledList.map(n => `'${n}'`).join(', ');
      const disabledStr = disabledList.map(n => `'${n}'`).join(', ');
      
      if (enabledMatch) {
        content = content.replace(enabledMatch[0], `skills:\n  enabled: [${enabledStr}]`);
      } else {
        content += `\nskills:\n  enabled: [${enabledStr}]\n`;
      }
      
      if (disabledMatch) {
        content = content.replace(disabledMatch[0], `skills:\n  disabled: [${disabledStr}]`);
      } else {
        content += `\nskills:\n  disabled: [${disabledStr}]\n`;
      }
      
      fs.writeFileSync(configPath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:create', async (_, skillData) => {
    try {
      if (!skillData.name || skillData.name.includes('..') || skillData.name.includes('/') || skillData.name.includes('\\')) {
        return { success: false, error: 'Invalid skill name' };
      }
      const hermesHome = skillScanner.getHermesHome();
      const skillsDir = path.join(hermesHome, 'skills');
      const skillPath = path.join(skillsDir, skillData.name);
      const normalized = path.normalize(skillPath);
      if (!normalized.startsWith(path.normalize(skillsDir))) {
        return { success: false, error: 'Invalid skill name' };
      }
      
      if (fs.existsSync(skillPath)) {
        return { success: false, error: 'Skill already exists' };
      }
      
      fs.mkdirSync(skillPath, { recursive: true });
      
      const skillMdContent = `---\nname: ${skillData.name}\ndescription: ${skillData.description}\ncategory: ${skillData.category || 'general'}\n---\n\n${skillData.content || '# New Skill\n\nDescribe your skill here.'}\n`;
      
      fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillMdContent, 'utf-8');
      
      return { success: true, path: skillPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:update', async (_, { skillPath, content }) => {
    const validation = validateSkillPath(skillPath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      fs.writeFileSync(skillMdPath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:delete', async (_, skillPath) => {
    const validation = validateSkillPath(skillPath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      fs.rmSync(skillPath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:archive', async (_, skillPath) => {
    const validation = validateSkillPath(skillPath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      const archiveDir = path.join(skillPath, '.archive');
      fs.mkdirSync(archiveDir, { recursive: true });
      const entries = fs.readdirSync(skillPath);
      for (const entry of entries) {
        if (entry === '.archive') continue;
        const src = path.join(skillPath, entry);
        const dest = path.join(archiveDir, entry);
        fs.renameSync(src, dest);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:unarchive', async (_, skillPath) => {
    const validation = validateSkillPath(skillPath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      const archiveDir = path.join(skillPath, '.archive');
      if (!fs.existsSync(archiveDir)) {
        return { success: false, error: 'No archive found' };
      }
      const entries = fs.readdirSync(archiveDir);
      for (const entry of entries) {
        const src = path.join(archiveDir, entry);
        const dest = path.join(skillPath, entry);
        fs.renameSync(src, dest);
      }
      fs.rmSync(archiveDir, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:get-file', async (_, filePath) => {
    const validation = validateSkillPath(filePath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:write-file', async (_, { filePath, content }) => {
    const validation = validateSkillPath(filePath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('skills:list-files', async (_, skillPath) => {
    const validation = validateSkillPath(skillPath);
    if (!validation.valid) return { success: false, error: validation.error };
    try {
      const files = await skillScanner.listSkillFiles(skillPath);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Cron IPC handlers
  ipcMain.handle('cron:list', async (_, includeDisabled = false) => {
    try {
      const jobs = await cronManager.listJobs(includeDisabled);
      return { success: true, jobs };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:create', async (_, data) => {
    try {
      const job = await cronManager.createJob(data);
      return { success: true, job };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:update', async (_, jobId, updates) => {
    try {
      const job = await cronManager.updateJob(jobId, updates);
      return { success: true, job };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:delete', async (_, jobId) => {
    try {
      const ok = await cronManager.deleteJob(jobId);
      return { success: ok };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:pause', async (_, jobId) => {
    try {
      const job = await cronManager.pauseJob(jobId);
      return { success: true, job };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:resume', async (_, jobId) => {
    try {
      const job = await cronManager.resumeJob(jobId);
      return { success: true, job };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:trigger', async (_, jobId) => {
    try {
      const job = await cronManager.triggerJob(jobId);
      return { success: true, job };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:status', async () => {
    return { success: true, isRunning: cronManager.isRunning };
  });

  ipcMain.handle('cron:start', async () => {
    try {
      await cronManager.start();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cron:stop', async () => {
    try {
      await cronManager.stop();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

// Expose agentManager for graceful shutdown on app quit
module.exports = { setupIPCHandlers, getAgentManager: () => agentManager, getCronManager: () => cronManager };
