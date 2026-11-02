import type {
  LaunchRepository,
  MetadataStore,
  PermissionRepository,
  ProfileRepository,
  ProjectRepository,
  SettingsRepository,
  StoredProject,
  TaskRepository,
} from '@agenthub/application';
import type { AccountProfile, ClientMode, LaunchAttempt, LaunchOutcome, LaunchStatus, Project, Provider, Task, TaskStatus } from '@agenthub/domain';
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

interface ProfileRow {
  id: string;
  provider: Provider;
  alias: string;
  account_email: string | null;
  cli_config_root: string | null;
  desktop_data_dir: string | null;
  created_at: string;
}

const toProfile = (row: ProfileRow): AccountProfile => ({
  id: row.id,
  provider: row.provider,
  alias: row.alias,
  accountEmail: row.account_email,
  cliConfigRoot: row.cli_config_root,
  desktopDataDir: row.desktop_data_dir,
  createdAt: row.created_at,
});

// A removed profile keeps its row, because launch history refers to it.
function profileRepository(db: SqliteDatabase): ProfileRepository {
  const list = db.prepare('SELECT * FROM account_profiles WHERE enabled = 1 ORDER BY provider, created_at');
  const get = db.prepare('SELECT * FROM account_profiles WHERE id = ? AND enabled = 1');
  const insert = db.prepare(`
    INSERT INTO account_profiles (id, provider, alias, account_email, cli_config_root, desktop_data_dir, created_at)
    VALUES (@id, @provider, @alias, @accountEmail, @cliConfigRoot, @desktopDataDir, @createdAt)`);
  const update = db.prepare(`
    UPDATE account_profiles
    SET alias = @alias, account_email = @accountEmail, cli_config_root = @cliConfigRoot, desktop_data_dir = @desktopDataDir
    WHERE id = @id`);
  const disable = db.prepare('UPDATE account_profiles SET enabled = 0 WHERE id = ?');

  return {
    list: () => (list.all() as ProfileRow[]).map(toProfile),
    get: (id) => {
      const row = get.get(id) as ProfileRow | undefined;
      return row && toProfile(row);
    },
    insert: (profile) => {
      insert.run(profile);
    },
    update: (profile) => {
      update.run(profile);
    },
    remove: (id) => {
      disable.run(id);
    },
  };
}

function permissionRepository(db: SqliteDatabase): PermissionRepository {
  const get = db.prepare('SELECT allowed FROM project_profile_permissions WHERE project_id = ? AND profile_id = ?');
  const set = db.prepare(`
    INSERT INTO project_profile_permissions (project_id, profile_id, allowed) VALUES (?, ?, ?)
    ON CONFLICT(project_id, profile_id) DO UPDATE SET allowed = excluded.allowed`);
  return {
    get: (projectId, profileId) => {
      const row = get.get(projectId, profileId) as { allowed: number } | undefined;
      return row === undefined ? undefined : row.allowed === 1;
    },
    set: (projectId, profileId, allowed) => {
      set.run(projectId, profileId, allowed ? 1 : 0);
    },
  };
}

interface LaunchRow {
  id: string;
  task_id: string;
  profile_id: string;
  mode: ClientMode;
  status: LaunchStatus;
  error_code: string | null;
  outcome: string | null;
  account_confirmed_at: string | null;
  created_at: string;
}

const toLaunch = (row: LaunchRow): LaunchAttempt => ({
  id: row.id,
  taskId: row.task_id,
  profileId: row.profile_id,
  mode: row.mode,
  status: row.status,
  errorCode: row.error_code,
  outcome: row.outcome === null ? null : (JSON.parse(row.outcome) as LaunchOutcome),
  accountConfirmedAt: row.account_confirmed_at,
  createdAt: row.created_at,
});

function launchRepository(db: SqliteDatabase): LaunchRepository {
  const list = db.prepare('SELECT * FROM launch_attempts WHERE task_id = ? ORDER BY created_at DESC, id LIMIT 50');
  const get = db.prepare('SELECT * FROM launch_attempts WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO launch_attempts (id, task_id, profile_id, mode, status, created_at)
    VALUES (@id, @taskId, @profileId, @mode, @status, @createdAt)`);
  const finish = db.prepare('UPDATE launch_attempts SET status = ?, error_code = ?, outcome = ? WHERE id = ?');
  const confirm = db.prepare('UPDATE launch_attempts SET account_confirmed_at = ? WHERE id = ?');

  return {
    list: (taskId) => (list.all(taskId) as LaunchRow[]).map(toLaunch),
    get: (id) => {
      const row = get.get(id) as LaunchRow | undefined;
      return row && toLaunch(row);
    },
    insert: (attempt) => {
      insert.run(attempt);
    },
    finish: (id, status, errorCode, outcome) => {
      finish.run(status, errorCode, outcome === null ? null : JSON.stringify(outcome), id);
    },
    confirmAccount: (id, at) => {
      confirm.run(at, id);
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
    profiles: profileRepository(db),
    permissions: permissionRepository(db),
    launches: launchRepository(db),
    status: () => ({ engineVersion, schemaVersion: schemaVersion(db) }),
    close: () => {
      db.close();
    },
  };
}
