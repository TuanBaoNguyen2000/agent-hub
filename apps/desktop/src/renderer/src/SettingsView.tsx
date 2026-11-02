import type { IpcChannel, IpcInput, SettingsDto, SystemStatusDto, ThemeDto } from '@agenthub/contracts';
import { THEMES } from '@agenthub/contracts/constants';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';
import { AccountsSection } from './AccountsSection';

const THEME_LABELS: Record<ThemeDto, string> = {
  system: 'Theo hệ thống',
  light: 'Sáng',
  dark: 'Tối',
};

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

export function SettingsView({ onError }: { onError: (message: string | undefined) => void }) {
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
    <div className="stack">
      <h1>Cài đặt</h1>
      {settings && (
        <label className="field">
          <span className="field-label">Giao diện</span>
          <select value={settings.theme} onChange={(event) => void saveSettings({ theme: event.target.value as ThemeDto })}>
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </option>
            ))}
          </select>
        </label>
      )}
      {settings && (
        <div className="field">
          <span className="field-label">Dữ liệu của AgentHub</span>
          <p className="path">{settings.dataDirectory}</p>
          <div className="row">
            <button type="button" onClick={() => void unwrap(api.openDataFolder())}>
              Mở trong Finder
            </button>
          </div>
        </div>
      )}
      <AccountsSection onError={onError} />
      {settings && (
        <details className="section">
          <summary>Nâng cao</summary>
          <div className="stack">
            <p className="hint">AgentHub tự tìm Claude và Codex CLI qua shell của bạn. Chỉ điền nếu nó tìm sai.</p>
            <CliPathField label="Claude CLI" value={settings.claudeCliPath} onSave={(claudeCliPath) => saveSettings({ claudeCliPath })} />
            <CliPathField label="Codex CLI" value={settings.codexCliPath} onSave={(codexCliPath) => saveSettings({ codexCliPath })} />
            {status && (
              <dl>
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
        </details>
      )}
    </div>
  );
}
