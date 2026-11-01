import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MetadataStore, type Workspace, createWorkspace } from '@agenthub/application';
import { DomainError } from '@agenthub/domain';
import { createContextStore, openMetadataStore } from '@agenthub/persistence';
import { createPathInspector } from '@agenthub/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Real persistence and platform adapters on temporary folders; only Electron is absent.
let root: string;
let projectDir: string;
let store: MetadataStore;
let workspace: Workspace;

function open(): void {
  store = openMetadataStore(join(root, 'agenthub.sqlite'), { backupDirectory: join(root, 'backups') });
  workspace = createWorkspace({
    store,
    context: createContextStore(join(root, 'artifacts')),
    paths: createPathInspector(),
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
  open();
});

afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});

describe('Phase 1 exit criteria', () => {
  it('keeps project, task and context across a restart, with a Unicode path', () => {
    const project = workspace.addProject({ path: projectDir });
    const task = workspace.createTask({ projectId: project.id, title: 'QA-024', objective: 'Sửa lỗi' });
    workspace.updateTask({ id: task.id, status: 'active', acceptanceCriteria: 'Không crash' });
    const reference = { scope: 'task', taskId: task.id, document: 'task' } as const;
    workspace.saveContext(reference, '# Bối cảnh\nGhi chú tiếng Việt', null);

    restart();

    const [reopened] = workspace.listProjects();
    expect(reopened).toMatchObject({ id: project.id, path: projectDir, pathStatus: 'directory' });
    expect(workspace.listTasks(project.id)).toEqual([
      expect.objectContaining({ id: task.id, status: 'active', objective: 'Sửa lỗi', acceptanceCriteria: 'Không crash' }),
    ]);
    expect(workspace.readContext(reference).content).toBe('# Bối cảnh\nGhi chú tiếng Việt');
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

  it('reports a moved folder and relinks it without losing tasks', () => {
    const project = workspace.addProject({ path: projectDir });
    const task = workspace.createTask({ projectId: project.id, title: 'QA-024' });
    const moved = join(root, 'đã chuyển');
    renameSync(projectDir, moved);

    expect(workspace.listProjects()[0]?.pathStatus).toBe('missing');

    expect(workspace.updateProject({ id: project.id, path: moved })).toMatchObject({ path: moved, pathStatus: 'directory' });
    expect(workspace.listTasks(project.id).map((item) => item.id)).toEqual([task.id]);
  });

  it('refuses to relink onto the folder of another project', () => {
    const other = join(root, 'other');
    mkdirSync(other);
    workspace.addProject({ path: other });
    const project = workspace.addProject({ path: projectDir });

    expect(codeOf(() => workspace.updateProject({ id: project.id, path: other }))).toBe('PROJECT_PATH_DUPLICATE');
  });

  it('removes a project from the list without deleting its folder or artifacts', () => {
    const project = workspace.addProject({ path: projectDir });
    const reference = { scope: 'project', projectId: project.id } as const;
    workspace.saveContext(reference, 'ghi chú', null);

    workspace.removeProject(project.id);

    expect(workspace.listProjects()).toEqual([]);
    expect(existsSync(projectDir)).toBe(true);
    expect(existsSync(join(root, 'artifacts', project.id, 'project.md'))).toBe(true);
    expect(codeOf(() => workspace.listTasks(project.id))).toBe('NOT_FOUND');
    expect(workspace.addProject({ path: projectDir }).id).not.toBe(project.id);
  });
});

describe('tasks', () => {
  it('starts in backlog and requires a title', () => {
    const project = workspace.addProject({ path: projectDir });

    expect(workspace.createTask({ projectId: project.id, title: 'QA' }).status).toBe('backlog');
    expect(codeOf(() => workspace.createTask({ projectId: project.id, title: '  ' }))).toBe('VALIDATION_FAILED');
  });

  it('keeps fields that an update leaves out', () => {
    const project = workspace.addProject({ path: projectDir });
    const task = workspace.createTask({ projectId: project.id, title: 'QA', objective: 'Mục tiêu' });

    const updated = workspace.updateTask({ id: task.id, status: 'blocked' });

    expect(updated).toMatchObject({ title: 'QA', objective: 'Mục tiêu', status: 'blocked' });
  });

  it('rejects unknown ids', () => {
    const missing = randomUUID();

    expect(codeOf(() => workspace.updateTask({ id: missing, title: 'x' }))).toBe('NOT_FOUND');
    expect(codeOf(() => workspace.createTask({ projectId: missing, title: 'x' }))).toBe('NOT_FOUND');
  });
});

describe('context', () => {
  it('keeps project, task and decision documents apart', () => {
    const project = workspace.addProject({ path: projectDir });
    const task = workspace.createTask({ projectId: project.id, title: 'QA' });

    workspace.saveContext({ scope: 'project', projectId: project.id }, 'project', null);
    workspace.saveContext({ scope: 'task', taskId: task.id, document: 'task' }, 'task', null);
    workspace.saveContext({ scope: 'task', taskId: task.id, document: 'decisions' }, 'decisions', null);

    expect(workspace.readContext({ scope: 'project', projectId: project.id }).content).toBe('project');
    expect(workspace.readContext({ scope: 'task', taskId: task.id, document: 'task' }).content).toBe('task');
    expect(workspace.readContext({ scope: 'task', taskId: task.id, document: 'decisions' }).content).toBe('decisions');
  });

  it('reports a conflict instead of overwriting', () => {
    const project = workspace.addProject({ path: projectDir });
    const reference = { scope: 'project', projectId: project.id } as const;
    const opened = workspace.saveContext(reference, 'một', null);
    workspace.saveContext(reference, 'hai', opened.revision);

    expect(codeOf(() => workspace.saveContext(reference, 'ba', opened.revision))).toBe('CONTEXT_CONFLICT');
    expect(workspace.readContext(reference).content).toBe('hai');
  });

  it('rejects context for an unknown task', () => {
    const reference = { scope: 'task', taskId: randomUUID(), document: 'task' } as const;
    expect(codeOf(() => workspace.readContext(reference))).toBe('NOT_FOUND');
  });
});

describe('settings', () => {
  it('keeps the device id and theme across a restart', () => {
    const { deviceId } = workspace.getSettings();
    workspace.updateSettings({ theme: 'dark' });

    restart();

    expect(workspace.getSettings()).toEqual({ deviceId, theme: 'dark' });
  });

  it('defaults to the system theme', () => {
    expect(workspace.getSettings().theme).toBe('system');
  });
});
