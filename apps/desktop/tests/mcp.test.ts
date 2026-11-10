import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type MetadataStore, type Workspace, createWorkspace } from '@agenthub/application';
import {
  accountSkillsLocation,
  appendHandoff,
  conflictingFiles,
  contextFiles,
  contextProjectsFor,
  copyContextFiles,
  defaultContextFolder,
  deleteContextTask,
  deleteContextWorkstream,
  detectContext,
  isContextFolder,
  listContext,
  listNotes,
  makeContextFolder,
  moveNote,
  openMetadataStore,
  readContext,
  readContextOverview,
  readNote,
  saveNote,
  writeContext,
  createContextTask,
  renumberContextTask,
  skillPresence,
  syncStatusTable,
} from '@agenthub/persistence';
import { createGitObserver, createMacPlatform, createPathInspector, createSkillInstaller, readSkillManifest } from '@agenthub/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSTRUCTIONS, createServer } from '../src/mcp/server';

const testLocks = join(tmpdir(), 'agenthub-test-locks');

const documentPorts = {
  overview: readContextOverview,
  detect: (path: string) => detectContext(path),
  files: contextFiles,
  conflicts: conflictingFiles,
  copy: copyContextFiles,
  list: (folder: string) => listContext(folder),
  read: readContext,
  write: writeContext,
  makeFolder: makeContextFolder,
  isContextFolder,
  // ADR-027: tasks numbered under a lock, kept out of the documents.
  createTask: (folder: string, input: Parameters<typeof createContextTask>[2]) => createContextTask(folder, testLocks, input),
  renumberTask: (folder: string, ref: string, language: Parameters<typeof renumberContextTask>[3]) => renumberContextTask(folder, testLocks, ref, language),
  syncStatus: syncStatusTable,
  deleteTask: (folder: string, ref: string, language: Parameters<typeof deleteContextTask>[3], at: Date) => deleteContextTask(folder, testLocks, ref, language, at),
  deleteWorkstream: (folder: string, slug: string, language: Parameters<typeof deleteContextWorkstream>[3], at: Date) => deleteContextWorkstream(folder, testLocks, slug, language, at),
};

// The server against a real AgentHub database and real folders, as an agent's client would use it.
let root: string;
let store: MetadataStore;
let workspace: Workspace;
const accountA = randomUUID();
const accountB = randomUUID();
const logs: string[] = [];

function serverFor(account: string, options: { cwd?: string } = {}) {
  return createServer({
    projects: () => contextProjectsFor(root, account),
    looseChats: join(root, 'loose-chats'),
    locks: join(root, 'locks'),
    accountSkills: () => accountSkillsLocation(root, account, join(root, 'home')),
    cwd: () => options.cwd ?? '/',
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
      ['context_here', true],
      ['context_task', true],
      ['context_read', true],
      ['context_write', false],
      ['context_create_task', false],
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

    expect(JSON.parse(textOf(call(serverFor(accountA), 'context_projects')))).toEqual([{ id: shared.id, name: 'Game', documents: true, language: 'en', root: join(root, 'Game') }]);
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

  it('creates tasks with the next number and their STATUS row (ADR-027)', () => {
    const project = addProject('Game', true);
    store.permissions.set(project.id, accountA, true);
    store.permissions.set(project.id, accountB, true);
    const folder = project.context.path;
    mkdirSync(join(folder, 'Workstreams', 'main', 'Tasks'), { recursive: true });
    writeFileSync(join(folder, 'Workstreams', 'main', 'STATUS.md'), '# Main\n');

    const first = textOf(call(serverFor(accountA), 'context_create_task', { project: 'Game', workstream: 'Workstreams/main', title: 'Combo', goal: 'Count hits.' }));
    const second = textOf(call(serverFor(accountB), 'context_create_task', { project: 'Game', workstream: 'Workstreams/main', title: 'Menu', body: '## Goal\n\nOpen it.\n' }));

    expect(first).toMatch(/^Created TASK-001 at Workstreams\/main\/Tasks\/TASK-001-combo\.md\. sha256: \w+$/);
    expect(second).toContain('Created TASK-002 at Workstreams/main/Tasks/TASK-002-menu.md');
    expect(readFileSync(join(folder, 'Workstreams', 'main', 'STATUS.md'), 'utf8')).toContain('| TASK-001 Combo | To do |\n| TASK-002 Menu | To do |');
    expect(readFileSync(join(folder, 'Workstreams', 'main', 'Tasks', 'TASK-002-menu.md'), 'utf8')).toContain('## Goal\n\nOpen it.\n\n## Handoff log');
    const missing = call(serverFor(accountA), 'context_create_task', { project: 'Game', workstream: 'Workstreams/none', title: 'X' });
    expect(missing.result?.isError).toBe(true);
    expect(textOf(missing)).toContain('Workstreams/main');
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

// ADR-028: one call tells an agent where it is; another finds a task from a short sentence.
function writeDoc(folder: string, path: string, text: string): void {
  mkdirSync(dirname(join(folder, path)), { recursive: true });
  writeFileSync(join(folder, path), text);
}

const taskText = (id: string, title: string, state: string): string =>
  `# ${id} ${title}\n\nStatus: ${state}\n\n## Goal\n\nGoal of ${title}.\n\n## Acceptance criteria\n\n- [x] First\n- [ ] Second\n\n` +
  `## Handoff log\n\n### 2026-11-09 17:40+0700 — A / claude\n- **Done:** newest\n\n### 2026-11-08 10:00+0700 — B / codex\n- **Done:** older\n`;

function gameWithDocuments() {
  const project = addProject('Game', true);
  store.permissions.set(project.id, accountA, true);
  const folder = project.context.path;
  writeDoc(folder, 'README.md', '# Context\n');
  writeDoc(folder, 'PROJECT_CONTEXT.md', '# Project\n\nNotes.\n');
  writeDoc(folder, 'Workstreams/combo/STATUS.md', '# Combo\n\nBranch: `VN/combo`\n\n| Task | State |\n|---|---|\n| TASK-004 Combo hits | To do |\n| TASK-005 Trạng thái màn chơi | In review |\n');
  writeDoc(folder, 'Workstreams/combo/Tasks/TASK-004-combo-hits.md', taskText('TASK-004', 'Combo hits', 'In progress'));
  writeDoc(folder, 'Workstreams/combo/Tasks/TASK-005-trang-thai.md', taskText('TASK-005', 'Trạng thái màn chơi', 'In review'));
  writeDoc(folder, 'Workstreams/shop/STATUS.md', '# Shop\n');
  writeDoc(folder, 'Workstreams/shop/Tasks/TASK-004-shop-menu.md', taskText('TASK-004', 'Shop menu', 'Blocked'));
  writeDoc(folder, 'Workstreams/shop/Tasks/TASK-006-old.md', taskText('TASK-006', 'Old', 'Done'));
  writeDoc(folder, 'Inbox/20261105T000000000Z-abcdef.md', '# Idea\n');
  writeDoc(folder, 'Inbox/archive/20261104T000000000Z-abcdef.md', '# Used\n');
  return { project, folder };
}

type Json = Record<string, unknown>;
const hereOf = (server: ReturnType<typeof serverFor>, cwd?: string): Json => JSON.parse(textOf(call(server, 'context_here', cwd === undefined ? {} : { cwd }))) as Json;

describe('context_here', () => {
  it('finds the project from a subfolder and summarises tasks, warnings and Inbox', () => {
    const { project } = gameWithDocuments();
    const deep = join(root, 'Game', 'src', 'deep');
    mkdirSync(deep, { recursive: true });

    const here = hereOf(serverFor(accountA), deep);

    expect(here['project']).toEqual({ id: project.id, name: 'Game', language: 'en', root: join(root, 'Game'), documents: true, folder: project.context.path });
    expect(here['matched']).toBe('root');
    expect(here['standardLayout']).toBe(true);
    expect(here['workstreams']).toEqual([
      { path: 'Workstreams/combo', title: 'Combo', branch: 'VN/combo', tasks: { todo: 0, inProgress: 1, review: 1, blocked: 0, done: 0 } },
      { path: 'Workstreams/shop', title: 'Shop', branch: null, tasks: { todo: 0, inProgress: 0, review: 0, blocked: 1, done: 1 } },
    ]);
    expect(here['tasks']).toEqual([
      { id: 'TASK-004', title: 'TASK-004 Combo hits', path: 'Workstreams/combo/Tasks/TASK-004-combo-hits.md', state: 'In progress', lastHandoff: '2026-11-09 17:40+0700 — A / claude' },
      { id: 'TASK-005', title: 'TASK-005 Trạng thái màn chơi', path: 'Workstreams/combo/Tasks/TASK-005-trang-thai.md', state: 'In review' },
      { id: 'TASK-004', title: 'TASK-004 Shop menu', path: 'Workstreams/shop/Tasks/TASK-004-shop-menu.md', state: 'Blocked' },
    ]);
    expect(here['inbox']).toBe(1);
    expect(here['issues']).toEqual(
      expect.arrayContaining([
        { kind: 'state_mismatch', task: 'TASK-004', path: 'Workstreams/combo/Tasks/TASK-004-combo-hits.md', taskFile: 'In progress', statusTable: 'To do' },
        { kind: 'duplicate_task_id', task: 'TASK-004', path: 'Workstreams/combo/Tasks/TASK-004-combo-hits.md', other: 'Workstreams/shop/Tasks/TASK-004-shop-menu.md' },
        { kind: 'duplicate_task_id', task: 'TASK-004', path: 'Workstreams/shop/Tasks/TASK-004-shop-menu.md', other: 'Workstreams/combo/Tasks/TASK-004-combo-hits.md' },
      ]),
    );
    expect(here['skills']).toBe('unknown');
    expect((here['next'] as string[]).join(' ')).toContain('git branch --show-current');
  });

  it('matches the context folder too, and uses the server folder when no cwd is given', () => {
    const { folder } = gameWithDocuments();
    expect(hereOf(serverFor(accountA), join(folder, 'Workstreams'))['matched']).toBe('folder');
    expect((hereOf(serverFor(accountA, { cwd: join(root, 'Game') }))['project'] as Json)['name']).toBe('Game');
    const relative = call(serverFor(accountA), 'context_here', { cwd: 'Game/src' });
    expect(relative.result?.isError).toBe(true);
  });

  it('picks the longest matching path when projects are nested', () => {
    const outer = addProject('Game', false);
    mkdirSync(join(root, 'Game', 'tools'));
    const inner = workspace.addProject({ path: join(root, 'Game', 'tools'), name: 'Tools' });
    for (const project of [outer, inner]) store.permissions.set(project.id, accountA, true);
    mkdirSync(join(root, 'Game', 'tools', 'bin'));
    mkdirSync(join(root, 'Game', 'src'));

    expect((hereOf(serverFor(accountA), join(root, 'Game', 'tools', 'bin'))['project'] as Json)['name']).toBe('Tools');
    expect((hereOf(serverFor(accountA), join(root, 'Game', 'src'))['project'] as Json)['name']).toBe('Game');
    // A sibling whose name starts the same is not inside.
    mkdirSync(join(root, 'Game2'));
    expect(hereOf(serverFor(accountA), join(root, 'Game2'))['match']).toBeNull();
  });

  it('says when nothing matches, listing the projects this account may use with their folders', () => {
    gameWithDocuments();
    const elsewhere = hereOf(serverFor(accountA), join(root, 'elsewhere'));
    expect(elsewhere['match']).toBeNull();
    expect(String(elsewhere['message'])).toContain('never search the disk');
    expect(elsewhere['projects']).toEqual([expect.objectContaining({ name: 'Game', root: join(root, 'Game'), documents: true })]);

    // Account B may not use Game: inside its folder it still matches nothing.
    const refused = hereOf(serverFor(accountB), join(root, 'Game'));
    expect(refused['match']).toBeNull();
    expect(refused['projects']).toEqual([]);
  });

  it('points a project without documents to its latest handoff', () => {
    const plain = addProject('Plain', false);
    store.permissions.set(plain.id, accountA, true);
    const server = serverFor(accountA);
    expect(hereOf(server, join(root, 'Plain'))['latestHandoff']).toBeNull();
    call(server, 'context_save_handoff', { project: 'Plain', summary: '- **Done:** x' });

    const here = hereOf(server, join(root, 'Plain'));
    expect((here['project'] as Json)['documents']).toBe(false);
    expect(here['latestHandoff']).toMatch(/^20261105T080000000Z-/);
    expect((here['next'] as string[])[0]).toContain('context_handoffs');
  });

  it('lists at most 40 tasks and counts the rest', () => {
    const project = addProject('Big', true);
    store.permissions.set(project.id, accountA, true);
    const folder = project.context.path;
    writeDoc(folder, 'README.md', '# Context\n');
    for (let number = 1; number <= 45; number += 1) {
      const id = `TASK-${String(number).padStart(3, '0')}`;
      writeDoc(folder, `Workstreams/main/Tasks/${id}-t.md`, taskText(id, `Task ${number}`, 'In progress'));
    }
    writeDoc(folder, 'Workstreams/main/STATUS.md', '# Main\n');

    const here = hereOf(serverFor(accountA), join(root, 'Big'));
    expect(here['tasks']).toHaveLength(40);
    expect(here['moreTasks']).toBe(5);
    expect(textOf(call(serverFor(accountA), 'context_here', { cwd: join(root, 'Big') })).length).toBeLessThan(16_000);
  });

  it('reports the AgentHub skills the account lacks or holds under someone else\'s folder', () => {
    gameWithDocuments();
    const shared = join(root, 'skills');
    for (const name of ['context-resume', 'context-checkpoint', 'context-capture', 'my-skill']) writeDoc(shared, `${name}/SKILL.md`, `---\nname: ${name}\n---\n`);
    store.skills.insert({ id: randomUUID(), name: 'my-skill', sourcePath: join(root, 'mine'), addedAt: '2026-11-10' });
    const directory = join(root, 'A', 'skills');
    mkdirSync(directory, { recursive: true });
    symlinkSync(join(shared, 'context-resume'), join(directory, 'context-resume'), 'dir');
    writeDoc(directory, 'context-checkpoint/SKILL.md', 'an old copy');

    const here = hereOf(serverFor(accountA), join(root, 'Game'));
    expect(here['skills']).toEqual({ missing: ['context-capture'], foreign: ['context-checkpoint'] });
    expect((here['next'] as string[]).join(' ')).toContain('AgentHub > Agent tools');

    // The same verdict as the app's skill installer.
    const installer = createSkillInstaller({ source: join(root, 'no-source'), shared });
    const names = ['context-resume', 'context-checkpoint', 'context-capture'];
    expect(Object.fromEntries(names.map((name) => [name, skillPresence(directory, shared, name)]))).toEqual(installer.inspect(directory, names));
  });

  it('computes the skill folder of the main account from home, as the launcher does', () => {
    const main = randomUUID();
    store.profiles.insert({ id: main, provider: 'codex', alias: 'Main', accountEmail: null, cliConfigRoot: null, desktopDataDir: null, createdAt: '2026-11-05' });
    expect(accountSkillsLocation(root, main, '/Users/me')?.directory).toBe('/Users/me/.codex/skills');
    expect(accountSkillsLocation(root, accountA, '/Users/me')?.directory).toBe(join(root, 'A', 'skills'));
    expect(accountSkillsLocation(root, randomUUID(), '/Users/me')).toBeNull();
  });
});

describe('context_task', () => {
  const taskOf = (args: Record<string, unknown>, cwd = join(root, 'Game')): Json | string => {
    const value = textOf(call(serverFor(accountA, { cwd }), 'context_task', args));
    return value.startsWith('{') ? (JSON.parse(value) as Json) : value;
  };

  it('finds a task by any way of writing its number', () => {
    const { folder } = gameWithDocuments();
    for (const task of ['TASK-005', 'task-5', '005', '5', 'Task 005']) {
      expect(taskOf({ task })).toMatchObject({ id: 'TASK-005', path: 'Workstreams/combo/Tasks/TASK-005-trang-thai.md' });
    }
    const found = taskOf({ task: 'TASK-005' }) as Json;
    expect(found).toEqual({
      project: 'Game',
      id: 'TASK-005',
      title: 'TASK-005 Trạng thái màn chơi',
      path: 'Workstreams/combo/Tasks/TASK-005-trang-thai.md',
      workstream: 'Workstreams/combo',
      status: 'In review',
      goal: 'Goal of Trạng thái màn chơi.',
      criteria: ['[x] First', '[ ] Second'],
      newestHandoff: '### 2026-11-09 17:40+0700 — A / claude\n- **Done:** newest',
      sha256: readContext(folder, 'Workstreams/combo/Tasks/TASK-005-trang-thai.md').sha256,
    });
  });

  it('finds a task by words of its title, with or without Vietnamese marks', () => {
    gameWithDocuments();
    for (const task of ['trang thai', 'TRẠNG THÁI màn', 'man choi']) expect(taskOf({ task })).toMatchObject({ id: 'TASK-005' });
    expect(taskOf({ task: 'combo hits' })).toMatchObject({ id: 'TASK-004', statusTable: 'To do', status: 'In progress' });
  });

  it('returns candidates instead of choosing, and says when nothing matches', () => {
    gameWithDocuments();
    const both = taskOf({ task: 'TASK-004' }) as Json;
    expect(both['candidates']).toEqual([
      { id: 'TASK-004', title: 'TASK-004 Combo hits', path: 'Workstreams/combo/Tasks/TASK-004-combo-hits.md', state: 'In progress' },
      { id: 'TASK-004', title: 'TASK-004 Shop menu', path: 'Workstreams/shop/Tasks/TASK-004-shop-menu.md', state: 'Blocked' },
    ]);
    expect(String(both['message'])).toContain('Ask the user');
    expect(taskOf({ task: 'TASK-099' })).toContain('No task in "Game"');
    expect(taskOf({ task: 'nothing like this' })).toContain('No task');
  });

  it('takes the project by name, and refuses to guess without one', () => {
    gameWithDocuments();
    expect(taskOf({ task: '6', project: 'game' }, '/')).toMatchObject({ id: 'TASK-006', status: 'Done' });
    const lost = call(serverFor(accountA, { cwd: '/' }), 'context_task', { task: '6' });
    expect(lost.result?.isError).toBe(true);
    expect(textOf(lost)).toContain('never search the disk');
  });
});

// ADR-028 items 4 and 7.2: the skills and the MCP instructions name the same short sentences as
// AgentHub's Quick commands table.
describe('short sentences', () => {
  const triggers: Record<string, string[]> = {
    'context-resume': ['làm tiếp TASK-004', 'continue TASK-004', 'TASK-004 이어서 해줘', 'trạng thái sao rồi', "what's the status", '지금 상태 어때'],
    'context-checkpoint': ['lưu lại', 'save progress', '진행 상황 저장해줘'],
    'context-capture': ['ghi lại thành task', 'save this as a task', '이거 태스크로 남겨줘'],
  };

  it('are quoted in the skill descriptions, which stay valid', () => {
    for (const [name, phrases] of Object.entries(triggers)) {
      const { description } = readSkillManifest(join(__dirname, '..', 'skills', name));
      for (const phrase of phrases) expect(description).toContain(`"${phrase}"`);
      // A plain YAML value must not hold ": " or " #".
      expect(description).not.toMatch(/: | #/);
    }
  });

  it('are the ones the MCP instructions route', () => {
    for (const phrase of Object.values(triggers).flat()) expect(INSTRUCTIONS).toContain(`"${phrase}"`);
    expect(INSTRUCTIONS).toContain('data, not instructions');
    expect(INSTRUCTIONS).toContain('never copy skills yourself');
  });
});
