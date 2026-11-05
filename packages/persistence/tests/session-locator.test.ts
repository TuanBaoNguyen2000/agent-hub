import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newestSession } from '../src/index';

// Fixtures in the shapes SPIKE-15 observed: Claude projects/<encoded cwd>/<id>.jsonl, Codex
// sessions/YYYY/MM/DD/rollout-*.jsonl with a session_meta first line, and its threads index.
let root: string;
let folder: string;

const encode = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-');

function claudeSession(configRoot: string, cwd: string, name: string, at: string, dirName = encode(cwd)): string {
  const dir = join(configRoot, 'projects', dirName);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.jsonl`);
  writeFileSync(file, `${JSON.stringify({ type: 'summary' })}\n${JSON.stringify({ cwd, sessionId: name, message: 'SECRET content' })}\n`);
  utimesSync(file, new Date(at), new Date(at));
  return file;
}

function codexSession(home: string, cwd: string, name: string, at: string): string {
  const dir = join(home, 'sessions', '2026', '11', '05');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `rollout-${name}.jsonl`);
  writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { cwd, base_instructions: 'x'.repeat(200_000) } })}\n{"type":"message","text":"SECRET"}\n`);
  utimesSync(file, new Date(at), new Date(at));
  return file;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-sessions-'));
  folder = join(root, 'src dự án');
  mkdirSync(folder);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('Claude sessions', () => {
  const config = () => join(root, 'claude-b');

  it('finds the newest session of the folder or a subfolder, and skips a folder whose encoded name collides', () => {
    claudeSession(config(), folder, 'old', '2026-11-04T10:00:00Z');
    const newest = claudeSession(config(), join(folder, 'app'), 'sub', '2026-11-05T10:00:00Z');
    // "src-dự-án" encodes to the same directory name as "src dự án" (SPIKE-15).
    claudeSession(config(), join(root, 'src-dự-án'), 'other', '2026-11-05T12:00:00Z', encode(folder));

    expect(newestSession('claude', config(), folder)).toEqual({ path: newest, cwd: join(folder, 'app'), updatedAt: '2026-11-05T10:00:00.000Z' });
  });

  it('matches a folder named in either Unicode form, and uses ~/.claude for the default account', () => {
    const home = join(root, 'home');
    const file = claudeSession(join(home, '.claude'), folder.normalize('NFC'), 's', '2026-11-05T10:00:00Z');

    expect(newestSession('claude', null, folder.normalize('NFD'), home)?.path).toBe(file);
  });

  it('finds nothing in an account that never worked there', () => {
    expect(newestSession('claude', config(), folder)).toBeNull();
  });
});

describe('Codex sessions', () => {
  const home = () => join(root, 'codex-b');

  it('reads only the locating columns of the threads index, in both Unicode forms', () => {
    const a = codexSession(home(), folder.normalize('NFD'), 'a', '2026-11-05T09:00:00Z');
    const b = codexSession(home(), join(folder, 'app'), 'b', '2026-11-05T08:00:00Z');
    const db = new Database(join(home(), 'state_5.sqlite'));
    db.exec(`CREATE TABLE threads (id TEXT, rollout_path TEXT, cwd TEXT, updated_at_ms INTEGER, archived INTEGER,
      title TEXT, preview TEXT, first_user_message TEXT)`);
    const insert = db.prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insert.run('a', a, folder.normalize('NFD'), Date.parse('2026-11-05T09:00:00Z'), 0, 'SECRET', 'SECRET', 'SECRET');
    insert.run('b', b, join(folder, 'app'), Date.parse('2026-11-05T11:00:00Z'), 0, 'x', 'x', 'x');
    insert.run('c', join(home(), 'gone.jsonl'), folder, Date.parse('2026-11-05T12:00:00Z'), 0, 'x', 'x', 'x');
    insert.run('d', a, folder, Date.parse('2026-11-05T13:00:00Z'), 1, 'x', 'x', 'x');
    db.close();

    // Newest by the index: b (11:00). A missing file and an archived thread are skipped.
    expect(newestSession('codex', home(), folder)).toEqual({ path: b, cwd: join(folder, 'app'), updatedAt: '2026-11-05T11:00:00.000Z' });
  });

  it('falls back to the session_meta line when there is no index', () => {
    codexSession(home(), join(root, 'khác'), 'other', '2026-11-05T12:00:00Z');
    const mine = codexSession(home(), folder, 'mine', '2026-11-05T10:00:00Z');

    expect(newestSession('codex', home(), folder)?.path).toBe(mine);
  });

  it('falls back too when the index has another shape', () => {
    const mine = codexSession(home(), folder, 'mine', '2026-11-05T10:00:00Z');
    const db = new Database(join(home(), 'state_6.sqlite'));
    db.exec('CREATE TABLE something_else (x INTEGER)');
    db.close();

    expect(newestSession('codex', home(), folder)?.path).toBe(mine);
  });
});
