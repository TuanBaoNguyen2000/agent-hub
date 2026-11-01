'use strict';
// SPIKE-09 launch scenarios, run from Electron Main. Reports hold env names only,
// never values. Never reads data directories, auth files or session contents;
// never signs in, and only stops instances found by their exact data directory.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HOME, allowlistEnv, run, brief, sleep, waitFor, shellQuote } = require('./process-utils');

const SPIKE_ROOT = path.join(HOME, '.agenthub-spike');
const WORK = path.join(SPIKE_ROOT, 'spike09');
const FIXTURE = path.join(WORK, 'Dự án thử');
const HOSTILE_MARKER = 'agenthub-spike09-injected';
const HOSTILE_FIXTURE = path.join(WORK, `Dự án 'nháy' $(touch ${HOSTILE_MARKER})`);

const CLAUDE_EXE = '/Applications/Claude.app/Contents/MacOS/Claude';
const CHATGPT_EXE = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';

const INSTANCES = {
  'claude-fresh': { app: 'Claude', exe: CLAUDE_EXE, envName: 'CLAUDE_CONFIG_DIR', envValue: path.join(WORK, 'Claude config thử'), dataDir: path.join(WORK, 'Claude dữ liệu thử') },
  'codex-fresh': { app: 'ChatGPT', exe: CHATGPT_EXE, envName: 'CODEX_HOME', envValue: path.join(WORK, 'Codex home thử'), dataDir: path.join(WORK, 'Codex dữ liệu thử') },
  'claude-b': { app: 'Claude', exe: CLAUDE_EXE, envName: 'CLAUDE_CONFIG_DIR', envValue: path.join(SPIKE_ROOT, 'claude-b'), dataDir: path.join(SPIKE_ROOT, 'claude-desktop-b') },
  'codex-b': { app: 'ChatGPT', exe: CHATGPT_EXE, envName: 'CODEX_HOME', envValue: path.join(SPIKE_ROOT, 'codex-b'), dataDir: path.join(SPIKE_ROOT, 'codex-desktop-b') },
};

function ensureFixtures() {
  for (const dir of [FIXTURE, HOSTILE_FIXTURE]) {
    fs.mkdirSync(dir, { recursive: true });
    const instructions = path.join(dir, 'AGENTS.md');
    if (!fs.existsSync(instructions)) fs.writeFileSync(instructions, '# SPIKE-09 fixture\n');
  }
}

// --- Executable resolution ---

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function lookInDirs(name, dirs) {
  return dirs.map((dir) => path.join(dir, name)).find(isExecutable) || null;
}

function knownDirs() {
  const dirs = [];
  const nvm = path.join(HOME, '.nvm/versions/node');
  if (fs.existsSync(nvm)) {
    const versions = fs.readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    dirs.push(...versions.map((version) => path.join(nvm, version, 'bin')));
  }
  return [...dirs, '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local/bin')];
}

async function viaShell(name, flags) {
  const mark = '@@AGENTHUB@@';
  const result = await run('/bin/zsh', [flags, `print -r -- "${mark}$(whence -p ${name})${mark}"`], { timeoutMs: 15000 });
  const found = new RegExp(`${mark}(.*?)${mark}`).exec(result.stdout);
  return { path: found && found[1] ? found[1] : null, exit: result.exit, timedOut: result.timedOut, ms: result.ms };
}

const resolved = {};

async function resolveTool(name) {
  const fromProcessPath = lookInDirs(name, (process.env.PATH || '').split(':').filter(Boolean));
  const fromKnownDirs = lookInDirs(name, knownDirs());
  const loginShell = await viaShell(name, '-lc');
  const interactiveShell = await viaShell(name, '-ilc');
  resolved[name] = interactiveShell.path || loginShell.path || fromProcessPath || fromKnownDirs;
  return { fromProcessPath, fromKnownDirs, loginShell, interactiveShell, chosen: resolved[name] };
}

async function tool(name) {
  if (!resolved[name]) await resolveTool(name);
  if (!resolved[name]) throw Object.assign(new Error(`${name} not found`), { code: 'BIN_NOT_FOUND' });
  return resolved[name];
}

const toolEnv = (exe, extra = {}) => allowlistEnv({ pathDirs: [path.dirname(exe)], extra });

// --- Native instances (ADR-013, ADR-014) ---

async function psLines() {
  const result = await run('/bin/ps', ['-axww', '-o', 'pid=,args=']);
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function instancePid(exe, dataDir) {
  const needle = `${exe} --user-data-dir=${dataDir}`;
  const matches = (await psLines()).filter((line) => line.includes(needle));
  return matches.length === 1 ? Number(matches[0].split(/\s+/, 1)[0]) : null;
}

async function defaultPids(exe) {
  return (await psLines())
    .filter((line) => line.includes(exe) && !line.includes('--user-data-dir='))
    .filter((line) => line.slice(line.indexOf(exe) + exe.length).trim() === '')
    .map((line) => Number(line.split(/\s+/, 1)[0]));
}

// Only says whether the expected pair is present; other values are never kept.
async function processHasEnv(pid, name, value) {
  const result = await run('/bin/ps', ['-wwE', '-p', String(pid), '-o', 'command=']);
  if (result.exit !== 0) return 'unreadable';
  return result.stdout.includes(`${name}=`) ? result.stdout.includes(`${name}=${value}`) : false;
}

// Names only: `open` forwards its caller's env, so this shows what really leaked.
async function providerEnvNames(pid) {
  const result = await run('/bin/ps', ['-wwE', '-p', String(pid), '-o', 'command=']);
  if (result.exit !== 0) return 'unreadable';
  const names = result.stdout.match(/\b(?:CLAUDE|ANTHROPIC|CODEX|OPENAI)[A-Z0-9_]*(?==)/g) || [];
  return [...new Set(names)].sort();
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function openInstance(key) {
  const spec = INSTANCES[key];
  const fresh = key.endsWith('-fresh');
  if (fresh) {
    fs.mkdirSync(spec.envValue, { recursive: true });
    fs.mkdirSync(spec.dataDir, { recursive: true });
  } else if (!fs.existsSync(spec.envValue) || !fs.existsSync(spec.dataDir)) {
    return { skipped: 'PROFILE_CONFIG_MISSING' };
  }
  if (await instancePid(spec.exe, spec.dataDir)) return { skipped: 'instance already running' };

  const defaultBefore = await defaultPids(spec.exe);
  const open = await run('/usr/bin/open', ['-n', '-a', spec.app, '--env', `${spec.envName}=${spec.envValue}`, '--args', `--user-data-dir=${spec.dataDir}`]);
  const pid = await waitFor(() => instancePid(spec.exe, spec.dataDir), { timeoutMs: 20000 });
  const envSeen = pid ? await processHasEnv(pid, spec.envName, spec.envValue) : null;
  const defaultAfter = await defaultPids(spec.exe);
  const outcome = {
    open: brief(open),
    instanceStarted: Boolean(pid),
    pid,
    envSeen,
    providerEnvNames: pid ? await providerEnvNames(pid) : null,
    defaultInstanceUnchanged: defaultBefore.join() === defaultAfter.join(),
    defaultInstanceCount: defaultAfter.length,
  };
  if (fresh && pid) {
    await sleep(3000);
    outcome.stopped = await stopPid(pid);
    outcome.defaultInstanceUnchangedAfterStop = defaultBefore.join() === (await defaultPids(spec.exe)).join();
  }
  return outcome;
}

async function stopPid(pid) {
  process.kill(pid, 'SIGTERM');
  const gone = await waitFor(() => !isAlive(pid), { timeoutMs: 20000 });
  return { signal: 'SIGTERM', exited: Boolean(gone) };
}

async function stopInstances() {
  const stopped = {};
  for (const [key, spec] of Object.entries(INSTANCES)) {
    const pid = await instancePid(spec.exe, spec.dataDir);
    if (pid) stopped[key] = await stopPid(pid);
  }
  return { stopped };
}

// --- Terminal.app ---

// Writes a one-shot .command in a private temp dir; Terminal.app runs it with no
// Automation permission. env -i keeps the user's rc files from reaching the tool.
function writeCommandFile({ exe, args, cwd, env }) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-spike09-'));
  const pidFile = path.join(stateDir, 'pid');
  const statusFile = path.join(stateDir, 'status');
  const assignments = Object.entries(env).map(([name, value]) => `${name}=${shellQuote(value)}`);
  const script = [
    '#!/bin/zsh -f',
    `print -r -- $$ > ${shellQuote(pidFile)}`,
    'rm -f -- "$0"',
    `cd -- ${shellQuote(cwd)} || { print -r -- 126 > ${shellQuote(statusFile)}; exit 126; }`,
    ['/usr/bin/env', '-i', ...assignments, 'TERM="$TERM"', 'TERM_PROGRAM="${TERM_PROGRAM:-}"', shellQuote(exe), ...args.map(shellQuote)].join(' '),
    `print -r -- $? > ${shellQuote(statusFile)}`,
    '',
  ].join('\n');
  const commandFile = path.join(stateDir, 'launch.command');
  fs.writeFileSync(commandFile, script, { mode: 0o700 });
  return { stateDir, pidFile, statusFile, commandFile };
}

const quarantineOf = (file) =>
  run('/usr/bin/xattr', [file]).then((result) => result.stdout.includes('com.apple.quarantine'));

async function terminalProbe() {
  const probeOut = path.join(os.tmpdir(), `agenthub-spike09-probe-${process.pid}-${Date.now()}.txt`);
  const shellBody = 'pwd > "$1"; tty >> "$1"; /usr/bin/env | /usr/bin/cut -d= -f1 | /usr/bin/sort >> "$1"';
  const files = writeCommandFile({
    exe: '/bin/sh',
    args: ['-c', shellBody, 'probe', probeOut],
    cwd: HOSTILE_FIXTURE,
    env: allowlistEnv({ extra: { CLAUDE_CONFIG_DIR: path.join(SPIKE_ROOT, 'claude-b') } }),
  });
  const quarantined = await quarantineOf(files.commandFile);
  const open = await run('/usr/bin/open', ['-a', 'Terminal', files.commandFile]);
  const status = await waitFor(() => fs.existsSync(files.statusFile) && fs.readFileSync(files.statusFile, 'utf8').trim(), { timeoutMs: 20000 });
  const lines = fs.existsSync(probeOut) ? fs.readFileSync(probeOut, 'utf8').trim().split('\n') : [];
  if (fs.existsSync(probeOut)) fs.rmSync(probeOut);
  return {
    open: brief(open),
    commandFileQuarantined: quarantined,
    commandFileRemovedItself: !fs.existsSync(files.commandFile),
    exitStatus: status,
    cwdMatches: lines[0] === HOSTILE_FIXTURE,
    hasTty: /^\/dev\/ttys/.test(lines[1] || ''),
    envNames: lines.slice(2),
    injectionMarkerAbsent: ![HOME, WORK, HOSTILE_FIXTURE].some((dir) => fs.existsSync(path.join(dir, HOSTILE_MARKER))),
  };
}

async function terminalInteractive(name, envName, profileDir) {
  const exe = await tool(name);
  if (!fs.existsSync(profileDir)) return { skipped: 'PROFILE_CONFIG_MISSING' };
  const files = writeCommandFile({ exe, args: [], cwd: FIXTURE, env: toolEnv(exe, { [envName]: profileDir }) });
  const open = await run('/usr/bin/open', ['-a', 'Terminal', files.commandFile]);
  const wrapperPid = await waitFor(() => fs.existsSync(files.pidFile) && Number(fs.readFileSync(files.pidFile, 'utf8')), { timeoutMs: 20000 });
  if (!wrapperPid) return { open: brief(open), started: false };
  const childPid = await waitFor(async () => {
    const children = await run('/usr/bin/pgrep', ['-P', String(wrapperPid)]);
    return children.exit === 0 && Number(children.stdout.split('\n')[0]);
  });
  await sleep(1500);
  const cwd = childPid ? await run('/usr/sbin/lsof', ['-a', '-p', String(childPid), '-d', 'cwd', '-Fn']) : null;
  const tty = childPid ? await run('/bin/ps', ['-p', String(childPid), '-o', 'tty=']) : null;
  return {
    open: brief(open),
    started: Boolean(childPid),
    wrapperPid,
    childPid,
    tty: tty ? tty.stdout.trim() : null,
    cwdMatches: cwd ? cwd.stdout.split('\n').some((line) => line === `n${FIXTURE}`) : null,
    envSeen: childPid ? await processHasEnv(childPid, envName, profileDir) : null,
    stateDir: files.stateDir,
  };
}

// --- Scenarios ---

function launchFacts() {
  return {
    ppid: process.ppid,
    startedByLaunchd: process.ppid === 1,
    envNames: Object.keys(process.env).sort(),
    path: process.env.PATH || null,
  };
}

async function envAllowlist() {
  const parse = (result) => result.stdout.split('\n').map((line) => line.split('=', 1)[0]).filter(Boolean).sort();
  const risky = (names) => names.filter((name) => /^(CLAUDE|ANTHROPIC|CODEX|OPENAI|NODE|ELECTRON)/.test(name));
  const inherited = parse(await run('/usr/bin/env', [], { env: process.env }));
  const allowed = parse(await run('/usr/bin/env', [], { env: allowlistEnv() }));
  return { inheritedCount: inherited.length, inheritedRisky: risky(inherited), allowedNames: allowed, allowedRisky: risky(allowed) };
}

async function versions() {
  const report = {};
  for (const name of ['claude', 'codex']) {
    const exe = await tool(name);
    report[name] = {
      systemPathOnly: brief(await run(exe, ['--version'], { env: allowlistEnv() })),
      withToolDir: brief(await run(exe, ['--version'], { env: toolEnv(exe) })),
    };
  }
  return report;
}

// Official status commands only; account identifiers are dropped before reporting.
async function authStatus() {
  const claudeExe = await tool('claude');
  const codexExe = await tool('codex');
  const claude = async (extra) => {
    const result = await run(claudeExe, ['auth', 'status'], { env: toolEnv(claudeExe, extra), timeoutMs: 20000 });
    let fields = null;
    try {
      const { loggedIn, authMethod, subscriptionType } = JSON.parse(result.stdout);
      fields = { loggedIn, authMethod, subscriptionType };
    } catch {
      fields = 'not JSON; output dropped';
    }
    return { exit: result.exit, ms: result.ms, fields };
  };
  const codex = async (extra) => {
    const result = await run(codexExe, ['login', 'status'], { env: toolEnv(codexExe, extra), timeoutMs: 20000 });
    const method = /(not logged in|logged in using [\w ]+)/i.exec(result.stdout + result.stderr);
    return { exit: result.exit, ms: result.ms, method: method ? method[0] : null };
  };
  return {
    claudeA: await claude({}),
    claudeB: await claude({ CLAUDE_CONFIG_DIR: path.join(SPIKE_ROOT, 'claude-b') }),
    codexA: await codex({}),
    codexB: await codex({ CODEX_HOME: path.join(SPIKE_ROOT, 'codex-b') }),
  };
}

async function spawnPaths() {
  const pwd = (cwd) => run('/bin/pwd', [], { cwd });
  const hostile = await pwd(HOSTILE_FIXTURE);
  const repo = await run('/bin/ls', ['-1'], { cwd: path.resolve(__dirname, '../../../../../../..') });
  return {
    unicodeAndSpaces: (await pwd(FIXTURE)).stdout.trim() === FIXTURE,
    quoteAndDollar: hostile.stdout.trim() === HOSTILE_FIXTURE,
    missingCwd: brief(await pwd(path.join(WORK, 'không tồn tại'))),
    missingBinary: brief(await run(path.join(WORK, 'không-có-binary'), [])),
    separateVolume: brief(repo, { keepOutput: false }),
  };
}

async function desktopPipe() {
  const exe = await tool('claude');
  return brief(await run(exe, ['--desktop'], { cwd: FIXTURE, env: toolEnv(exe) }));
}

async function desktopPty() {
  const exe = await tool('claude');
  const env = toolEnv(exe, { TERM: 'xterm-256color' });
  return { pty: '/usr/bin/script', ...brief(await run('/usr/bin/script', ['-q', '/dev/null', exe, '--desktop'], { cwd: FIXTURE, env, timeoutMs: 45000 })) };
}

async function codexApp() {
  const exe = await tool('codex');
  return brief(await run(exe, ['app', FIXTURE], { env: toolEnv(exe), timeoutMs: 45000 }));
}

async function openBundles() {
  return {
    claude: brief(await run('/usr/bin/open', ['-b', 'com.anthropic.claudefordesktop'])),
    codex: brief(await run('/usr/bin/open', ['-b', 'com.openai.codex'])),
  };
}

// Same guard the product needs: only allowlisted schemes reach the OS (TDD §11.3).
function deepLink(openExternal) {
  const allowed = new Set(['claude:']);
  const check = (url) => allowed.has(new URL(url).protocol);
  return async () => {
    const url = `claude://code/new?q=${encodeURIComponent('SPIKE-09 prefilled prompt. Do not send.')}`;
    const rejected = ['file:///etc/hosts', 'x-apple.systempreferences:', 'javascript:alert(1)'].filter((candidate) => !check(candidate));
    await openExternal(url);
    return { opened: url, rejectedByAllowlist: rejected };
  };
}

function buildScenarios({ openExternal }) {
  const define = (id, visible, label, run) => ({ id, visible, label, run });
  return [
    define('launch-facts', false, 'Env names and parent process of this app', launchFacts),
    define('resolve-claude', false, 'Resolve claude from a GUI environment', () => resolveTool('claude')),
    define('resolve-codex', false, 'Resolve codex from a GUI environment', () => resolveTool('codex')),
    define('env-allowlist', false, 'Compare inherited env with the allowlist', envAllowlist),
    define('versions', false, 'Run --version with and without the tool directory on PATH', versions),
    define('auth-status', false, 'Official status commands for profiles A and B', authStatus),
    define('spawn-paths', false, 'cwd with Unicode, spaces, quotes; missing cwd and binary', spawnPaths),
    define('desktop-pipe', false, 'claude --desktop with pipes (expected refusal)', desktopPipe),
    define('terminal-probe', true, 'Terminal.app: one-shot .command, hostile path', terminalProbe),
    define('claude-fresh', true, 'open -n Claude, empty dirs, then stop by PID', () => openInstance('claude-fresh')),
    define('codex-fresh', true, 'open -n ChatGPT, empty dirs, then stop by PID', () => openInstance('codex-fresh')),
    define('desktop-pty', true, 'claude --desktop through a pty, opens a Code session', desktopPty),
    define('codex-app', true, 'codex app PATH, opens ChatGPT', codexApp),
    define('open-bundles', true, 'open -b for Claude and ChatGPT', openBundles),
    define('deep-link', true, 'claude:// link with a prefilled prompt, not sent', deepLink(openExternal)),
    define('claude-b', true, 'Open Claude instance for account B (ADR-013)', () => openInstance('claude-b')),
    define('codex-b', true, 'Open ChatGPT instance for account B (ADR-014)', () => openInstance('codex-b')),
    define('terminal-claude-b', true, 'Terminal.app: interactive claude, profile B', () => terminalInteractive('claude', 'CLAUDE_CONFIG_DIR', path.join(SPIKE_ROOT, 'claude-b'))),
    define('terminal-codex-b', true, 'Terminal.app: interactive codex, profile B', () => terminalInteractive('codex', 'CODEX_HOME', path.join(SPIKE_ROOT, 'codex-b'))),
    define('stop-instances', true, 'Stop instances found by exact data directory', stopInstances),
  ];
}

module.exports = { buildScenarios, ensureFixtures };
