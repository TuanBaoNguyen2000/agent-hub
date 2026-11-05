import { join } from 'node:path';
import { type ContextLanguage, DomainError, raw } from '@agenthub/domain';
import Database from 'better-sqlite3';

// What the MCP server may show one account (ADR-019 item 6, FR-016): the projects this account
// is allowed to use, with or without context documents. The server runs without the app, so it reads
// AgentHub's database read-only and never migrates it.

export const CONTEXT_CATALOG_SCHEMA = 4;

// TDD §6.3; the app and the MCP server must agree on it.
export const defaultContextFolder = (dataDirectory: string, projectId: string): string =>
  join(dataDirectory, 'projects', projectId, 'context');

// Handoffs of a project without context documents, and chats that belong to no project (§6.3).
export const handoffFolder = (dataDirectory: string, projectId: string): string => join(dataDirectory, 'projects', projectId, 'handoffs');
export const looseChatFolder = (dataDirectory: string): string => join(dataDirectory, 'loose-chats');

export interface ContextProjectEntry {
  id: string;
  name: string;
  language: ContextLanguage;
  // false: no context documents; the project keeps short handoffs instead (§7.5).
  documents: boolean;
  folder: string;
  handoffs: string;
}

interface Row {
  id: string;
  name: string;
  context_language: ContextLanguage;
  context_enabled: number;
  context_path: string | null;
}

export function contextProjectsFor(dataDirectory: string, profileId: string): ContextProjectEntry[] {
  let db: Database.Database;
  try {
    db = new Database(join(dataDirectory, 'agenthub.sqlite'), { readonly: true, fileMustExist: true });
  } catch {
    throw new DomainError('NOT_FOUND', raw('AgentHub has no data yet. Open AgentHub once.'));
  }
  try {
    const { version } = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number };
    if (version < CONTEXT_CATALOG_SCHEMA) {
      throw new DomainError('UNEXPECTED', raw('AgentHub data is from an older version. Open AgentHub once to update it.'));
    }
    const device = db.prepare("SELECT value FROM settings WHERE key = 'device_id'").get() as { value: string } | undefined;
    if (!device) return [];
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.context_language, p.context_enabled, l.context_path
         FROM projects p
         JOIN project_locations l ON l.project_id = p.id AND l.device_id = @device
         JOIN project_profile_permissions pp ON pp.project_id = p.id AND pp.profile_id = @profile AND pp.allowed = 1
         JOIN account_profiles a ON a.id = pp.profile_id AND a.enabled = 1
         WHERE p.removed_at IS NULL
         ORDER BY p.name COLLATE NOCASE`,
      )
      .all({ device: device.value, profile: profileId }) as Row[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.context_language,
      documents: row.context_enabled === 1,
      folder: row.context_path ?? defaultContextFolder(dataDirectory, row.id),
      handoffs: handoffFolder(dataDirectory, row.id),
    }));
  } finally {
    db.close();
  }
}
