/// <reference types="vite/client" />
// Install the typed browser API before the actual renderer captures window.agentHub.
import './api';
import '../../apps/desktop/src/renderer/src/style.css';
void import('../../apps/desktop/src/renderer/src/main');
