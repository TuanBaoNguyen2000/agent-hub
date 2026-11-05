import type { AccountToolsDto, AgentToolsDto, SkillPresenceDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '@agenthub/i18n';
import { PROVIDER_LABELS } from './accounts';
import { api, unwrap } from './api';
import { useI18n } from './i18n';

type Tool = { kind: 'skill'; name: string } | { kind: 'mcp' };

const MCP_LABEL = 'MCP "agenthub"';

const SKILL_STATES: Record<SkillPresenceDto, { text: MessageKey; tone: string; hint?: MessageKey }> = {
  installed: { text: 'tools.state.installed', tone: 'ok' },
  missing: { text: 'tools.state.missing', tone: '' },
  foreign: { text: 'tools.state.foreign', tone: 'warning', hint: 'tools.state.foreignHint' },
};

const MCP_STATES: Record<AccountToolsDto['mcp'], { text: MessageKey; tone: string }> = {
  installed: { text: 'tools.state.installed', tone: 'ok' },
  partial: { text: 'tools.state.partial', tone: 'warning' },
  missing: { text: 'tools.state.missing', tone: '' },
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
}

// ADR-020 item 1: which skills and MCP server each account has, read from its own folders.
export function AgentToolsSection({ onError, accountsVersion, focused }: Props) {
  const { t, tr } = useI18n();
  const [tools, setTools] = useState<AgentToolsDto>();
  const [busy, setBusy] = useState<string>();
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

  function cellButtons(account: AccountToolsDto, tool: Tool, canInstall: boolean, canRemove: boolean) {
    const disabled = busy !== undefined;
    const params = { tool: toolName(tool), account: tr(account.name) };
    return (
      <span className="tools-actions">
        {canInstall && (
          <button type="button" className="small" disabled={disabled} aria-label={t('tools.installFor', params)} onClick={() => void change(account, tool, true)}>
            {t('tools.install')}
          </button>
        )}
        {canRemove && (
          <button type="button" className="small" disabled={disabled} aria-label={t('tools.removeFrom', params)} onClick={() => void change(account, tool, false)}>
            {t('tools.remove')}
          </button>
        )}
      </span>
    );
  }

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
      ) : tools.accounts.length === 0 ? (
        <p className="hint settings-empty">{t('accounts.empty')}</p>
      ) : (
        <div className="tools-scroll">
          <table className="tools-table">
            <thead>
              <tr>
                <th scope="col">{t('tools.column')}</th>
                {tools.accounts.map((account) => (
                  <th key={account.profileId} scope="col">
                    <span className="tools-account">
                      <span className="truncate" title={tr(account.name)}>
                        {tr(account.name)}
                      </span>
                      <span className="hint">
                        {PROVIDER_LABELS[account.provider]}
                        {account.mainConfig ? ` · ${t('tools.mainConfig')}` : ''}
                      </span>
                      <label className="choice tools-auto">
                        <input
                          type="checkbox"
                          checked={account.autoInstall}
                          disabled={busy !== undefined}
                          aria-label={t('tools.autoFor', { account: tr(account.name) })}
                          onChange={(event) => void setAuto(account, event.target.checked)}
                        />
                        {t('tools.auto')}
                      </label>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tools.skills.map((skill) => (
                <tr key={skill.name}>
                  <th scope="row">
                    <div className="tools-skill">
                      <span className="tools-name">
                        <code>{skill.name}</code>
                        {skill.kind === 'custom' && <span className="badge">{t('tools.custom')}</span>}
                      </span>
                      {skill.description && <span className="hint tools-description">{skill.description}</span>}
                      {skill.kind === 'custom' && (
                        <button
                          type="button"
                          className="small"
                          disabled={busy !== undefined}
                          aria-label={t('tools.deleteSkillFor', { name: skill.name })}
                          onClick={() => void removeSkill(skill.name)}
                        >
                          {t('tools.deleteSkill')}
                        </button>
                      )}
                    </div>
                  </th>
                  {tools.accounts.map((account) => {
                    const presence = account.skills[skill.name] ?? 'missing';
                    const state = SKILL_STATES[presence];
                    return (
                      <td key={account.profileId} aria-label={`${skill.name} · ${tr(account.name)}: ${t(state.text)}`}>
                        <span className={`badge ${state.tone}`} title={state.hint ? t(state.hint) : undefined}>
                          {t(state.text)}
                        </span>
                        {cellButtons(account, { kind: 'skill', name: skill.name }, presence === 'missing', presence === 'installed')}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <div className="tools-skill">
                    <span className="tools-name">
                      <code>{MCP_LABEL}</code>
                    </span>
                    <span className="hint tools-description">{t('tools.mcpDescription')}</span>
                  </div>
                </th>
                {tools.accounts.map((account) => {
                  const state = MCP_STATES[account.mcp];
                  return (
                    <td key={account.profileId} aria-label={`${MCP_LABEL} · ${tr(account.name)}: ${t(state.text)}`}>
                      <span className={`badge ${state.tone}`} title={account.mcpDetail.map(tr).join('\n') || undefined}>
                        {t(state.text)}
                      </span>
                      {cellButtons(
                        account,
                        { kind: 'mcp' },
                        account.mcp === 'missing' || account.mcp === 'partial',
                        account.mcp === 'installed' || account.mcp === 'partial',
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="hint tools-footnote">{t('tools.footnote')}</p>
    </section>
  );
}
