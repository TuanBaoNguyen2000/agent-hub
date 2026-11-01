export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'PROJECT_PATH_MISSING'
  | 'PROJECT_PATH_INVALID'
  | 'PROJECT_PATH_DUPLICATE'
  | 'CONTEXT_CONFLICT'
  | 'UNEXPECTED';

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const TASK_STATUSES = ['backlog', 'active', 'blocked', 'in_review', 'done', 'archived'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  objective: string;
  acceptanceCriteria: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

const MAX_LABEL_LENGTH = 200;

export function requireLabel(value: string, field: string): string {
  const label = value.trim();
  if (label.length === 0) throw new DomainError('VALIDATION_FAILED', `${field} không được để trống.`);
  if (label.length > MAX_LABEL_LENGTH) {
    throw new DomainError('VALIDATION_FAILED', `${field} không được dài quá ${MAX_LABEL_LENGTH} ký tự.`);
  }
  return label;
}

export function folderNameOf(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

// macOS treats composed and decomposed Unicode names as the same file.
export function isSamePath(a: string, b: string): boolean {
  return a.normalize('NFC') === b.normalize('NFC');
}
