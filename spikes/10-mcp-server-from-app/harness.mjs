// SPIKE-10 harness: acts as an MCP client and starts the stub the way a client config
// would, from a minimal env like a GUI-launched client. Sends no provider requests.
// Usage: node harness.mjs        (after ./build-app.sh)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const local = join(here, 'local');
const app = join(local, 'build', 'Thử nghiệm MCP', 'AgentHub Spike 10.app');
const binary = join(app, 'Contents', 'MacOS', 'AgentHub');
const resources = join(app, 'Contents', 'Resources');
const shim = join(local, 'bin', 'agenthub mcp');
const contextRoot = join(local, 'context');
const logFile = join(local, 'runs', 'server.log');

const minimalEnv = { HOME: process.env.HOME, USER: process.env.USER, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
const serverArgs = (alias) => [`--account=${alias}`, `--context-root=${contextRoot}`, `--log=${logFile}`];

const modes = {
  'resources-file': (alias) => ({
    command: binary,
    args: [join(resources, 'mcp', 'agenthub-mcp-stub.cjs'), ...serverArgs(alias)],
    env: { ...minimalEnv, ELECTRON_RUN_AS_NODE: '1' },
  }),
  'inside-asar': (alias) => ({
    command: binary,
    args: [join(resources, 'app.asar', 'mcp', 'agenthub-mcp-stub.cjs'), ...serverArgs(alias)],
    env: { ...minimalEnv, ELECTRON_RUN_AS_NODE: '1' },
  }),
  shim: (alias) => ({ command: shim, args: serverArgs(alias), env: { ...minimalEnv } }),
};

function startServer(spec) {
  const child = spawn(spec.command, spec.args, { env: spec.env, cwd: '/', stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  const badLines = [];
  let nextId = 1;
  let buffer = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        badLines.push(line.slice(0, 200));
        continue;
      }
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const request = (method, params, timeoutMs = 10000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeoutMs);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  return { child, request, notify, exited, badLines, stderr: () => stderr };
}

const callText = (response) => response.result?.content?.[0]?.text;
const isError = (response) => response.result?.isError === true || Boolean(response.error);

function guiRegistered() {
  try {
    return execFileSync('/usr/bin/lsappinfo', ['find', 'bundleid=dev.agenthub.spike10'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function runMode(name, alias) {
  const spec = modes[name](alias);
  const t0 = performance.now();
  const server = startServer(spec);
  const result = { mode: name, alias };
  try {
    const init = await server.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'spike10-harness', version: '0' },
    });
    result.initMs = Math.round(performance.now() - t0);
    result.protocolVersion = init.result?.protocolVersion;
    result.hasInstructions = Boolean(init.result?.instructions);
    server.notify('notifications/initialized', {});
    const list = await server.request('tools/list', {});
    result.tools = list.result?.tools?.map((tool) => tool.name);
    const facts = JSON.parse(callText(await server.request('tools/call', { name: 'spike_facts', arguments: {} })));
    result.facts = {
      account: facts.account,
      electron: facts.versions.electron,
      node: facts.versions.node,
      scriptInAsar: facts.scriptInAsar,
      runAsNode: facts.runAsNode,
      envNames: facts.envNames,
      parent: facts.parent,
      sqlite: facts.sqlite,
    };
    result.projects = JSON.parse(callText(await server.request('tools/call', { name: 'context_projects', arguments: {} })));
    const read = await server.request('tools/call', { name: 'context_read', arguments: { path: 'demo/STATUS.md' } });
    result.readInside = !isError(read) && callText(read).includes('SPIKE-10 fixture');
    result.rejected = {};
    for (const probe of ['../outside/secret.txt', '/etc/hosts', 'demo/link-out.md']) {
      const response = await server.request('tools/call', { name: 'context_read', arguments: { path: probe } });
      result.rejected[probe] = isError(response) && !String(callText(response)).includes('outside the context root\n');
    }
    result.guiRegisteredWhileRunning = guiRegistered() !== '';
    const rss = execFileSync('/bin/ps', ['-o', 'rss=', '-p', String(server.child.pid)], { encoding: 'utf8' }).trim();
    result.rssMb = Math.round(Number(rss) / 1024);
    const closedAt = performance.now();
    server.child.stdin.end();
    const exit = await Promise.race([server.exited, new Promise((resolve) => setTimeout(() => resolve('still running'), 3000))]);
    result.exitAfterStdinClose = exit === 'still running' ? exit : { ...exit, ms: Math.round(performance.now() - closedAt) };
  } catch (error) {
    result.error = String(error.message);
    server.child.kill('SIGKILL');
  }
  result.nonJsonStdoutLines = server.badLines;
  result.stderrLines = server.stderr().trim().split('\n').filter(Boolean).length;
  return result;
}

// A client that dies without closing the pipe cleanly: the server must not be orphaned.
async function orphanCheck() {
  const spec = modes['inside-asar']('orphan');
  const clientCode = `
    const { spawn } = require('node:child_process');
    const spec = ${JSON.stringify(spec)};
    const child = spawn(spec.command, spec.args, { env: spec.env, stdio: ['pipe', 'pipe', 'ignore'] });
    child.stdout.once('data', () => {});
    process.stdout.write(String(child.pid) + '\\n');
    setInterval(() => {}, 1000);
  `;
  const client = spawn(process.execPath, ['-e', clientCode], { stdio: ['ignore', 'pipe', 'inherit'] });
  const serverPid = await new Promise((resolve) => client.stdout.once('data', (data) => resolve(Number(String(data).trim()))));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  client.kill('SIGKILL');
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let waited = 0; waited < 3000; waited += 100) {
    if (!alive(serverPid)) return { serverExitedAfterClientKill: true, withinMs: waited };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  process.kill(serverPid, 'SIGKILL');
  return { serverExitedAfterClientKill: false };
}

const report = {
  startedAt: new Date().toISOString(),
  productAppRunning: (() => {
    try {
      return execFileSync('/usr/bin/pgrep', ['-f', 'AgentHub.app/Contents/MacOS/AgentHub'], { encoding: 'utf8' }).trim() !== '';
    } catch {
      return false;
    }
  })(),
  runs: [],
};
for (const mode of Object.keys(modes)) report.runs.push(await runMode(mode, 'A'));
report.parallel = await Promise.all([runMode('inside-asar', 'A'), runMode('inside-asar', 'B')]);
report.orphan = await orphanCheck();

mkdirSync(join(local, 'runs'), { recursive: true });
const out = join(local, 'runs', `${report.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error(`Report: ${out}`);
