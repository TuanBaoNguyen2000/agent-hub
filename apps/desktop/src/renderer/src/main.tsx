import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveLocale } from '@agenthub/i18n';
import { App } from './App';
import { api, unwrap } from './api';
import { I18nProvider } from './i18n';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
// The window has no title bar on macOS, so the layout leaves room for the traffic lights.
if (navigator.userAgent.includes('Mac')) document.documentElement.dataset['platform'] = 'mac';

// The interface language comes first, so the first frame is already in it.
const root = createRoot(container);
unwrap(api.getSettings()).then(
  (settings) => ({ ui: settings.uiLanguage, chat: settings.chatLanguage }),
  () => ({ ui: resolveLocale(navigator.language), chat: null }),
).then((locale) => {
  root.render(
    <StrictMode>
      <I18nProvider initial={locale}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});
