import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextProjectsFor, looseChatFolder } from '@agenthub/persistence';
import { createServer } from './server';

// Entry of the MCP server, started by an agent's client through the shim AgentHub writes:
//   ELECTRON_RUN_AS_NODE=1 <AgentHub binary> <app>/out/main/mcp.js --account=<id> --data=<userData>
// stdout carries only protocol messages; logs go to stderr and, if given, a file.

const args = new Map(
  process.argv.slice(2).flatMap((arg) => {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    return match?.[1] !== undefined && match[2] !== undefined ? [[match[1], match[2]] as const] : [];
  }),
);
const account = args.get('account') ?? '';
const dataDirectory = args.get('data') ?? '';
const logFile = args.get('log') ?? '';

function log(message: string): void {
  const line = `${new Date().toISOString()} [agenthub-mcp ${process.pid}] ${message}\n`;
  process.stderr.write(line);
  if (logFile) {
    try {
      appendFileSync(logFile, line);
    } catch {
      // A log that cannot be written must never break the protocol.
    }
  }
}

const server = createServer({
  projects: () => (account && dataDirectory ? contextProjectsFor(dataDirectory, account) : []),
  looseChats: looseChatFolder(dataDirectory || '/nonexistent'),
  locks: join(dataDirectory || '/nonexistent', 'locks'),
  now: () => new Date(),
  version: process.env['AGENTHUB_VERSION'] ?? '0.0.0',
  log,
});

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let newline = buffer.indexOf('\n');
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      const reply = server.handleLine(line);
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    }
    newline = buffer.indexOf('\n');
  }
});
process.stdin.on('end', () => process.exit(0));

log(`started for account ${account || 'unset'}`);
