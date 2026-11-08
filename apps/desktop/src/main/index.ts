import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { type LaunchService, type MetadataStore, createLaunchService, createWorkspace } from '@agenthub/application';
import { DomainError } from '@agenthub/domain';
import { createLauncher } from '@agenthub/integrations';
import {
  appendHandoff,
  conflictingFiles,
  contextFiles,
  copyContextFiles,
  defaultContextFolder,
  detectContext,
  handoffFolder,
  listNotes,
  looseChatFolder,
  moveNote,
  newestSession,
  openMetadataStore,
  readContextOverview,
  readNote,
  saveNote,
  isContextFolder,
  listContext,
  makeContextFolder,
  readContext,
  writeContext,
} from '@agenthub/persistence';
import { createGitObserver, createMacPlatform, createPathInspector, createSkillInstaller, readSkillManifest, shellQuote } from '@agenthub/platform';
import { type Locale, resolveLocale, translate } from '@agenthub/i18n';
import { BrowserWindow, app, dialog, nativeTheme, session, shell } from 'electron';
import { registerIpcHandlers } from './ipc';
import { MIN_HEIGHT, MIN_WIDTH, loadWindowState, trackWindowState } from './window-state';

// Dev runs keep their own data, so unreleased migrations never touch real data.
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'AgentHub Dev'));
}

let store: MetadataStore | undefined;
let launchService: LaunchService | undefined;
let mainWindow: BrowserWindow | undefined;
// The interface language for what Main shows itself (ADR-020 item 6); the system's until the store opens.
let uiLocale: () => Locale = () => resolveLocale(app.getLocale());

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];

function isAppUrl(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
}

function createWindow(): void {
  const dataDirectory = app.getPath('userData');
  const state = loadWindowState(dataDirectory);
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'AgentHub',
    // The sidebar runs up under the traffic lights, as in Claude and Codex.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  if (state.maximized) window.maximize();
  trackWindowState(window, dataDirectory);

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  // The renderer blocks unload while it holds unsaved edits; the user decides here.
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: translate(uiLocale(), 'main.unsaved.message'),
      detail: translate(uiLocale(), 'main.unsaved.detail'),
      buttons: [translate(uiLocale(), 'main.unsaved.stay'), translate(uiLocale(), 'main.unsaved.discard')],
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

// Clients start the MCP server through this stable path, so moving or updating the app only
// needs the shim rewritten, never each account's config (SPIKE-10).
function writeMcpShim(dataDirectory: string): string {
  const shim = join(dataDirectory, 'bin', 'agenthub-mcp');
  const script = join(app.getAppPath(), 'out', 'main', 'mcp.js');
  const body = [
    '#!/bin/sh',
    '# Written by AgentHub at every start: runs its MCP server with the app binary in Node mode.',
    `ELECTRON_RUN_AS_NODE=1 AGENTHUB_VERSION=${shellQuote(app.getVersion())} exec ${shellQuote(process.execPath)} ${shellQuote(script)} "$@"`,
    '',
  ].join('\n');
  mkdirSync(join(dataDirectory, 'bin'), { recursive: true, mode: 0o700 });
  const temporary = `${shim}.${process.pid}.tmp`;
  writeFileSync(temporary, body, { mode: 0o700 });
  chmodSync(temporary, 0o700);
  renameSync(temporary, shim);
  return shim;
}

function start(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const dataDirectory = app.getPath('userData');
  // English outside the three interface languages; `--lang` sets it, as E2E does.
  const systemLocale = resolveLocale(app.getLocale());
  const openedStore = openMetadataStore(join(dataDirectory, 'agenthub.sqlite'), {
    backupDirectory: join(dataDirectory, 'backups'),
  });
  store = openedStore;

  const paths = createPathInspector();
  let mcpShim: string | null = null;
  try {
    mcpShim = writeMcpShim(dataDirectory);
    mkdirSync(join(dataDirectory, 'logs'), { recursive: true, mode: 0o700 });
  } catch (error) {
    // Without the shim, opening still works; only the MCP step is skipped.
    console.error(error);
  }
  const mcpLog = join(dataDirectory, 'logs', 'mcp.log');
  const mcpServer = (profileId: string): { command: string; args: string[] } | null =>
    mcpShim === null ? null : { command: mcpShim, args: [`--account=${profileId}`, `--data=${dataDirectory}`, `--log=${mcpLog}`] };
  const newId = randomUUID;
  const now = (): string => new Date().toISOString();
  const defaultContextDirectory = (projectId: string): string => defaultContextFolder(dataDirectory, projectId);
  // Dev runs and tests keep accounts inside their own data folder, away from real logins.
  const usesOwnData = !app.isPackaged || app.commandLine.hasSwitch('user-data-dir');
  const testBrowser = usesOwnData ? process.env['AGENTHUB_E2E_BROWSER_DIR'] : undefined;
  const testTrash = usesOwnData ? process.env['AGENTHUB_E2E_TRASH_DIR'] : undefined;
  const platform = createMacPlatform(testBrowser ? { browserDirs: [testBrowser], browserOpenCommand: join(testBrowser, 'open') } : {});
  const git = createGitObserver(platform);
  const documents = {
    overview: readContextOverview,
    detect: (projectPath: string) => detectContext(projectPath),
    isContextFolder,
    makeFolder: makeContextFolder,
    files: contextFiles,
    conflicts: conflictingFiles,
    copy: copyContextFiles,
    list: (folder: string) => listContext(folder),
    read: readContext,
    write: writeContext,
    appendHandoff: (folder: string, taskRef: string, entry: string) => {
      appendHandoff(folder, taskRef, entry);
    },
  };
  const notes = { list: (folder: string) => listNotes(folder), read: readNote, save: saveNote, move: moveNote };
  const handoffDirectory = (projectId: string): string => handoffFolder(dataDirectory, projectId);
  const workspace = createWorkspace({
    store: openedStore,
    paths,
    defaultContextDirectory,
    documents,
    git,
    notes,
    handoffDirectory,
    looseChatDirectory: looseChatFolder(dataDirectory),
    ensureDirectory: (path) => mkdirSync(path, { recursive: true, mode: 0o700 }),
    // E2E runs move folders into their own stand-in Trash, never the user's.
    trash: testTrash ? async (path) => renameSync(path, join(testTrash, `${Date.now()}-${basename(path)}`)) : (path) => shell.trashItem(path),
    newId,
    now,
    defaultLocale: systemLocale,
  });
  uiLocale = () => workspace.getSettings().uiLanguage;
  const accountsRoot = usesOwnData ? join(dataDirectory, 'accounts') : join(homedir(), '.agenthub', 'accounts');
  // Packaged skills sit beside app.asar; a dev run reads them from the source tree.
  const skills = createSkillInstaller({
    source: app.isPackaged ? join(process.resourcesPath, 'skills') : join(app.getAppPath(), 'skills'),
    shared: join(dataDirectory, 'skills'),
  });
  try {
    // Accounts link to AgentHub's copy, so this brings an app update to all of them.
    skills.refresh();
  } catch (error) {
    console.error(error);
  }
  const launching = createLaunchService({
    store: openedStore,
    launcher: createLauncher(platform),
    platform,
    paths,
    skills,
    readSkill: readSkillManifest,
    mcpServer,
    defaultContextDirectory,
    documents,
    git,
    notes,
    handoffDirectory,
    sessions: { newest: (provider, configRoot, folder) => newestSession(provider, configRoot, folder) },
    deviceId: () => workspace.getSettings().deviceId,
    newId,
    now,
    accountDirectories: (id) => ({ cli: join(accountsRoot, id, 'cli'), desktop: join(accountsRoot, id, 'desktop') }),
    defaultLocale: systemLocale,
  });
  launchService = launching;
  nativeTheme.themeSource = workspace.getSettings().theme;

  registerIpcHandlers({
    workspace,
    launching,
    engineStatus: () => openedStore.status(),
    dataDirectory,
    isTrustedSender: (event) => isAppUrl(event.senderFrame?.url ?? ''),
    mcp: { server: mcpServer, logFile: mcpLog },
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
      dialog.showErrorBox(
        translate(uiLocale(), 'main.startFailed'),
        error instanceof DomainError ? translate(uiLocale(), error.detail) : error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  launchService?.stopLogins();
  store?.close();
});
