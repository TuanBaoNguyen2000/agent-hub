export interface Migration {
  version: number;
  up: string;
}

// Tables for checkpoints and handoffs arrive with Phase 3.
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
];
