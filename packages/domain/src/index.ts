export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'PROJECT_PATH_MISSING'
  | 'PROJECT_PATH_INVALID'
  | 'PROJECT_PATH_DUPLICATE'
  | 'CONTEXT_CONFLICT'
  | 'PROFILE_INVALID'
  | 'PROFILE_CONFIG_MISSING'
  | 'PROFILE_NOT_ALLOWED'
  | 'LOGIN_NOT_ACTIVE'
  | 'CONFIRMATION_REQUIRED'
  | 'BIN_NOT_FOUND'
  | 'APP_NOT_FOUND'
  | 'LAUNCH_UNSUPPORTED'
  | 'LAUNCH_FAILED'
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

export const CONTEXT_LANGUAGES = ['en', 'vi'] as const;
export type ContextLanguage = (typeof CONTEXT_LANGUAGES)[number];

// Context documents are optional per project (ADR-019). AgentHub only keeps where they live;
// agents write them through skills or MCP.
export interface ProjectContextSettings {
  enabled: boolean;
  language: ContextLanguage;
}

export interface Project {
  id: string;
  name: string;
  context: ProjectContextSettings;
  createdAt: string;
  updatedAt: string;
}

export const PROVIDERS = ['claude', 'codex'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const CLIENT_MODES = ['desktop', 'cli'] as const;
export type ClientMode = (typeof CLIENT_MODES)[number];

// An alias is only a label: it never proves which account is signed in (TDD §11.4).
export interface AccountProfile {
  id: string;
  provider: Provider;
  // An optional nickname; empty means the account goes by its email.
  alias: string;
  // Last seen from the official CLI (ADR-018). It names the CLI login, not a Desktop window's.
  accountEmail: string | null;
  // CLAUDE_CONFIG_DIR or CODEX_HOME; null means the provider's default location.
  cliConfigRoot: string | null;
  // A separate Desktop instance (ADR-013, ADR-014); null means the main app.
  desktopDataDir: string | null;
  createdAt: string;
}

const PROVIDER_LABELS: Record<Provider, string> = { claude: 'Claude', codex: 'Codex' };

// The email is the name: a nickname added nothing the email did not already say (ADR-018 note).
export function accountName({ provider, accountEmail }: Pick<AccountProfile, 'provider' | 'accountEmail'>): string {
  return accountEmail ?? `${PROVIDER_LABELS[provider]} (chưa rõ account)`;
}

export const LAUNCH_STATUSES = ['planned', 'launched', 'manual_step', 'failed'] as const;
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];

// What AgentHub can honestly say about a launch. There is deliberately no "switched"
// or "resumed": opening an app proves neither (TDD §8.4).
export interface LaunchOutcome {
  appOpened: boolean;
  // 'opened': cwd of a process AgentHub started. 'requested': a command was accepted, the
  // result is not observable. 'manual': the user has to choose the folder.
  workspace: 'opened' | 'requested' | 'manual' | 'none';
  sessionStarted: false;
  userActionRequired: string[];
  warnings: string[];
}

export interface LaunchAttempt {
  id: string;
  projectId: string;
  // A task inside the project's documents, by its path there; AgentHub keeps no tasks itself.
  taskRef: string | null;
  profileId: string;
  mode: ClientMode;
  status: LaunchStatus;
  errorCode: string | null;
  outcome: LaunchOutcome | null;
  // Set only when the user says the account was right; AgentHub cannot observe it.
  accountConfirmedAt: string | null;
  createdAt: string;
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
