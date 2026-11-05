import type {
  CustomSkill,
  LaunchRepository,
  MetadataStore,
  PermissionRepository,
  ProfileRepository,
  ProfileToolsRepository,
  ProjectRepository,
  SettingsRepository,
  SkillRepository,
  StoredProject,
} from '@agenthub/application';
import { type AccountProfile, type ClientMode, type ContextLanguage, type LaunchAttempt, type LaunchOutcome, type LaunchStatus, type Message, type Project, type Provider, raw } from '@agenthub/domain';
import { isLocale } from '@agenthub/i18n';
import { type SqliteDatabase, openDatabase, schemaVersion } from './database';
import { MIGRATIONS } from './migrations';

export { type SessionLocation, newestSession } from './session-locator';
export { type Note, type NoteWithContent, listNotes, moveNote, readNote, saveNote } from './notes';
export { handoffTime, latestHandoff, readContextOverview, statusBranch, taskStates, workstreamFolders } from './context-overview';
export { MAX_SCANNED_FOLDERS, detectContext, isContextFolder } from './context-detect';
export { conflictingFiles, contextFiles, copyContextFiles } from './context-move';
export { CONTEXT_CATALOG_SCHEMA, type ContextProjectEntry, contextProjectsFor, defaultContextFolder, handoffFolder, looseChatFolder } from './context-catalog';
export { type ContextEntry, MAX_DOCUMENT_BYTES, appendHandoff, insertHandoff, listContext, readContext, sha256, writeContext } from './context-files';

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  context_enabled: number;
  context_language: ContextLanguage;
  chat_language: string | null;
  absolute_path: string | null;
  context_path: string | null;
  context_detected_at: string | null;
}

type Location = { id: string; deviceId: string; path: string };

const toProject = (row: ProjectRow): StoredProject => ({
  id: row.id,
  name: row.name,
  context: { enabled: row.context_enabled === 1, language: row.context_language },
  chatLanguage: isLocale(row.chat_language) ? row.chat_language : null,
  path: row.absolute_path,
  contextPath: row.context_path,
  contextDetectedAt: row.context_detected_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function projectRepository(db: SqliteDatabase): ProjectRepository {
  const select = `
    SELECT p.id, p.name, p.created_at, p.updated_at, p.context_enabled, p.context_language, p.chat_language, l.absolute_path, l.context_path, l.context_detected_at
    FROM projects p
    LEFT JOIN project_locations l ON l.project_id = p.id AND l.device_id = @deviceId
    WHERE p.removed_at IS NULL`;
  const listActive = db.prepare(`${select} ORDER BY p.name COLLATE NOCASE`);
  const getOne = db.prepare(`${select} AND p.id = @id`);
  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, context_enabled, context_language, created_at, updated_at)
    VALUES (@id, @name, @contextEnabled, @contextLanguage, @createdAt, @updatedAt)`);
  const upsertLocation = db.prepare(`
    INSERT INTO project_locations (id, project_id, device_id, absolute_path)
    VALUES (@id, @projectId, @deviceId, @path)
    ON CONFLICT(project_id, device_id) DO UPDATE SET
      absolute_path = excluded.absolute_path,
      -- Another folder may hold other documents, so it is searched again.
      context_detected_at = CASE WHEN project_locations.absolute_path = excluded.absolute_path THEN project_locations.context_detected_at END`);
  const touch = db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?');
  const rename = db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?');
  const updateContext = db.prepare(
    'UPDATE projects SET context_enabled = @enabled, context_language = @language, updated_at = @updatedAt WHERE id = @id',
  );
  const updateContextPath = db.prepare('UPDATE project_locations SET context_path = ? WHERE project_id = ? AND device_id = ?');
  const markDetected = db.prepare('UPDATE project_locations SET context_detected_at = ? WHERE project_id = ? AND device_id = ?');
  const updateChatLanguage = db.prepare('UPDATE projects SET chat_language = ?, updated_at = ? WHERE id = ?');
  const markRemoved = db.prepare('UPDATE projects SET removed_at = ?, updated_at = ? WHERE id = ?');

  const insert = db.transaction((project: Project, location: Location) => {
    insertProject.run({
      id: project.id,
      name: project.name,
      contextEnabled: project.context.enabled ? 1 : 0,
      contextLanguage: project.context.language,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    upsertLocation.run({ ...location, projectId: project.id });
  });
  const setContext = db.transaction(
    (id: string, deviceId: string, context: Project['context'], contextPath: string | null, updatedAt: string) => {
      updateContext.run({ id, enabled: context.enabled ? 1 : 0, language: context.language, updatedAt });
      updateContextPath.run(contextPath, id, deviceId);
    },
  );
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
    setContext: (id, deviceId, context, contextPath, updatedAt) => {
      setContext(id, deviceId, context, contextPath, updatedAt);
    },
    setChatLanguage: (id, language, updatedAt) => {
      updateChatLanguage.run(language, updatedAt, id);
    },
    markContextDetected: (id, deviceId, at) => {
      markDetected.run(at, id, deviceId);
    },
    markRemoved: (id, removedAt) => {
      markRemoved.run(removedAt, removedAt, id);
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
  project_id: string;
  task_ref: string | null;
  profile_id: string;
  mode: ClientMode;
  status: LaunchStatus;
  error_code: string | null;
  outcome: string | null;
  account_confirmed_at: string | null;
  created_at: string;
}

// Launches recorded before ADR-020 item 6 kept their texts in Vietnamese; they are shown as they were.
type StoredText = string | Message;
const asMessage = (text: StoredText): Message => (typeof text === 'string' ? raw(text) : text);

function readOutcome(json: string): LaunchOutcome {
  const stored = JSON.parse(json) as Omit<LaunchOutcome, 'userActionRequired' | 'warnings'> & { userActionRequired: StoredText[]; warnings: StoredText[] };
  return { ...stored, userActionRequired: (stored.userActionRequired ?? []).map(asMessage), warnings: (stored.warnings ?? []).map(asMessage) };
}

const toLaunch = (row: LaunchRow): LaunchAttempt => ({
  id: row.id,
  projectId: row.project_id,
  taskRef: row.task_ref,
  profileId: row.profile_id,
  mode: row.mode,
  status: row.status,
  errorCode: row.error_code,
  outcome: row.outcome === null ? null : readOutcome(row.outcome),
  accountConfirmedAt: row.account_confirmed_at,
  createdAt: row.created_at,
});

function launchRepository(db: SqliteDatabase): LaunchRepository {
  const list = db.prepare('SELECT * FROM launch_attempts WHERE project_id = ? ORDER BY created_at DESC, id LIMIT 50');
  const get = db.prepare('SELECT * FROM launch_attempts WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO launch_attempts (id, project_id, task_ref, profile_id, mode, status, created_at)
    VALUES (@id, @projectId, @taskRef, @profileId, @mode, @status, @createdAt)`);
  const finish = db.prepare('UPDATE launch_attempts SET status = ?, error_code = ?, outcome = ? WHERE id = ?');
  const confirm = db.prepare('UPDATE launch_attempts SET account_confirmed_at = ? WHERE id = ?');

  return {
    list: (projectId) => (list.all(projectId) as LaunchRow[]).map(toLaunch),
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

interface SkillRow {
  id: string;
  name: string;
  source_path: string;
  added_at: string;
}

function skillRepository(db: SqliteDatabase): SkillRepository {
  const list = db.prepare('SELECT * FROM skills ORDER BY name');
  const insert = db.prepare('INSERT INTO skills (id, name, source_path, added_at) VALUES (@id, @name, @sourcePath, @addedAt)');
  const remove = db.prepare('DELETE FROM skills WHERE name = ?');
  return {
    list: () =>
      (list.all() as SkillRow[]).map((row): CustomSkill => ({ id: row.id, name: row.name, sourcePath: row.source_path, addedAt: row.added_at })),
    insert: (skill) => {
      insert.run(skill);
    },
    remove: (name) => {
      remove.run(name);
    },
  };
}

function profileToolsRepository(db: SqliteDatabase): ProfileToolsRepository {
  const get = db.prepare('SELECT auto_install FROM profile_tools WHERE profile_id = ?');
  const set = db.prepare(`
    INSERT INTO profile_tools (profile_id, auto_install) VALUES (?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET auto_install = excluded.auto_install`);
  return {
    autoInstall: (profileId) => {
      const row = get.get(profileId) as { auto_install: number } | undefined;
      return row === undefined ? undefined : row.auto_install === 1;
    },
    setAutoInstall: (profileId, on) => {
      set.run(profileId, on ? 1 : 0);
    },
  };
}

export function openMetadataStore(databasePath: string, options: { backupDirectory?: string } = {}): MetadataStore {
  const db = openDatabase(databasePath, MIGRATIONS, options.backupDirectory);
  const engineVersion = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
  return {
    projects: projectRepository(db),
    settings: settingsRepository(db),
    profiles: profileRepository(db),
    permissions: permissionRepository(db),
    launches: launchRepository(db),
    skills: skillRepository(db),
    profileTools: profileToolsRepository(db),
    status: () => ({ engineVersion, schemaVersion: schemaVersion(db) }),
    close: () => {
      db.close();
    },
  };
}
