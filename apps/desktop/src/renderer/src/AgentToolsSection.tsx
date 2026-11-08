import type { AccountToolsDto, AgentToolsDto, SkillPresenceDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '@agenthub/i18n';
import { PROVIDER_LABELS } from './accounts';
import { api, unwrap } from './api';
import { More } from './icons';
import { useI18n } from './i18n';
import { Menu, MenuItem, StatusText, type StatusTone } from './ui';

type Tool = { kind: 'skill'; name: string } | { kind: 'mcp' };

const MCP_LABEL = 'MCP "agenthub"';

const SKILL_STATES: Record<SkillPresenceDto, { text: MessageKey; tone: StatusTone; hint?: MessageKey }> = {
  installed: { text: 'tools.state.installed', tone: 'ok' },
  missing: { text: 'tools.state.missing', tone: 'neutral' },
  foreign: { text: 'tools.state.foreign', tone: 'warning', hint: 'tools.state.foreignHint' },
};

const MCP_STATES: Record<AccountToolsDto['mcp'], { text: MessageKey; tone: StatusTone }> = {
  installed: { text: 'tools.state.installed', tone: 'ok' },
  partial: { text: 'tools.state.partial', tone: 'warning' },
  missing: { text: 'tools.state.missing', tone: 'neutral' },
  unknown: { text: 'tools.state.unknown', tone: 'warning' },
  unavailable: { text: 'tools.state.unavailable', tone: 'warning' },
};

const toolName = (tool: Tool): string => (tool.kind === 'mcp' ? MCP_LABEL : tool.name);

interface Props {
  onError: (message: string | undefined) => void;
  // Changes whenever the accounts change, so the table reads them again.
  accountsVersion: number;
  // Scrolled into view when a launch sent the user here.
  focused: boolean;
  onOpenMcp: () => void;
}

// ADR-020 item 1: which skills and MCP server each account has, read from its own folders.
export function AgentToolsSection({ onError, accountsVersion, focused, onOpenMcp }: Props) {
  const { t, tr } = useI18n();
  const [tools, setTools] = useState<AgentToolsDto>();
  const [busy, setBusy] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const section = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      setTools(await unwrap(api.getAgentTools()));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, accountsVersion]);

  const loaded = tools !== undefined;
  useEffect(() => {
    if (focused && loaded) section.current?.scrollIntoView({ block: 'start' });
  }, [focused, loaded]);

  function replaceAccount(account: AccountToolsDto): void {
    setTools(
      (current) =>
        current && {
          ...current,
          accounts: current.accounts.map((item) => (item.profileId === account.profileId ? account : item)),
        },
    );
  }

  async function run(key: string, action: () => Promise<void>): Promise<void> {
    setBusy(key);
    onError(undefined);
    try {
      await action();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  const change = (account: AccountToolsDto, tool: Tool, install: boolean) =>
    run(`${account.profileId}:${toolName(tool)}`, async () => {
      const input = { profileId: account.profileId, tool };
      replaceAccount(await unwrap(install ? api.installTool(input) : api.uninstallTool(input)));
    });

  const setAuto = (account: AccountToolsDto, on: boolean) =>
    run(`${account.profileId}:auto`, async () => replaceAccount(await unwrap(api.setToolsAutoInstall({ profileId: account.profileId, on }))));

  const addSkill = () =>
    run('add-skill', async () => {
      const path = await unwrap(api.pickProjectFolder());
      if (path) setTools(await unwrap(api.addSkill({ path })));
    });

  const removeSkill = (name: string) => run(`remove:${name}`, async () => setTools(await unwrap(api.removeSkill({ name }))));

  const selectedAccount = tools?.accounts.find((account) => account.profileId === selected) ?? tools?.accounts[0];

  return (
    <section className="settings-group" aria-label={t('tools.title')} ref={section}>
      <div className="settings-group-header">
        <div className="grow">
          <h2>{t('tools.title')}</h2>
          <p className="hint">{t('tools.hint')}</p>
        </div>
        <button type="button" disabled={busy !== undefined} onClick={() => void addSkill()}>
          {t('tools.addSkill')}
        </button>
      </div>
      {tools?.leaked.map((entry) => (
        <p key={entry.directory} className="banner warning tools-banner">
          {t('tools.leaked', { directory: entry.directory, names: entry.names.join(', ') })}
        </p>
      ))}
      {!tools ? (
        <p className="hint settings-empty">{t('tools.checking')}</p>
      ) : !selectedAccount ? (
        <p className="hint settings-empty">{t('accounts.empty')}</p>
      ) : (
        <div className="tools-layout">
          <div className="tools-accounts" role="tablist" aria-orientation="vertical" aria-label={t('nav.accounts')}>
            {tools.accounts.map((account) => {
              const total = tools.skills.length + 1;
              const installed = tools.skills.filter((skill) => account.skills[skill.name] === 'installed').length + (account.mcp === 'installed' ? 1 : 0);
              return (
                <button
                  key={account.profileId}
                  type="button"
                  role="tab"
                  aria-selected={account.profileId === selectedAccount.profileId}
                  className="tools-account-item"
                  onClick={() => setSelected(account.profileId)}
                >
                  <span className="truncate" title={tr(account.name)}>
                    {tr(account.name)}
                  </span>
                  <span className="hint">
                    {PROVIDER_LABELS[account.provider]}
                    {account.mainConfig ? ` · ${t('tools.mainConfig')}` : ''}
                  </span>
                  <StatusText tone={installed === total ? 'ok' : 'neutral'}>{t('tools.summary', { installed, total })}</StatusText>
                </button>
              );
            })}
          </div>
          <AccountTools
            account={selectedAccount}
            tools={tools}
            busy={busy !== undefined}
            onChange={(tool, install) => void change(selectedAccount, tool, install)}
            onAuto={(on) => void setAuto(selectedAccount, on)}
            onRemoveSkill={(name) => void removeSkill(name)}
            onOpenMcp={onOpenMcp}
          />
        </div>
      )}
    </section>
  );
}

interface AccountToolsProps {
  account: AccountToolsDto;
  tools: AgentToolsDto;
  busy: boolean;
  onChange: (tool: Tool, install: boolean) => void;
  onAuto: (on: boolean) => void;
  onRemoveSkill: (name: string) => void;
  onOpenMcp: () => void;
}

// The tools of one account: what each one is, its state, and one action; removing is in the menu.
function AccountTools({ account, tools, busy, onChange, onAuto, onRemoveSkill, onOpenMcp }: AccountToolsProps) {
  const { t, tr } = useI18n();
  const accountName = tr(account.name);

  function row(tool: Tool, info: { description: string | null; custom: boolean }, state: { text: MessageKey; tone: StatusTone; title?: string | undefined }, canInstall: boolean, canRemove: boolean) {
    const name = toolName(tool);
    const params = { tool: name, account: accountName };
    return (
      <li key={name} className="tools-row">
        <div className="tools-skill">
          <span className="tools-name">
            <code>{name}</code>
            {info.custom && <span className="badge">{t('tools.custom')}</span>}
          </span>
          {info.description && <span className="hint tools-description">{info.description}</span>}
          {tool.kind === 'mcp' && (
            <button type="button" className="link tools-details" aria-label={t('mcpPage.openLabel')} onClick={onOpenMcp}>
              {t('mcpPage.open')}
            </button>
          )}
        </div>
        <span aria-label={`${name} · ${accountName}: ${t(state.text)}`}>
          <StatusText tone={state.tone} title={state.title}>
            {t(state.text)}
          </StatusText>
        </span>
        <span className="tools-row-actions">
          {canInstall && (
            <button type="button" className="small" disabled={busy} aria-label={t('tools.installFor', params)} onClick={() => onChange(tool, true)}>
              {t('tools.install')}
            </button>
          )}
          {(canRemove || info.custom) && (
            <Menu label={t('tools.moreFor', params)} trigger={<More />} triggerClassName="icon-button" align="end" disabled={busy}>
              {canRemove && <MenuItem onSelect={() => onChange(tool, false)}>{t('tools.removeFrom', params)}</MenuItem>}
              {info.custom && tool.kind === 'skill' && (
                <MenuItem tone="danger" onSelect={() => onRemoveSkill(tool.name)}>
                  {t('tools.deleteSkillFor', { name: tool.name })}
                </MenuItem>
              )}
            </Menu>
          )}
        </span>
      </li>
    );
  }

  const mcpState = MCP_STATES[account.mcp];
  return (
    <div className="tools-detail" role="tabpanel" aria-label={accountName}>
      <label className="settings-row choice">
        <input type="checkbox" checked={account.autoInstall} disabled={busy} aria-label={t('tools.autoFor', { account: accountName })} onChange={(event) => onAuto(event.target.checked)} />
        <span className="settings-row-text">
          <span>{t('tools.auto')}</span>
          <span className="hint">{t('tools.footnote')}</span>
        </span>
      </label>
      <ul className="tools-list">
        {tools.skills.map((skill) => {
          const presence = account.skills[skill.name] ?? 'missing';
          const state = SKILL_STATES[presence];
          return row(
            { kind: 'skill', name: skill.name },
            { description: skill.description, custom: skill.kind === 'custom' },
            { text: state.text, tone: state.tone, title: state.hint ? t(state.hint) : undefined },
            presence === 'missing',
            presence === 'installed',
          );
        })}
        {row(
          { kind: 'mcp' },
          { description: t('tools.mcpDescription'), custom: false },
          { text: mcpState.text, tone: mcpState.tone, title: account.mcpDetail.map(tr).join('\n') || undefined },
          account.mcp === 'missing' || account.mcp === 'partial',
          account.mcp === 'installed' || account.mcp === 'partial',
        )}
      </ul>
    </div>
  );
}
