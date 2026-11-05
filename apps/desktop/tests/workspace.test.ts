import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MetadataStore, type Workspace, createWorkspace } from '@agenthub/application';
import { DomainError } from '@agenthub/domain';
import { openMetadataStore } from '@agenthub/persistence';
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
    paths: createPathInspector(),
    defaultContextDirectory: (projectId) => join(root, 'projects', projectId, 'context'),
    ensureDirectory: (path) => mkdirSync(path, { recursive: true }),
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
