#!/usr/bin/env node
// SPIKE-10: throwaway MCP server stub. Runs under the AgentHub.app binary with
// ELECTRON_RUN_AS_NODE=1, speaks MCP over stdio (one JSON-RPC message per line),
// and uses only Node built-ins plus the app's own better-sqlite3.
// Not product code: the product server will live in a package after review.
// Usage: AgentHub ... agenthub-mcp-stub.cjs --account=<alias> --context-root=<dir> [--log=<file>]
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const startedAt = Date.now();
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    return match ? [match[1], match[2]] : [arg, ''];
  }),
);
const account = args.account || '';
const contextRoot = args['context-root'] ? path.resolve(args['context-root']) : '';
const logFile = args.log || '';

const SUPPORTED_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];

function log(message) {
  const line = `${new Date().toISOString()} [pid ${process.pid}] ${message}\n`;
  process.stderr.write(line);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line);
    } catch {
      // Logging must never break the protocol.
    }
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function parentCommand() {
  try {
    return execFileSync('/bin/ps', ['-o', 'comm=', '-p', String(process.ppid)], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Ancestry up to the first process that is not a shell, to see what started us.
function ancestry() {
  const chain = [];
  let pid = process.ppid;
  for (let depth = 0; depth < 5 && pid > 1; depth += 1) {
    try {
      const [ppid, ...comm] = execFileSync('/bin/ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/);
      chain.push(path.basename(comm.join(' ')));
      pid = Number(ppid);
    } catch {
      break;
    }
  }
  return chain;
}

// Which Claude Desktop instance (if any) started us: the --user-data-dir of the
// nearest Claude.app ancestor, or "default" when it has none.
function desktopInstance() {
  let pid = process.ppid;
  for (let depth = 0; depth < 8 && pid > 1; depth += 1) {
    try {
      const line = execFileSync('/bin/ps', ['-o', 'ppid=,args=', '-p', String(pid)], { encoding: 'utf8' }).trim();
      const [ppid] = line.split(/\s+/, 1);
      // Only the Claude.app main process counts: helpers such as `disclaimer` sit in between
      // and have no --user-data-dir, and a shell that merely mentions the path does not count.
      if (/^\d+\s+\/\S*Claude\.app\/Contents\/MacOS\/Claude(\s|$)/.test(line)) {
        const match = /--user-data-dir=(\S+)/.exec(line);
        return match ? path.basename(match[1]) : 'default';
      }
      pid = Number(ppid);
    } catch {
      break;
    }
  }
  return 'none';
}

// Can this process write outside the agent's workspace? The context root is outside it.
function writeProbe() {
  if (!contextRoot) return 'no context root';
  const probe = path.join(contextRoot, `.write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, 'probe');
    fs.unlinkSync(probe);
    return 'ok';
  } catch (error) {
    return String(error.code || error.message);
  }
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function sqliteProbe() {
  const resources = path.resolve(path.dirname(process.execPath), '..', 'Resources');
  const candidates = ['better-sqlite3', path.join(resources, 'app.asar', 'node_modules', 'better-sqlite3')];
  for (const candidate of candidates) {
    try {
      const Database = require(candidate);
      const db = new Database(':memory:');
      const version = db.prepare('select sqlite_version() as v').get().v;
      db.close();
      return { ok: true, from: candidate === 'better-sqlite3' ? 'module resolution' : 'app.asar of the app', sqlite: version };
    } catch (error) {
      if (candidate === candidates[candidates.length - 1]) {
        return { ok: false, error: String(error && error.message ? error.message : error).split('\n')[0] };
      }
    }
  }
  return { ok: false, error: 'no candidate' };
}

function facts() {
  return {
    account,
    execPath: process.execPath,
    script: __filename,
    scriptInAsar: __filename.includes('.asar'),
    versions: { node: process.versions.node, electron: process.versions.electron || null, modules: process.versions.modules },
    runAsNode: process.env.ELECTRON_RUN_AS_NODE || null,
    envNames: Object.keys(process.env).sort(),
    cwd: process.cwd(),
    parent: parentCommand(),
    ancestry: ancestry(),
    writeOutsideWorkspace: writeProbe(),
    sandboxEnv: process.env.CODEX_SANDBOX || null,
    desktopInstance: desktopInstance(),
    contextRoot,
    sqlite: sqliteProbe(),
    uptimeMs: Date.now() - startedAt,
  };
}

// The only file access goes through here: a relative path inside the context root.
function resolveInsideRoot(relative) {
  if (!contextRoot) throw new Error('No context root configured');
  if (typeof relative === 'string' && relative.split(/[\\/]/).includes('..')) throw new Error('Path is outside the context root');
  if (typeof relative !== 'string' || relative === '' || path.isAbsolute(relative)) {
    throw new Error('Path must be relative to the context root');
  }
  const target = path.resolve(contextRoot, relative);
  // A file that does not exist yet is checked through its parent directory.
  const real = fs.existsSync(target) ? fs.realpathSync(target) : path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
  const realRoot = fs.realpathSync(contextRoot);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new Error('Path is outside the context root');
  }
  return real;
}

const tools = [
  {
    name: 'context_projects',
    description: 'List AgentHub projects that have context documents for this account.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'context_read',
    description: 'Read one context document by its path relative to the project context root.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative path, for example demo/STATUS.md' } },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'context_write',
    description: 'Write a whole context document. Pass the sha256 returned by context_read for an existing file; it is refused if the file changed since.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path, for example demo/STATUS.md' },
        content: { type: 'string' },
        base_sha256: { type: 'string', description: 'sha256 of the version you read; omit for a new file' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'spike_facts',
    description: 'Spike only: report how this server process was started.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function callTool(name, input) {
  switch (name) {
    case 'context_projects': {
      if (!contextRoot) return text([]);
      const entries = fs.readdirSync(contextRoot, { withFileTypes: true });
      return text(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort());
    }
    case 'context_read': {
      const content = fs.readFileSync(resolveInsideRoot(input && input.path), 'utf8');
      return { content: [{ type: 'text', text: content }, { type: 'text', text: `sha256: ${sha256(content)}` }] };
    }
    case 'context_write': {
      const target = resolveInsideRoot(input && input.path);
      const exists = fs.existsSync(target);
      if (exists && sha256(fs.readFileSync(target, 'utf8')) !== (input.base_sha256 || '')) {
        throw new Error('Conflict: the file changed since it was read, or base_sha256 is missing');
      }
      const temp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(temp, String(input.content));
      fs.renameSync(temp, target);
      log(`context_write ${input.path}`);
      return text(`written, sha256: ${sha256(String(input.content))}`);
    }
    case 'spike_facts':
      return text(facts());
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  try {
    switch (method) {
      case 'initialize': {
        const requested = params && params.protocolVersion;
        const protocolVersion = SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[SUPPORTED_VERSIONS.length - 1];
        log(`initialize from ${JSON.stringify(params && params.clientInfo)} requested ${requested}, answered ${protocolVersion}`);
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'agenthub-spike10', version: '0.0.0' },
            instructions: 'AgentHub context documents. Read STATUS.md of the project first.',
          },
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return undefined;
      case 'ping':
        return send({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list':
        return send({ jsonrpc: '2.0', id, result: { tools } });
      case 'tools/call': {
        log(`tools/call ${params && params.name}`);
        try {
          return send({ jsonrpc: '2.0', id, result: callTool(params && params.name, params && params.arguments) });
        } catch (error) {
          if (error.code === -32602) throw error;
          return send({ jsonrpc: '2.0', id, result: { ...text(String(error.message)), isError: true } });
        }
      }
      default:
        if (isRequest) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
        return undefined;
    }
  } catch (error) {
    if (isRequest) send({ jsonrpc: '2.0', id, error: { code: error.code || -32603, message: String(error.message) } });
    return undefined;
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    handle(message);
  }
});
process.stdin.on('end', () => {
  log('stdin closed, exiting');
  process.exit(0);
});

log(`started account=${account || 'unset'} desktopInstance=${desktopInstance()} ancestry=${ancestry().join('<')} electron=${process.versions.electron || 'none'} runAsNode=${process.env.ELECTRON_RUN_AS_NODE || 'unset'} parent=${parentCommand()}`);
