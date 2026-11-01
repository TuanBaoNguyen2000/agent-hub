export interface Migration {
  version: number;
  up: string;
}

// Tables for profiles, checkpoints, handoffs and launches arrive with Phases 2 and 3.
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
];
