const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electron',
    {
        enableDeveloperMode: () => ipcRenderer.invoke('enable-developer-mode'),
        installExtension: (path) => ipcRenderer.invoke('install-extension', path),
        removeExtension: (id) => ipcRenderer.invoke('remove-extension', id),
        getExtensions: () => ipcRenderer.invoke('get-extensions')
    }
); 