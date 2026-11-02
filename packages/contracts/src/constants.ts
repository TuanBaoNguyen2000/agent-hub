// Runtime values for Preload and Renderer, kept apart so those bundles do not pull in zod.
export const IpcChannel = {
  systemStatus: 'system:status',
  projectsList: 'projects:list',
  projectsPickFolder: 'projects:pick-folder',
  projectsAdd: 'projects:add',
  projectsUpdate: 'projects:update',
  projectsRemove: 'projects:remove',
  tasksList: 'tasks:list',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  contextGet: 'context:get',
  contextSave: 'context:save',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsOpenDataFolder: 'settings:open-data-folder',
  profilesList: 'profiles:list',
  profilesAdd: 'profiles:add',
  profilesUpdate: 'profiles:update',
  profilesRemove: 'profiles:remove',
  profilesStatus: 'profiles:status',
  profilesMachineAccount: 'profiles:machine-account',
  profilesOpenLogin: 'profiles:open-login',
  profilesLoginState: 'profiles:login-state',
  profilesLoginReopen: 'profiles:login-reopen',
  profilesLoginCopyLink: 'profiles:login-copy-link',
  profilesLoginCancel: 'profiles:login-cancel',
  permissionsSet: 'permissions:set',
  launchPlan: 'launch:plan',
  launchExecute: 'launch:execute',
  launchHistory: 'launch:history',
  launchConfirmAccount: 'launch:confirm-account',
  launchAccountPlan: 'launch:account-plan',
  launchAccountExecute: 'launch:account-execute',
} as const;

export const TASK_STATUSES = ['backlog', 'active', 'blocked', 'in_review', 'done', 'archived'] as const;
export const THEMES = ['system', 'light', 'dark'] as const;
export const PROVIDERS = ['claude', 'codex'] as const;
export const CLIENT_MODES = ['desktop', 'cli'] as const;
export const ACCOUNT_SOURCES = ['machine', 'separate'] as const;
export const LOGIN_BROWSERS = ['private', 'normal'] as const;
