import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { Provider } from '@agenthub/domain';
import Database from 'better-sqlite3';

// Fallback transcript (ADR-019 item 10, SPIKE-15): find the newest session a provider recorded for
// a project folder, reading only what locates it (cwd, path, time). Never the conversation:
// for Codex only the locating columns of `threads`, for Claude only the first line with `cwd`.

export interface SessionLocation {
  path: string;
  cwd: string;
  updatedAt: string;
}

// Compare in NFC: macOS keeps whichever form a name was created with; Claude writes NFC, Codex NFD.
const norm = (path: string): string => resolve(path).normalize('NFC');

function within(cwd: unknown, folder: string): boolean {
  if (typeof cwd !== 'string') return false;
  const value = norm(cwd);
  return value === folder || value.startsWith(folder + sep);
}

// Reads lines from the start until `pick` returns a value. The first line of a Codex rollout holds
// its base instructions (about 100 KB), so the read is capped.
function firstLineWith<T>(file: string, pick: (entry: Record<string, unknown>) => T | undefined, maxBytes = 1024 * 1024): T | undefined {
  let descriptor: number;
  try {
    descriptor = openSync(file, 'r');
  } catch {
    return undefined;
  }
  try {
    const chunk = Buffer.alloc(64 * 1024);
    let pending = Buffer.alloc(0);
    let offset = 0;
    while (offset < maxBytes) {
      const read = readSync(descriptor, chunk, 0, chunk.length, offset);
      if (read === 0) break;
      offset += read;
      pending = Buffer.concat([pending, chunk.subarray(0, read)]);
      let newline = pending.indexOf(10);
      while (newline >= 0) {
        const line = pending.subarray(0, newline).toString('utf8');
        pending = pending.subarray(newline + 1);
        newline = pending.indexOf(10);
        if (!line) continue;
        try {
          const value = pick(JSON.parse(line) as Record<string, unknown>);
          if (value !== undefined) return value;
        } catch {
          // A partial or non-JSON line.
        }
      }
    }
    return undefined;
  } finally {
    closeSync(descriptor);
  }
}

const listDir = (path: string): string[] => {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
};

// Claude names a project directory after its cwd with every non-alphanumeric character as "-",
// cuts long names and adds a hash, so two folders can share a name: match by prefix, check cwd.
const encodeClaude = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-');

function newestClaude(configRoot: string, folder: string): SessionLocation | null {
  const projects = join(configRoot, 'projects');
  const prefixes = [folder, folder.normalize('NFD')].map((form) => encodeClaude(form).slice(0, 100));
  let best: SessionLocation | null = null;
  for (const dir of listDir(projects).filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))) {
    const full = join(projects, dir);
    // Only top-level *.jsonl are sessions; subagent transcripts sit in <session>/subagents/.
    for (const name of listDir(full).filter((entry) => entry.endsWith('.jsonl'))) {
      const file = join(full, name);
      const cwd = firstLineWith(file, (entry) => (typeof entry['cwd'] === 'string' ? entry['cwd'] : undefined));
      if (!within(cwd, folder)) continue;
      const updatedAt = statSync(file).mtime.toISOString();
      if (!best || updatedAt > best.updatedAt) best = { path: file, cwd: cwd as string, updatedAt };
    }
  }
  return best;
}

interface ThreadRow {
  rollout_path: string;
  cwd: string;
  updated_at_ms: number;
}

// The index's file name carries a version (state_5.sqlite); null when it is missing or changed.
function newestCodexFromIndex(home: string, folder: string): SessionLocation | null | undefined {
  const index = listDir(home)
    .filter((name) => /^state_\d+\.sqlite$/.test(name))
    .sort((a, b) => Number(/\d+/.exec(b)?.[0]) - Number(/\d+/.exec(a)?.[0]))[0];
  if (!index) return undefined;
  let db: Database.Database;
  try {
    db = new Database(join(home, index), { readonly: true, fileMustExist: true });
  } catch {
    return undefined;
  }
  try {
    // Only locating columns: title, preview and first_user_message hold conversation text.
    const forms = [folder, folder.normalize('NFD')];
    const rows = db
      .prepare(
        `SELECT rollout_path, cwd, updated_at_ms FROM threads
         WHERE archived = 0 AND (cwd = ? OR cwd = ? OR cwd LIKE ? OR cwd LIKE ?)
         ORDER BY updated_at_ms DESC LIMIT 20`,
      )
      .all(forms[0], forms[1], `${forms[0]}/%`, `${forms[1]}/%`) as ThreadRow[];
    const row = rows.find((candidate) => within(candidate.cwd, folder) && existsSync(candidate.rollout_path));
    return row ? { path: row.rollout_path, cwd: row.cwd, updatedAt: new Date(row.updated_at_ms).toISOString() } : null;
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}

const SCAN_LIMIT = 400;

// Fallback: the newest rollout files first (sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl).
function newestCodexByScan(home: string, folder: string): SessionLocation | null {
  const files: string[] = [];
  const sessions = join(home, 'sessions');
  const descending = (path: string) => listDir(path).sort().reverse();
  outer: for (const year of descending(sessions)) {
    for (const month of descending(join(sessions, year))) {
      for (const day of descending(join(sessions, year, month))) {
        for (const name of descending(join(sessions, year, month, day))) {
          if (name.startsWith('rollout-') && name.endsWith('.jsonl')) files.push(join(sessions, year, month, day, name));
          if (files.length >= SCAN_LIMIT) break outer;
        }
      }
    }
  }
  let best: SessionLocation | null = null;
  for (const file of files) {
    const cwd = firstLineWith(file, (entry) => {
      if (entry['type'] !== 'session_meta') return undefined;
      const payload = entry['payload'] as { cwd?: unknown } | undefined;
      return typeof payload?.cwd === 'string' ? payload.cwd : '';
    });
    if (!within(cwd, folder)) continue;
    const updatedAt = statSync(file).mtime.toISOString();
    if (!best || updatedAt > best.updatedAt) best = { path: file, cwd: cwd as string, updatedAt };
  }
  return best;
}

// configRoot null means the provider's default folder (~/.claude, ~/.codex).
export function newestSession(provider: Provider, configRoot: string | null, folder: string, home = homedir()): SessionLocation | null {
  const target = norm(folder);
  if (provider === 'claude') return newestClaude(configRoot ?? join(home, '.claude'), target);
  const codexHome = configRoot ?? join(home, '.codex');
  const indexed = newestCodexFromIndex(codexHome, target);
  return indexed === undefined ? newestCodexByScan(codexHome, target) : indexed;
}
