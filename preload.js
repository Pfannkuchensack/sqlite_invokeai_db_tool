const { contextBridge, ipcRenderer } = require('electron');
const translations = require('./translations.js');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDbFile: () => ipcRenderer.invoke('select-db-file'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  syncDatabase: (params) => ipcRenderer.invoke('sync-database', params),
  restoreImages: (params) => ipcRenderer.invoke('restore-images', params),
  removeEntries: (params) => ipcRenderer.invoke('remove-entries', params),
  restoreDbEntries: (params) => ipcRenderer.invoke('restore-db-entries', params),
  syncThumbnails: (params) => ipcRenderer.invoke('sync-thumbnails', params),
  restoreThumbnails: (params) => ipcRenderer.invoke('restore-thumbnails', params),
  loadModels: (params) => ipcRenderer.invoke('load-models', params),
  updateModelPaths: (params) => ipcRenderer.invoke('update-model-paths', params),
  updateModelTypes: (params) => ipcRenderer.invoke('update-model-types', params)
});

// Stelle die Übersetzungen im Renderer-Prozess zur Verfügung
contextBridge.exposeInMainWorld('translations', translations);
