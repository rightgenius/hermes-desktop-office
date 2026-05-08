const { ipcMain, shell } = require('electron');
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

  let cliDir, binary;
  if (cliName === 'lark-cli') {
    cliDir = 'feishu-cli';
    if (platform === 'darwin') {
      binary = arch === 'arm64' ? 'darwin-arm64/lark-cli' : 'darwin-amd64/lark-cli';
    } else if (platform === 'win32') {
      binary = 'windows-amd64/lark-cli.exe';
    } else {
      binary = 'linux-amd64/lark-cli';
    }
  } else if (cliName === 'dws') {
    cliDir = 'dws-cli';
    if (platform === 'darwin') {
      binary = arch === 'arm64' ? 'darwin-arm64/dws' : 'darwin-amd64/dws';
    } else if (platform === 'win32') {
      binary = 'windows-amd64/dws.exe';
    } else {
      binary = 'linux-amd64/dws';
    }
  }

  return path.join(assetsDir, cliDir, binary);
}

function runCLI(cliName, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const binaryPath = getCLIBinaryPath(cliName);
    const child = execFile(binaryPath, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function setupIPCHandlers(mainWindow) {
  agentManager = new AgentManager(mainWindow);

  // ============================
  // Auth handlers
  // ============================
  ipcMain.handle('auth-feishu', async () => {
    try {
      const result = await runCLI('lark-cli', ['auth', 'login', '--recommend', '--no-wait', '--json']);
      const auth = JSON.parse(result.stdout);

      if (auth.device_code && auth.verification_url) {
        // Open browser
        shell.openExternal(auth.verification_url);

        // Poll for completion
        return new Promise((resolve, reject) => {
          const pollInterval = setInterval(async () => {
            try {
              const statusResult = await runCLI('lark-cli', ['auth', 'login', '--device-code', auth.device_code]);
              const status = JSON.parse(statusResult.stdout);
              if (status.ok) {
                clearInterval(pollInterval);
                resolve({ success: true, userName: status.userName, userOpenId: status.userOpenId });
              }
            } catch (e) {
              // Polling not complete yet
            }
          }, 3000);

          // Timeout after 10 minutes
          setTimeout(() => {
            clearInterval(pollInterval);
            reject(new Error('授权超时'));
          }, 600000);
        });
      }
      return { success: false, error: '未获取到授权码' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth-dingtalk', async () => {
    try {
      const result = await runCLI('dws', ['auth', 'login', '--format', 'json']);
      const auth = JSON.parse(result.stdout);
      if (auth.success) {
        return { success: true, userName: auth.userName || '' };
      }
      return { success: false, error: '授权失败' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('run-diagnostic', async () => {
    try {
      const [larkResult, dwsResult] = await Promise.allSettled([
        runCLI('lark-cli', ['doctor']),
        runCLI('dws', ['doctor']),
      ]);

      let output = '=== 诊断结果 ===\n\n';
      output += '--- 飞书 CLI (lark-cli) ---\n';
      output += larkResult.status === 'fulfilled' ? larkResult.value.stdout : `错误: ${larkResult.reason.message}\n`;
      output += '\n--- 钉钉 CLI (dws) ---\n';
      output += dwsResult.status === 'fulfilled' ? dwsResult.value.stdout : `错误: ${dwsResult.reason.message}\n`;

      return { output };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ============================
  // Agent handlers
  // ============================
  ipcMain.handle('agent-start', async () => {
    const config = configStore.get();
    return agentManager.start(config);
  });

  ipcMain.handle('agent-stop', async () => {
    return agentManager.stop();
  });

  ipcMain.handle('agent-restart', async () => {
    const config = configStore.get();
    await agentManager.stop();
    return agentManager.start(config);
  });
}

module.exports = { setupIPCHandlers };
