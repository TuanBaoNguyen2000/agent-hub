import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { AppInstance, BrowserCapture, InstalledApp, PathInspector, PathStatus, PlatformPort, RunOptions, RunResult, ToolProcess } from '@agenthub/application';

export function createPathInspector(): PathInspector {
  return {
    inspect(path: string): PathStatus {
      if (!isAbsolute(path)) return 'not_absolute';
      try {
        return statSync(path).isDirectory() ? 'directory' : 'not_directory';
      } catch {
        return 'missing';
      }
    },
  };
}

const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
const ENV_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', '__CF_USER_TEXT_ENCODING'];
const OUTPUT_CAP = 1024 * 1024;

// Child processes get only this, however the app was started: `open` forwards its caller's
// env into the app (SPIKE-09), and a GUI app has no LANG or tool directories of its own.
export function allowlistEnv(
  parent: NodeJS.ProcessEnv,
  { pathDirs = [], extra = {} }: { pathDirs?: string[]; extra?: Record<string, string> } = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ENV_ALLOWLIST) {
    const value = parent[name];
    if (value !== undefined) env[name] = value;
  }
  env['HOME'] ??= homedir();
  env['LANG'] ??= 'en_US.UTF-8';
  env['PATH'] = [...pathDirs, ...SYSTEM_PATH].join(':');
  return { ...env, ...extra };
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// A one-shot script for Terminal.app (ADR-009). Every value is quoted, and env -i keeps the
// user's rc files from reaching the tool. The state folder disappears when the tool exits.
export function terminalScript(request: {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stateDir: string;
}): string {
  const assignments = Object.entries(request.env).map(([name, value]) => `${name}=${shellQuote(value)}`);
  const command = [
    '/usr/bin/env',
    '-i',
    ...assignments,
    'TERM="$TERM"',
    'TERM_PROGRAM="${TERM_PROGRAM:-}"',
    shellQuote(request.executable),
    ...request.args.map(shellQuote),
  ].join(' ');
  return [
    '#!/bin/zsh -f',
    `print -r -- $$ > ${shellQuote(join(request.stateDir, 'pid'))}`,
    'rm -f -- "$0"',
    `cd -- ${shellQuote(request.cwd)} || exit 126`,
    command,
    // `status` is read-only in zsh.
    'code=$?',
    `rm -rf -- ${shellQuote(request.stateDir)}`,
    'exit $code',
    '',
  ].join('\n');
}

export function instanceOpenArgs(request: { appName: string; envName: string; envValue: string; dataDir: string }): string[] {
  return ['-n', '-a', request.appName, '--env', `${request.envName}=${request.envValue}`, '--args', `--user-data-dir=${request.dataDir}`];
}

// Reads `ps -o lstart=,pid=,args=`. A data dir ends at the next flag, so it may contain spaces.
export function parseInstances(psOutput: string, executable: string): AppInstance[] {
  const instances: (AppInstance & { startedAt: number })[] = [];
  for (const line of psOutput.split('\n')) {
    const match = /^\s*(\w{3} \w{3}\s+\d+ [\d:]{8} \d{4})\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const [, started = '', pid = '', args = ''] = match;
    if (args !== executable && !args.startsWith(`${executable} `)) continue;
    const dataDir = /--user-data-dir=(.*?)(?= --|$)/.exec(args.slice(executable.length))?.[1] ?? null;
    instances.push({ pid: Number(pid), dataDir, startedAt: Date.parse(started) });
  }
  return instances.sort((a, b) => a.startedAt - b.startedAt || a.pid - b.pid).map(({ pid, dataDir }) => ({ pid, dataDir }));
}

// AppKit activates a given process with no Automation permission, which System Events would need.
export function focusScript(pid: number): string {
  return `ObjC.import('AppKit'); var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}); app.isNil() ? false : app.activateWithOptions($.NSApplicationActivateAllWindows)`;
}

// In order of preference. Safari is missing because nothing outside it can open a private window.
const PRIVATE_BROWSERS = [
  { app: 'Google Chrome', flag: '--incognito' },
  { app: 'Microsoft Edge', flag: '--inprivate' },
  { app: 'Brave Browser', flag: '--incognito' },
  { app: 'Firefox', flag: '--private-window' },
] as const;

export function privateWindowArgs(browser: { app: string; flag: string }, url: string): string[] {
  return ['-na', browser.app, '--args', browser.flag, url];
}

// Writes the address where AgentHub can read it. The first argument is all a CLI passes.
export function browserCaptureScript(urlFile: string): string {
  return ['#!/bin/sh', `printf '%s' "$1" > ${shellQuote(urlFile)}`, ''].join('\n');
}

function spawnProcess(command: string, args: string[], { cwd, env }: { cwd?: string | undefined; env: Record<string, string> }): ToolProcess {
  const child = spawn(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
  const listeners: ((line: string) => void)[] = [];
  let pending = '';
  child.stdout.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    if (pending.length > OUTPUT_CAP) pending = '';
    for (const line of lines) for (const listener of listeners) listener(line);
  });
  // A write can race the process exiting; the exit is reported through `exited`.
  child.stdin.on('error', () => undefined);
  const exited = new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(null));
    child.on('close', (exit) => resolve(exit));
  });
  return {
    onLine: (listener) => listeners.push(listener),
    write: (line) => {
      if (child.stdin.writable) child.stdin.write(`${line}\n`);
    },
    kill: () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    },
    exited,
  };
}

function runProcess(
  command: string,
  args: string[],
  { cwd, env, timeoutMs = 30_000 }: { cwd?: string | undefined; env: Record<string, string>; timeoutMs?: number | undefined },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const result: RunResult = { exit: null, stdout: '', stderr: '', timedOut: false, errorCode: null };
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = (key: 'stdout' | 'stderr') => (chunk: Buffer) => {
      if (result[key].length < OUTPUT_CAP) result[key] += chunk.toString('utf8');
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs);
    child.on('error', (error: NodeJS.ErrnoException) => {
      result.errorCode = error.code ?? 'SPAWN_FAILED';
    });
    child.on('close', (exit) => {
      clearTimeout(timer);
      resolve({ ...result, exit });
    });
  });
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export interface MacPlatformOptions {
  env?: NodeJS.ProcessEnv;
  applicationDirs?: string[];
  // Tests replace these, so they never open a window in the real browser.
  browserDirs?: string[];
  browserOpenCommand?: string;
}

const CLI_CACHE_MS = 30_000;

export function createMacPlatform({
  env: parentEnv = process.env,
  applicationDirs,
  browserDirs,
  browserOpenCommand = '/usr/bin/open',
}: MacPlatformOptions = {}): PlatformPort {
  const home = parentEnv['HOME'] ?? homedir();
  const appDirs = applicationDirs ?? ['/Applications', join(home, 'Applications')];
  const baseEnv = (options: { pathDirs?: string[]; extra?: Record<string, string> } = {}): Record<string, string> =>
    allowlistEnv(parentEnv, options);
  const cliCache = new Map<string, { path: string | null; at: number }>();

  // A GUI app sees no nvm or Homebrew on PATH, and only an interactive shell loads them (SPIKE-09).
  async function discoverCli(name: string): Promise<string | null> {
    const mark = '@@AGENTHUB@@';
    const shell = baseEnv()['SHELL'] ?? '/bin/zsh';
    const viaShell = await runProcess(shell, ['-ilc', `command -v ${name}; printf '${mark}'`], {
      env: baseEnv(),
      timeoutMs: 15_000,
    });
    const found = viaShell.stdout
      .split(mark)[0]
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => isAbsolute(line) && isExecutableFile(line))
      .at(-1);
    if (found) return found;

    const nvm = join(home, '.nvm/versions/node');
    const nvmDirs = existsSync(nvm)
      ? readdirSync(nvm)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          .map((version) => join(nvm, version, 'bin'))
      : [];
    const candidates = [...nvmDirs, '/opt/homebrew/bin', '/usr/local/bin', join(home, '.local/bin')];
    return candidates.map((dir) => join(dir, name)).find(isExecutableFile) ?? null;
  }

  const toolRun = (executable: string, options: RunOptions = {}) => ({
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    // Some CLIs are node scripts, so their own folder must be on PATH (SPIKE-09).
    env: baseEnv({ pathDirs: [dirname(executable)], extra: options.extraEnv ?? {} }),
  });

  async function processLines(): Promise<string[]> {
    const result = await runProcess('/bin/ps', ['-axww', '-o', 'args='], { env: baseEnv() });
    return result.stdout.split('\n').map((line) => line.trim());
  }

  async function runningInstances(executable: string): Promise<AppInstance[]> {
    const result = await runProcess('/bin/ps', ['-axww', '-o', 'lstart=,pid=,args='], { env: { ...baseEnv(), LC_ALL: 'C' } });
    return parseInstances(result.stdout, executable);
  }

  return {
    supported: process.platform === 'darwin',

    async findCli(name, overridePath) {
      if (overridePath !== null) return isExecutableFile(overridePath) ? overridePath : null;
      const cached = cliCache.get(name);
      if (cached && Date.now() - cached.at < CLI_CACHE_MS && (cached.path === null || isExecutableFile(cached.path))) {
        return cached.path;
      }
      const path = await discoverCli(name);
      cliCache.set(name, { path, at: Date.now() });
      return path;
    },

    run: (executable, args, options) => runProcess(executable, args, toolRun(executable, options)),

    // Some commands refuse pipes; /usr/bin/script gives them a pty with no native module (SPIKE-09).
    runInPty(executable, args, options = {}) {
      const run = toolRun(executable, { ...options, extraEnv: { TERM: 'xterm-256color', ...options.extraEnv } });
      return runProcess('/usr/bin/script', ['-q', '/dev/null', executable, ...args], run);
    },

    spawnTool: (executable, args, options) => spawnProcess(executable, args, toolRun(executable, options)),

    captureBrowserRequest(): BrowserCapture {
      const directory = mkdtempSync(join(tmpdir(), 'agenthub-login-'));
      const urlFile = join(directory, 'url');
      const command = join(directory, 'browser');
      writeFileSync(command, browserCaptureScript(urlFile), { mode: 0o700 });
      return {
        command,
        url: () => (existsSync(urlFile) ? readFileSync(urlFile, 'utf8').trim() || null : null),
        dispose: () => rmSync(directory, { recursive: true, force: true }),
      };
    },

    async openPrivateWindow(url) {
      const browser = PRIVATE_BROWSERS.find(({ app }) => (browserDirs ?? appDirs).some((dir) => existsSync(join(dir, `${app}.app`))));
      if (!browser) return null;
      const opened = await runProcess(browserOpenCommand, privateWindowArgs(browser, url), { env: baseEnv() });
      return opened.exit === 0 ? browser.app : null;
    },

    async openInDefaultBrowser(url) {
      return (await runProcess(browserOpenCommand, [url], { env: baseEnv() })).exit === 0;
    },

    async openTerminal({ executable, args, cwd, extraEnv }) {
      const stateDir = mkdtempSync(join(tmpdir(), 'agenthub-launch-'));
      const commandFile = join(stateDir, 'launch.command');
      const env = baseEnv({ pathDirs: [dirname(executable)], extra: extraEnv });
      writeFileSync(commandFile, terminalScript({ executable, args, cwd, env, stateDir }), { mode: 0o700 });
      const opened = await runProcess('/usr/bin/open', ['-a', 'Terminal', commandFile], { env: baseEnv() });
      if (opened.exit !== 0) return false;
      // The state folder is already gone if the tool exited at once, which still counts as started.
      return waitFor(() => existsSync(join(stateDir, 'pid')) || !existsSync(stateDir), 10_000);
    },

    async findApp(bundleName): Promise<InstalledApp | null> {
      for (const dir of appDirs) {
        const path = join(dir, `${bundleName}.app`);
        const executable = join(path, 'Contents/MacOS', bundleName);
        if (!isExecutableFile(executable)) continue;
        const plist = join(path, 'Contents/Info.plist');
        const version = await runProcess('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', plist], { env: baseEnv() });
        return { path, executable, version: version.exit === 0 ? version.stdout.trim() : null };
      }
      return null;
    },

    async openApp(bundleId) {
      return (await runProcess('/usr/bin/open', ['-b', bundleId], { env: baseEnv() })).exit === 0;
    },

    async openInstance(request) {
      const opened = await runProcess('/usr/bin/open', instanceOpenArgs(request), { env: baseEnv() });
      if (opened.exit !== 0) return false;
      const needle = `${request.executable} --user-data-dir=${request.dataDir}`;
      return waitFor(async () => (await processLines()).some((line) => line.includes(needle)), 20_000);
    },

    async openDefaultInstance({ appName, executable }) {
      // -n because plain `open` would only bring forward whichever copy is already running.
      const opened = await runProcess('/usr/bin/open', ['-n', '-a', appName], { env: baseEnv() });
      if (opened.exit !== 0) return false;
      return waitFor(async () => (await runningInstances(executable)).some((instance) => instance.dataDir === null), 20_000);
    },

    runningInstances,

    async focusProcess(pid) {
      const result = await runProcess('/usr/bin/osascript', ['-l', 'JavaScript', '-e', focusScript(pid)], { env: baseEnv(), timeoutMs: 10_000 });
      return result.exit === 0 && result.stdout.trim() === 'true';
    },

    defaultDesktopDataDirs() {
      const support = join(home, 'Library/Application Support');
      return [join(support, 'Claude'), join(support, 'ChatGPT'), join(support, 'Codex')];
    },

    ensureDirectory(path) {
      mkdirSync(path, { recursive: true, mode: 0o700 });
    },

    readTextFile(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },

    writeTextFile(path, content) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
      try {
        writeFileSync(temporary, content, { mode: 0o600 });
        renameSync(temporary, path);
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
    },

    // Only counts names: these folders are treated as credential stores (ADR-013).
    isEmptyDirectory(path) {
      return readdirSync(path).length === 0;
    },

    pathKind(path) {
      if (!isAbsolute(path)) return 'relative';
      try {
        return statSync(path).isDirectory() ? 'directory' : 'file';
      } catch {
        return 'missing';
      }
    },

    homeDirectory: () => home,
  };
}
export { createSkillInstaller } from './skills';
export { createGitObserver } from './git';
