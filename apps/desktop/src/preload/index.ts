import { type AgentHubApi, IpcChannel } from '@agenthub/contracts';
import { contextBridge, ipcRenderer } from 'electron';

const api: AgentHubApi = {
  getSystemStatus: () => ipcRenderer.invoke(IpcChannel.systemStatus),
};

contextBridge.exposeInMainWorld('agentHub', api);
