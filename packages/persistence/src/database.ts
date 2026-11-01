import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DomainError } from '@agenthub/domain';
import Database from 'better-sqlite3';
import type { Migration } from './migrations';

export type SqliteDatabase = Database.Database;

export function schemaVersion(db: SqliteDatabase): number {
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number };
  return row.version;
}

// Each migration commits on its own, so a failure keeps the versions before it.
function migrate(db: SqliteDatabase, migrations: readonly Migration[], backupDirectory?: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const current = schemaVersion(db);

  const newest = Math.max(0, ...migrations.map((migration) => migration.version));
  if (current > newest) {
    throw new DomainError(
      'UNEXPECTED',
      `Database có schema ${current}, mới hơn bản app này (${newest}). Hãy cập nhật AgentHub; dữ liệu chưa bị thay đổi.`,
    );
  }

  const pending = migrations
    .filter((migration) => migration.version > current)
    .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return;

  if (current > 0 && backupDirectory) {
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    db.prepare('VACUUM INTO ?').run(join(backupDirectory, `agenthub-schema-${current}-${stamp}.sqlite`));
  }

  const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
  const apply = db.transaction((migration: Migration) => {
    db.exec(migration.up);
    record.run(migration.version, new Date().toISOString());
  });
  for (const migration of pending) apply(migration);
}

export function openDatabase(path: string, migrations: readonly Migration[], backupDirectory?: string): SqliteDatabase {
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db, migrations, backupDirectory);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
