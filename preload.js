// Preload script for webviews to enable IPC communication
const { ipcRenderer, contextBridge } = require('electron');

// Expose the ipcRenderer to the webview content
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    sendToHost: (channel, data) => {
      ipcRenderer.sendToHost(channel, data);
    },
    send: (channel, data) => {
      ipcRenderer.send(channel, data);
    }
  }
});

console.log('Preload script executed successfully'); 