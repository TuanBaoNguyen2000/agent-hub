// Runtime values for Preload and Renderer, kept apart so those bundles do not pull in zod.
export const IpcChannel = {
  systemStatus: 'system:status',
  systemCopyText: 'system:copy-text',
  projectsList: 'projects:list',
  projectsPickFolder: 'projects:pick-folder',
  projectsAdd: 'projects:add',
  projectsUpdate: 'projects:update',
  projectsRemove: 'projects:remove',
  projectsUpdateContext: 'projects:update-context',
  projectsOpenContextFolder: 'projects:open-context-folder',
  projectsContext: 'projects:context',
  projectsDetectContext: 'projects:detect-context',
  projectsMoveContext: 'projects:move-context',
  projectsAddHandoff: 'projects:add-handoff',
  projectsReadHandoff: 'projects:read-handoff',
  projectsSaveHandoff: 'projects:save-handoff',
  looseChatsList: 'loose-chats:list',
  looseChatsRead: 'loose-chats:read',
  looseChatsSave: 'loose-chats:save',
  looseChatsMove: 'loose-chats:move',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsOpenDataFolder: 'settings:open-data-folder',
  profilesList: 'profiles:list',
  profilesAdd: 'profiles:add',
  profilesUpdate: 'profiles:update',
  profilesRemove: 'profiles:remove',
  profilesStatus: 'profiles:status',
  profilesUsage: 'profiles:usage',
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

export const CONTEXT_LANGUAGES = ['en', 'vi'] as const;
// Same id as the application's CONTEXT_TOOLS_CONFIRMATION: consent to change the main config folder.
export const CONTEXT_TOOLS_CONFIRMATION = 'context-tools-main-config';
export const THEMES = ['system', 'light', 'dark'] as const;
export const PROVIDERS = ['claude', 'codex'] as const;
export const CLIENT_MODES = ['desktop', 'cli'] as const;
export const ACCOUNT_SOURCES = ['machine', 'separate'] as const;
export const LOGIN_BROWSERS = ['private', 'normal'] as const;
