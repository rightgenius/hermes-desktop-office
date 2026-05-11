const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
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

function runCLI(cliName, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const binaryPath = getCLIBinaryPath(cliName);
    execFile(binaryPath, args, { timeout }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve({ stdout, stderr });
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
        return new Promise((resolve) => {
          const poll = setInterval(async () => {
            try {
              const s = await runCLI('lark-cli', ['auth', 'login', '--device-code', auth.device_code]);
              const status = JSON.parse(s.stdout);
              if (status.ok) { clearInterval(poll); resolve({ success: true, userName: status.userName || '', version: status.cliVersion || '' }); }
            } catch (e) { /* waiting */ }
          }, 3000);
          setTimeout(() => { clearInterval(poll); resolve({ success: false, error: '授权超时' }); }, 600000);
        });
      }
      return { success: false, error: '未获取到授权码' };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('auth-dingtalk', async () => {
    try {
      const result = await runCLI('dws', ['auth', 'login', '--format', 'json']);
      const auth = JSON.parse(result.stdout);
      if (auth.success) return { success: true, userName: auth.userName || '' };
      return { success: false, error: '授权失败' };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('check-auth-status', async () => {
    const status = { feishu: { authed: false, userName: '', version: '' }, dingtalk: { authed: false, userName: '', version: '' } };
    try {
      const r = await runCLI('lark-cli', ['auth', 'status'], 5000);
      const data = JSON.parse(r.stdout);
      if (data.tokenStatus === 'valid') status.feishu = { authed: true, userName: data.userName || '', version: data.cliVersion || '' };
    } catch (e) { /* not authed */ }
    try {
      const r = await runCLI('dws', ['auth', 'status', '--format', 'json'], 5000);
      const data = JSON.parse(r.stdout);
      if (data.success) status.dingtalk = { authed: true, userName: data.userName || '', version: data.version || '' };
    } catch (e) { /* not authed */ }
    return status;
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
  ipcMain.handle('agent-send-message', (_, text) => agentManager.sendMessage(text));
  ipcMain.handle('agent-stop-generation', () => agentManager.stopGeneration());

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
}

// Expose agentManager for graceful shutdown on app quit
module.exports = { setupIPCHandlers, getAgentManager: () => agentManager };
