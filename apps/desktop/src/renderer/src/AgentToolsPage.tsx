import type { AccountToolsDto, AgentToolsDto, ClientModeDto, ProfileDto, ToolSkillDto, UsageDto } from '@agenthub/contracts';
import { translate } from '@agenthub/i18n';
import { useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, windowLabel } from './accounts';
import { AccountTools, skillNotice } from './AgentToolsSection';
import { api, unwrap } from './api';
import { CopyButton } from './CopyButton';
import { useI18n } from './i18n';
import { ChevronRight, Gear, Monitor, More, Plug, Puzzle, Terminal } from './icons';
import { McpServerPage } from './McpServerPage';
import { QUICK_COMMANDS, commandArgument, skillCommand } from './quickCommands';
import { SkillViewer } from './SkillViewer';
import { type AccountHealth, accountHealth, needsAttention, needsInstall, toolsAction } from './toolsHealth';
import { Dialog, Menu, MenuItem, StatusText } from './ui';
import { shownWindows, usageTone, windowTitle } from './usage';

// ADR-029: the agent tools are a place of their own, beside projects and chats: an overview of every
// account, a page per account, and three sub-pages for what is used less often.
export type ToolsView = { kind: 'overview' } | { kind: 'library' } | { kind: 'mcp' } | { kind: 'commands' } | { kind: 'account'; id: string };

interface Shared {
  tools: AgentToolsDto | undefined;
  onTools: (tools: AgentToolsDto) => void;
  onError: (message: string | undefined) => void;
}

// What one click installs for an account: the shipped skills it lacks and the MCP server.
async function installMissing(account: AccountToolsDto, health: AccountHealth): Promise<void> {
  for (const name of health.missing) await unwrap(api.installTool({ profileId: account.profileId, tool: { kind: 'skill', name } }));
  if (health.mcpNeeds) await unwrap(api.installTool({ profileId: account.profileId, tool: { kind: 'mcp' } }));
}

function BackLink({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="link back-link" onClick={onBack}>
      ‹ {t('tools.title')}
    </button>
  );
}

function healthText(t: ReturnType<typeof useI18n>['t'], health: AccountHealth): { text: string; tone: 'ok' | 'warning' } {
  if (health.missing.length > 0) return { text: t('tools.health.missing', { count: health.missing.length }), tone: 'warning' };
  if (health.foreign.length > 0) return { text: t('tools.health.foreign'), tone: 'warning' };
  if (health.changed.length > 0) return { text: t('tools.health.changed'), tone: 'warning' };
  return { text: t('tools.health.complete'), tone: 'ok' };
}

const MCP_TEXT = {
  installed: 'tools.state.installed',
  partial: 'tools.state.partial',
  missing: 'tools.state.missing',
  unknown: 'tools.state.unknown',
  unavailable: 'tools.state.unavailable',
} as const;

// --- Overview: every account in one list, one button per row ---

export function ToolsOverview({ tools, onTools, onError, accounts, onView }: Shared & { accounts: ProfileDto[] | undefined; onView: (view: ToolsView) => void }) {
  const { t, tr } = useI18n();
  const [busy, setBusy] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState<ToolSkillDto>();

  const rows = (accounts ?? [])
    .map((profile) => tools?.accounts.find((account) => account.profileId === profile.id))
    .filter((account): account is AccountToolsDto => account !== undefined);
  const healths = new Map(rows.map((account) => [account.profileId, accountHealth(account, tools?.skills ?? [])]));
  const toInstall = rows.filter((account) => needsInstall(healths.get(account.profileId) as AccountHealth));
  const attention = rows.filter((account) => needsAttention(healths.get(account.profileId) as AccountHealth)).length;

  async function reload(): Promise<void> {
    onTools(await unwrap(api.getAgentTools()));
  }

  async function run(key: string, action: () => Promise<void>): Promise<void> {
    setBusy(key);
    onError(undefined);
    try {
      await action();
      await reload();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  function act(account: AccountToolsDto, health: AccountHealth): void {
    const action = toolsAction(health);
    if (action === 'install') void run(account.profileId, () => installMissing(account, health));
    else if (action === 'update') setViewing(tools?.skills.find((skill) => skill.name === health.changed[0]));
    else onView({ kind: 'account', id: account.profileId });
  }

  return (
    <section className="tools-page stack" aria-label={t('tools.title')}>
      <div className="tools-page-head">
        <div className="grow">
          <h1>{t('tools.title')}</h1>
          <p className="hint">{!tools ? t('tools.checking') : attention > 0 ? t('tools.overview.attention', { count: attention }) : t('tools.overview.allGood')}</p>
        </div>
        {toInstall.length > 0 && (
          <button type="button" className="primary" disabled={busy !== undefined} onClick={() => setConfirming(true)}>
            {t('tools.installAll')}
          </button>
        )}
      </div>
      {tools?.leaked.map((entry) => (
        <p key={entry.directory} className="banner warning">
          {t('tools.leaked', { directory: entry.directory, names: entry.names.join(', ') })}
        </p>
      ))}
      {accounts?.length === 0 && <p className="hint">{t('accounts.empty')}</p>}
      {rows.length > 0 && (
        <ul className="tools-accounts-list" aria-label={t('nav.accounts')}>
          {rows.map((account) => {
            const health = healths.get(account.profileId) as AccountHealth;
            const profile = accounts?.find((item) => item.id === account.profileId);
            const state = healthText(t, health);
            const action = toolsAction(health);
            const name = tr(account.name);
            return (
              <li key={account.profileId} className="tools-account-row">
                <button type="button" className="tools-account-open" aria-label={t('tools.openAccount', { account: name })} onClick={() => onView({ kind: 'account', id: account.profileId })}>
                  {profile && <AccountAvatar account={profile} size="sm" />}
                  <span className="tools-account-name">
                    <span className="truncate">{name}</span>
                    <span className="hint truncate">
                      {PROVIDER_LABELS[account.provider]}
                      {profile ? ` · ${windowLabel(t, profile)}` : ''}
                    </span>
                  </span>
                </button>
                <span className="tools-account-state">
                  <StatusText tone={state.tone}>{`${t('tools.skills')} ${health.installed}/${health.total} · ${state.text}`}</StatusText>
                  <StatusText tone={account.mcp === 'installed' ? 'ok' : 'warning'}>{`MCP · ${t(MCP_TEXT[account.mcp])}`}</StatusText>
                </span>
                <button
                  type="button"
                  className={action === 'view' ? 'small' : 'small primary'}
                  disabled={busy !== undefined}
                  aria-label={t(`tools.action.${action}For`, { account: name })}
                  onClick={() => act(account, health)}
                >
                  {busy === account.profileId ? t('tools.installing') : t(`tools.action.${action}`)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <nav className="tools-subpages" aria-label={t('tools.more')}>
        <button type="button" className="tools-subpage" onClick={() => onView({ kind: 'library' })}>
          <Puzzle />
          <span className="grow">
            <span>{t('tools.library')}</span>
            <span className="hint">{t('tools.libraryHint', { count: tools?.skills.length ?? 0 })}</span>
          </span>
          <ChevronRight />
        </button>
        <button type="button" className="tools-subpage" onClick={() => onView({ kind: 'mcp' })}>
          <Plug />
          <span className="grow">
            <span>{t('mcpPage.title')}</span>
            <span className="hint">{t('tools.mcpHint')}</span>
          </span>
          <ChevronRight />
        </button>
        <button type="button" className="tools-subpage" onClick={() => onView({ kind: 'commands' })}>
          <Terminal />
          <span className="grow">
            <span>{t('quick.title')}</span>
            <span className="hint">{t('quick.hint')}</span>
          </span>
          <ChevronRight />
        </button>
      </nav>
      {confirming && (
        <Dialog
          label={t('tools.installAll')}
          title={t('tools.installAll')}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button type="button" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy !== undefined}
                onClick={() => {
                  setConfirming(false);
                  void run('all', async () => {
                    for (const account of toInstall) await installMissing(account, healths.get(account.profileId) as AccountHealth);
                  });
                }}
              >
                {t('tools.install')}
              </button>
            </>
          }
        >
          <ul className="stack install-plan">
            {toInstall.map((account) => {
              const health = healths.get(account.profileId) as AccountHealth;
              return (
                <li key={account.profileId}>
                  <strong>{tr(account.name)}</strong> · {PROVIDER_LABELS[account.provider]}
                  {health.missing.length > 0 && <p className="hint">{`${t('tools.skills')}: ${health.missing.join(', ')}`}</p>}
                  {health.mcpNeeds && <p className="hint">MCP "agenthub"</p>}
                  {account.mainConfig && <p className="warning-text">{t('tools.installAllMain')}</p>}
                </li>
              );
            })}
          </ul>
        </Dialog>
      )}
      {viewing && <SkillViewer name={viewing.name} sourcePath={viewing.sourcePath} onClose={() => setViewing(undefined)} onChanged={onTools} onError={onError} />}
    </section>
  );
}

// --- One account: usage, its skills and MCP server, and its quick commands ---

export function AccountToolsPage({
  tools,
  onTools,
  onError,
  account: profile,
  usage,
  onBack,
  onLaunch,
  onManage,
  onOpenMcp,
}: Shared & {
  account: ProfileDto;
  usage: UsageDto | undefined;
  onBack: () => void;
  onLaunch: (account: ProfileDto, mode: ClientModeDto) => void;
  onManage: () => void;
  onOpenMcp: () => void;
}) {
  const i18n = useI18n();
  const { t, tr } = i18n;
  const [busy, setBusy] = useState<string>();
  const [viewing, setViewing] = useState<ToolSkillDto>();
  const account = tools?.accounts.find((item) => item.profileId === profile.id);
  const name = tr(profile.name);
  const windows = usage?.state === 'ok' ? shownWindows(usage.windows) : [];

  function replaceAccount(next: AccountToolsDto): void {
    if (tools) onTools({ ...tools, accounts: tools.accounts.map((item) => (item.profileId === next.profileId ? next : item)) });
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

  return (
    <section className="tools-page stack" aria-label={name}>
      <BackLink onBack={onBack} />
      <div className="tools-page-head">
        <AccountAvatar account={profile} />
        <div className="grow tools-account-name">
          <h1 className="truncate">{name}</h1>
          <span className="hint">
            {PROVIDER_LABELS[profile.provider]} · {windowLabel(t, profile)}
          </span>
        </div>
        {/* Review 2026-11-10: Desktop and Terminal are equal choices, side by side. */}
        <span className="row nowrap account-open">
          <button type="button" onClick={() => onLaunch(profile, 'desktop')}>
            <Monitor />
            {t('launch.openDesktop')}
          </button>
          <button type="button" onClick={() => onLaunch(profile, 'cli')}>
            <Terminal />
            {t('launch.openTerminal')}
          </button>
          <button type="button" className="icon-button" aria-label={t('accounts.manage')} title={t('accounts.manage')} onClick={onManage}>
            <Gear />
          </button>
        </span>
      </div>
      {windows.length > 0 && (
        <div className="account-usage" aria-label={t('tools.usage')}>
          {windows.map((window) => {
            const title = windowTitle(i18n, window);
            const percent = Math.round(window.usedPercent);
            return (
              <span key={title} className="mini-usage" title={t('usage.meter', { title, percent })}>
                <span className="mini-usage-label">
                  {title} <strong>{percent}%</strong>
                </span>
                <span className={`usage-bar ${usageTone(window.usedPercent)}`} aria-hidden="true">
                  <span style={{ width: `${Math.min(window.usedPercent, 100)}%` }} />
                </span>
              </span>
            );
          })}
        </div>
      )}

      {!tools || !account ? (
          <p className="hint settings-empty">{t('tools.checking')}</p>
        ) : (
          <AccountTools
            account={account}
            tools={tools}
            busy={busy !== undefined}
            onChange={(tool, install) =>
              void run(`${tool.kind}`, async () => {
                const input = { profileId: account.profileId, tool };
                replaceAccount(await unwrap(install ? api.installTool(input) : api.uninstallTool(input)));
              })
            }
            onAuto={(on) => void run('auto', async () => replaceAccount(await unwrap(api.setToolsAutoInstall({ profileId: account.profileId, on }))))}
            onRemoveSkill={(skill) => void run('remove', async () => onTools(await unwrap(api.removeSkill({ name: skill }))))}
            onViewSkill={setViewing}
            onOpenMcp={onOpenMcp}
            onInstallSkills={(names) =>
              void run('install', async () => {
                for (const skillName of names) await unwrap(api.installTool({ profileId: account.profileId, tool: { kind: 'skill', name: skillName } }));
                onTools(await unwrap(api.getAgentTools()));
              })
            }
          />
        )}

      <QuickCommands />
      {viewing && <SkillViewer name={viewing.name} sourcePath={viewing.sourcePath} onClose={() => setViewing(undefined)} onChanged={onTools} onError={onError} />}
    </section>
  );
}

// --- Sub-pages ---

export function SkillLibrary({ tools, onTools, onError, onBack }: Shared & { onBack: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ToolSkillDto>();

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    onError(undefined);
    try {
      await action();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tools-page stack" aria-label={t('tools.library')}>
      <BackLink onBack={onBack} />
      <div className="tools-page-head">
        <div className="grow">
          <h1>{t('tools.library')}</h1>
          <p className="hint">{t('tools.hint')}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const path = await unwrap(api.pickProjectFolder());
              if (path) onTools(await unwrap(api.addSkill({ path })));
            })
          }
        >
          {t('tools.addSkill')}
        </button>
      </div>
      {!tools ? (
        <p className="hint">{t('tools.checking')}</p>
      ) : (
        <ul className="tools-list">
          {tools.skills.map((skill) => {
            const notice = skillNotice(skill);
            return (
              <li key={skill.name} className="tools-row">
                <div className="tools-skill">
                  <span className="tools-name">
                    <code>{skill.name}</code>
                    {skill.kind === 'custom' && <span className="badge">{t('tools.custom')}</span>}
                    {notice && (
                      <StatusText tone={notice.tone} title={t(notice.hint, { path: skill.sourcePath ?? '' })}>
                        {t(notice.text)}
                      </StatusText>
                    )}
                  </span>
                  {skill.description && <span className="hint tools-description">{skill.description}</span>}
                </div>
                <span className="tools-row-actions">
                  <button type="button" className="small" aria-label={t('tools.viewFor', { name: skill.name })} onClick={() => setViewing(skill)}>
                    {notice && notice.text !== 'tools.sourceMissing' ? t('tools.viewChanges') : t('tools.view')}
                  </button>
                  {skill.kind === 'custom' && (
                    <Menu label={t('tools.moreFor', { tool: skill.name, account: '' })} trigger={<More />} triggerClassName="icon-button" align="end" disabled={busy}>
                      <MenuItem tone="danger" onSelect={() => void run(async () => onTools(await unwrap(api.removeSkill({ name: skill.name }))))}>
                        {t('tools.deleteSkillFor', { name: skill.name })}
                      </MenuItem>
                    </Menu>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {viewing && <SkillViewer name={viewing.name} sourcePath={viewing.sourcePath} onClose={() => setViewing(undefined)} onChanged={onTools} onError={onError} />}
    </section>
  );
}

export function McpDetails({ onError, onBack }: { onError: (message: string | undefined) => void; onBack: () => void }) {
  return (
    <div className="tools-page stack">
      <BackLink onBack={onBack} />
      <McpServerPage onError={onError} />
    </div>
  );
}

export function QuickCommandsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="tools-page stack">
      <BackLink onBack={onBack} />
      <QuickCommands />
    </div>
  );
}

// ADR-028 item 7.2: the short sentence and the command that always calls the skill, with copy. The
// task panel copies the same with the task's own number; here they stay general (review 2026-11-10).
// A number that reads as an example, not as a task of the open project.
const EXAMPLE_TASK = 'TASK-012';

export function QuickCommands() {
  const { t, chatLocale } = useI18n();
  return (
    <section className="settings-group" aria-label={t('quick.title')}>
      <div className="settings-group-header">
        <div className="grow">
          <h2>{t('quick.title')}</h2>
          <p className="hint">{t('quick.hint')}</p>
        </div>
      </div>
      <table className="quick-table">
        <thead>
          <tr>
            <th scope="col">{t('quick.column.task')}</th>
            <th scope="col">{t('quick.column.phrase')}</th>
            <th scope="col">{t('quick.column.command')}</th>
          </tr>
        </thead>
        <tbody>
          {QUICK_COMMANDS.map((command) => {
            const phraseKey = command.id === 'resume' ? 'quick.phrase.resumeAny' : command.phrase;
            const phrase = phraseKey ? translate(chatLocale, phraseKey) : null;
            const call = skillCommand(command.skill, commandArgument(command, null));
            return (
              <tr key={command.id}>
                <th scope="row">{t(command.label)}</th>
                <td>{phrase ? <CopyButton className="quick-copy" text={phrase} label={phrase} /> : <span className="hint">—</span>}</td>
                <td>
                  <CopyButton className="quick-copy code" text={call} label={call} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Review 2026-11-10: a worked example says it better than a rule. */}
      <div className="quick-note">
        <p>{t('quick.taskNote')}</p>
        <p className="quick-examples">
          <span className="hint">{t('quick.example')}</span>
          <code className="phrase">{translate(chatLocale, 'quick.phrase.resume', { task: EXAMPLE_TASK })}</code>
          <span className="hint">{t('quick.or')}</span>
          <code>{skillCommand('context-resume', EXAMPLE_TASK)}</code>
        </p>
        <p className="hint">{t('quick.taskCopy')}</p>
      </div>
    </section>
  );
}
