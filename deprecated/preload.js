// Preload script for webviews to enable IPC communication
const { ipcRenderer, contextBridge } = require('electron');

console.log('[Preload] Script loaded');

// Expose a limited version of ipcRenderer to the window object for secure communication
// if contextIsolation is enabled. This is good practice.
contextBridge.exposeInMainWorld('electronAPI', {
  sendToHost: (channel, data) => {
    ipcRenderer.sendToHost(channel, data);
  },
  // It's safer to explicitly define which channels the preload script can send on,
  // rather than exposing send() directly.
});

// Inform the main renderer process that the webview's global context is ready
// This is better than just 'dom-ready' as it ensures the window object is fully set up.
window.addEventListener('load', () => {
  console.log('[Preload] Window loaded, sending webview-ready-for-scripts');
  try {
    ipcRenderer.sendToHost('webview-ready-for-scripts');
  } catch (e) {
    console.error('[Preload] Error sending webview-ready-for-scripts to host:', e);
  }
}, { once: true });

// You can also add other early-stage manipulations here if needed,
// for example, overriding navigator properties before any page scripts run.
// However, it's often cleaner to do this from the main renderer after 'webview-ready-for-scripts'
// to keep preload minimal.

// Example of an early override (if you choose to do it here):
// try {
//   Object.defineProperty(navigator, 'webdriver', {
//     get: () => false,
//   });
//   console.log('[Preload] Overrode navigator.webdriver');
// } catch (e) {
//   console.error('[Preload] Error overriding navigator.webdriver:', e);
// }

console.log('[Preload] Preload script execution finished.'); 