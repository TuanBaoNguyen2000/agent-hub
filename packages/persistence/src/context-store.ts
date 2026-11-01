import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ContextAddress, ContextDocument, ContextStore } from '@agenthub/application';
import { DomainError } from '@agenthub/domain';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_FILES = { project: 'project.md', task: 'task.md', decisions: 'decisions.md' } as const;

const checksum = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex');

// Ids reach the filesystem here, so this check stands even if a caller skipped validation.
function pathOf(root: string, address: ContextAddress): string {
  const ids = address.taskId === undefined ? [address.projectId] : [address.projectId, address.taskId];
  if (!ids.every((id) => UUID.test(id))) throw new DomainError('VALIDATION_FAILED', 'Id không hợp lệ.');
  const file = DOCUMENT_FILES[address.document];
  if (!file) throw new DomainError('VALIDATION_FAILED', 'Tên tài liệu không hợp lệ.');
  return join(root, ...ids, file);
}

function readDocument(path: string): ContextDocument {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { content: '', revision: null, modifiedAt: null };
    throw error;
  }
  return { content, revision: checksum(content), modifiedAt: statSync(path).mtime.toISOString() };
}

// Temp file in the same folder, flushed, then renamed: a crash leaves the old or the new file, never half of one.
function writeAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
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

export function createContextStore(root: string): ContextStore {
  return {
    read: (address) => readDocument(pathOf(root, address)),
    write: (address, content, expectedRevision) => {
      const path = pathOf(root, address);
      if (readDocument(path).revision !== expectedRevision) {
        throw new DomainError('CONTEXT_CONFLICT', 'Tài liệu đã bị thay đổi ở nơi khác kể từ lần mở gần nhất.');
      }
      writeAtomically(path, content);
      return readDocument(path);
    },
  };
}
