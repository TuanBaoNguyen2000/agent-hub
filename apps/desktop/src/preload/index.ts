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
  listProfiles: () => ipcRenderer.invoke(IpcChannel.profilesList),
  addAccount: (input) => ipcRenderer.invoke(IpcChannel.profilesAdd, input),
  updateProfile: (input) => ipcRenderer.invoke(IpcChannel.profilesUpdate, input),
  removeProfile: (input) => ipcRenderer.invoke(IpcChannel.profilesRemove, input),
  getProfileStatus: (input) => ipcRenderer.invoke(IpcChannel.profilesStatus, input),
  getMachineAccount: (input) => ipcRenderer.invoke(IpcChannel.profilesMachineAccount, input),
  openProfileLogin: (input) => ipcRenderer.invoke(IpcChannel.profilesOpenLogin, input),
  getLoginState: (input) => ipcRenderer.invoke(IpcChannel.profilesLoginState, input),
  reopenLogin: (input) => ipcRenderer.invoke(IpcChannel.profilesLoginReopen, input),
  copyLoginLink: (input) => ipcRenderer.invoke(IpcChannel.profilesLoginCopyLink, input),
  cancelLogin: (input) => ipcRenderer.invoke(IpcChannel.profilesLoginCancel, input),
  setPermission: (input) => ipcRenderer.invoke(IpcChannel.permissionsSet, input),
  planLaunch: (input) => ipcRenderer.invoke(IpcChannel.launchPlan, input),
  executeLaunch: (input) => ipcRenderer.invoke(IpcChannel.launchExecute, input),
  listLaunches: (input) => ipcRenderer.invoke(IpcChannel.launchHistory, input),
  confirmLaunchAccount: (input) => ipcRenderer.invoke(IpcChannel.launchConfirmAccount, input),
  planAccountLaunch: (input) => ipcRenderer.invoke(IpcChannel.launchAccountPlan, input),
  openAccount: (input) => ipcRenderer.invoke(IpcChannel.launchAccountExecute, input),
};

contextBridge.exposeInMainWorld('agentHub', api);
