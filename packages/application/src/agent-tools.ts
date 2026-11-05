import { type AccountProfile, DomainError, type Message, type Provider, accountName, msg } from '@agenthub/domain';

import type { CustomSkill, MetadataStore } from './index';
import type { Launcher, McpServerSpec } from './launching';

// --- Skills: one copy owned by AgentHub, linked into each account (ADR-019, SPIKE-14, ADR-020 item 1). ---

// 'foreign': something of the same name that AgentHub did not put there; it is never replaced or removed.
export type SkillPresence = 'installed' | 'missing' | 'foreign';

export interface SkillManifest {
  name: string;
  description: string;
}

export interface SkillInstaller {
  // The skills that ship with the app.
  readonly builtin: readonly string[];
  // Copies the shipped skills over AgentHub's own copies, so an app update reaches every account.
  refresh(): void;
  inspect(directory: string, names: readonly string[]): Record<string, SkillPresence>;
  // Links only the missing names; never touches the user's own folder of the same name.
  install(directory: string, names: readonly string[]): void;
  // Removes only the links AgentHub made.
  uninstall(directory: string, names: readonly string[]): void;
  // AgentHub's copy of a skill the user added.
  addCopy(folder: string, name: string): void;
  removeCopy(name: string): void;
  describe(name: string): string | null;
}

// --- MCP: AgentHub's server registered under one name in each of the account's configs. ---

// 'partial': registered in some configs, or with an older command; 'unknown': a config could not be read.
export type McpState = 'installed' | 'partial' | 'missing' | 'unknown' | 'unavailable';

export interface ToolSkill {
  name: string;
  kind: 'builtin' | 'custom';
  description: string | null;
  // Where a custom skill was added from; AgentHub uses its own copy, not this folder.
  sourcePath: string | null;
}

export interface AccountTools {
  profileId: string;
  name: Message;
  provider: Provider;
  // The machine's own login: its config is the user's main one.
  mainConfig: boolean;
  autoInstall: boolean;
  skillsDirectory: string;
  skills: Record<string, SkillPresence>;
  mcp: McpState;
  // Why the MCP state is unknown or partial, in words for the user.
  mcpDetail: Message[];
}

export interface AgentToolsView {
  skills: ToolSkill[];
  accounts: AccountTools[];
  // Folders every account reads (~/.agents/skills) that hold one of AgentHub's skill names.
  leaked: { directory: string; names: string[] }[];
}

export type ToolRef = { kind: 'skill'; name: string } | { kind: 'mcp' };

// What an account lacks of the tools the context workflow relies on: the shipped skills and MCP.
export interface MissingTools {
  skills: string[];
  mcp: boolean;
}

export interface AgentToolsDependencies {
  store: MetadataStore;
  launcher: Launcher;
  skills: SkillInstaller;
  mcpServer: (profileId: string) => McpServerSpec | null;
  cliOverride: (provider: Provider) => string | null;
  readSkill: (folder: string) => SkillManifest;
  isInside: (child: string, parent: string) => boolean;
  newId: () => string;
  now: () => string;
}

export type AgentTools = ReturnType<typeof createAgentTools>;

export function createAgentTools({ store, launcher, skills, mcpServer, cliOverride, readSkill, isInside, newId, now }: AgentToolsDependencies) {
  const customSkills = (): CustomSkill[] => store.skills.list();
  const allNames = (): string[] => [...skills.builtin, ...customSkills().map((skill) => skill.name)];

  function requireProfile(id: string): AccountProfile {
    const profile = store.profiles.get(id);
    if (!profile) throw new DomainError('NOT_FOUND', 'error.accountNotFound');
    return profile;
  }

  // The main config defaults to off: changing it is the user's call (ADR-020 item 1).
  const autoInstallOf = (profile: AccountProfile): boolean => store.profileTools.autoInstall(profile.id) ?? profile.cliConfigRoot !== null;

  async function mcpState(profile: AccountProfile): Promise<{ state: McpState; detail: Message[]; pending: boolean }> {
    const server = mcpServer(profile.id);
    if (!server) return { state: 'unavailable', detail: [msg('tools.mcpUnavailable')], pending: false };
    const registration = await launcher.mcpRegistration(profile, server, cliOverride(profile.provider));
    const pending = registration.pending.length > 0;
    let state: McpState;
    if (!pending && registration.problems.length === 0) state = 'installed';
    else if (registration.registered.length > 0) state = 'partial';
    else if (registration.problems.length > 0) state = 'unknown';
    else state = 'missing';
    const detail = [...registration.problems, ...(state === 'partial' ? registration.pending.map((path) => msg('tools.mcpPendingIn', { path })) : [])];
    return { state, detail, pending };
  }

  async function accountTools(profile: AccountProfile): Promise<AccountTools> {
    const directory = launcher.skillsDirectory(profile);
    const mcp = await mcpState(profile);
    return {
      profileId: profile.id,
      name: accountName(profile),
      provider: profile.provider,
      mainConfig: profile.cliConfigRoot === null,
      autoInstall: autoInstallOf(profile),
      skillsDirectory: directory,
      skills: skills.inspect(directory, allNames()),
      mcp: mcp.state,
      mcpDetail: mcp.detail,
    };
  }

  function leaked(): AgentToolsView['leaked'] {
    const names = allNames();
    return launcher
      .sharedSkillsDirectories()
      .map((directory) => {
        const state = skills.inspect(directory, names);
        return { directory, names: names.filter((name) => state[name] !== 'missing') };
      })
      .filter((entry) => entry.names.length > 0);
  }

  async function installMcp(profile: AccountProfile): Promise<void> {
    const server = mcpServer(profile.id);
    if (!server) throw new DomainError('MCP_UNAVAILABLE', 'tools.mcpUnavailable');
    await launcher.registerMcp(profile, server, cliOverride(profile.provider));
  }

  async function install(profileId: string, tool: ToolRef): Promise<AccountTools> {
    const profile = requireProfile(profileId);
    if (tool.kind === 'mcp') await installMcp(profile);
    else {
      if (!allNames().includes(tool.name)) throw new DomainError('NOT_FOUND', 'tools.noSkill', { name: tool.name });
      skills.install(launcher.skillsDirectory(profile), [tool.name]);
    }
    return accountTools(profile);
  }

  async function uninstall(profileId: string, tool: ToolRef): Promise<AccountTools> {
    const profile = requireProfile(profileId);
    if (tool.kind === 'mcp') await launcher.unregisterMcp(profile, cliOverride(profile.provider));
    else skills.uninstall(launcher.skillsDirectory(profile), [tool.name]);
    return accountTools(profile);
  }

  return {
    autoInstallOf,

    async view(): Promise<AgentToolsView> {
      const custom = customSkills();
      return {
        skills: [
          ...skills.builtin.map((name): ToolSkill => ({ name, kind: 'builtin', description: skills.describe(name), sourcePath: null })),
          ...custom.map((skill): ToolSkill => ({ name: skill.name, kind: 'custom', description: skills.describe(skill.name), sourcePath: skill.sourcePath })),
        ],
        accounts: await Promise.all(store.profiles.list().map(accountTools)),
        leaked: leaked(),
      };
    },

    account: (profileId: string): Promise<AccountTools> => accountTools(requireProfile(profileId)),

    install,
    uninstall,

    async setAutoInstall(profileId: string, on: boolean): Promise<AccountTools> {
      const profile = requireProfile(profileId);
      store.profileTools.setAutoInstall(profile.id, on);
      return accountTools(profile);
    },

    // What the context workflow needs and the account lacks; the user's own skills of the same
    // name count as present. MCP problems are reported by the launch plan itself.
    async missing(profile: AccountProfile): Promise<MissingTools> {
      const state = skills.inspect(launcher.skillsDirectory(profile), skills.builtin);
      const mcp = await mcpState(profile);
      return { skills: skills.builtin.filter((name) => state[name] === 'missing'), mcp: mcp.pending };
    },

    // Shipped skills and MCP, as opening an account with automatic install does.
    async installContextTools(profile: AccountProfile, options: { skills: boolean; mcp: boolean }): Promise<void> {
      if (options.skills) skills.install(launcher.skillsDirectory(profile), skills.builtin);
      if (options.mcp) await installMcp(profile);
    },

    leaked,

    addSkill(folder: string): ToolSkill {
      for (const shared of launcher.sharedSkillsDirectories()) {
        if (isInside(folder, shared)) {
          throw new DomainError('SKILL_INVALID', 'tools.skillFromShared', { directory: shared });
        }
      }
      const manifest = readSkill(folder);
      if (allNames().includes(manifest.name)) throw new DomainError('SKILL_EXISTS', 'tools.skillTaken', { name: manifest.name });
      skills.addCopy(folder, manifest.name);
      store.skills.insert({ id: newId(), name: manifest.name, sourcePath: folder, addedAt: now() });
      return { name: manifest.name, kind: 'custom', description: manifest.description, sourcePath: folder };
    },

    // Unlinks it from every account first, so no account is left with a broken link.
    removeSkill(name: string): void {
      if (!customSkills().some((skill) => skill.name === name)) throw new DomainError('NOT_FOUND', 'tools.noCustomSkill', { name });
      for (const profile of store.profiles.list()) skills.uninstall(launcher.skillsDirectory(profile), [name]);
      skills.removeCopy(name);
      store.skills.remove(name);
    },
  };
}
