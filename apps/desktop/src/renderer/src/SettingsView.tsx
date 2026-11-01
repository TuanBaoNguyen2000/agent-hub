import type { SettingsDto, SystemStatusDto, ThemeDto } from '@agenthub/contracts';
import { THEMES } from '@agenthub/contracts/constants';
import { useEffect, useState } from 'react';
import { api, unwrap } from './api';

const THEME_LABELS: Record<ThemeDto, string> = {
  system: 'Theo hệ thống',
  light: 'Sáng',
  dark: 'Tối',
};

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

  async function changeTheme(theme: ThemeDto): Promise<void> {
    try {
      setSettings(await unwrap(api.updateSettings({ theme })));
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
          <select value={settings.theme} onChange={(event) => void changeTheme(event.target.value as ThemeDto)}>
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
      {status && settings && (
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
  );
}
