import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, schemaVersion } from '../src/database';
import { raw } from '@agenthub/domain';
import { openMetadataStore } from '../src/index';
import { MIGRATIONS } from '../src/migrations';

const noteTable = { version: 1, up: 'CREATE TABLE note (id INTEGER PRIMARY KEY)' };
const projectId = '6f1c2b7e-3a44-4c1d-9a55-0d6f3a7b8c91';
const locationId = '7a2d3c8f-4b55-4d2e-8b66-1e7a4b8c9d02';

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
  it('drops the names AgentHub made up for accounts, and keeps real nicknames', () => {
    const before = openDatabase(databasePath, MIGRATIONS.filter((migration) => migration.version <= 2));
    const insert = before.prepare("INSERT INTO account_profiles (id, provider, alias, created_at) VALUES (?, ?, ?, '2026-11-01')");
    insert.run('1', 'claude', 'Claude');
    insert.run('2', 'claude', 'Claude 2');
    insert.run('3', 'codex', 'Codex 12');
    insert.run('4', 'claude', 'Công việc');
    insert.run('5', 'claude', 'Claude 2 riêng');
    insert.run('6', 'codex', 'Claude');
    before.close();

    const store = openMetadataStore(databasePath);
    const aliases = store.profiles.list().map((profile) => [profile.id, profile.alias, profile.accountEmail]);
    store.close();

    expect(aliases).toEqual(
      expect.arrayContaining([
        ['1', '', null],
        ['2', '', null],
        ['3', '', null],
        ['4', 'Công việc', null],
        ['5', 'Claude 2 riêng', null],
        ['6', 'Claude', null],
      ]),
    );
  });

  it('moves launches onto their task\'s project and drops tasks (ADR-019)', () => {
    const before = openDatabase(databasePath, MIGRATIONS.filter((migration) => migration.version <= 3));
    before.exec(`
      INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Game', '2026-11-01', '2026-11-01');
      INSERT INTO project_locations (id, project_id, device_id, absolute_path) VALUES ('l1', 'p1', 'device-a', '/a/game');
      INSERT INTO tasks (id, project_id, title, objective, status, created_at, updated_at)
        VALUES ('t1', 'p1', 'QA', '', 'active', '2026-11-01', '2026-11-01');
      INSERT INTO account_profiles (id, provider, alias, created_at) VALUES ('a1', 'claude', '', '2026-11-01');
      INSERT INTO launch_attempts (id, task_id, profile_id, mode, status, outcome, account_confirmed_at, created_at)
        VALUES ('x1', 't1', 'a1', 'desktop', 'launched', '{"appOpened":true}', '2026-11-02', '2026-11-02');
    `);
    before.close();

    const store = openMetadataStore(databasePath, { backupDirectory: join(dir, 'backups') });
    const [launch] = store.launches.list('p1');
    const project = store.projects.get('p1', 'device-a');
    store.close();

    expect(launch).toMatchObject({ id: 'x1', projectId: 'p1', taskRef: null, profileId: 'a1', accountConfirmedAt: '2026-11-02' });
    expect(project).toMatchObject({ context: { enabled: false, language: 'en' }, chatLanguage: null, contextPath: null, path: '/a/game' });
    const db = openDatabase(databasePath, MIGRATIONS);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get()).toBeUndefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
    expect(readdirSync(join(dir, 'backups'))[0]).toMatch(/^agenthub-schema-3-/);
  });

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

  it('shows launches recorded before ADR-020 item 6 with their texts as they were', () => {
    const database = join(dir, 'legacy.sqlite');
    const store = openMetadataStore(database);
    const project = { id: 'p1', name: 'P', context: { enabled: false, language: 'en' as const }, chatLanguage: null, createdAt: 't', updatedAt: 't' };
    store.projects.insert(project, { id: 'l1', deviceId: 'd', path: '/p' });
    store.profiles.insert({ id: 'a1', provider: 'claude', alias: '', accountEmail: null, cliConfigRoot: null, desktopDataDir: null, createdAt: 't' });
    store.launches.insert({ id: 'x1', projectId: 'p1', taskRef: null, profileId: 'a1', mode: 'cli', status: 'planned', createdAt: 't' });
    store.close();
    const db = openDatabase(database, MIGRATIONS);
    db.prepare('UPDATE launch_attempts SET outcome = ? WHERE id = ?').run(
      JSON.stringify({ appOpened: true, workspace: 'manual', sessionStarted: false, userActionRequired: ['Chọn folder'], warnings: ['Cũ'] }),
      'x1',
    );
    db.close();

    const reopened = openMetadataStore(database);
    expect(reopened.launches.get('x1')?.outcome).toMatchObject({ userActionRequired: [raw('Chọn folder')], warnings: [raw('Cũ')] });
    reopened.close();
  });

  it('refuses a database newer than the app and leaves it unchanged', () => {
    versionAfterOpening([noteTable, { version: 2, up: 'CREATE TABLE later (id INTEGER)' }]);

    expect(() => versionAfterOpening([noteTable])).toThrow(/newer than this app/);
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
  const project = { id: projectId, name: 'Dự án', context: { enabled: false, language: 'en' as const }, chatLanguage: null, createdAt: timestamp, updatedAt: timestamp };
  const location = { id: locationId, deviceId: 'device-a', path: '/a/Dự án thử' };

  it('keeps projects, context settings and settings after reopening', () => {
    const first = openMetadataStore(databasePath);
    first.projects.insert(project, location);
    first.projects.setContext(projectId, 'device-a', { enabled: true, language: 'vi' }, '/a/Tài liệu', timestamp);
    first.settings.set('theme', 'dark');
    first.close();

    const second = openMetadataStore(databasePath);
    expect(second.projects.get(projectId, 'device-a')).toMatchObject({
      path: '/a/Dự án thử',
      context: { enabled: true, language: 'vi' },
      contextPath: '/a/Tài liệu',
    });
    expect(second.settings.get('theme')).toBe('dark');
    second.close();
  });

  it('keeps a project folder and a context folder per device', () => {
    const store = openMetadataStore(databasePath);
    store.projects.insert(project, location);
    store.projects.setContext(projectId, 'device-a', { enabled: true, language: 'en' }, '/a/docs', timestamp);

    expect(store.projects.get(projectId, 'device-b')).toMatchObject({ path: null, contextPath: null, context: { enabled: true } });
    store.close();
  });

  it('keeps the chosen context folder when the project folder moves', () => {
    const store = openMetadataStore(databasePath);
    store.projects.insert(project, location);
    store.projects.setContext(projectId, 'device-a', project.context, '/a/docs', timestamp);

    store.projects.setLocation(projectId, { ...location, id: 'other', path: '/b/moved' }, timestamp);

    expect(store.projects.get(projectId, 'device-a')).toMatchObject({ path: '/b/moved', contextPath: '/a/docs' });
    store.close();
  });

  it('hides a removed project', () => {
    const store = openMetadataStore(databasePath);
    store.projects.insert(project, location);

    store.projects.markRemoved(projectId, timestamp);

    expect(store.projects.listActive('device-a')).toEqual([]);
    store.close();
  });

  it('rejects a launch for an unknown project', () => {
    const store = openMetadataStore(databasePath);
    const attempt = { id: 'x', projectId, taskRef: null, profileId: 'a', mode: 'cli' as const, status: 'planned' as const, createdAt: timestamp };
    expect(() => store.launches.insert(attempt)).toThrow(/FOREIGN KEY/);
    store.close();
  });

  it('stores names with shell metacharacters as plain data', () => {
    const store = openMetadataStore(databasePath);
    const name = `'; DROP TABLE projects; -- $(rm -rf /) \`x\``;

    store.projects.insert({ ...project, name }, location);

    expect(store.projects.get(projectId, 'device-a')?.name).toBe(name);
    store.close();
  });
});
