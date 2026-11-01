'use strict';
// Process helpers for the launcher scenarios. Argument arrays only, never a shell
// string built from input; env is always built from an allowlist.
const { spawn } = require('node:child_process');
const os = require('node:os');

const HOME = os.homedir();
const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
const ENV_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', '__CF_USER_TEXT_ENCODING'];
const OUTPUT_CAP = 8 * 1024 * 1024;

// Reports keep aliases and paths relative to ~; never an account identifier.
function tidy(text) {
  return String(text)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replaceAll(HOME, '~');
}

function sanitize(value) {
  if (typeof value === 'string') return tidy(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  }
  return value;
}

function allowlistEnv({ pathDirs = [], extra = {} } = {}) {
  const env = {};
  for (const name of ENV_ALLOWLIST) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  env.HOME = env.HOME || HOME;
  // A GUI app gets no LANG from launchd; Unicode paths need a UTF-8 locale.
  env.LANG = env.LANG || 'en_US.UTF-8';
  env.PATH = [...pathDirs, ...SYSTEM_PATH].join(':');
  return { ...env, ...extra };
}

function run(command, args = [], { cwd, env, timeoutMs = 30000, stdin = 'ignore' } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const result = { command, args, exit: null, signal: null, timedOut: false, errorCode: null, stdout: '', stderr: '' };
    let child;
    try {
      child = spawn(command, args, { cwd, env: env || allowlistEnv(), stdio: [stdin, 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ...result, errorCode: error.code || 'SPAWN_THROW', ms: 0 });
      return;
    }
    const collect = (key) => (chunk) => {
      if (result[key].length < OUTPUT_CAP) result[key] += chunk.toString('utf8');
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      result.errorCode = error.code;
    });
    child.on('close', (exit, signal) => {
      clearTimeout(timer);
      resolve({ ...result, exit, signal, ms: Date.now() - startedAt });
    });
  });
}

// What a report may keep from a command: never the full env or long raw output.
function brief(result, { keepOutput = true } = {}) {
  const trim = (text) => tidy(text).trim().slice(0, 600);
  return {
    exit: result.exit,
    signal: result.signal,
    timedOut: result.timedOut,
    errorCode: result.errorCode,
    ms: result.ms,
    ...(keepOutput ? { stdout: trim(result.stdout), stderr: trim(result.stderr) } : {}),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, { timeoutMs = 15000, everyMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(everyMs);
  }
}

// Quotes one value for the generated zsh script; input stays literal data.
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

module.exports = { HOME, sanitize, allowlistEnv, run, brief, sleep, waitFor, shellQuote };
