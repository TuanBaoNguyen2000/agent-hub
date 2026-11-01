import type { SystemStatusDto } from '@agenthub/contracts';
import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState<SystemStatusDto>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    window.agentHub.getSystemStatus().then(setStatus, (reason: unknown) => setError(String(reason)));
  }, []);

  return (
    <main>
      <h1>AgentHub</h1>
      {error && <p role="alert">{error}</p>}
      {status && (
        <dl>
          <dt>App</dt>
          <dd id="app-version">{status.appVersion}</dd>
          <dt>SQLite</dt>
          <dd id="sqlite-version">{status.storage.engineVersion}</dd>
          <dt>Schema</dt>
          <dd id="schema-version">{status.storage.schemaVersion}</dd>
        </dl>
      )}
    </main>
  );
}
