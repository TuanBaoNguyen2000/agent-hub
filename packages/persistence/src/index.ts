import type {
  MetadataStore,
  ProjectRepository,
  SettingsRepository,
  StoredProject,
  TaskRepository,
} from '@agenthub/application';
import type { Project, Task, TaskStatus } from '@agenthub/domain';
import { type SqliteDatabase, openDatabase, schemaVersion } from './database';
import { MIGRATIONS } from './migrations';

export { createContextStore } from './context-store';

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  objective: string;
  acceptance_criteria: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  absolute_path: string | null;
}

type Location = { id: string; deviceId: string; path: string };

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  objective: row.objective,
  acceptanceCriteria: row.acceptance_criteria,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toProject = (row: ProjectRow): StoredProject => ({
  id: row.id,
  name: row.name,
  path: row.absolute_path,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function projectRepository(db: SqliteDatabase): ProjectRepository {
  const select = `
    SELECT p.id, p.name, p.created_at, p.updated_at, l.absolute_path
    FROM projects p
    LEFT JOIN project_locations l ON l.project_id = p.id AND l.device_id = @deviceId
    WHERE p.removed_at IS NULL`;
  const listActive = db.prepare(`${select} ORDER BY p.name COLLATE NOCASE`);
  const getOne = db.prepare(`${select} AND p.id = @id`);
  const insertProject = db.prepare(
    'INSERT INTO projects (id, name, created_at, updated_at) VALUES (@id, @name, @createdAt, @updatedAt)',
  );
  const upsertLocation = db.prepare(`
    INSERT INTO project_locations (id, project_id, device_id, absolute_path)
    VALUES (@id, @projectId, @deviceId, @path)
    ON CONFLICT(project_id, device_id) DO UPDATE SET absolute_path = excluded.absolute_path`);
  const touch = db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?');
  const rename = db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?');
  const markRemoved = db.prepare('UPDATE projects SET removed_at = ?, updated_at = ? WHERE id = ?');

  const insert = db.transaction((project: Project, location: Location) => {
    insertProject.run(project);
    upsertLocation.run({ ...location, projectId: project.id });
  });
  const setLocation = db.transaction((projectId: string, location: Location, updatedAt: string) => {
    upsertLocation.run({ ...location, projectId });
    touch.run(updatedAt, projectId);
  });

  return {
    listActive: (deviceId) => (listActive.all({ deviceId }) as ProjectRow[]).map(toProject),
    get: (id, deviceId) => {
      const row = getOne.get({ id, deviceId }) as ProjectRow | undefined;
      return row && toProject(row);
    },
    insert: (project, location) => {
      insert(project, location);
    },
    rename: (id, name, updatedAt) => {
      rename.run(name, updatedAt, id);
    },
    setLocation: (projectId, location, updatedAt) => {
      setLocation(projectId, location, updatedAt);
    },
    markRemoved: (id, removedAt) => {
      markRemoved.run(removedAt, removedAt, id);
    },
  };
}

function taskRepository(db: SqliteDatabase): TaskRepository {
  const list = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC, id');
  const get = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO tasks (id, project_id, title, objective, acceptance_criteria, status, created_at, updated_at)
    VALUES (@id, @projectId, @title, @objective, @acceptanceCriteria, @status, @createdAt, @updatedAt)`);
  const update = db.prepare(`
    UPDATE tasks
    SET title = @title, objective = @objective, acceptance_criteria = @acceptanceCriteria,
        status = @status, updated_at = @updatedAt
    WHERE id = @id`);

  return {
    list: (projectId) => (list.all(projectId) as TaskRow[]).map(toTask),
    get: (id) => {
      const row = get.get(id) as TaskRow | undefined;
      return row && toTask(row);
    },
    insert: (task) => {
      insert.run(task);
    },
    update: (task) => {
      update.run(task);
    },
  };
}

function settingsRepository(db: SqliteDatabase): SettingsRepository {
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const set = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  return {
    get: (key) => (get.get(key) as { value: string } | undefined)?.value,
    set: (key, value) => {
      set.run(key, value);
    },
  };
}

export function openMetadataStore(databasePath: string, options: { backupDirectory?: string } = {}): MetadataStore {
  const db = openDatabase(databasePath, MIGRATIONS, options.backupDirectory);
  const engineVersion = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
  return {
    projects: projectRepository(db),
    tasks: taskRepository(db),
    settings: settingsRepository(db),
    status: () => ({ engineVersion, schemaVersion: schemaVersion(db) }),
    close: () => {
      db.close();
    },
  };
}
