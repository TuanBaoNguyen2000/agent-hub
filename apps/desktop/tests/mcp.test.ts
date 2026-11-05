import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MetadataStore, type Workspace, createWorkspace } from '@agenthub/application';
import { appendHandoff, conflictingFiles, contextFiles, copyContextFiles, detectContext, contextProjectsFor, defaultContextFolder, openMetadataStore, readContextOverview, listNotes, moveNote, readNote, saveNote, listContext, readContext, writeContext } from '@agenthub/persistence';
import { createGitObserver, createMacPlatform, createPathInspector } from '@agenthub/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSTRUCTIONS, createServer } from '../src/mcp/server';

const documentPorts = {
  overview: readContextOverview,
  detect: (path: string) => detectContext(path),
  files: contextFiles,
  conflicts: conflictingFiles,
  copy: copyContextFiles,
  list: (folder: string) => listContext(folder),
  read: readContext,
  write: writeContext,
};

// The server against a real AgentHub database and real folders, as an agent's client would use it.
let root: string;
let store: MetadataStore;
let workspace: Workspace;
const accountA = randomUUID();
const accountB = randomUUID();
const logs: string[] = [];

function serverFor(account: string) {
  return createServer({
    projects: () => contextProjectsFor(root, account),
    looseChats: join(root, 'loose-chats'),
    now: () => new Date('2026-11-05T08:00:00.000Z'),
    version: 'test',
    log: (line) => logs.push(line),
  });
}

type Reply = { result?: { content?: { text: string }[]; isError?: boolean; tools?: { name: string }[]; protocolVersion?: string; instructions?: string }; error?: { code: number } };

function call(server: ReturnType<typeof serverFor>, name: string, args: Record<string, unknown> = {}): Reply {
  return server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as Reply;
}
const textOf = (reply: Reply): string => reply.result?.content?.map((item) => item.text).join('\n') ?? '';

function addProject(name: string, contextEnabled: boolean) {
  const path = join(root, name);
  mkdirSync(path);
  const project = workspace.addProject({ path });
  return contextEnabled ? workspace.updateProjectContext({ id: project.id, enabled: true }) : project;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-mcp-'));
  store = openMetadataStore(join(root, 'agenthub.sqlite'));
  workspace = createWorkspace({
    store,
    paths: createPathInspector(),
    defaultContextDirectory: (projectId) => defaultContextFolder(root, projectId),
    ensureDirectory: (path) => mkdirSync(path, { recursive: true }),
    trash: async () => undefined,
    documents: { ...documentPorts, appendHandoff: (folder, ref, entry) => void appendHandoff(folder, ref, entry) },
    git: createGitObserver(createMacPlatform()),
    notes: { list: (folder) => listNotes(folder), read: readNote, save: saveNote, move: moveNote },
    handoffDirectory: (projectId) => join(root, 'projects', projectId, 'handoffs'),
    looseChatDirectory: join(root, 'loose-chats'),
    newId: randomUUID,
    now: () => new Date().toISOString(),
  });
  for (const [id, alias] of [
    [accountA, 'A'],
    [accountB, 'B'],
  ] as const) {
    store.profiles.insert({ id, provider: 'claude', alias, accountEmail: null, cliConfigRoot: join(root, alias), desktopDataDir: null, createdAt: '2026-11-05' });
  }
  logs.length = 0;
});

afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});

describe('MCP protocol', () => {
  it('answers the protocol version each client asks for, with the pointer as instructions', () => {
    const server = serverFor(accountA);
    for (const version of ['2025-06-18', '2025-11-25']) {
      const reply = server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version } }) as Reply;
      expect(reply.result?.protocolVersion).toBe(version);
      expect(reply.result?.instructions).toBe(INSTRUCTIONS);
    }
    const unknown = server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }) as Reply;
    expect(unknown.result?.protocolVersion).toBe('2025-11-25');
  });

  it('lists its tools, marking only the readers read-only', () => {
    const reply = serverFor(accountA).handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    expect(reply.result.tools.map((tool) => [tool.name, tool.annotations.readOnlyHint])).toEqual([
      ['context_projects', true],
      ['context_read', true],
      ['context_write', false],
      ['context_append_handoff', false],
      ['context_save_handoff', false],
      ['context_handoffs', true],
      ['context_capture', false],
      ['context_loose_chats', true],
    ]);
  });

  it('answers bad input with JSON-RPC errors and stays silent on notifications', () => {
    const server = serverFor(accountA);
    expect(server.handleLine('not json')).toMatchObject({ error: { code: -32700 } });
    expect(server.handleLine('[1]')).toMatchObject({ error: { code: -32600 } });
    expect(server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).toMatchObject({ error: { code: -32601 } });
    expect(call(server, 'rm_rf')).toMatchObject({ error: { code: -32602 } });
    expect(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });
});

describe('context tools', () => {
  it('shows an account only the projects it may use, saying which have documents (FR-016)', () => {
    const shared = addProject('Game', true);
    const onlyB = addProject('Khác', true);
    const noDocs = addProject('Không tài liệu', false);
    for (const project of [shared, onlyB, noDocs]) store.permissions.set(project.id, accountB, true);
    store.permissions.set(shared.id, accountA, true);
    store.permissions.set(onlyB.id, accountA, false);

    expect(JSON.parse(textOf(call(serverFor(accountA), 'context_projects')))).toEqual([{ id: shared.id, name: 'Game', documents: true, language: 'en' }]);
    expect(JSON.parse(textOf(call(serverFor(accountB), 'context_projects'))).map((item: { name: string; documents: boolean }) => [item.name, item.documents])).toEqual([
      ['Game', true],
      ['Khác', true],
      ['Không tài liệu', false],
    ]);

    const refused = call(serverFor(accountA), 'context_read', { project: onlyB.id, path: '' });
    expect(refused.result?.isError).toBe(true);
    expect(textOf(refused)).toContain('context_projects');
  });

  it('applies a permission change at once, without restarting the server', () => {
    const project = addProject('Game', true);
    const server = serverFor(accountA);
    expect(textOf(call(server, 'context_projects'))).toContain('No project');

    store.permissions.set(project.id, accountA, true);

    expect(textOf(call(server, 'context_projects'))).toContain('Game');
  });

  it('reads, lists, writes with the checksum and adds handoffs, by project name or id', () => {
    const project = addProject('Game', true);
    store.permissions.set(project.id, accountA, true);
    const server = serverFor(accountA);
    expect(textOf(call(server, 'context_read', { project: 'game', path: '' }))).toContain('context-init');

    expect(textOf(call(server, 'context_write', { project: 'Game', path: 'Workstreams/combo/STATUS.md', content: '# Status\n' }))).toContain('Written');
    const read = textOf(call(server, 'context_read', { project: project.id, path: 'Workstreams/combo/STATUS.md' }));
    const checksum = /sha256: (\w+)/.exec(read)?.[1];
    expect(read).toContain('# Status');

    const stale = call(server, 'context_write', { project: 'Game', path: 'Workstreams/combo/STATUS.md', content: 'x' });
    expect(stale.result?.isError).toBe(true);
    call(server, 'context_write', { project: 'Game', path: 'Workstreams/combo/STATUS.md', content: '# Status 2\n', base_sha256: checksum });

    call(server, 'context_append_handoff', { project: 'Game', path: 'Workstreams/combo/Tasks/TASK-001.md', entry: '### 2026-11-05 — A\n- Done: x' });
    const folder = project.context.path;
    expect(readFileSync(join(folder, 'Workstreams/combo/Tasks/TASK-001.md'), 'utf8')).toContain('## Handoff log\n\n### 2026-11-05 — A');
    expect(textOf(call(server, 'context_read', { project: 'Game', path: '' })).split('\n')).toContain('Workstreams/combo/STATUS.md');
    expect(logs.some((line) => line.includes('context_write'))).toBe(true);
  });

  it('keeps every path inside the project\'s documents', () => {
    const project = addProject('Game', true);
    store.permissions.set(project.id, accountA, true);
    writeFileSync(join(root, 'secret.md'), 'secret');
    const server = serverFor(accountA);

    for (const path of ['../../secret.md', join(root, 'secret.md'), '../../agenthub.sqlite']) {
      const reply = call(server, 'context_read', { project: 'Game', path });
      expect(reply.result?.isError).toBe(true);
      expect(textOf(reply)).not.toContain('secret');
    }
    expect(call(server, 'context_write', { project: 'Game', path: 'x.sh', content: 'rm' }).result?.isError).toBe(true);
  });

  it('asks the user to open AgentHub when its data is older than the server', () => {
    const old = mkdtempSync(join(tmpdir(), 'agenthub-mcp-old-'));
    try {
      expect(() => contextProjectsFor(old, accountA)).toThrow(/Open AgentHub/);
    } finally {
      rmSync(old, { recursive: true, force: true });
    }
  });

  it('saves and reads handoffs of a project without documents, and points each kind of project to its own tools', () => {
    const plain = addProject('Không tài liệu', false);
    const documented = addProject('Game', true);
    for (const project of [plain, documented]) store.permissions.set(project.id, accountA, true);
    const server = serverFor(accountA);
    server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'codex-mcp-client', version: '0.166.0' } } });

    expect(textOf(call(server, 'context_handoffs', { project: plain.id }))).toContain('No handoff');
    expect(textOf(call(server, 'context_save_handoff', { project: 'Không tài liệu', summary: '- **Done:** x' }))).toContain('Handoff saved');
    const list = JSON.parse(textOf(call(server, 'context_handoffs', { project: plain.id }))) as { id: string; source: string; title: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]?.source).toBe('codex-mcp-client 0.166.0');
    expect(list[0]?.title).toBe('Handoff 2026-11-05 08:00');
    expect(textOf(call(server, 'context_handoffs', { project: plain.id, id: 'latest' }))).toContain('- **Done:** x');

    expect(textOf(call(server, 'context_read', { project: plain.id, path: '' }))).toContain('no context documents');
    expect(textOf(call(server, 'context_save_handoff', { project: documented.id, summary: 'x' }))).toContain('context_append_handoff');
    expect(textOf(call(server, 'context_handoffs', { project: plain.id, id: '../../agenthub' }))).toContain('Invalid note id');
  });

  it('keeps loose chats that any account can read back', () => {
    const saved = textOf(call(serverFor(accountA), 'context_capture', { title: 'Ý tưởng combo', content: 'Ghi chú' }));
    const id = /loose chat (\S+)\./.exec(saved)?.[1] ?? '';

    const listed = JSON.parse(textOf(call(serverFor(accountB), 'context_loose_chats'))) as { id: string; title: string }[];
    expect(listed.map((note) => [note.id, note.title])).toEqual([[id, 'Ý tưởng combo']]);
    expect(textOf(call(serverFor(accountB), 'context_loose_chats', { id }))).toContain('Ghi chú');
    expect(call(serverFor(accountA), 'context_capture', { title: ' ', content: 'x' }).result?.isError).toBe(true);
  });
});
