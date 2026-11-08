import type { AccountToolsDto, AgentToolsDto, McpLogDto, McpProbeDto, McpServerDto } from '@agenthub/contracts';
import type { MessageKey } from '@agenthub/i18n';
import { useCallback, useEffect, useState } from 'react';
import { PROVIDER_LABELS } from './accounts';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { useI18n } from './i18n';
import { PathText, StatusText, type StatusTone } from './ui';

const STATES: Record<AccountToolsDto['mcp'], { text: MessageKey; tone: StatusTone }> = {
  installed: { text: 'tools.state.installed', tone: 'ok' },
  partial: { text: 'tools.state.partial', tone: 'warning' },
  missing: { text: 'tools.state.missing', tone: 'neutral' },
  unknown: { text: 'tools.state.unknown', tone: 'warning' },
  unavailable: { text: 'tools.state.unavailable', tone: 'warning' },
};

const shellWord = (word: string): string => (/^[\w@%+=:,./<>-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

interface Props {
  onError: (message: string | undefined) => void;
}

// AgentHub's own MCP server (ADR-019 item 6): how it runs, what it offers, and whether each
// account's app reaches it. Installing stays the same action as on the Agent tools table.
export function McpServerPage({ onError }: Props) {
  const { t, tr } = useI18n();
  const [server, setServer] = useState<McpServerDto>();
  const [tools, setTools] = useState<AgentToolsDto>();
  const [log, setLog] = useState<McpLogDto>();
  const [probes, setProbes] = useState<Record<string, McpProbeDto | 'running'>>({});
  const [busy, setBusy] = useState<string>();
  // Installed during this visit: an app that is open has not loaded it yet.
  const [installedNow, setInstalledNow] = useState<Set<string>>(new Set());

  const loadLog = useCallback(async () => {
    try {
      setLog(await unwrap(api.readMcpLog()));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    Promise.all([unwrap(api.getMcpServer()), unwrap(api.getAgentTools())]).then(
      ([loadedServer, loadedTools]) => {
        setServer(loadedServer);
        setTools(loadedTools);
      },
      (reason: unknown) => onError((reason as Error).message),
    );
    void loadLog();
  }, [onError, loadLog]);

  async function change(account: AccountToolsDto, install: boolean): Promise<void> {
    setBusy(account.profileId);
    onError(undefined);
    try {
      const input = { profileId: account.profileId, tool: { kind: 'mcp' as const } };
      const updated = await unwrap(install ? api.installTool(input) : api.uninstallTool(input));
      setTools((current) => current && { ...current, accounts: current.accounts.map((item) => (item.profileId === updated.profileId ? updated : item)) });
      setInstalledNow((current) => {
        const next = new Set(current);
        if (install) next.add(account.profileId);
        else next.delete(account.profileId);
        return next;
      });
      setProbes((current) => withoutKey(current, account.profileId));
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function probe(account: AccountToolsDto): Promise<void> {
    setProbes((current) => ({ ...current, [account.profileId]: 'running' }));
    onError(undefined);
    try {
      const result = await unwrap(api.probeMcpServer({ profileId: account.profileId }));
      setProbes((current) => ({ ...current, [account.profileId]: result }));
    } catch (reason) {
      setProbes((current) => withoutKey(current, account.profileId));
      onError((reason as Error).message);
    }
    void loadLog();
  }

  const command = server?.command ? [server.command, ...server.args].map(shellWord).join(' ') : null;

  return (
    <div className="stack">
      <header className="settings-intro">
        <h2>{t('mcpPage.title')}</h2>
        <p className="hint">{t('mcpPage.hint')}</p>
      </header>

      {server && server.command === null && (
        <p className="banner warning" role="alert">
          {t('mcpPage.noCommand')}
        </p>
      )}

      <section className="settings-group" aria-label={t('mcpPage.accounts')}>
        <div className="settings-group-header">
          <div className="grow">
            <h2>{t('mcpPage.accounts')}</h2>
            <p className="hint">{t('mcpPage.accountsHint')}</p>
          </div>
        </div>
        {tools?.accounts.length === 0 && <p className="settings-empty hint">{t('mcpPage.noAccounts')}</p>}
        <ul className="settings-list">
          {tools?.accounts.map((account) => {
            const state = STATES[account.mcp];
            const result = probes[account.profileId];
            const name = tr(account.name);
            const canInstall = account.mcp === 'missing' || account.mcp === 'partial';
            const canRemove = account.mcp === 'installed' || account.mcp === 'partial';
            return (
              <li key={account.profileId} className="settings-row mcp-account" aria-label={name}>
                <div className="grow settings-row-text">
                  <span className="settings-row-label truncate" title={name}>
                    {name}
                  </span>
                  <span className="hint">
                    {PROVIDER_LABELS[account.provider]}
                    {account.mainConfig ? ` · ${t('tools.mainConfig')}` : ''}
                  </span>
                  <StatusText tone={state.tone}>{t(state.text)}</StatusText>
                  {account.mcpDetail.map((detail, index) => (
                    <span key={index} className="hint">
                      {tr(detail)}
                    </span>
                  ))}
                  {installedNow.has(account.profileId) && account.mcp === 'installed' && <span className="hint">{t('mcpPage.restartHint')}</span>}
                  {result && result !== 'running' && <ProbeResult result={result} />}
                </div>
                <div className="row nowrap mcp-account-actions">
                  {canInstall && (
                    <button type="button" className="small" disabled={busy !== undefined || !server?.command} onClick={() => void change(account, true)}>
                      {t('tools.install')}
                    </button>
                  )}
                  {canRemove && (
                    <button type="button" className="small" disabled={busy !== undefined} onClick={() => void change(account, false)}>
                      {t('tools.remove')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="small"
                    aria-label={t('mcpPage.testFor', { account: name })}
                    disabled={result === 'running' || !server?.command}
                    onClick={() => void probe(account)}
                  >
                    {result === 'running' ? t('mcpPage.testing') : t('mcpPage.test')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {server && (
        <section className="settings-group" aria-label={t('mcpPage.tools')}>
          <div className="settings-group-header">
            <h2 className="grow">{t('mcpPage.tools')}</h2>
          </div>
          <ul className="settings-list">
            {server.tools.map((tool) => (
              <li key={tool.name} className="settings-row">
                <div className="grow settings-row-text">
                  <code className="tools-name">{tool.name}</code>
                  <span className="hint">{t(`mcpTool.${tool.name}` as MessageKey)}</span>
                </div>
                <span className={`badge ${tool.readOnly ? '' : 'warning'}`}>{t(tool.readOnly ? 'mcpPage.readOnly' : 'mcpPage.writes')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {server && (
        <section className="settings-group" aria-label={t('mcpPage.run')}>
          <div className="settings-group-header">
            <div className="grow">
              <h2>{t('mcpPage.run')}</h2>
              <p className="hint">{t('mcpPage.runHint')}</p>
            </div>
            {command && <CopyButton text={command} label={t('mcpPage.copyCommand')} />}
          </div>
          <div className="settings-row">
            <dl className="facts grow">
              <dt>{t('mcpPage.command')}</dt>
              <dd className="path" data-testid="mcp-command">
                {server.command ? <PathText path={server.command} /> : '—'}
              </dd>
              <dt>{t('mcpPage.args')}</dt>
              <dd className="path">
                {server.args.map((arg) => (
                  <span key={arg} className="mcp-arg">
                    <PathText path={arg} />
                  </span>
                ))}
              </dd>
              <dt>{t('mcpPage.version')}</dt>
              <dd>
                {server.name} {server.version}
              </dd>
              <dt>{t('mcpPage.protocols')}</dt>
              <dd>{server.protocolVersions.join(', ')}</dd>
            </dl>
          </div>
        </section>
      )}

      <section className="settings-group" aria-label={t('mcpPage.log')}>
        <div className="settings-group-header">
          <div className="grow">
            <h2>{t('mcpPage.log')}</h2>
            {log?.exists && <p className="hint">{t('mcpPage.logHint', { count: log.lines.length })}</p>}
          </div>
          <div className="row nowrap">
            <button type="button" onClick={() => void loadLog()}>
              {t('mcpPage.refresh')}
            </button>
            <button type="button" disabled={!log?.exists} onClick={() => void unwrap(api.revealMcpLog()).catch((reason: unknown) => onError((reason as Error).message))}>
              {t('mcpPage.reveal')}
            </button>
          </div>
        </div>
        {log && !log.exists && <p className="settings-empty hint">{t('mcpPage.logEmpty')}</p>}
        {log?.exists && (
          <pre className="mcp-log" data-testid="mcp-log">
            {log.lines.join('\n')}
          </pre>
        )}
      </section>
    </div>
  );
}

function ProbeResult({ result }: { result: McpProbeDto }) {
  const { t, tr } = useI18n();
  if (!result.ok) {
    return (
      <span className="warning-text" role="status">
        {t('mcpPage.failed')}: {result.error ? tr(result.error) : ''}
      </span>
    );
  }
  return (
    <span className="mcp-probe" role="status">
      <span className="login-state ok">{t('mcpPage.ok', { tools: result.tools.length, ms: result.durationMs })}</span>
      <span className="hint">
        {result.projects && result.projects.length > 0
          ? t('mcpPage.sees', { count: result.projects.length, names: result.projects.join(', ') })
          : t('mcpPage.seesNone')}
      </span>
    </span>
  );
}
