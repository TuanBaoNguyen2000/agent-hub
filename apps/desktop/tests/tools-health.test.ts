import type { AccountToolsDto, AgentToolsDto, ToolSkillDto } from '@agenthub/contracts';
import { describe, expect, it } from 'vitest';
import { shownWindows } from '../src/renderer/src/usageWindows';
import { QUICK_COMMANDS, commandArgument, skillCommand } from '../src/renderer/src/quickCommands';
import { accountHealth, accountsNeedingAttention, needsInstall, toolsAction } from '../src/renderer/src/toolsHealth';

// ADR-029: what an account's row asks of the user; ADR-028 item 7: the quick commands.

const skill = (name: string, kind: 'builtin' | 'custom' = 'builtin', source: ToolSkillDto['source'] = null): ToolSkillDto => ({
  name,
  kind,
  description: null,
  sourcePath: kind === 'custom' ? `/src/${name}` : null,
  updated: false,
  source,
});
const skills = [skill('context-resume'), skill('context-checkpoint'), skill('mine', 'custom', 'changed')];
const account = (over: Partial<AccountToolsDto>): AccountToolsDto => ({
  profileId: 'a',
  name: { key: 'common.raw', params: { text: 'A' } },
  provider: 'claude',
  mainConfig: false,
  autoInstall: true,
  skillsDirectory: '/x',
  skills: { 'context-resume': 'installed', 'context-checkpoint': 'installed' },
  mcp: 'installed',
  mcpDetail: [],
  ...over,
});

describe('account health', () => {
  it('asks to install when a shipped skill or the MCP server is missing', () => {
    const health = accountHealth(account({ skills: { 'context-resume': 'installed' }, mcp: 'partial' }), skills);
    expect(health.missing).toEqual(['context-checkpoint']);
    expect(health.mcpNeeds).toBe(true);
    expect(needsInstall(health)).toBe(true);
    expect(toolsAction(health)).toBe('install');
  });

  it('does not count the user’s own skills as missing, and offers an update when their source changed', () => {
    const health = accountHealth(account({ skills: { 'context-resume': 'installed', 'context-checkpoint': 'installed', mine: 'installed' } }), skills);
    expect(health.missing).toEqual([]);
    expect(health.changed).toEqual(['mine']);
    expect(toolsAction(health)).toBe('update');
  });

  it('only views a complete account, and flags clashing names without an install', () => {
    expect(toolsAction(accountHealth(account({}), skills))).toBe('view');
    const clash = accountHealth(account({ skills: { 'context-resume': 'foreign', 'context-checkpoint': 'installed' } }), skills);
    expect(clash.foreign).toEqual(['context-resume']);
    expect(toolsAction(clash)).toBe('view');
  });

  it('counts the accounts that need attention', () => {
    const tools: AgentToolsDto = { skills, accounts: [account({}), account({ profileId: 'b', mcp: 'missing' })], leaked: [] };
    expect(accountsNeedingAttention(tools)).toEqual(['b']);
    expect(accountsNeedingAttention(undefined)).toEqual([]);
  });
});

describe('quick commands', () => {
  it('calls skills with "/", which Claude Code and Codex both take', () => {
    expect(skillCommand('context-resume', 'TASK-004')).toBe('/context-resume TASK-004');
    expect(skillCommand('context-checkpoint')).toBe('/context-checkpoint');
  });

  it('passes the task or "status" where the command takes one', () => {
    const byId = new Map(QUICK_COMMANDS.map((command) => [command.id, command]));
    expect(commandArgument(byId.get('resume')!, 'TASK-007')).toBe('TASK-007');
    expect(commandArgument(byId.get('status')!, 'TASK-007')).toBe('status');
    expect(commandArgument(byId.get('checkpoint')!, 'TASK-007')).toBeUndefined();
    // Without a task the command stays general.
    expect(commandArgument(byId.get('resume')!, null)).toBeUndefined();
  });
});

describe('usage windows on an account row', () => {
  it('shows the 5-hour and weekly windows, or the only other limit an account has (backlog I5)', () => {
    expect(shownWindows([{ kind: 'session' }, { kind: 'week' }, { kind: 'other' }]).map((w) => w.kind)).toEqual(['session', 'week']);
    expect(shownWindows([{ kind: 'other' }]).map((w) => w.kind)).toEqual(['other']);
  });
});
