export interface Migration {
  version: number;
  up: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        removed_at TEXT
      );

      CREATE TABLE project_locations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        device_id TEXT NOT NULL,
        absolute_path TEXT NOT NULL,
        UNIQUE(project_id, device_id)
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        acceptance_criteria TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN
          ('backlog','active','blocked','in_review','done','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX tasks_project_id ON tasks(project_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE account_profiles (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
        alias TEXT NOT NULL,
        cli_config_root TEXT,
        desktop_data_dir TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE project_profile_permissions (
        project_id TEXT NOT NULL REFERENCES projects(id),
        profile_id TEXT NOT NULL REFERENCES account_profiles(id),
        allowed INTEGER NOT NULL,
        PRIMARY KEY(project_id, profile_id)
      );

      CREATE TABLE launch_attempts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        profile_id TEXT NOT NULL REFERENCES account_profiles(id),
        mode TEXT NOT NULL CHECK(mode IN ('desktop','cli')),
        status TEXT NOT NULL CHECK(status IN ('planned','launched','manual_step','failed')),
        error_code TEXT,
        outcome TEXT,
        account_confirmed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX launch_attempts_task_created ON launch_attempts(task_id, created_at);
    `,
  },
  {
    // Names AgentHub made up give way to the account's email (ADR-018); nicknames stay.
    version: 3,
    up: `
      ALTER TABLE account_profiles ADD COLUMN account_email TEXT;

      UPDATE account_profiles SET alias = ''
      WHERE (provider = 'claude' AND (alias = 'Claude' OR alias GLOB 'Claude [0-9]' OR alias GLOB 'Claude [0-9][0-9]'))
         OR (provider = 'codex' AND (alias = 'Codex' OR alias GLOB 'Codex [0-9]' OR alias GLOB 'Codex [0-9][0-9]'));
    `,
  },
  {
    // ADR-019: AgentHub keeps no tasks. Phase 1 tasks only held test data; the database is
    // backed up before this runs. Launches move to their task's project, and context
    // documents get per-project settings. The old artifacts/ folder is left on disk.
    version: 4,
    up: `
      ALTER TABLE projects ADD COLUMN context_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE projects ADD COLUMN context_language TEXT NOT NULL DEFAULT 'en';
      -- A folder chosen on this device; null means the default inside AgentHub's data.
      ALTER TABLE project_locations ADD COLUMN context_path TEXT;

      CREATE TABLE launch_attempts_v4 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        task_ref TEXT,
        profile_id TEXT NOT NULL REFERENCES account_profiles(id),
        mode TEXT NOT NULL CHECK(mode IN ('desktop','cli')),
        status TEXT NOT NULL CHECK(status IN ('planned','launched','manual_step','failed')),
        error_code TEXT,
        outcome TEXT,
        account_confirmed_at TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO launch_attempts_v4
        (id, project_id, task_ref, profile_id, mode, status, error_code, outcome, account_confirmed_at, created_at)
      SELECT l.id, t.project_id, NULL, l.profile_id, l.mode, l.status, l.error_code, l.outcome, l.account_confirmed_at, l.created_at
      FROM launch_attempts l JOIN tasks t ON t.id = l.task_id;

      DROP TABLE launch_attempts;
      ALTER TABLE launch_attempts_v4 RENAME TO launch_attempts;
      CREATE INDEX launch_attempts_project_created ON launch_attempts(project_id, created_at);

      DROP TABLE tasks;
    `,
  },
];
