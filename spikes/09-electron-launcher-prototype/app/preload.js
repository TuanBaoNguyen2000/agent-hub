'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  list: () => ipcRenderer.invoke('scenarios:list'),
  run: (id) => ipcRenderer.invoke('scenario:run', id),
  reportPath: () => ipcRenderer.invoke('report:path'),
});
