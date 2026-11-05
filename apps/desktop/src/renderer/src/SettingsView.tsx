import type { IpcChannel, IpcInput, SettingsDto, SystemStatusDto, ThemeDto, UiLanguageDto } from '@agenthub/contracts';
import { THEMES } from '@agenthub/contracts/constants';
import { LANGUAGE_LABELS, LOCALES, type MessageKey } from '@agenthub/i18n';
import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { AccountsSection } from './AccountsSection';
import { AgentToolsSection } from './AgentToolsSection';
import { useI18n } from './i18n';
import { Disclosure, Segmented } from './ui';

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
    <label className="field">
      <span className="field-label">{label}</span>
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
  onError: (message: string | undefined) => void;
  onAccountsChanged: () => void;
  // Opens the page at this section, as a launch does when an account lacks its tools.
  section?: 'tools' | undefined;
}

export function SettingsView({ onError, onAccountsChanged, section }: Props) {
  const { t, setLanguages } = useI18n();
  const [settings, setSettings] = useState<SettingsDto>();
  const [accountsVersion, setAccountsVersion] = useState(0);
  // Stable: the accounts section reloads whenever this changes.
  const accountsChanged = useCallback(() => {
    setAccountsVersion((version) => version + 1);
    onAccountsChanged();
  }, [onAccountsChanged]);
  const [status, setStatus] = useState<SystemStatusDto>();

  useEffect(() => {
    Promise.all([unwrap(api.getSettings()), unwrap(api.getSystemStatus())]).then(
      ([loadedSettings, loadedStatus]) => {
        setSettings(loadedSettings);
        setStatus(loadedStatus);
      },
      (reason: unknown) => onError((reason as Error).message),
    );
  }, [onError]);

  async function saveSettings(input: IpcInput<typeof IpcChannel.settingsUpdate>): Promise<void> {
    try {
      const saved = await unwrap(api.updateSettings(input));
      setSettings(saved);
      setLanguages({ ui: saved.uiLanguage, chat: saved.chatLanguage });
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  return (
    <div className="stack page">
      <header className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
      </header>
      {settings && (
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
          <div className="settings-row">
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
              <span className="path">{settings.dataDirectory}</span>
            </div>
            <button type="button" onClick={() => void unwrap(api.openDataFolder())}>
              {t('settings.openInFinder')}
            </button>
          </div>
        </section>
      )}
      <AccountsSection onError={onError} onChanged={accountsChanged} />
      <AgentToolsSection onError={onError} accountsVersion={accountsVersion} focused={section === 'tools'} />
      {settings && (
        <Disclosure summary={t('settings.advanced')} className="settings-advanced">
          <div className="stack">
            <p className="hint">{t('settings.cliHint')}</p>
            <CliPathField label="Claude CLI" value={settings.claudeCliPath} onSave={(claudeCliPath) => saveSettings({ claudeCliPath })} />
            <CliPathField label="Codex CLI" value={settings.codexCliPath} onSave={(codexCliPath) => saveSettings({ codexCliPath })} />
            {status && (
              <dl className="facts">
                <dt>{t('settings.appVersion')}</dt>
                <dd id="app-version">{status.appVersion}</dd>
                <dt>SQLite</dt>
                <dd id="sqlite-version">{status.storage.engineVersion}</dd>
                <dt>Schema</dt>
                <dd id="schema-version">{status.storage.schemaVersion}</dd>
                <dt>Device ID</dt>
                <dd>{settings.deviceId}</dd>
              </dl>
            )}
          </div>
        </Disclosure>
      )}
    </div>
  );
}
