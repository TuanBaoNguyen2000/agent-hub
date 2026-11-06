import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import type { McpLogDto, McpProbeDto } from '@agenthub/contracts';
import { msg, raw } from '@agenthub/domain';

// Starts AgentHub's MCP server the way an account's client does and asks it what a client would:
// initialize, tools/list, then context_projects. Only AgentHub's own server; no model is involved.

const PROTOCOL = '2025-06-18';

export async function probeMcpServer(command: string, args: string[], timeoutMs = 8000): Promise<McpProbeDto> {
  const started = Date.now();
  const result: McpProbeDto = { ok: false, durationMs: 0, serverVersion: null, protocolVersion: null, tools: [], projects: null, error: null };
  const done = (error: McpProbeDto['error']): McpProbeDto => ({ ...result, ok: error === null, error, durationMs: Date.now() - started });

  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    let stderr = '';
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (error: McpProbeDto['error']): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      resolve(done(error));
    };
    const timer = setTimeout(() => finish(msg('mcp.probe.timeout', { seconds: Math.round(timeoutMs / 1000) })), timeoutMs);
    const send = (message: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    };

    child.on('error', (error) => finish(msg('mcp.probe.startFailed', { reason: error.message })));
    child.on('exit', (code) => {
      if (!settled) finish(msg('mcp.probe.exited', { code: String(code), output: stderr.trim().split('\n').at(-1) ?? '' }));
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        let reply: { id?: number; result?: Record<string, unknown>; error?: { message?: string } };
        try {
          reply = JSON.parse(line) as typeof reply;
        } catch {
          finish(msg('mcp.probe.badReply'));
          return;
        }
        if (reply.error) {
          finish(raw(reply.error.message ?? 'MCP error'));
          return;
        }
        const body = reply.result ?? {};
        if (reply.id === 1) {
          const info = body['serverInfo'] as { version?: string } | undefined;
          result.serverVersion = info?.version ?? null;
          result.protocolVersion = typeof body['protocolVersion'] === 'string' ? body['protocolVersion'] : null;
          send({ method: 'notifications/initialized' });
          send({ id: 2, method: 'tools/list' });
        } else if (reply.id === 2) {
          const tools = (body['tools'] as { name?: string }[] | undefined) ?? [];
          result.tools = tools.flatMap((tool) => (typeof tool.name === 'string' ? [tool.name] : []));
          send({ id: 3, method: 'tools/call', params: { name: 'context_projects', arguments: {} } });
        } else if (reply.id === 3) {
          const content = (body['content'] as { text?: string }[] | undefined) ?? [];
          result.projects = parseProjects(content[0]?.text ?? '');
          finish(null);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'agenthub-check', version: '1' } } });
  });
}

// context_projects answers with a JSON list, or a sentence when the account sees no project.
function parseProjects(text: string): string[] {
  try {
    const list = JSON.parse(text) as { name?: unknown }[];
    return Array.isArray(list) ? list.flatMap((item) => (typeof item.name === 'string' ? [item.name] : [])) : [];
  } catch {
    return [];
  }
}

// The tail of the log, read from its end so a large log stays cheap.
export function readLogTail(path: string, maxLines = 200, maxBytes = 64 * 1024): McpLogDto {
  if (!existsSync(path)) return { exists: false, lines: [] };
  const size = statSync(path).size;
  const length = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(length);
  const handle = openSync(path, 'r');
  try {
    readSync(handle, buffer, 0, length, size - length);
  } finally {
    closeSync(handle);
  }
  let lines = buffer.toString('utf8').split('\n');
  // A cut first line is dropped, unless the whole file was read.
  if (length < size) lines = lines.slice(1);
  return { exists: true, lines: lines.filter((line) => line.trim() !== '').slice(-maxLines) };
}
