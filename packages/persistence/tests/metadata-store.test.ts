import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, schemaVersion } from '../src/database';
import { createContextStore, openMetadataStore } from '../src/index';

const noteTable = { version: 1, up: 'CREATE TABLE note (id INTEGER PRIMARY KEY)' };
const projectId = '6f1c2b7e-3a44-4c1d-9a55-0d6f3a7b8c91';
const taskId = '7a2d3c8f-4b55-4d2e-8b66-1e7a4b8c9d02';

let dir: string;
let databasePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agenthub dữ liệu 'thử' "));
  databasePath = join(dir, 'agenthub.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function versionAfterOpening(migrations: { version: number; up: string }[], backupDirectory?: string): number {
  const db = openDatabase(databasePath, migrations, backupDirectory);
  const version = schemaVersion(db);
  db.close();
  return version;
}

describe('migrations', () => {
  it('opens a database at a path with Unicode, spaces and quotes', () => {
    expect(versionAfterOpening([])).toBe(0);
  });

  it('keeps the schema version after reopening and does not reapply', () => {
    versionAfterOpening([noteTable]);
    expect(versionAfterOpening([noteTable])).toBe(1);
  });

  it('applies pending migrations in version order', () => {
    const second = { version: 2, up: 'ALTER TABLE note ADD COLUMN body TEXT' };
    expect(versionAfterOpening([second, noteTable])).toBe(2);
  });

  it('rolls back a failing migration and keeps earlier versions', () => {
    const broken = { version: 2, up: 'CREATE TABLE half (id INTEGER); THIS IS NOT SQL' };
    expect(() => versionAfterOpening([noteTable, broken])).toThrow();

    expect(versionAfterOpening([noteTable, { version: 2, up: 'CREATE TABLE half (id INTEGER)' }])).toBe(2);
  });

  it('refuses a database newer than the app and leaves it unchanged', () => {
    versionAfterOpening([noteTable, { version: 2, up: 'CREATE TABLE later (id INTEGER)' }]);

    expect(() => versionAfterOpening([noteTable])).toThrow(/mới hơn/);
    expect(versionAfterOpening([noteTable, { version: 2, up: 'SELECT 1' }])).toBe(2);
  });

  it('backs up before upgrading an existing schema, not when creating one', () => {
    const backups = join(dir, 'backups');
    versionAfterOpening([noteTable], backups);
    expect(existsSync(backups)).toBe(false);

    versionAfterOpening([noteTable, { version: 2, up: 'CREATE TABLE later (id INTEGER)' }], backups);
    expect(readdirSync(backups)).toHaveLength(1);
    expect(readdirSync(backups)[0]).toMatch(/^agenthub-schema-1-.*\.sqlite$/);
  });
});

describe('openMetadataStore', () => {
  const timestamp = '2026-11-01T00:00:00.000Z';
  const project = { id: projectId, name: 'Dự án', createdAt: timestamp, updatedAt: timestamp };
  const task = {
    id: taskId,
    projectId,
    title: 'QA-024',
    objective: '',
    acceptanceCriteria: '',
    status: 'backlog' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const location = { id: taskId, deviceId: 'device-a', path: '/a/Dự án thử' };

  it('keeps projects, tasks and settings after reopening', () => {
    const first = openMetadataStore(databasePath);
    first.projects.insert(project, location);
    first.tasks.insert(task);
    first.settings.set('theme', 'dark');
    first.close();

    const second = openMetadataStore(databasePath);
    expect(second.projects.get(projectId, 'device-a')?.path).toBe('/a/Dự án thử');
    expect(second.tasks.list(projectId)).toEqual([task]);
    expect(second.settings.get('theme')).toBe('dark');
    second.close();
  });

  it('keeps a path per device', () => {
    const store = openMetadataStore(databasePath);
    store.projects.insert(project, location);

    expect(store.projects.get(projectId, 'device-b')?.path).toBeNull();
    store.close();
  });

  it('hides a removed project but keeps its tasks', () => {
    const store = openMetadataStore(databasePath);
    store.projects.insert(project, location);
    store.tasks.insert(task);

    store.projects.markRemoved(projectId, timestamp);

    expect(store.projects.listActive('device-a')).toEqual([]);
    expect(store.tasks.get(taskId)).toEqual(task);
    store.close();
  });

  it('rejects a task for an unknown project', () => {
    const store = openMetadataStore(databasePath);
    expect(() => store.tasks.insert(task)).toThrow(/FOREIGN KEY/);
    store.close();
  });

  it('stores titles with shell metacharacters as plain data', () => {
    const store = openMetadataStore(databasePath);
    store.projects.insert(project, location);
    const title = `'; DROP TABLE tasks; -- $(rm -rf /) \`x\``;

    store.tasks.insert({ ...task, title });

    expect(store.tasks.get(taskId)?.title).toBe(title);
    store.close();
  });
});

describe('createContextStore', () => {
  const projectContext = { projectId, document: 'project' } as const;
  const taskContext = { projectId, taskId, document: 'task' } as const;

  it('reads a document that was never saved as empty', () => {
    expect(createContextStore(dir).read(taskContext)).toEqual({ content: '', revision: null, modifiedAt: null });
  });

  it('saves Unicode content and reads it back', () => {
    const store = createContextStore(dir);
    const saved = store.write(taskContext, '# Mục tiêu\nSửa lỗi — 日本語\n', null);

    expect(saved.revision).toMatch(/^[0-9a-f]{64}$/);
    expect(store.read(taskContext)).toEqual(saved);
    expect(readFileSync(join(dir, projectId, taskId, 'task.md'), 'utf8')).toBe('# Mục tiêu\nSửa lỗi — 日本語\n');
  });

  it('uses the layout from TDD §6.3', () => {
    const store = createContextStore(dir);
    store.write(projectContext, 'p', null);
    store.write({ projectId, taskId, document: 'decisions' }, 'd', null);

    expect(existsSync(join(dir, projectId, 'project.md'))).toBe(true);
    expect(existsSync(join(dir, projectId, taskId, 'decisions.md'))).toBe(true);
  });

  it('leaves no temporary file behind', () => {
    const store = createContextStore(dir);
    store.write(taskContext, 'một', null);

    expect(readdirSync(join(dir, projectId, taskId))).toEqual(['task.md']);
  });

  it('rejects a save based on an old revision and keeps the newer content', () => {
    const store = createContextStore(dir);
    const first = store.write(taskContext, 'một', null);
    store.write(taskContext, 'hai', first.revision);

    expect(() => store.write(taskContext, 'ba', first.revision)).toThrow(/thay đổi ở nơi khác/);
    expect(store.read(taskContext).content).toBe('hai');
  });

  it('detects a change made outside the app', () => {
    const store = createContextStore(dir);
    const opened = store.write(taskContext, 'một', null);
    writeFileSync(join(dir, projectId, taskId, 'task.md'), 'sửa bằng editor khác');

    expect(() => store.write(taskContext, 'hai', opened.revision)).toThrow(/thay đổi ở nơi khác/);
  });

  it('rejects a save that assumes a new document when one exists', () => {
    const store = createContextStore(dir);
    store.write(taskContext, 'một', null);

    expect(() => store.write(taskContext, 'hai', null)).toThrow(/thay đổi ở nơi khác/);
  });

  it.each(['../../evil', '..', 'a/b', ''])('rejects the id %j', (badId) => {
    const outside = join(dir, 'outside');
    mkdirSync(outside);
    const store = createContextStore(join(dir, 'root'));

    expect(() => store.write({ projectId: badId, document: 'project' }, 'x', null)).toThrow(/không hợp lệ/);
    expect(readdirSync(dir)).not.toContain('evil');
  });
});
