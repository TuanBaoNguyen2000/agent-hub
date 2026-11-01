import { join } from 'node:path';
import type { MetadataStore } from '@agenthub/application';
import { IpcChannel, type SystemStatusDto } from '@agenthub/contracts';
import { openMetadataStore } from '@agenthub/persistence';
import { BrowserWindow, app, dialog, ipcMain, session } from 'electron';

let store: MetadataStore | undefined;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'AgentHub',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!devServerUrl || !url.startsWith(devServerUrl)) event.preventDefault();
  });

  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function start(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const openedStore = openMetadataStore(join(app.getPath('userData'), 'agenthub.sqlite'));
  store = openedStore;

  ipcMain.handle(IpcChannel.systemStatus, (): SystemStatusDto => ({
    appVersion: app.getVersion(),
    storage: openedStore.status(),
  }));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.whenReady().then(start).catch((error: unknown) => {
  dialog.showErrorBox('AgentHub could not start', error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  store?.close();
});
