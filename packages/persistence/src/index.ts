import type { MetadataStore } from '@agenthub/application';
import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  up: string;
}

// The application schema in TDD §6.2 is still a draft; Phase 1 adds it here.
const MIGRATIONS: readonly Migration[] = [];

// Each migration commits on its own, so a failure keeps the versions before it.
export function openMetadataStore(databasePath: string, migrations: readonly Migration[] = MIGRATIONS): MetadataStore {
  const db = new Database(databasePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);

    const currentVersion = (): number =>
      (db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version;
    const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
    const apply = db.transaction((migration: Migration) => {
      db.exec(migration.up);
      record.run(migration.version, new Date().toISOString());
    });

    const pending = [...migrations]
      .filter((migration) => migration.version > currentVersion())
      .sort((a, b) => a.version - b.version);
    for (const migration of pending) apply(migration);

    const engineVersion = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
    return {
      status: () => ({ engineVersion, schemaVersion: currentVersion() }),
      close: () => {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
