import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DomainError, raw } from '@agenthub/domain';

// Files agents read and write in a project's context folder (ADR-019). Every path is relative to
// that folder and must stay inside it, through symlinks too. Only Markdown is ever written.

export const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_LISTED = 1000;

export const sha256 = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex');

const invalid = (message: string): DomainError => new DomainError('VALIDATION_FAILED', raw(message));

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

// Resolves an existing path or the place a new one would go, checked against the real root.
function resolveInside(root: string, relativePath: string): { path: string; realRoot: string } {
  if (typeof relativePath !== 'string' || relativePath.includes('\0') || isAbsolute(relativePath)) {
    throw invalid('Path must be relative to the context folder.');
  }
  const segments = relativePath.split(/[\\/]/).filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..')) throw invalid('Path is outside the context folder.');
  if (segments.some((segment) => segment.startsWith('.'))) throw invalid('Hidden files are not context documents.');

  const realRoot = realpathSync(root);
  const target = resolve(realRoot, ...segments);
  // The nearest part that exists decides where the path really leads.
  let existing = target;
  while (!existsSync(existing) && existing !== realRoot) existing = dirname(existing);
  const real = realpathSync(existing);
  if (!isWithin(real, realRoot)) throw invalid('Path is outside the context folder.');
  return { path: existing === target ? real : join(real, relative(existing, target)), realRoot };
}

function readText(path: string): string {
  if (statSync(path).size > MAX_DOCUMENT_BYTES) throw invalid('Document is larger than 1 MB.');
  return readFileSync(path, 'utf8');
}

function writeAtomically(path: string, content: string): void {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    const descriptor = openSync(temporary, 'wx', 0o600);
    try {
      writeSync(descriptor, content, null, 'utf8');
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function requireMarkdown(relativePath: string, content: string): void {
  if (!/\.md$/i.test(relativePath)) throw invalid('Only Markdown (.md) documents can be written.');
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) throw invalid('Document is larger than 1 MB.');
}

export interface ContextEntry {
  path: string;
  kind: 'file' | 'folder';
}

// Newest entry first, right under the "Handoff log" heading (TDD §7.2).
export function insertHandoff(document: string, entry: string): string {
  const block = `${entry.trim()}\n`;
  const heading = /^(#{1,6})[ \t]+Handoff log(?:[ \t]*(?:\([^)\n]*\)|[-–—:][^\n]*))?[ \t]*$/im.exec(document);
  if (!heading) {
    const base = document.replace(/\s*$/, '');
    return `${base}${base === '' ? '' : '\n\n'}## Handoff log\n\n${block}`;
  }
  const afterHeading = heading.index + heading[0].length;
  const rest = document.slice(afterHeading).replace(/^[ \t]*\n(?:[ \t]*\n)*/, '');
  return `${document.slice(0, afterHeading)}\n\n${block}${rest === '' ? '' : `\n${rest}`}`;
}

export function listContext(root: string, relativePath = ''): ContextEntry[] {
  const { path, realRoot } = resolveInside(root, relativePath);
  if (!existsSync(path)) throw new DomainError('NOT_FOUND', raw('No such folder in the context documents.'));
  const entries: ContextEntry[] = [];
  const walk = (folder: string): void => {
    for (const item of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('.') || entries.length >= MAX_LISTED) continue;
      const full = join(folder, item.name);
      const shown = relative(realRoot, full).split(sep).join('/');
      if (item.isDirectory()) {
        entries.push({ path: `${shown}/`, kind: 'folder' });
        walk(full);
      } else if (item.isFile()) {
        entries.push({ path: shown, kind: 'file' });
      }
    }
  };
  walk(path);
  return entries;
}

export function readContext(root: string, relativePath: string): { content: string; sha256: string } {
  const { path } = resolveInside(root, relativePath);
  if (!existsSync(path) || !statSync(path).isFile()) throw new DomainError('NOT_FOUND', raw(`No document at ${relativePath}.`));
  const content = readText(path);
  return { content, sha256: sha256(content) };
}

// baseSha256 is the checksum of the version the caller read; null only for a new document.
export function writeContext(root: string, relativePath: string, content: string, baseSha256: string | null): { sha256: string } {
  requireMarkdown(relativePath, content);
  const { path } = resolveInside(root, relativePath);
  const current = existsSync(path) ? sha256(readText(path)) : null;
  if (current !== baseSha256) {
    throw new DomainError(
      'CONTEXT_CONFLICT',
      raw(
        current === null
          ? `${relativePath} does not exist; write it without base_sha256.`
          : `${relativePath} changed since it was read (or base_sha256 is missing). Read it again and merge.`,
      ),
    );
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeAtomically(path, content);
  return { sha256: sha256(content) };
}

// Merges with whatever is on disk, so two agents adding entries never lose one.
export function appendHandoff(root: string, relativePath: string, entry: string): { sha256: string } {
  if (entry.trim() === '') throw invalid('The handoff entry is empty.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = (() => {
      try {
        return readContext(root, relativePath);
      } catch (error) {
        if (error instanceof DomainError && error.code === 'NOT_FOUND') return null;
        throw error;
      }
    })();
    const updated = insertHandoff(existing?.content ?? '', entry);
    try {
      return writeContext(root, relativePath, updated, existing?.sha256 ?? null);
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'CONTEXT_CONFLICT')) throw error;
    }
  }
  throw new DomainError('CONTEXT_CONFLICT', raw(`${relativePath} kept changing; try again.`));
}

// An empty folder inside the documents, such as a workstream's Tasks/ (ADR-023 item 2).
export function makeContextFolder(root: string, relativePath: string): void {
  const { path } = resolveInside(root, relativePath);
  mkdirSync(path, { recursive: true, mode: 0o700 });
}
