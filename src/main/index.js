const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { setupIPCHandlers, getAgentManager } = require('./ipc-handlers');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Hermes Desktop for Office',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  setupIPCHandlers(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Graceful shutdown: stop Agent before quitting
app.on('before-quit', async () => {
  const agent = getAgentManager();
  if (agent && agent.running) {
    try { await agent.stop(); } catch (_) { /* best effort */ }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// NOTE: config-get/config-save handlers are registered in ipc-handlers.js (setupIPCHandlers).
// Do NOT register them here to avoid duplicates and separate ConfigStore instances.
