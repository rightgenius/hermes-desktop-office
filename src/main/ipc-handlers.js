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

  // Config handlers
  ipcMain.handle('config-get', () => configStore.get());
  ipcMain.handle('config-save', (_, data) => configStore.save(data));

  ipcMain.handle('config-browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择工作空间路径',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
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
            } catch (e) { /* still waiting */ }
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
      if (data.tokenStatus === 'valid') {
        status.feishu = { authed: true, userName: data.userName || '', version: data.cliVersion || '' };
      }
    } catch (e) { /* not authenticated */ }
    try {
      const r = await runCLI('dws', ['auth', 'status', '--format', 'json'], 5000);
      const data = JSON.parse(r.stdout);
      if (data.success) {
        status.dingtalk = { authed: true, userName: data.userName || '', version: data.version || '' };
      }
    } catch (e) { /* not authenticated */ }
    return status;
  });

  ipcMain.handle('run-diagnostic', async () => {
    const [lark, dws] = await Promise.allSettled([
      runCLI('lark-cli', ['doctor']),
      runCLI('dws', ['doctor']),
    ]);
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
}

module.exports = { setupIPCHandlers };
