import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MetadataStore, type Workspace, createWorkspace } from '@agenthub/application';
import { DomainError } from '@agenthub/domain';
import { appendHandoff, conflictingFiles, contextFiles, copyContextFiles, detectContext, openMetadataStore, readContextOverview, listNotes, moveNote, readNote, saveNote } from '@agenthub/persistence';
import { createGitObserver, createMacPlatform, createPathInspector } from '@agenthub/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const documentPorts = { overview: readContextOverview, detect: (path: string) => detectContext(path), files: contextFiles, conflicts: conflictingFiles, copy: copyContextFiles };

// Real persistence and platform adapters on temporary folders; only Electron is absent.
let root: string;
let projectDir: string;
let store: MetadataStore;
let workspace: Workspace;
let trashed: string[] = [];

function open(): void {
  store = openMetadataStore(join(root, 'agenthub.sqlite'), { backupDirectory: join(root, 'backups') });
  workspace = createWorkspace({
    store,
    paths: createPathInspector(),
    defaultContextDirectory: (projectId) => join(root, 'projects', projectId, 'context'),
    ensureDirectory: (path) => mkdirSync(path, { recursive: true }),
    trash: async (path) => {
      trashed.push(path);
      renameSync(path, join(root, `trash-${trashed.length}`));
    },
    documents: { ...documentPorts, appendHandoff: (folder, ref, entry) => void appendHandoff(folder, ref, entry) },
    git: createGitObserver(createMacPlatform()),
    notes: { list: (folder) => listNotes(folder), read: readNote, save: saveNote, move: moveNote },
    handoffDirectory: (projectId) => join(root, 'projects', projectId, 'handoffs'),
    looseChatDirectory: join(root, 'loose-chats'),
    newId: randomUUID,
    now: () => new Date().toISOString(),
  });
}

function restart(): void {
  store.close();
  open();
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-workspace-'));
  projectDir = join(root, "Dự án 'nháy' $(touch x)");
  mkdirSync(projectDir);
  trashed = [];
  open();
});

afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Phase 1 exit criteria', () => {
  it('keeps a project and its context settings across a restart, with a Unicode path', () => {
    const project = workspace.addProject({ path: projectDir });
    workspace.updateProjectContext({ id: project.id, enabled: true, language: 'vi' });

    restart();

    const [reopened] = workspace.listProjects();
    expect(reopened).toMatchObject({
      id: project.id,
      path: projectDir,
      pathStatus: 'directory',
      context: { enabled: true, language: 'vi', custom: false, pathStatus: 'directory' },
    });
  });
});

describe('projects', () => {
  it('names a project after its folder unless given a name', () => {
    expect(workspace.addProject({ path: projectDir }).name).toBe("Dự án 'nháy' $(touch x)");
  });

  it('does not write anything into the project folder', () => {
    workspace.addProject({ path: projectDir });
    expect(readdirSync(projectDir)).toEqual([]);
  });

  it('rejects a missing folder, a file and a relative path', () => {
    const file = join(root, 'file.txt');
    writeFileSync(file, '');

    expect(codeOf(() => workspace.addProject({ path: join(root, 'không có') }))).toBe('PROJECT_PATH_MISSING');
    expect(codeOf(() => workspace.addProject({ path: file }))).toBe('PROJECT_PATH_INVALID');
    expect(codeOf(() => workspace.addProject({ path: 'relative/path' }))).toBe('PROJECT_PATH_INVALID');
    expect(workspace.listProjects()).toEqual([]);
  });

  it('rejects a folder that is already registered, in either Unicode form', () => {
    workspace.addProject({ path: projectDir });

    expect(codeOf(() => workspace.addProject({ path: projectDir }))).toBe('PROJECT_PATH_DUPLICATE');
    expect(codeOf(() => workspace.addProject({ path: projectDir.normalize('NFD') }))).toBe('PROJECT_PATH_DUPLICATE');
  });

  it('renames a project', () => {
    const project = workspace.addProject({ path: projectDir });

    expect(workspace.updateProject({ id: project.id, name: '  Game A  ' }).name).toBe('Game A');
    expect(codeOf(() => workspace.updateProject({ id: project.id, name: '   ' }))).toBe('VALIDATION_FAILED');
  });

  it('reports a moved folder and relinks it without losing context settings', () => {
    const project = workspace.addProject({ path: projectDir });
    workspace.updateProjectContext({ id: project.id, enabled: true });
    const moved = join(root, 'đã chuyển');
    renameSync(projectDir, moved);

    expect(workspace.listProjects()[0]?.pathStatus).toBe('missing');

    expect(workspace.updateProject({ id: project.id, path: moved })).toMatchObject({ path: moved, pathStatus: 'directory' });
    expect(workspace.listProjects()[0]?.context.enabled).toBe(true);
  });

  it('refuses to relink onto the folder of another project', () => {
    const other = join(root, 'other');
    mkdirSync(other);
    workspace.addProject({ path: other });
    const project = workspace.addProject({ path: projectDir });

    expect(codeOf(() => workspace.updateProject({ id: project.id, path: other }))).toBe('PROJECT_PATH_DUPLICATE');
  });

  it('removes a project from the list without deleting its folder or documents', () => {
    const project = workspace.addProject({ path: projectDir });
    const documents = workspace.contextFolder(workspace.updateProjectContext({ id: project.id, enabled: true }).id);
    writeFileSync(join(documents, 'STATUS.md'), 'ghi chú');

    workspace.removeProject(project.id);

    expect(workspace.listProjects()).toEqual([]);
    expect(existsSync(projectDir)).toBe(true);
    expect(existsSync(join(documents, 'STATUS.md'))).toBe(true);
    expect(codeOf(() => workspace.contextFolder(project.id))).toBe('NOT_FOUND');
    expect(workspace.addProject({ path: projectDir }).id).not.toBe(project.id);
  });
});

describe('context documents', () => {
  it('starts off, in English, in the default folder inside AgentHub', () => {
    const project = workspace.addProject({ path: projectDir });

    expect(project.context).toEqual({
      enabled: false,
      language: 'en',
      path: join(root, 'projects', project.id, 'context'),
      custom: false,
      pathStatus: 'missing',
      detected: false,
    });
    expect(codeOf(() => workspace.contextFolder(project.id))).toBe('VALIDATION_FAILED');
  });

  it('creates the default folder when turned on, and never writes into the project folder', () => {
    const project = workspace.addProject({ path: projectDir });

    const updated = workspace.updateProjectContext({ id: project.id, enabled: true });

    expect(updated.context).toMatchObject({ enabled: true, pathStatus: 'directory' });
    expect(readdirSync(updated.context.path)).toEqual([]);
    expect(readdirSync(projectDir)).toEqual([]);
  });

  it('uses a folder the user chose, and goes back to the default', () => {
    const project = workspace.addProject({ path: projectDir });
    const chosen = join(projectDir, 'AgentContext');
    mkdirSync(chosen);

    const custom = workspace.updateProjectContext({ id: project.id, enabled: true, customPath: chosen });
    expect(custom.context).toMatchObject({ path: chosen, custom: true, pathStatus: 'directory' });
    expect(workspace.contextFolder(project.id)).toBe(chosen);

    const reset = workspace.updateProjectContext({ id: project.id, customPath: null });
    expect(reset.context).toMatchObject({ path: join(root, 'projects', project.id, 'context'), custom: false });
  });

  it('keeps settings an update leaves out', () => {
    const project = workspace.addProject({ path: projectDir });
    workspace.updateProjectContext({ id: project.id, enabled: true, language: 'vi' });

    expect(workspace.updateProjectContext({ id: project.id, enabled: false }).context).toMatchObject({ enabled: false, language: 'vi' });
  });

  it('rejects a chosen folder that is missing or a file, and an unknown project', () => {
    const project = workspace.addProject({ path: projectDir });
    const file = join(root, 'file.txt');
    writeFileSync(file, '');

    expect(codeOf(() => workspace.updateProjectContext({ id: project.id, customPath: join(root, 'không có') }))).toBe('PROJECT_PATH_MISSING');
    expect(codeOf(() => workspace.updateProjectContext({ id: project.id, customPath: file }))).toBe('PROJECT_PATH_INVALID');
    expect(codeOf(() => workspace.updateProjectContext({ id: randomUUID(), enabled: true }))).toBe('NOT_FOUND');
    expect(workspace.listProjects()[0]?.context.custom).toBe(false);
  });

  it('reports a chosen folder that has since disappeared', () => {
    const project = workspace.addProject({ path: projectDir });
    const chosen = join(root, 'docs');
    mkdirSync(chosen);
    workspace.updateProjectContext({ id: project.id, enabled: true, customPath: chosen });
    rmSync(chosen, { recursive: true });

    expect(workspace.listProjects()[0]?.context.pathStatus).toBe('missing');
    expect(codeOf(() => workspace.contextFolder(project.id))).toBe('PROJECT_PATH_MISSING');
  });
});

describe('tasks read from the documents (ADR-019, ADR-017)', () => {
  function documentsFor(projectId: string): string {
    const folder = workspace.updateProjectContext({ id: projectId, enabled: true }).context.path;
    mkdirSync(join(folder, 'Workstreams', 'combo', 'Tasks'), { recursive: true });
    writeFileSync(join(folder, 'README.md'), '# Context');
    writeFileSync(join(folder, 'PROJECT_CONTEXT.md'), '# Project');
    writeFileSync(join(folder, 'Workstreams', 'combo', 'STATUS.md'), '# Combo\nBranch: feature/combo\n\n| Task | State |\n|---|---|\n| TASK-001 | in progress |\n');
    writeFileSync(join(folder, 'Workstreams', 'combo', 'Tasks', 'TASK-001-counter.md'), '# TASK-001 Counter\n\n## Handoff log\n');
    return folder;
  }

  it('shows tasks, Git and warnings, and reads nothing when the documents are off', async () => {
    const project = workspace.addProject({ path: projectDir });
    expect(await workspace.projectContext(project.id)).toMatchObject({ overview: { workstreams: [] }, warnings: [] });

    documentsFor(project.id);
    const state = await workspace.projectContext(project.id);

    expect(state.git.state).toBe('not_repo');
    expect(state.overview.workstreams[0]?.tasks.map((task) => task.id)).toEqual(['TASK-001']);
    expect(state.warnings.map((warning) => warning.kind)).toEqual(['no_handoff']);
  });

  it('adds a pasted handoff to the top of the task\'s log, and nothing else', async () => {
    const project = workspace.addProject({ path: projectDir });
    const folder = documentsFor(project.id);
    const ref = 'Workstreams/combo/Tasks/TASK-001-counter.md';

    workspace.addHandoff({ id: project.id, taskRef: ref, entry: '### 2026-11-05 10:00 — Chat / Claude\n- **Done:** x' });
    const overview = workspace.addHandoff({ id: project.id, taskRef: ref, entry: '### 2026-11-05 11:00 — Chat / Claude\n- **Done:** y' });

    expect(overview.workstreams[0]?.tasks[0]?.lastHandoff?.heading).toBe('2026-11-05 11:00 — Chat / Claude');
    expect(readFileSync(join(folder, ref), 'utf8').indexOf('11:00')).toBeLessThan(readFileSync(join(folder, ref), 'utf8').indexOf('10:00'));
    expect(codeOf(() => workspace.addHandoff({ id: project.id, taskRef: 'Workstreams/combo/Tasks/TASK-404.md', entry: 'x' }))).toBe('NOT_FOUND');
    expect(readdirSync(projectDir)).toEqual([]);
  });

  it('adds a handoff to a task under a workstream folder with another name (ADR-020 item 4)', () => {
    const project = workspace.addProject({ path: projectDir });
    const folder = documentsFor(project.id);
    const ref = 'Playables/playable005/Tasks/TASK-016-intro.md';
    mkdirSync(join(folder, 'Playables', 'playable005', 'Tasks'), { recursive: true });
    writeFileSync(join(folder, 'Playables', 'playable005', 'STATUS.md'), '# Playable 005\n');
    writeFileSync(join(folder, ref), '# TASK-016 Intro\n');

    const overview = workspace.addHandoff({ id: project.id, taskRef: ref, entry: '### 2026-11-05 10:00 — A\n- **Done:** x' });

    expect(overview.workstreams.map((workstream) => workstream.slug)).toEqual(['Playables/playable005', 'Workstreams/combo']);
    expect(readFileSync(join(folder, ref), 'utf8')).toBe('# TASK-016 Intro\n\n## Handoff log\n\n### 2026-11-05 10:00 — A\n- **Done:** x\n');
  });
});

describe('handoffs without documents, and loose chats (TDD §7.5)', () => {
  it('keeps pasted handoffs of a project without documents and offers the summary prompt', async () => {
    const project = workspace.addProject({ path: projectDir });

    const handoffs = workspace.saveProjectHandoff({ id: project.id, content: '- **Done:** x' });
    const state = await workspace.projectContext(project.id);

    expect(state.handoffs.map((note) => note.id)).toEqual(handoffs.map((note) => note.id));
    expect(state.handoffs[0]?.source).toBe('AgentHub (dán)');
    expect(state.checkpointPrompt).toContain('context_save_handoff');
    expect(workspace.readProjectHandoff({ id: project.id, noteId: handoffs[0]?.id ?? '' }).content).toContain('- **Done:** x');
    expect(existsSync(join(root, 'projects', project.id, 'handoffs'))).toBe(true);
    expect(readdirSync(projectDir)).toEqual([]);
  });

  it('sends a project with documents to its tasks instead', async () => {
    const project = workspace.addProject({ path: projectDir });
    workspace.updateProjectContext({ id: project.id, enabled: true });

    expect(codeOf(() => workspace.saveProjectHandoff({ id: project.id, content: 'x' }))).toBe('VALIDATION_FAILED');
    expect((await workspace.projectContext(project.id)).checkpointPrompt).toContain('context-checkpoint');
  });

  it('moves a loose chat into a project: to Inbox/ with documents, to handoffs without', () => {
    const withDocs = workspace.addProject({ path: projectDir });
    const folder = workspace.updateProjectContext({ id: withDocs.id, enabled: true }).context.path;
    const otherDir = join(root, 'khác');
    mkdirSync(otherDir);
    const plain = workspace.addProject({ path: otherDir });

    const first = workspace.saveLooseChat({ title: 'Ý tưởng', content: 'a' });
    const second = workspace.saveLooseChat({ title: 'Lỗi build', content: 'b' });
    expect(workspace.listLooseChats().map((note) => note.title).sort()).toEqual(['Lỗi build', 'Ý tưởng']);

    workspace.moveLooseChat({ id: first.id, projectId: withDocs.id });
    workspace.moveLooseChat({ id: second.id, projectId: plain.id });

    expect(workspace.listLooseChats()).toEqual([]);
    expect(existsSync(join(folder, 'Inbox', `${first.id}.md`))).toBe(true);
    expect(workspace.readProjectHandoff({ id: plain.id, noteId: second.id }).content).toContain('b');
    expect(codeOf(() => workspace.moveLooseChat({ id: first.id, projectId: plain.id }))).toBe('NOT_FOUND');
  });
});

describe('documents the project already has (ADR-020 item 4)', () => {
  function write(path: string, content = '# x\n'): void {
    mkdirSync(join(projectDir, path, '..'), { recursive: true });
    writeFileSync(join(projectDir, path), content);
  }

  it('starts using the one set in AgentHub\'s layout, under a workstream folder of its own name, once', async () => {
    write('AgentContext/README.md');
    write('AgentContext/Playables/playable005/STATUS.md', '# Playable 005\n');
    write('AgentContext/Playables/playable005/Tasks/TASK-016-intro.md', '# TASK-016\n\n## Handoff log\n');
    const project = workspace.addProject({ path: projectDir });
    expect(project.context.detected).toBe(false);

    const result = workspace.detectContext({ id: project.id, apply: true });

    expect(result.applied).toBe(join(projectDir, 'AgentContext'));
    expect(result.project.context).toMatchObject({ enabled: true, custom: true, path: join(projectDir, 'AgentContext'), detected: true });
    const state = await workspace.projectContext(project.id);
    expect(state.overview.workstreams[0]?.tasks[0]?.ref).toBe('Playables/playable005/Tasks/TASK-016-intro.md');

    restart();
    expect(workspace.listProjects()[0]?.context.detected).toBe(true);
  });

  it('lists several sets for the user to pick, and changes nothing', () => {
    write('Docs/A/PROJECT_CONTEXT.md');
    write('Tools/B/PROJECT_CONTEXT.md');
    const project = workspace.addProject({ path: projectDir });

    const result = workspace.detectContext({ id: project.id, apply: true });

    expect(result.found).toEqual([join(projectDir, 'Docs', 'A'), join(projectDir, 'Tools', 'B')]);
    expect(result.applied).toBeNull();
    expect(result.project.context.enabled).toBe(false);
  });

  it('only lists notes in another shape, and searches again after the folder moves', () => {
    write('Docs/Continuity.md');
    write('Docs/Design/STATUS-combo.md');
    write('Docs/Design/spec.md');
    write('AGENTS.md');
    const project = workspace.addProject({ path: projectDir });

    const result = workspace.detectContext({ id: project.id, apply: true });

    expect(result).toMatchObject({ found: [], applied: null, others: ['AGENTS.md', 'Docs/Continuity.md', 'Docs/Design/STATUS-combo.md'] });
    const moved = join(root, 'moved');
    renameSync(projectDir, moved);
    expect(workspace.updateProject({ id: project.id, path: moved }).context.detected).toBe(false);
  });
});

describe('moving the documents to another folder (ADR-020 item 5)', () => {
  function withDocuments(): { id: string; from: string } {
    const project = workspace.addProject({ path: projectDir });
    const from = workspace.updateProjectContext({ id: project.id, enabled: true }).context.path;
    mkdirSync(join(from, 'Workstreams', 'combo'), { recursive: true });
    writeFileSync(join(from, 'README.md'), '# Context');
    writeFileSync(join(from, 'Workstreams', 'combo', 'STATUS.md'), '# Combo');
    return { id: project.id, from };
  }

  it('asks first, then copies every file and puts AgentHub\'s own folder in the Trash', async () => {
    const { id, from } = withDocuments();
    const to = join(root, 'Tài liệu chung');
    mkdirSync(to);

    expect(await workspace.changeContextFolder({ id, customPath: to, move: 'ask' })).toMatchObject({ status: 'needs_decision', files: 2 });
    expect(workspace.listProjects()[0]?.context.custom).toBe(false);

    const result = await workspace.changeContextFolder({ id, customPath: to, move: 'move' });

    expect(result).toMatchObject({ status: 'done', moved: 2, kept: null });
    expect(readFileSync(join(to, 'Workstreams', 'combo', 'STATUS.md'), 'utf8')).toBe('# Combo');
    expect(trashed).toEqual([from]);
    expect(existsSync(from)).toBe(false);
    expect(workspace.listProjects()[0]?.context.path).toBe(to);
  });

  it('stops on files already in the new folder, and overwrites nothing', async () => {
    const { id, from } = withDocuments();
    const to = join(root, 'đích');
    mkdirSync(to);
    writeFileSync(join(to, 'README.md'), 'của người dùng');

    const result = await workspace.changeContextFolder({ id, customPath: to, move: 'move' });

    expect(result).toMatchObject({ status: 'conflict', conflicts: ['README.md'] });
    expect(readFileSync(join(to, 'README.md'), 'utf8')).toBe('của người dùng');
    expect(existsSync(join(to, 'Workstreams'))).toBe(false);
    expect(existsSync(join(from, 'README.md'))).toBe(true);
    expect(workspace.listProjects()[0]?.context.custom).toBe(false);
  });

  it('leaves a folder the user chose where it is, and refuses folders inside each other', async () => {
    const { id } = withDocuments();
    const chosen = join(projectDir, 'AgentContext');
    mkdirSync(chosen);
    await workspace.changeContextFolder({ id, customPath: chosen, move: 'move' });

    const back = await workspace.changeContextFolder({ id, customPath: null, move: 'move' });

    expect(back).toMatchObject({ status: 'done', moved: 2, kept: chosen });
    expect(existsSync(join(chosen, 'README.md'))).toBe(true);
    const inside = join(workspace.listProjects()[0]?.context.path ?? '', 'sub');
    mkdirSync(inside);
    expect(await workspace.changeContextFolder({ id, customPath: inside, move: 'move' }).catch((error: DomainError) => error.code)).toBe('VALIDATION_FAILED');
  });

  it('switches without moving when asked to leave the files', async () => {
    const { id, from } = withDocuments();
    const to = join(root, 'khác');
    mkdirSync(to);

    expect(await workspace.changeContextFolder({ id, customPath: to, move: 'leave' })).toMatchObject({ status: 'done', moved: 0, kept: null });
    expect(readdirSync(to)).toEqual([]);
    expect(existsSync(join(from, 'README.md'))).toBe(true);
    expect(trashed).toEqual([]);
  });
});

describe('settings', () => {
  it('keeps the device id and theme across a restart', () => {
    const { deviceId } = workspace.getSettings();
    workspace.updateSettings({ theme: 'dark' });

    restart();

    expect(workspace.getSettings()).toEqual({ deviceId, theme: 'dark', claudeCliPath: null, codexCliPath: null });
  });

  it('defaults to the system theme', () => {
    expect(workspace.getSettings().theme).toBe('system');
  });
});
