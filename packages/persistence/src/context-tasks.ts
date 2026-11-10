import { mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type ContextOverview,
  STATE_WORDS,
  newTaskDocument,
  nextTaskId,
  renumberStatusRow,
  renumberTaskDocument,
  setStatusState,
  stateGroup,
  taskDocumentFromBody,
  taskSlug,
} from '@agenthub/application';
import { type ContextLanguage, DomainError, raw } from '@agenthub/domain';
import { readContext, renameContext, sha256, writeContext } from './context-files';
import { readContextOverview, workstreamStates } from './context-overview';

// ADR-027 item 1: task numbers come from one place. The MCP server runs as its own process for
// every agent session, and AgentHub writes too, so the lock is a folder that only one process can
// create (mkdir is atomic). It lives in AgentHub's data, never in the documents or the repo.

export interface LockOptions {
  waitMs?: number;
  staleMs?: number;
}

const WAIT_MS = 2000;
const STALE_MS = 30_000;
const STEP_MS = 25;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function contextLockPath(lockRoot: string, folder: string): string {
  let real: string;
  try {
    real = realpathSync(folder);
  } catch {
    real = resolve(folder);
  }
  return join(lockRoot, `context-${sha256(real).slice(0, 16)}`);
}

export function withContextLock<T>(lockRoot: string, folder: string, work: () => T, options: LockOptions = {}): T {
  const waitMs = options.waitMs ?? WAIT_MS;
  const staleMs = options.staleMs ?? STALE_MS;
  mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
  const lock = contextLockPath(lockRoot, folder);
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    let age: number;
    try {
      age = Date.now() - statSync(lock).mtimeMs;
    } catch {
      // Released between the two calls: try again at once.
      continue;
    }
    if (age > staleMs) {
      // Left by a process that died while holding it. Renaming is atomic, so only one waiter
      // takes it away; the others find it gone and try again.
      const stale = `${lock}.stale-${randomUUID()}`;
      try {
        renameSync(lock, stale);
        rmSync(stale, { recursive: true, force: true });
      } catch {
        // Another waiter got there first.
      }
      continue;
    }
    if (Date.now() >= deadline) {
      throw new DomainError('CONTEXT_CONFLICT', raw('Another agent or AgentHub is creating a task in this project. Try again in a moment.'));
    }
    sleep(STEP_MS);
  }
  try {
    return work();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

const allIds = (overview: ContextOverview): string[] => overview.workstreams.flatMap((workstream) => workstream.tasks.map((task) => task.id));

// Numbers to skip when handing out a new one: the task files, plus every number the STATUS files
// and the README still name, so a deleted task's number is not handed out again (backlog I1).
function reservedIds(folder: string, overview: ContextOverview): string[] {
  const texts = [readOptional(folder, 'README.md'), ...overview.workstreams.map((workstream) => readOptional(folder, `${workstream.slug}/STATUS.md`))];
  const named = texts.flatMap((text) => (text ? [...text.content.matchAll(/\bTASK-(\d+)\b/gi)].map((match) => `TASK-${match[1] ?? ''}`) : []));
  return [...allIds(overview), ...named];
}

export function readOptional(folder: string, path: string): { content: string; sha256: string } | null {
  try {
    return readContext(folder, path);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

// STATUS.md may be written by an agent at the same moment; a changed file is read again, never overwritten.
export function updateStatus(folder: string, workstream: string, change: (current: string | null) => string | null): void {
  const path = `${workstream}/STATUS.md`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = readOptional(folder, path);
    const next = change(current?.content ?? null);
    if (next === null || next === current?.content) return;
    try {
      writeContext(folder, path, next, current?.sha256 ?? null);
      return;
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'CONTEXT_CONFLICT')) throw error;
    }
  }
  throw new DomainError('CONTEXT_CONFLICT', raw(`${path} kept changing; try again.`));
}

export interface CreateTaskInput {
  workstream: string;
  title: string;
  goal: string;
  // Written by an agent: everything after the title and the "Status:" line.
  body?: string | null;
  language: ContextLanguage;
}

export function createContextTask(folder: string, lockRoot: string, input: CreateTaskInput, options?: LockOptions): { ref: string; id: string; sha256: string } {
  const title = input.title.replace(/\s+/g, ' ').trim();
  if (title === '') throw new DomainError('VALIDATION_FAILED', raw('The task needs a title.'));
  return withContextLock(
    lockRoot,
    folder,
    () => {
      const overview = readContextOverview(folder);
      const workstream = overview.workstreams.find((item) => item.slug === input.workstream);
      if (!workstream) {
        const known = overview.workstreams.map((item) => item.slug).join(', ') || 'none';
        throw new DomainError('NOT_FOUND', raw(`No workstream "${input.workstream}". Workstreams: ${known}.`));
      }
      const id = nextTaskId(reservedIds(folder, overview));
      const ref = `${workstream.slug}/Tasks/${id}-${taskSlug(title)}.md`;
      const content =
        input.body && input.body.trim() !== ''
          ? taskDocumentFromBody({ id, title, body: input.body, language: input.language })
          : newTaskDocument({ id, title, goal: input.goal, language: input.language });
      const written = writeContext(folder, ref, content, null);
      updateStatus(folder, workstream.slug, (current) => setStatusState(current, { id, title }, STATE_WORDS[input.language].todo, workstream.title));
      return { ref, id, sha256: written.sha256 };
    },
    options,
  );
}

// ADR-027 item 1.4: the task moves to the next free number; the other task keeps its own.
export function renumberContextTask(folder: string, lockRoot: string, ref: string, language: ContextLanguage, options?: LockOptions): { ref: string; id: string } {
  return withContextLock(
    lockRoot,
    folder,
    () => {
      const overview = readContextOverview(folder);
      const workstream = overview.workstreams.find((item) => item.tasks.some((task) => task.ref === ref));
      const task = workstream?.tasks.find((item) => item.ref === ref);
      if (!workstream || !task) throw new DomainError('NOT_FOUND', raw(`No task at ${ref}.`));
      const newId = nextTaskId(reservedIds(folder, overview));
      const slash = ref.lastIndexOf('/');
      const newRef = `${ref.slice(0, slash + 1)}${ref.slice(slash + 1).replace(/^TASK-\d+/i, newId)}`;
      const current = readContext(folder, ref);
      writeContext(folder, ref, renumberTaskDocument(current.content, task.id, newId), current.sha256);
      renameContext(folder, ref, newRef);
      const word = task.state ?? STATE_WORDS[language].todo;
      updateStatus(folder, workstream.slug, (status) =>
        status === null ? null : renumberStatusRow(status, { oldId: task.id, newId, title: task.title }, word, workstream.title),
      );
      return { ref: newRef, id: newId };
    },
    options,
  );
}

// ADR-027 item 2: the task files say the state; the STATUS table is a summary written back from
// them when the user asks. Tasks that share a number are left alone until they are renumbered.
export function syncStatusTable(folder: string, workstream: string): number {
  const overview = readContextOverview(folder);
  const found = overview.workstreams.find((item) => item.slug === workstream);
  if (!found) throw new DomainError('NOT_FOUND', raw(`No workstream "${workstream}".`));
  const ids = allIds(overview);
  const shared = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  let changed = 0;
  updateStatus(folder, workstream, (current) => {
    changed = 0;
    let text = current;
    for (const task of workstreamStates(folder, workstream)) {
      if (task.fileState === null || shared.has(task.id)) continue;
      if (task.tableState !== null && stateGroup(task.tableState) === stateGroup(task.fileState)) continue;
      text = setStatusState(text, { id: task.id, title: task.title.replace(new RegExp(`^${task.id}[\\s:.-]*`, 'i'), '') }, task.fileState, found.title);
      changed += 1;
    }
    return text;
  });
  return changed;
}
