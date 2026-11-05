import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listNotes, moveNote, readNote, saveNote } from '../src/index';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenthub-notes-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso);

describe('notes', () => {
  it('saves one Markdown file per note, newest listed first', () => {
    const folder = join(root, 'handoffs');
    const first = saveNote(folder, { title: 'Đợt 1: combo', content: 'a', source: 'claude-code 2.1', now: at('2026-11-04T10:00:00.000Z') });
    const second = saveNote(folder, { title: 'Đợt 2', content: 'b', source: 'app', now: at('2026-11-05T10:00:00.000Z') });

    expect(first.id).toMatch(/^20261104T100000000Z-[0-9a-f]{6}-dot-1-combo$/);
    expect(listNotes(folder).map((note) => note.title)).toEqual(['Đợt 2', 'Đợt 1: combo']);
    expect(readNote(folder, second.id)).toEqual({ ...second, content: 'b\n' });
    expect(readFileSync(join(folder, `${first.id}.md`), 'utf8')).toBe(
      '# Đợt 1: combo\n<!-- agenthub: created=2026-11-04T10:00:00.000Z; source=claude-code 2.1 -->\n\na\n',
    );
  });

  it('keeps a title or source from breaking the header', () => {
    const note = saveNote(root, { title: 'a\n# b', content: 'x', source: 'evil --> \n; y', now: at('2026-11-05T00:00:00.000Z') });
    expect(readNote(root, note.id)).toMatchObject({ title: 'a # b', source: 'evil y' });
  });

  it('refuses empty notes and ids that could leave the folder', () => {
    expect(() => saveNote(root, { title: ' ', content: 'x', source: 's', now: new Date() })).toThrow(/title/);
    expect(() => saveNote(root, { title: 't', content: ' \n', source: 's', now: new Date() })).toThrow(/empty/);
    expect(() => readNote(root, '../secret')).toThrow(/Invalid/);
    expect(listNotes(join(root, 'none'))).toEqual([]);
  });

  it('moves a note to another folder under the same id', () => {
    const note = saveNote(join(root, 'loose'), { title: 't', content: 'x', source: 's', now: new Date() });
    moveNote(join(root, 'loose'), note.id, join(root, 'project', 'Inbox'));

    expect(existsSync(join(root, 'loose', `${note.id}.md`))).toBe(false);
    expect(readNote(join(root, 'project', 'Inbox'), note.id).title).toBe('t');
  });
});
