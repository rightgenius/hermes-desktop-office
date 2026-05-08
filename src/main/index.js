const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { setupIPCHandlers } = require('./ipc-handlers');
const ConfigStore = require('./config-store');

let mainWindow = null;
const configStore = new ConfigStore();

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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Config IPC
ipcMain.handle('config-get', () => configStore.get());
ipcMain.handle('config-save', (_, data) => configStore.save(data));
