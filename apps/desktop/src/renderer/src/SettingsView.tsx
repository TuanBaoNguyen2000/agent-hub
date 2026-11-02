import type { IpcChannel, IpcInput, SettingsDto, SystemStatusDto, ThemeDto } from '@agenthub/contracts';
import { THEMES } from '@agenthub/contracts/constants';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { AccountsSection } from './AccountsSection';
import { Disclosure, Segmented } from './ui';

const THEME_LABELS: Record<ThemeDto, string> = {
  system: 'Theo hệ thống',
  light: 'Sáng',
  dark: 'Tối',
};
const THEME_OPTIONS = THEMES.map((value) => ({ value, label: THEME_LABELS[value] }));

function CliPathField({ label, value, onSave }: { label: string; value: string | null; onSave: (path: string | null) => Promise<void> }) {
  const [draft, setDraft] = useState(value ?? '');
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        value={draft}
        placeholder="Tự tìm"
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

export function SettingsView({ onError, onAccountsChanged }: { onError: (message: string | undefined) => void; onAccountsChanged: () => void }) {
  const [settings, setSettings] = useState<SettingsDto>();
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
      setSettings(await unwrap(api.updateSettings(input)));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  return (
    <div className="stack page">
      <header className="page-header">
        <h1 className="page-title">Cài đặt</h1>
      </header>
      {settings && (
        <section className="settings-group" aria-label="Chung">
          <div className="settings-row">
            <div className="grow">
              <span className="settings-row-label">Giao diện</span>
            </div>
            <Segmented label="Giao diện" value={settings.theme} options={THEME_OPTIONS} onChange={(theme) => void saveSettings({ theme })} />
          </div>
          <div className="settings-row">
            <div className="grow settings-row-text">
              <span className="settings-row-label">Dữ liệu của AgentHub</span>
              <span className="path">{settings.dataDirectory}</span>
            </div>
            <button type="button" onClick={() => void unwrap(api.openDataFolder())}>
              Mở trong Finder
            </button>
          </div>
        </section>
      )}
      <AccountsSection onError={onError} onChanged={onAccountsChanged} />
      {settings && (
        <Disclosure summary="Nâng cao" className="settings-advanced">
          <div className="stack">
            <p className="hint">AgentHub tự tìm Claude và Codex CLI qua shell của bạn. Chỉ điền nếu nó tìm sai.</p>
            <CliPathField label="Claude CLI" value={settings.claudeCliPath} onSave={(claudeCliPath) => saveSettings({ claudeCliPath })} />
            <CliPathField label="Codex CLI" value={settings.codexCliPath} onSave={(codexCliPath) => saveSettings({ codexCliPath })} />
            {status && (
              <dl className="facts">
                <dt>Phiên bản app</dt>
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
