import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
// The window has no title bar on macOS, so the layout leaves room for the traffic lights.
if (navigator.userAgent.includes('Mac')) document.documentElement.dataset['platform'] = 'mac';

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
