import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type ContextHandoff, type ContextIssue, type ContextOverview, type ContextTask, type ContextWorkstream, stateGroup } from '@agenthub/application';
import { MAX_DOCUMENT_BYTES } from './context-files';

// Reads back what the agents wrote, in the layout of TDD §7.2. The documents are free-form
// Markdown written by models, so every field is optional and nothing in them is ever run.

const TASK_FILE = /^(TASK-\d+)[^/]*\.md$/i;
// Date, optional time, optional UTC offset (ADR-026 item 4): "2026-11-09 17:40+0700".
const DATE = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?(?:[ \t]?(Z|[+-]\d{2}:?\d{2})(?![\d:]))?)?/;

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

// With an offset the time is exact; without one it is the machine's local time, as older entries
// were written. A bare date means the end of that day.
export function handoffTime(heading: string): string | null {
  const match = DATE.exec(heading);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const zone = match[6];
  let at: Date;
  if (hour === undefined || Number.isNaN(hour)) at = new Date(year as number, (month as number) - 1, day, 23, 59, 59);
  else if (zone) {
    const offset = zone === 'Z' ? 0 : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
    at = new Date(Date.UTC(year as number, (month as number) - 1, day, hour, minute as number) - offset * 60_000);
  } else at = new Date(year as number, (month as number) - 1, day, hour, minute);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

// The first heading inside the "Handoff log" section is the newest entry.
export function latestHandoff(task: string): ContextHandoff | null {
  const lines = task.split(/\r?\n/);
  const start = lines.findIndex((line) => HANDOFF_LOG.test(line));
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

// ADR-023 item 4: "Status: In progress" in the lines between the title and the first section.
// Further down, a handoff entry may say "Status:" about something else, so it is not read there.
const STATUS_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*|__)?(?:Status|Trạng thái|상태)(?:\*\*|__)?[ \t]*:[ \t]*(?:\*\*|__)?[ \t]*(.*?)[ \t]*$/iu;

export function taskFileState(task: string): string | null {
  let seenTitle = false;
  for (const line of task.split(/\r?\n/)) {
    if (/^#[ \t]/.test(line)) {
      if (seenTitle) break;
      seenTitle = true;
      continue;
    }
    if (/^#{2,6}[ \t]/.test(line)) break;
    const match = STATUS_LINE.exec(line);
    if (match) {
      const state = (match[1] ?? '').replace(/[`*_]/g, '').trim();
      return state === '' ? null : state;
    }
  }
  return null;
}

// Ticked and total checklist items under the acceptance criteria heading; null without one.
const CRITERIA_HEADING = /acceptance|criteria|tiêu chí|điều kiện hoàn thành|완료 조건|수락 기준|인수 조건/i;

export function criteriaProgress(task: string): { done: number; total: number } | null {
  const lines = task.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{2,6}[ \t]/.test(line) && CRITERIA_HEADING.test(line));
  if (start < 0) return null;
  const level = (/^#+/.exec(lines[start] ?? '')?.[0] ?? '##').length;
  let done = 0;
  let total = 0;
  for (const line of lines.slice(start + 1)) {
    const heading = /^(#{1,6})[ \t]/.exec(line);
    if (heading && (heading[1] ?? '').length <= level) break;
    const item = /^[ \t]*[-*+][ \t]+\[([ xX])\]/.exec(line);
    if (!item) continue;
    total += 1;
    if (item[1] !== ' ') done += 1;
  }
  return total === 0 ? null : { done, total };
}

// "STATUS – Playable005" names the file, not the workstream; only "Playable005" is shown.
// A heading that is only "STATUS" leaves the folder name.
export function workstreamTitle(heading: string | null): string | null {
  if (heading === null) return null;
  const title = heading
    .replace(/^(?:STATUS|Trạng thái|상태)(?:\.md)?(?:\s*[-–—:|·]\s*|\s+(?=\S))/iu, '')
    .replace(/\s*[-–—:|·]\s*(?:STATUS|Trạng thái|상태)(?:\.md)?$/iu, '')
    .trim();
  return title === '' || /^(?:STATUS|Trạng thái|상태)(?:\.md)?$/iu.test(title) ? null : title;
}

export function statusBranch(status: string): string | null {
  const match = /\bBranch:(?:\*\*|__)?[ \t]*`?([\w./-]+?)`?(?=[\s,;)]|\.(?:\s|$)|$)/im.exec(status);
  return match?.[1] ?? null;
}

// "Handoff log (newest first)" counts too: agents often add a note after the name.
const HANDOFF_LOG = /^#{1,6}[ \t]+Handoff log(?:[ \t]*(?:\([^)\n]*\)|[-–—:][^\n]*))?[ \t]*$/im;

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

interface TaskFile {
  ref: string;
  id: string;
  text: string | null;
  title: string;
  // ADR-027 item 2: the task file is the source; the table is a summary that may lag behind.
  fileState: string | null;
  tableState: string | null;
}

function readTaskFiles(folder: string, slug: string, status: string | null): TaskFile[] {
  const states = status ? taskStates(status) : new Map<string, string>();
  const taskFolder = join(folder, slug, 'Tasks');
  const files = existsSync(taskFolder) ? readdirSync(taskFolder).filter((name) => TASK_FILE.test(name)).sort() : [];
  return files.map((name) => {
    const id = (TASK_FILE.exec(name)?.[1] ?? name).toUpperCase();
    const text = readSmall(join(taskFolder, name));
    return {
      ref: `${slug}/Tasks/${name}`,
      id,
      text,
      title: firstHeading(text) ?? name.replace(/\.md$/i, ''),
      fileState: text ? taskFileState(text) : null,
      tableState: states.get(id) ?? null,
    };
  });
}

// The state of each task as its file and the STATUS table write it, for syncing the table.
export function workstreamStates(folder: string, slug: string): Omit<TaskFile, 'text'>[] {
  return readTaskFiles(folder, slug, readSmall(join(folder, slug, 'STATUS.md'))).map(({ ref, id, title, fileState, tableState }) => ({ ref, id, title, fileState, tableState }));
}

function readWorkstream(folder: string, slug: string): { workstream: ContextWorkstream; issues: ContextIssue[] } {
  const base = join(folder, slug);
  const status = readSmall(join(base, 'STATUS.md'));
  const taskFolder = join(base, 'Tasks');
  const issues: ContextIssue[] = [];
  if (status === null) issues.push({ kind: 'no_status', workstream: slug, taskRef: null });
  // An empty Tasks/ is a workstream just created (ADR-023); only a missing one is reported.
  if (!existsSync(taskFolder)) issues.push({ kind: 'no_tasks', workstream: slug, taskRef: null });
  const tasks: ContextTask[] = readTaskFiles(folder, slug, status).map(({ ref, id, text, title, fileState, tableState }) => {
    if (text !== null && !HANDOFF_LOG.test(text)) issues.push({ kind: 'no_handoff_log', workstream: slug, taskRef: ref });
    // Only a different state counts; "in progress" and "Đang làm" say the same.
    if (fileState !== null && tableState !== null && stateGroup(fileState) !== stateGroup(tableState)) {
      issues.push({ kind: 'state_mismatch', workstream: slug, taskRef: ref, detail: tableState });
    }
    return {
      ref,
      id,
      title,
      state: fileState ?? tableState,
      criteria: text ? criteriaProgress(text) : null,
      lastHandoff: text ? latestHandoff(text) : null,
    };
  });
  const title = workstreamTitle(firstHeading(status)) ?? slug.split('/').at(-1) ?? slug;
  return { workstream: { slug, title, branch: status ? statusBranch(status) : null, tasks }, issues };
}

// ADR-027 item 1.4: each task file whose number another one has too, naming the first other one.
function duplicateIssues(workstreams: ContextWorkstream[]): ContextIssue[] {
  const tasks = workstreams.flatMap((workstream) => workstream.tasks.map((task) => ({ workstream: workstream.slug, ref: task.ref, id: task.id })));
  return tasks.flatMap((task) => {
    const other = tasks.find((item) => item.id === task.id && item.ref !== task.ref);
    return other ? [{ kind: 'duplicate_task_id' as const, workstream: task.workstream, taskRef: task.ref, detail: other.ref }] : [];
  });
}

export function readContextOverview(folder: string): ContextOverview {
  const initialized = existsSync(join(folder, 'README.md'));
  const read = workstreamFolders(folder).map((slug) => readWorkstream(folder, slug));
  const issues: ContextIssue[] = [];
  if (initialized) {
    if (!existsSync(join(folder, 'PROJECT_CONTEXT.md'))) issues.push({ kind: 'no_project_context', workstream: null, taskRef: null });
    if (read.length === 0) issues.push({ kind: 'no_workstream', workstream: null, taskRef: null });
    issues.push(...read.flatMap((item) => item.issues));
    issues.push(...duplicateIssues(read.map((item) => item.workstream)));
  }
  const projectContext = readSmall(join(folder, 'PROJECT_CONTEXT.md'));
  // The scaffold AgentHub writes has headings only (ADR-023 item 2).
  const filled = projectContext !== null && projectContext.split(/\r?\n/).some((line) => line.trim() !== '' && !/^#{1,6}[ \t]/.test(line));
  return { initialized, filled, workstreams: read.map((item) => item.workstream), issues };
}
