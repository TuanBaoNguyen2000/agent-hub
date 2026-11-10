import { readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { type ContextOverview, type ContextTask, parseTaskDocument } from '@agenthub/application';
import type { ContextProjectEntry } from './context-catalog';

// ADR-028 items 1 and 2: which project an agent's working folder belongs to, and which task a
// short sentence names. Read-only; nothing here searches the disk beyond the given paths.

// The path as given and as the file system resolves it (/tmp and /private/tmp on macOS).
function forms(path: string): string[] {
  const given = resolve(path);
  try {
    const real = realpathSync.native(given);
    return real === given ? [given] : [given, real];
  } catch {
    return [given];
  }
}

const within = (child: string, parent: string): boolean => child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);

export interface ProjectMatch {
  project: ContextProjectEntry;
  // Which of the project's folders holds the working folder.
  matched: 'root' | 'folder';
}

// The project whose folder, or context folder, is the working folder or holds it; the longest
// path wins, so a project nested in another is told apart.
export function matchProject(projects: readonly ContextProjectEntry[], cwd: string): ProjectMatch | null {
  if (!isAbsolute(cwd)) return null;
  const here = forms(cwd);
  let best: (ProjectMatch & { length: number }) | null = null;
  for (const project of projects) {
    const places: [ProjectMatch['matched'], string][] = [['root', project.root]];
    if (project.documents) places.push(['folder', project.folder]);
    for (const [matched, place] of places) {
      for (const candidate of forms(place)) {
        if (!here.some((path) => within(path, candidate))) continue;
        if (!best || candidate.length > best.length) best = { project, matched, length: candidate.length };
      }
    }
  }
  return best && { project: best.project, matched: best.matched };
}

// Lower case without Vietnamese diacritics, so "trang thai" finds "Trạng thái".
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFC')
    .toLowerCase();
}

export type FoundTask = ContextTask & { workstream: string };

// "TASK-004", "task-4", "004", "4", or words of the title. Every match is returned: the caller
// asks the user when there is more than one, including two files with the same number.
export function findContextTasks(overview: ContextOverview, query: string): FoundTask[] {
  const tasks = overview.workstreams.flatMap((workstream) => workstream.tasks.map((task) => ({ ...task, workstream: workstream.slug })));
  const trimmed = query.trim();
  const number = /^(?:task[-_ ]?)?#?0*(\d+)$/i.exec(trimmed) ?? /\btask[-_ ]?0*(\d+)\b/i.exec(trimmed);
  if (number) {
    const wanted = Number(number[1]);
    return tasks.filter((task) => Number(/\d+/.exec(task.id)?.[0] ?? Number.NaN) === wanted);
  }
  const words = foldText(trimmed).split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');
  if (words.length === 0) return [];
  return tasks.filter((task) => {
    const haystack = foldText(`${task.title} ${task.ref.split('/').at(-1) ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

export interface TaskDetails {
  goal: string | null;
  // Checklist lines as written, "[x] …" or "[ ] …".
  criteria: string[];
  // The newest entry of the handoff log, heading included.
  newestHandoff: string | null;
}

const MAX_GOAL = 1500;
const MAX_CRITERIA = 40;
const MAX_HANDOFF = 4000;

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max).trimEnd()}\n… (cut; read the file for the rest)`);

export function taskDetails(text: string): TaskDetails {
  const { sections } = parseTaskDocument(text);
  const goal = sections.find((section) => section.kind === 'goal')?.body.trim() ?? '';
  const criteria = sections
    .filter((section) => section.kind === 'criteria')
    .flatMap((section) => section.body.split(/\r?\n/))
    .flatMap((line) => {
      const item = /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]*(.*)$/.exec(line);
      return item ? [`[${item[1] === ' ' ? ' ' : 'x'}] ${(item[2] ?? '').trim()}`] : [];
    });
  const log = sections.find((section) => section.kind === 'handoff')?.body ?? '';
  return {
    goal: goal === '' ? null : clip(goal, MAX_GOAL),
    criteria: criteria.length > MAX_CRITERIA ? [...criteria.slice(0, MAX_CRITERIA), `… ${criteria.length - MAX_CRITERIA} more`] : criteria,
    newestHandoff: newestEntry(log),
  };
}

// From the first heading of the log up to the next heading of the same or a higher level.
function newestEntry(log: string): string | null {
  const lines = log.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,6}[ \t]+\S/.test(line));
  if (start < 0) return null;
  const level = (/^#+/.exec(lines[start] ?? '')?.[0] ?? '').length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = /^(#{1,6})[ \t]/.exec(lines[index] ?? '');
    if (heading && (heading[1] ?? '').length <= level) {
      end = index;
      break;
    }
  }
  return clip(lines.slice(start, end).join('\n').trim(), MAX_HANDOFF);
}

// Markdown notes waiting in Inbox/, not those already in Inbox/archive/.
export function inboxCount(folder: string): number {
  try {
    return readdirSync(resolve(folder, 'Inbox'), { withFileTypes: true }).filter((entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.md')).length;
  } catch {
    return 0;
  }
}
