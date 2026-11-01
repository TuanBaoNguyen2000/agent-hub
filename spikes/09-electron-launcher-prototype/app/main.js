'use strict';
// SPIKE-09 Electron Main. With --run=a,b the scenarios run without a window and the
// app quits; with no arguments (a Finder launch) the window offers them as buttons.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildScenarios, ensureFixtures } = require('./scenarios');
const { sanitize } = require('./process-utils');

const argValue = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
};

const scenarios = buildScenarios({ openExternal: (url) => shell.openExternal(url) });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function configuredOutDir() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'spike-config.json'), 'utf8')).outDir;
  } catch {
    return path.resolve(__dirname, '../local/runs');
  }
}

const report = {
  spike: 'SPIKE-09',
  startedAt: new Date().toISOString(),
  launch: argValue('label') || 'window',
  // app.isPackaged is false here because the executable keeps Electron's name.
  app: { inAppBundle: __dirname.includes('.app/Contents/Resources/'), electron: process.versions.electron, node: process.versions.node, os: `${os.release()} ${process.arch}` },
  results: [],
};

function saveReport() {
  const name = `${stamp}-${report.launch}.json`;
  const body = `${JSON.stringify(sanitize(report), null, 2)}\n`;
  try {
    const dir = configuredOutDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
    return path.join(dir, name);
  } catch (error) {
    // Falls back so a denied folder is itself recorded, not lost.
    report.reportWriteError = error.code;
    const fallback = path.join(app.getPath('userData'), name);
    fs.writeFileSync(fallback, `${JSON.stringify(sanitize(report), null, 2)}\n`);
    return fallback;
  }
}

async function runScenario(id) {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  const startedAt = Date.now();
  const entry = { id, at: new Date(startedAt).toISOString() };
  try {
    entry.data = await scenario.run();
  } catch (error) {
    entry.error = error.code || error.message;
  }
  entry.ms = Date.now() - startedAt;
  report.results.push(entry);
  saveReport();
  return sanitize(entry);
}

function openWindow() {
  const window = new BrowserWindow({
    width: 860,
    height: 720,
    title: 'AgentHub Spike 09',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('scenarios:list', () => scenarios.map(({ id, visible, label }) => ({ id, visible, label })));
ipcMain.handle('scenario:run', (_event, id) => {
  if (typeof id !== 'string') throw new Error('Malformed scenario id');
  return runScenario(id);
});
ipcMain.handle('report:path', () => saveReport());

app.whenReady().then(async () => {
  ensureFixtures();
  const requested = argValue('run');
  if (!requested) {
    openWindow();
    return;
  }
  for (const id of requested.split(',')) await runScenario(id);
  saveReport();
  app.quit();
});

app.on('window-all-closed', () => app.quit());
