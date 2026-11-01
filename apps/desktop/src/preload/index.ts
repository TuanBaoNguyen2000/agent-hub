import type { AgentHubApi } from '@agenthub/contracts';
import { IpcChannel } from '@agenthub/contracts/constants';
import { contextBridge, ipcRenderer } from 'electron';

// Named methods only; the renderer never sees ipcRenderer or a channel name.
const api: AgentHubApi = {
  getSystemStatus: () => ipcRenderer.invoke(IpcChannel.systemStatus),
  listProjects: () => ipcRenderer.invoke(IpcChannel.projectsList),
  pickProjectFolder: () => ipcRenderer.invoke(IpcChannel.projectsPickFolder),
  addProject: (input) => ipcRenderer.invoke(IpcChannel.projectsAdd, input),
  updateProject: (input) => ipcRenderer.invoke(IpcChannel.projectsUpdate, input),
  removeProject: (input) => ipcRenderer.invoke(IpcChannel.projectsRemove, input),
  listTasks: (input) => ipcRenderer.invoke(IpcChannel.tasksList, input),
  createTask: (input) => ipcRenderer.invoke(IpcChannel.tasksCreate, input),
  updateTask: (input) => ipcRenderer.invoke(IpcChannel.tasksUpdate, input),
  getContext: (input) => ipcRenderer.invoke(IpcChannel.contextGet, input),
  saveContext: (input) => ipcRenderer.invoke(IpcChannel.contextSave, input),
  getSettings: () => ipcRenderer.invoke(IpcChannel.settingsGet),
  updateSettings: (input) => ipcRenderer.invoke(IpcChannel.settingsUpdate, input),
  openDataFolder: () => ipcRenderer.invoke(IpcChannel.settingsOpenDataFolder),
};

contextBridge.exposeInMainWorld('agentHub', api);
