#!/usr/bin/env node
// SPIKE-15: find the newest session of a project folder for one account, reading only what is
// needed to locate it (cwd, path, time), never the conversation.
//
//   node locate.mjs claude <CLAUDE_CONFIG_DIR> <folder> [--subfolders]
//   node locate.mjs codex-db <CODEX_HOME> <folder> [--subfolders]
//   node locate.mjs codex-scan <CODEX_HOME> <folder> [--subfolders]
//
// Prints JSON: { method, ms, candidates: [{ path, cwd, updatedAt, ... }] } newest first.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [mode, root, folderArg, ...flags] = process.argv.slice(2);
if (!mode || !root || !folderArg) {
  console.error('Usage: locate.mjs claude|codex-db|codex-scan <account dir> <folder> [--subfolders]');
  process.exit(2);
}
const subfolders = flags.includes('--subfolders');
// Compare folders in NFC: macOS keeps whatever form a name was created with, and the same folder
// can be reached through both forms.
const norm = (p) => path.resolve(p).normalize('NFC');
const folder = norm(folderArg);
const matches = (cwd) => {
  if (typeof cwd !== 'string') return false;
  const c = norm(cwd);
  return c === folder || (subfolders && c.startsWith(folder + path.sep));
};

// Reads from the start of a file until `done(line)` returns a value, without loading the whole
// file. Lines can be large (Codex puts the base instructions in its first line), so cap the read.
function firstLineWith(file, pick, maxBytes = 4 * 1024 * 1024) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    let rest = Buffer.alloc(0);
    let read = 0;
    while (read < maxBytes) {
      const n = fs.readSync(fd, buf, 0, buf.length, read);
      if (n === 0) break;
      read += n;
      rest = Buffer.concat([rest, buf.subarray(0, n)]);
      let nl;
      while ((nl = rest.indexOf(10)) >= 0) {
        const line = rest.subarray(0, nl).toString('utf8');
        rest = rest.subarray(nl + 1);
        if (!line) continue;
        try {
          const value = pick(JSON.parse(line));
          if (value !== undefined) return value;
        } catch { /* partial or non-JSON line */ }
      }
    }
    return undefined;
  } finally {
    fs.closeSync(fd);
  }
}

// Claude Code names a project directory after its cwd with every non-alphanumeric character
// replaced by "-". Long names are cut and given a suffix, so match by prefix, then check `cwd`.
const encodeClaude = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

function locateClaude() {
  const projects = path.join(root, 'projects');
  const wanted = [folder, folder.normalize('NFD')].map(encodeClaude);
  const prefix = wanted.map((w) => w.slice(0, 100));
  const dirs = fs.readdirSync(projects).filter((name) => prefix.some((p) => name.startsWith(p)));
  const out = [];
  for (const dir of dirs) {
    const full = path.join(projects, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    // Only top-level *.jsonl are sessions; subagent transcripts live in <session>/subagents/.
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(full, name);
      const meta = firstLineWith(file, (e) => (typeof e.cwd === 'string' ? { cwd: e.cwd, entrypoint: e.entrypoint, sessionId: e.sessionId } : undefined));
      if (!meta || !matches(meta.cwd)) continue;
      const stat = fs.statSync(file);
      out.push({ path: file, cwd: meta.cwd, sessionId: meta.sessionId, entrypoint: meta.entrypoint, updatedAt: stat.mtime.toISOString(), bytes: stat.size, projectDir: dir, exactDirName: wanted.includes(dir) });
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function locateCodexDb() {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database(path.join(root, 'state_5.sqlite'), { readonly: true, fileMustExist: true });
  try {
    // Only locating columns; title, preview and first_user_message hold conversation text.
    const rows = db.prepare(`SELECT id, rollout_path, cwd, updated_at_ms, source, originator, archived
      FROM threads WHERE archived = 0 AND (cwd = ? OR cwd = ? OR (? AND (cwd LIKE ? OR cwd LIKE ?)))
      ORDER BY updated_at_ms DESC LIMIT 20`)
      .all(folder, folder.normalize('NFD'), subfolders ? 1 : 0, folder + '/%', folder.normalize('NFD') + '/%');
    return rows.filter((r) => matches(r.cwd)).map((r) => {
      const exists = fs.existsSync(r.rollout_path);
      return { path: r.rollout_path, cwd: r.cwd, threadId: r.id, source: r.source, originator: r.originator, updatedAt: new Date(r.updated_at_ms).toISOString(), fileExists: exists, fileMtime: exists ? fs.statSync(r.rollout_path).mtime.toISOString() : null };
    });
  } finally {
    db.close();
  }
}

function locateCodexScan() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        const meta = firstLineWith(full, (e) => (e.type === 'session_meta' ? { cwd: e.payload?.cwd, id: e.payload?.id, originator: e.payload?.originator } : undefined));
        if (!meta || !matches(meta.cwd)) continue;
        const stat = fs.statSync(full);
        out.push({ path: full, cwd: meta.cwd, threadId: meta.id, originator: meta.originator, updatedAt: stat.mtime.toISOString(), bytes: stat.size });
      }
    }
  };
  walk(path.join(root, 'sessions'));
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const started = process.hrtime.bigint();
const candidates = mode === 'claude' ? locateClaude() : mode === 'codex-db' ? locateCodexDb() : mode === 'codex-scan' ? locateCodexScan() : null;
if (!candidates) { console.error(`unknown mode ${mode}`); process.exit(2); }
const ms = Number(process.hrtime.bigint() - started) / 1e6;
console.log(JSON.stringify({ method: mode, ms: Math.round(ms), count: candidates.length, candidates: candidates.slice(0, 5) }, null, 2));
