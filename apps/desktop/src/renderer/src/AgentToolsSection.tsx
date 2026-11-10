import type { AccountToolsDto, AgentToolsDto, SkillPresenceDto, ToolSkillDto } from '@agenthub/contracts';
import type { MessageKey } from '@agenthub/i18n';
import { More } from './icons';
import { useI18n } from './i18n';
import { Menu, MenuItem, StatusText, type StatusTone } from './ui';

export type Tool = { kind: 'skill'; name: string } | { kind: 'mcp' };

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

interface AccountToolsProps {
  account: AccountToolsDto;
  tools: AgentToolsDto;
  busy: boolean;
  onChange: (tool: Tool, install: boolean) => void;
  onAuto: (on: boolean) => void;
  onRemoveSkill: (name: string) => void;
  onViewSkill: (skill: ToolSkillDto) => void;
  onOpenMcp: () => void;
  // Installs the shipped skills the account lacks, in one click.
  onInstallSkills?: (names: string[]) => void;
}

// The tools of one account, shown on its page (ADR-029); ADR-026 items 7, 8: a skill that changed since the user last looked, as a status, not a button.
export function skillNotice(skill: ToolSkillDto): { text: MessageKey; hint: MessageKey; tone: StatusTone } | null {
  if (skill.updated) return { text: 'tools.updated', hint: 'tools.updatedHint', tone: 'warning' };
  if (skill.source === 'changed') return { text: 'tools.sourceChanged', hint: 'tools.sourceChangedHint', tone: 'warning' };
  if (skill.source === 'missing') return { text: 'tools.sourceMissing', hint: 'tools.sourceMissingHint', tone: 'neutral' };
  return null;
}

// The tools of one account: what each one is, its state, and one action; removing is in the menu.
export function AccountTools({ account, tools, busy, onChange, onAuto, onRemoveSkill, onViewSkill, onOpenMcp, onInstallSkills }: AccountToolsProps) {
  const { t, tr } = useI18n();
  const accountName = tr(account.name);

  function row(
    tool: Tool,
    info: { description: string | null; custom: boolean; skill?: ToolSkillDto },
    state: { text: MessageKey; tone: StatusTone; title?: string | undefined },
    canInstall: boolean,
    canRemove: boolean,
  ) {
    const name = toolName(tool);
    const params = { tool: name, account: accountName };
    const notice = info.skill ? skillNotice(info.skill) : null;
    return (
      <li key={name} className="tools-row">
        <div className="tools-skill">
          <span className="tools-name">
            <code>{name}</code>
            {info.custom && <span className="badge">{t('tools.custom')}</span>}
            {notice && (
              <StatusText tone={notice.tone} title={t(notice.hint, { path: info.skill?.sourcePath ?? '' })}>
                {t(notice.text)}
              </StatusText>
            )}
          </span>
          {info.description && <span className="hint tools-description">{info.description}</span>}
          {info.skill && (
            <button type="button" className="link tools-details" aria-label={t('tools.viewFor', { name })} onClick={() => info.skill && onViewSkill(info.skill)}>
              {notice && notice.text !== 'tools.sourceMissing' ? t('tools.viewChanges') : t('tools.view')}
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
  const installed = tools.skills.filter((skill) => account.skills[skill.name] === 'installed').length;
  const missing = tools.skills.filter((skill) => skill.kind === 'builtin' && (account.skills[skill.name] ?? 'missing') === 'missing').map((skill) => skill.name);
  // Review 2026-11-10: skills and the MCP server are two different things, so two groups.
  return (
    <div className="account-tools stack" role="region" aria-label={t('tools.title')}>
      <section className="settings-group" aria-label={t('tools.auto')}>
        <label className="settings-row choice">
          <input type="checkbox" checked={account.autoInstall} disabled={busy} aria-label={t('tools.autoFor', { account: accountName })} onChange={(event) => onAuto(event.target.checked)} />
          <span className="settings-row-text">
            <span>{t('tools.auto')}</span>
            <span className="hint">{t('tools.footnote')}</span>
          </span>
        </label>
      </section>

      <section className="settings-group" aria-label={t('tools.skills')}>
        <div className="settings-group-header">
          <div className="grow">
            <h2>{t('tools.skills')}</h2>
            <p className="hint">{t('tools.skillsInstalled', { installed, total: tools.skills.length })}</p>
          </div>
          {missing.length > 0 && onInstallSkills && (
            <button type="button" className="primary" disabled={busy} onClick={() => onInstallSkills(missing)}>
              {t('tools.installMissingSkills', { count: missing.length })}
            </button>
          )}
        </div>
        <ul className="tools-list">
          {tools.skills.map((skill) => {
            const presence = account.skills[skill.name] ?? 'missing';
            const state = SKILL_STATES[presence];
            return row(
              { kind: 'skill', name: skill.name },
              { description: skill.description, custom: skill.kind === 'custom', skill },
              { text: state.text, tone: state.tone, title: state.hint ? t(state.hint) : undefined },
              presence === 'missing',
              presence === 'installed',
            );
          })}
        </ul>
      </section>

      <section className="settings-group" aria-label={MCP_LABEL}>
        <div className="settings-group-header">
          <div className="grow">
            <h2>{t('mcpPage.title')}</h2>
            <p className="hint">{t('tools.mcpDescription')}</p>
          </div>
          <button type="button" className="small" aria-label={t('mcpPage.openLabel')} onClick={onOpenMcp}>
            {t('mcpPage.open')}
          </button>
        </div>
        <ul className="tools-list">
          {row(
            { kind: 'mcp' },
            { description: null, custom: false },
            { text: mcpState.text, tone: mcpState.tone, title: account.mcpDetail.map(tr).join('\n') || undefined },
            account.mcp === 'missing' || account.mcp === 'partial',
            account.mcp === 'installed' || account.mcp === 'partial',
          )}
        </ul>
      </section>
    </div>
  );
}
