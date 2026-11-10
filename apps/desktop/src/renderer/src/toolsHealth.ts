import type { AccountToolsDto, AgentToolsDto, ToolSkillDto } from '@agenthub/contracts';

// ADR-029: one account's tools reduced to what the user has to do about them.
export interface AccountHealth {
  // Shipped skills the account lacks; the user's own skills are installed one by one.
  missing: string[];
  // A folder of the same name that is not AgentHub's: left alone, shown as a warning.
  foreign: string[];
  // The MCP server can be installed or repaired with one click.
  mcpNeeds: boolean;
  // Installed skills whose source folder changed since AgentHub copied it.
  changed: string[];
  installed: number;
  total: number;
}

export type ToolsAction = 'install' | 'update' | 'view';

export function accountHealth(account: AccountToolsDto, skills: readonly ToolSkillDto[]): AccountHealth {
  const presence = (skill: ToolSkillDto) => account.skills[skill.name] ?? 'missing';
  return {
    missing: skills.filter((skill) => skill.kind === 'builtin' && presence(skill) === 'missing').map((skill) => skill.name),
    foreign: skills.filter((skill) => presence(skill) === 'foreign').map((skill) => skill.name),
    mcpNeeds: account.mcp === 'missing' || account.mcp === 'partial',
    changed: skills.filter((skill) => presence(skill) === 'installed' && skill.source === 'changed').map((skill) => skill.name),
    installed: skills.filter((skill) => presence(skill) === 'installed').length,
    total: skills.length,
  };
}

export const needsInstall = (health: AccountHealth): boolean => health.missing.length > 0 || health.mcpNeeds;

// Something the user should look at: what one click fixes, and what only they can settle.
export const needsAttention = (health: AccountHealth): boolean => needsInstall(health) || health.foreign.length > 0 || health.changed.length > 0;

// The one button of the account's row, most pressing first.
export function toolsAction(health: AccountHealth): ToolsAction {
  if (needsInstall(health)) return 'install';
  if (health.changed.length > 0) return 'update';
  return 'view';
}

export function accountsNeedingAttention(tools: AgentToolsDto | undefined): string[] {
  if (!tools) return [];
  return tools.accounts.filter((account) => needsAttention(accountHealth(account, tools.skills))).map((account) => account.profileId);
}
