import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DomainError, raw } from '@agenthub/domain';
import { MAX_DOCUMENT_BYTES, writeContext } from './context-files';

// Short Markdown notes AgentHub keeps itself (TDD §6.3, §7.5): the handoffs of a project without
// context documents, and loose chats that belong to no project yet. One file per note, never
// rewritten; the id is the file name, so the newest sorts last.

export interface Note {
  id: string;
  title: string;
  createdAt: string;
  // Who saved it, as the saver said: an MCP client, or the app when the user pasted it.
  source: string;
}

export type NoteWithContent = Note & { content: string };

// UTC to the millisecond, so notes saved within the same second still sort in order.
const ID = /^\d{8}T\d{9}Z-[0-9a-f]{6}(?:-[a-z0-9-]{1,48})?$/;
const MAX_TITLE = 200;

const slug = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

function requireId(id: string): string {
  if (!ID.test(id)) throw new DomainError('VALIDATION_FAILED', raw('Invalid note id.'));
  return id;
}

// "# title" then "<!-- agenthub: created=…; source=… -->" then the body.
function parse(id: string, text: string): NoteWithContent {
  const lines = text.split('\n');
  const title = /^#\s+(.*)$/.exec(lines[0] ?? '')?.[1]?.trim() || id;
  const meta = /^<!-- agenthub: created=([^;]+); source=(.*) -->$/.exec(lines[1] ?? '');
  const content = (meta ? lines.slice(2) : lines.slice(1)).join('\n').replace(/^\n+/, '');
  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/.exec(id);
  const fromId = stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.${stamp[7]}Z` : '';
  return { id, title, createdAt: meta?.[1] ?? fromId, source: meta?.[2] ?? 'unknown', content };
}

export function saveNote(folder: string, input: { title: string; content: string; source: string; now: Date }): Note {
  const title = input.title.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TITLE);
  if (title === '') throw new DomainError('VALIDATION_FAILED', raw('The note needs a title.'));
  if (input.content.trim() === '') throw new DomainError('VALIDATION_FAILED', raw('The note is empty.'));
  const source = input.source.replace(/-->|[\r\n;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'unknown';
  const stamp = input.now.toISOString().replace(/[-:.]/g, '');
  const name = slug(title);
  const id = `${stamp}-${randomBytes(3).toString('hex')}${name ? `-${name}` : ''}`;
  const text = `# ${title}\n<!-- agenthub: created=${input.now.toISOString()}; source=${source} -->\n\n${input.content.trim()}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_DOCUMENT_BYTES) throw new DomainError('VALIDATION_FAILED', raw('The note is larger than 1 MB.'));
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeContext(folder, `${id}.md`, text, null);
  return { id, title, createdAt: input.now.toISOString(), source };
}

// Newest first.
export function listNotes(folder: string, limit = 200): Note[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith('.md') && ID.test(name.slice(0, -3)))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => {
      const { id, title, createdAt, source } = readNote(folder, name.slice(0, -3));
      return { id, title, createdAt, source };
    });
}

export function readNote(folder: string, id: string): NoteWithContent {
  const path = join(folder, `${requireId(id)}.md`);
  if (!existsSync(path) || statSync(path).size > MAX_DOCUMENT_BYTES) throw new DomainError('NOT_FOUND', raw('No such note.'));
  return parse(id, readFileSync(path, 'utf8'));
}

// A loose chat moving into a project keeps its file and id.
export function moveNote(from: string, id: string, to: string): void {
  const source = join(from, `${requireId(id)}.md`);
  if (!existsSync(source)) throw new DomainError('NOT_FOUND', raw('No such note.'));
  mkdirSync(to, { recursive: true, mode: 0o700 });
  const target = join(to, `${id}.md`);
  if (existsSync(target)) throw new DomainError('CONTEXT_CONFLICT', raw('A note with this id is already there.'));
  renameSync(source, target);
}
