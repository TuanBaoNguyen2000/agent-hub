import { join } from 'node:path';
import { appendDeletedNote, removeStatusRow } from '@agenthub/application';
import { type ContextLanguage, DomainError, raw } from '@agenthub/domain';
import { writeContext } from './context-files';
import { readContextOverview } from './context-overview';
import { type LockOptions, readOptional, updateStatus, withContextLock } from './context-tasks';

// Backlog I1: AgentHub removes a task or a workstream from the documents; the caller then moves the
// file or folder to the system Trash. The number stays listed, so it is never handed out again.

const day = (at: Date): string => at.toISOString().slice(0, 10);

export function deleteContextTask(folder: string, lockRoot: string, ref: string, language: ContextLanguage, at: Date, options?: LockOptions): { path: string; id: string } {
  return withContextLock(
    lockRoot,
    folder,
    () => {
      const overview = readContextOverview(folder);
      const workstream = overview.workstreams.find((item) => item.tasks.some((task) => task.ref === ref));
      const task = workstream?.tasks.find((item) => item.ref === ref);
      if (!workstream || !task) throw new DomainError('NOT_FOUND', raw(`No task at ${ref}.`));
      const title = task.title.replace(new RegExp(`^${task.id}[\\s:.-]*`, 'i'), '').trim();
      updateStatus(folder, workstream.slug, (status) =>
        appendDeletedNote(removeStatusRow(status ?? '', { id: task.id, title: task.title }), 'tasks', language, `${task.id} ${title} (${day(at)})`),
      );
      return { path: join(folder, ref), id: task.id };
    },
    options,
  );
}

export function deleteContextWorkstream(folder: string, lockRoot: string, slug: string, language: ContextLanguage, at: Date, options?: LockOptions): { path: string } {
  return withContextLock(
    lockRoot,
    folder,
    () => {
      const overview = readContextOverview(folder);
      const workstream = overview.workstreams.find((item) => item.slug === slug);
      if (!workstream) throw new DomainError('NOT_FOUND', raw(`No workstream "${slug}".`));
      const ids = workstream.tasks.map((task) => task.id).filter((id, index, all) => all.indexOf(id) === index);
      const readme = readOptional(folder, 'README.md');
      if (readme) {
        const line = `${workstream.title} (\`${slug}\`, ${day(at)})${ids.length > 0 ? `: ${ids.join(', ')}` : ''}`;
        writeContext(folder, 'README.md', appendDeletedNote(readme.content, 'workstreams', language, line), readme.sha256);
      }
      return { path: join(folder, slug) };
    },
    options,
  );
}
