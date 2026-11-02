import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type MetadataStore, createLaunchService, createWorkspace } from '@agenthub/application';
import { createLauncher } from '@agenthub/integrations';
import { createContextStore, openMetadataStore } from '@agenthub/persistence';
import { createMacPlatform, createPathInspector } from '@agenthub/platform';
import { BrowserWindow, app, dialog, nativeTheme, session } from 'electron';
import { registerIpcHandlers } from './ipc';

// Dev runs keep their own data, so unreleased migrations never touch real data.
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'AgentHub Dev'));
}

let store: MetadataStore | undefined;
let mainWindow: BrowserWindow | undefined;

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];

function isAppUrl(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    title: 'AgentHub',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  // The renderer blocks unload while it holds unsaved edits; the user decides here.
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: 'Bạn có thay đổi chưa lưu.',
      detail: 'Nếu đóng bây giờ, các thay đổi này sẽ mất.',
      buttons: ['Ở lại', 'Đóng và bỏ thay đổi'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function start(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const dataDirectory = app.getPath('userData');
  const openedStore = openMetadataStore(join(dataDirectory, 'agenthub.sqlite'), {
    backupDirectory: join(dataDirectory, 'backups'),
  });
  store = openedStore;

  const paths = createPathInspector();
  const newId = randomUUID;
  const now = (): string => new Date().toISOString();
  const workspace = createWorkspace({
    store: openedStore,
    context: createContextStore(join(dataDirectory, 'artifacts')),
    paths,
    newId,
    now,
  });
  const platform = createMacPlatform();
  // Dev runs and tests keep accounts inside their own data folder, away from real logins.
  const usesOwnData = !app.isPackaged || app.commandLine.hasSwitch('user-data-dir');
  const accountsRoot = usesOwnData ? join(dataDirectory, 'accounts') : join(homedir(), '.agenthub', 'accounts');
  const launching = createLaunchService({
    store: openedStore,
    launcher: createLauncher(platform),
    platform,
    paths,
    deviceId: () => workspace.getSettings().deviceId,
    newId,
    now,
    accountDirectories: (id) => ({ cli: join(accountsRoot, id, 'cli'), desktop: join(accountsRoot, id, 'desktop') }),
  });
  nativeTheme.themeSource = workspace.getSettings().theme;

  registerIpcHandlers({
    workspace,
    launching,
    engineStatus: () => openedStore.status(),
    dataDirectory,
    isTrustedSender: (event) => isAppUrl(event.senderFrame?.url ?? ''),
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// The database and artifact files assume a single writer.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      if (app.isReady() && store) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      dialog.showErrorBox('AgentHub không khởi động được', error instanceof Error ? error.message : String(error));
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  store?.close();
});
