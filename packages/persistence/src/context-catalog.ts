import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type SkillPresence, skillsDirectoryParts } from '@agenthub/application';
import { type ContextLanguage, DomainError, type Provider, raw } from '@agenthub/domain';
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
  // The project's own folder on this device (project_locations.absolute_path), for matching an
  // agent's working directory (ADR-028 item 3).
  root: string;
  folder: string;
  handoffs: string;
}

interface Row {
  id: string;
  name: string;
  context_language: ContextLanguage;
  context_enabled: number;
  context_path: string | null;
  absolute_path: string;
}

// Opens the database read-only and checks it is recent enough; the caller closes it.
function openCatalog(dataDirectory: string): { db: Database.Database; version: number } {
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
    return { db, version };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function contextProjectsFor(dataDirectory: string, profileId: string): ContextProjectEntry[] {
  const { db } = openCatalog(dataDirectory);
  try {
    const device = db.prepare("SELECT value FROM settings WHERE key = 'device_id'").get() as { value: string } | undefined;
    if (!device) return [];
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.context_language, p.context_enabled, l.context_path, l.absolute_path
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
      root: row.absolute_path,
      folder: row.context_path ?? defaultContextFolder(dataDirectory, row.id),
      handoffs: handoffFolder(dataDirectory, row.id),
    }));
  } finally {
    db.close();
  }
}

// The account's skill folder as the launcher computes it, and the names of AgentHub's own skills
// (its copies in <userData>/skills, less the ones the user added), for telling an agent which
// skills it lacks (ADR-028 item 7.3). Null when the account is unknown.
export interface AccountSkillsLocation {
  directory: string;
  shared: string;
  builtin: string[];
}

// Matches the skills table of migration 6.
const CUSTOM_SKILLS_SCHEMA = 6;

export function accountSkillsLocation(dataDirectory: string, profileId: string, home: string): AccountSkillsLocation | null {
  const { db, version } = openCatalog(dataDirectory);
  try {
    const profile = db.prepare('SELECT provider, cli_config_root FROM account_profiles WHERE id = ? AND enabled = 1').get(profileId) as
      | { provider: Provider; cli_config_root: string | null }
      | undefined;
    if (!profile) return null;
    const custom = new Set(
      version >= CUSTOM_SKILLS_SCHEMA ? (db.prepare('SELECT name FROM skills').all() as { name: string }[]).map((row) => row.name) : [],
    );
    const shared = join(dataDirectory, 'skills');
    let builtin: string[];
    try {
      builtin = readdirSync(shared, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !custom.has(entry.name) && existsSync(join(shared, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort();
    } catch {
      builtin = [];
    }
    return { directory: join(...skillsDirectoryParts({ provider: profile.provider, cliConfigRoot: profile.cli_config_root }, home)), shared, builtin };
  } finally {
    db.close();
  }
}

// The same test as the skill installer of @agenthub/platform: AgentHub's link is "installed",
// anything else under the name belongs to the user and is "foreign".
export function skillPresence(directory: string, shared: string, name: string): SkillPresence {
  const path = join(directory, name);
  let isLink: boolean;
  try {
    isLink = lstatSync(path).isSymbolicLink();
  } catch {
    return 'missing';
  }
  return isLink && resolve(directory, readlinkSync(path)) === join(shared, name) ? 'installed' : 'foreign';
}
