import type { IpcChannel, IpcInput, SettingsDto, SystemStatusDto, ThemeDto, UiLanguageDto } from '@agenthub/contracts';
import { THEMES } from '@agenthub/contracts/constants';
import { LANGUAGE_LABELS, LOCALES, type MessageKey } from '@agenthub/i18n';
import { type ReactElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, unwrap } from './api';
import { AccountsSection } from './AccountsSection';
import { AgentToolsSection } from './AgentToolsSection';
import { useI18n } from './i18n';
import { Close, Person, Plug, Puzzle, Sliders, Wrench } from './icons';
import { McpServerPage } from './McpServerPage';
import { PathText, Segmented } from './ui';

export type SettingsTab = 'general' | 'accounts' | 'tools' | 'mcp' | 'advanced';

const TABS: readonly { value: SettingsTab; label: MessageKey; icon: () => ReactElement }[] = [
  { value: 'general', label: 'settings.general', icon: Sliders },
  { value: 'accounts', label: 'nav.accounts', icon: Person },
  { value: 'tools', label: 'tools.title', icon: Puzzle },
  { value: 'mcp', label: 'settings.tab.mcp', icon: Plug },
  { value: 'advanced', label: 'settings.advanced', icon: Wrench },
];

const THEME_LABELS: Record<ThemeDto, MessageKey> = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
};
const LANGUAGE_OPTIONS = LOCALES.map((value) => ({ value, label: LANGUAGE_LABELS[value] }));

function CliPathField({ label, value, onSave }: { label: string; value: string | null; onSave: (path: string | null) => Promise<void> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value ?? '');
  return (
    <label className="settings-row cli-field">
      <span className="settings-row-label">{label}</span>
      <input
        value={draft}
        placeholder={t('settings.cliAuto')}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim() === '' ? null : draft.trim();
          if (next !== value) void onSave(next);
        }}
      />
    </label>
  );
}

interface Props {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  onClose: () => void;
  onAccountsChanged: () => void;
}

// Settings open over the window, one tab per topic, as in Claude and Codex Desktop.
export function SettingsDialog({ tab, onTab, onClose, onAccountsChanged }: Props) {
  const { t, setLanguages } = useI18n();
  const idBase = useId();
  const [settings, setSettings] = useState<SettingsDto>();
  const [status, setStatus] = useState<SystemStatusDto>();
  const [error, setError] = useState<string>();
  const [accountsVersion, setAccountsVersion] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const onError = useCallback((message: string | undefined) => setError(message), []);
  const accountsChanged = useCallback(() => {
    setAccountsVersion((version) => version + 1);
    onAccountsChanged();
  }, [onAccountsChanged]);

  useEffect(() => {
    Promise.all([unwrap(api.getSettings()), unwrap(api.getSystemStatus())]).then(
      ([loadedSettings, loadedStatus]) => {
        setSettings(loadedSettings);
        setStatus(loadedStatus);
      },
      (reason: unknown) => setError((reason as Error).message),
    );
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => previous?.focus();
  }, []);

  async function saveSettings(input: IpcInput<typeof IpcChannel.settingsUpdate>): Promise<void> {
    try {
      const saved = await unwrap(api.updateSettings(input));
      setSettings(saved);
      setLanguages({ ui: saved.uiLanguage, chat: saved.chatLanguage });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function select(next: SettingsTab): void {
    setError(undefined);
    onTab(next);
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        className="settings-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) onClose();
        }}
      >
        <header className="settings-dialog-header">
          <h2 className="grow">{t('settings.title')}</h2>
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}>
            <Close />
          </button>
        </header>
        <div className="settings-dialog-body">
          <div className="settings-nav" role="tablist" aria-label={t('settings.title')} aria-orientation="vertical">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                id={`${idBase}-${item.value}`}
                className="nav-item settings-nav-item"
                aria-selected={item.value === tab}
                aria-controls={`${idBase}-panel`}
                tabIndex={item.value === tab ? 0 : -1}
                onClick={() => select(item.value)}
                onKeyDown={(event) => {
                  const index = TABS.findIndex((entry) => entry.value === tab);
                  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next = TABS[(index + step + TABS.length) % TABS.length];
                  if (!next) return;
                  select(next.value);
                  dialog.current?.querySelector<HTMLElement>(`#${CSS.escape(`${idBase}-${next.value}`)}`)?.focus();
                }}
              >
                <span className="nav-icon">
                  <item.icon />
                </span>
                {t(item.label)}
              </button>
            ))}
          </div>
          <div className="settings-panel" role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-${tab}`}>
            {error && (
              <p className="banner error" role="alert">
                {error}
              </p>
            )}
            {tab === 'general' && settings && (
              <section className="settings-group" aria-label={t('settings.general')}>
                <div className="settings-row">
                  <div className="grow">
                    <span className="settings-row-label">{t('settings.theme')}</span>
                  </div>
                  <Segmented
                    label={t('settings.theme')}
                    value={settings.theme}
                    options={THEMES.map((value) => ({ value, label: t(THEME_LABELS[value]) }))}
                    onChange={(theme) => void saveSettings({ theme })}
                  />
                </div>
                <div className="settings-row">
                  <div className="grow settings-row-text">
                    <span className="settings-row-label">{t('settings.uiLanguage')}</span>
                  </div>
                  <Segmented label={t('settings.uiLanguage')} value={settings.uiLanguage} options={LANGUAGE_OPTIONS} onChange={(uiLanguage) => void saveSettings({ uiLanguage })} />
                </div>
                <div className="settings-row wrap-narrow">
                  <div className="grow settings-row-text">
                    <span className="settings-row-label">{t('settings.chat.label')}</span>
                    <span className="hint">{t('settings.chat.appHint')}</span>
                  </div>
                  <Segmented<UiLanguageDto | 'ui'>
                    label={t('settings.chat.label')}
                    value={settings.chatLanguage ?? 'ui'}
                    options={[{ value: 'ui', label: t('settings.chat.followUi') }, ...LANGUAGE_OPTIONS]}
                    onChange={(value) => void saveSettings({ chatLanguage: value === 'ui' ? null : value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="grow settings-row-text">
                    <span className="settings-row-label">{t('settings.data')}</span>
                    <span className="hint">{t('settings.dataHint')}</span>
                    <span className="path">
                      <PathText path={settings.dataDirectory} />
                    </span>
                  </div>
                  <button type="button" onClick={() => void unwrap(api.openDataFolder())}>
                    {t('settings.openInFinder')}
                  </button>
                </div>
              </section>
            )}
            {tab === 'accounts' && <AccountsSection onError={onError} onChanged={accountsChanged} />}
            {tab === 'tools' && <AgentToolsSection onError={onError} accountsVersion={accountsVersion} focused={false} onOpenMcp={() => select('mcp')} />}
            {tab === 'mcp' && <McpServerPage onError={onError} />}
            {tab === 'advanced' && settings && (
              <>
                <section className="settings-group" aria-label={t('settings.cli')}>
                  <div className="settings-group-header">
                    <div className="grow">
                      <h2>{t('settings.cli')}</h2>
                      <p className="hint">{t('settings.cliHint')}</p>
                    </div>
                  </div>
                  <CliPathField label="Claude CLI" value={settings.claudeCliPath} onSave={(claudeCliPath) => saveSettings({ claudeCliPath })} />
                  <CliPathField label="Codex CLI" value={settings.codexCliPath} onSave={(codexCliPath) => saveSettings({ codexCliPath })} />
                </section>
                {status && (
                  <section className="settings-group" aria-label={t('settings.about')}>
                    <div className="settings-group-header">
                      <h2 className="grow">{t('settings.about')}</h2>
                    </div>
                    <div className="settings-row">
                      <dl className="facts grow">
                        <dt>{t('settings.appVersion')}</dt>
                        <dd id="app-version">{status.appVersion}</dd>
                        <dt>SQLite</dt>
                        <dd id="sqlite-version">{status.storage.engineVersion}</dd>
                        <dt>Schema</dt>
                        <dd id="schema-version">{status.storage.schemaVersion}</dd>
                        <dt>Device ID</dt>
                        <dd>{settings.deviceId}</dd>
                      </dl>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
