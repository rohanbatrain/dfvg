const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    getApiPort: () => ipcRenderer.invoke('get-api-port'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    isElectron: true,
});
