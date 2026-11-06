import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TABLES } from '@agenthub/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { probeMcpServer, readLogTail } from '../src/main/mcp-probe';
import { TOOLS } from '../src/mcp/server';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-probe-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// A stand-in server: a script that answers line by line the way AgentHub's server does.
function fakeServer(body: string): string {
  const path = join(root, 'server.mjs');
  writeFileSync(path, `#!/usr/bin/env node\n${body}`);
  chmodSync(path, 0o700);
  return path;
}

const answering = `
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin });
const say = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
lines.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') say({ id: message.id, result: { protocolVersion: message.params.protocolVersion, serverInfo: { name: 'agenthub', version: '9.9' } } });
  if (message.method === 'tools/list') say({ id: message.id, result: { tools: [{ name: 'context_projects' }, { name: 'context_read' }] } });
  if (message.method === 'tools/call') say({ id: message.id, result: { content: [{ type: 'text', text: JSON.stringify([{ id: 'p1', name: 'Game' }, { id: 'p2', name: 'Tools' }]) }] } });
});
`;

describe('MCP connection check', () => {
  it('asks the server what a client would and reports what it answered', async () => {
    const result = await probeMcpServer(process.execPath, [fakeServer(answering)]);
    expect(result).toMatchObject({ ok: true, serverVersion: '9.9', protocolVersion: '2025-06-18', tools: ['context_projects', 'context_read'], projects: ['Game', 'Tools'], error: null });
  });

  it('reports a server that cannot start, stops early or never answers', async () => {
    expect((await probeMcpServer(join(root, 'missing'), [])).error?.key).toBe('mcp.probe.startFailed');
    expect((await probeMcpServer(process.execPath, [fakeServer("process.stderr.write('boom\\n'); process.exit(3);")])).error).toMatchObject({
      key: 'mcp.probe.exited',
      params: { code: '3', output: 'boom' },
    });
    const silent = await probeMcpServer(process.execPath, [fakeServer('setInterval(() => {}, 1000);')], 300);
    expect(silent).toMatchObject({ ok: false, error: { key: 'mcp.probe.timeout' } });
  });

  it('reads only the end of a long log, without a cut first line', () => {
    expect(readLogTail(join(root, 'none.log'))).toEqual({ exists: false, lines: [] });
    const path = join(root, 'mcp.log');
    writeFileSync(path, Array.from({ length: 5000 }, (_, index) => `line ${index}`).join('\n') + '\n');
    const tail = readLogTail(path, 200, 1000);
    expect(tail.lines.at(-1)).toBe('line 4999');
    expect(tail.lines.every((line) => /^line \d+$/.test(line))).toBe(true);
    expect(readLogTail(path, 3).lines).toEqual(['line 4997', 'line 4998', 'line 4999']);
  });

  it('has a description in the interface for every tool the server offers', () => {
    for (const tool of TOOLS) expect(Object.keys(TABLES.vi)).toContain(`mcpTool.${tool.name}`);
  });
});
