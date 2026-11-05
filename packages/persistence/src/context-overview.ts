import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ContextHandoff, ContextIssue, ContextOverview, ContextTask, ContextWorkstream } from '@agenthub/application';
import { MAX_DOCUMENT_BYTES } from './context-files';

// Reads back what the agents wrote, in the layout of TDD §7.2. The documents are free-form
// Markdown written by models, so every field is optional and nothing in them is ever run.

const TASK_FILE = /^(TASK-\d+)[^/]*\.md$/i;
const DATE = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

function readSmall(path: string): string | null {
  try {
    if (!statSync(path).isFile() || statSync(path).size > MAX_DOCUMENT_BYTES) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

const firstHeading = (text: string | null): string | null => {
  const match = text ? /^#[ \t]+(.+?)[ \t#]*$/m.exec(text) : null;
  return match?.[1]?.trim() ?? null;
};

// Local time, as agents write it; a bare date means the end of that day.
export function handoffTime(heading: string): string | null {
  const match = DATE.exec(heading);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const at = hour === undefined || Number.isNaN(hour)
    ? new Date(year as number, (month as number) - 1, day, 23, 59, 59)
    : new Date(year as number, (month as number) - 1, day, hour, minute);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

// The first heading inside the "Handoff log" section is the newest entry.
export function latestHandoff(task: string): ContextHandoff | null {
  const lines = task.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,6}[ \t]+Handoff log[ \t]*$/i.test(line));
  if (start < 0) return null;
  const level = (/^#+/.exec(lines[start] ?? '')?.[0] ?? '#').length;
  for (const line of lines.slice(start + 1)) {
    const heading = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (!heading) continue;
    if ((heading[1] ?? '').length <= level) return null;
    const text = (heading[2] ?? '').trim();
    return { heading: text, at: handoffTime(text) };
  }
  return null;
}

// "| TASK-001-combo | in progress |": the state is the second cell of a row naming the task.
export function taskStates(status: string): Map<string, string> {
  const states = new Map<string, string>();
  for (const line of status.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const id = /TASK-\d+/i.exec(cells[0] ?? '')?.[0]?.toUpperCase();
    const state = cells[1]?.replace(/[`*_]/g, '').trim();
    if (id && state && !/^-+$/.test(state)) states.set(id, state);
  }
  return states;
}

export function statusBranch(status: string): string | null {
  const match = /\bBranch:(?:\*\*|__)?[ \t]*`?([\w./-]+?)`?(?=[\s,;)]|\.(?:\s|$)|$)/im.exec(status);
  return match?.[1] ?? null;
}

const HANDOFF_LOG = /^#{1,6}[ \t]+Handoff log[ \t]*$/im;

// The layout of TDD §7.2 names the folder Workstreams/, but documents that already existed in a
// repo may group workstreams under another name, such as Playables/ (ADR-020 item 4).
export const DEFAULT_WORKSTREAM_FOLDER = 'Workstreams';

function subfolders(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

const looksLikeWorkstream = (path: string): boolean => existsSync(join(path, 'STATUS.md')) || existsSync(join(path, 'Tasks'));

// Every top-level folder with at least one subfolder holding STATUS.md or Tasks/, and Workstreams/
// itself even before that; each subfolder of one is a workstream, named by its relative path.
export function workstreamFolders(folder: string): string[] {
  return subfolders(folder)
    .filter((group) => group === DEFAULT_WORKSTREAM_FOLDER || subfolders(join(folder, group)).some((name) => looksLikeWorkstream(join(folder, group, name))))
    .flatMap((group) => subfolders(join(folder, group)).map((name) => `${group}/${name}`));
}

function readWorkstream(folder: string, slug: string): { workstream: ContextWorkstream; issues: ContextIssue[] } {
  const base = join(folder, slug);
  const status = readSmall(join(base, 'STATUS.md'));
  const states = status ? taskStates(status) : new Map<string, string>();
  const taskFolder = join(base, 'Tasks');
  const files = existsSync(taskFolder) ? readdirSync(taskFolder).filter((name) => TASK_FILE.test(name)).sort() : [];
  const issues: ContextIssue[] = [];
  if (status === null) issues.push({ kind: 'no_status', workstream: slug, taskRef: null });
  if (files.length === 0) issues.push({ kind: 'no_tasks', workstream: slug, taskRef: null });
  const tasks: ContextTask[] = files.map((name) => {
    const id = (TASK_FILE.exec(name)?.[1] ?? name).toUpperCase();
    const text = readSmall(join(taskFolder, name));
    const ref = `${slug}/Tasks/${name}`;
    if (text !== null && !HANDOFF_LOG.test(text)) issues.push({ kind: 'no_handoff_log', workstream: slug, taskRef: ref });
    return {
      ref,
      id,
      title: firstHeading(text) ?? name.replace(/\.md$/i, ''),
      state: states.get(id) ?? null,
      lastHandoff: text ? latestHandoff(text) : null,
    };
  });
  const title = firstHeading(status) ?? slug.split('/').at(-1) ?? slug;
  return { workstream: { slug, title, branch: status ? statusBranch(status) : null, tasks }, issues };
}

export function readContextOverview(folder: string): ContextOverview {
  const initialized = existsSync(join(folder, 'README.md'));
  const read = workstreamFolders(folder).map((slug) => readWorkstream(folder, slug));
  const issues: ContextIssue[] = [];
  if (initialized) {
    if (!existsSync(join(folder, 'PROJECT_CONTEXT.md'))) issues.push({ kind: 'no_project_context', workstream: null, taskRef: null });
    if (read.length === 0) issues.push({ kind: 'no_workstream', workstream: null, taskRef: null });
    issues.push(...read.flatMap((item) => item.issues));
  }
  return { initialized, workstreams: read.map((item) => item.workstream), issues };
}
