import { app, protocol, net } from 'electron';
import started from 'electron-squirrel-startup';
import { BrowserWindow } from './main/BrowserWindow';
import path from 'path';

if (started) {
  app.quit();
}

// Set as default protocol client for browzer:// URLs
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('browzer', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('browzer');
}

// Ensure single instance (required for deep links on Windows/Linux)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'video-file',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      stream: true
    }
  },
  {
    scheme: 'browzer',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: true,
    }
  }
]);

app.whenReady().then(() => {
  protocol.handle('video-file', (request) => {
    const url = request.url.replace('video-file://', '');
    const decodedPath = decodeURIComponent(url);
    
    const normalizedPath = path.normalize(decodedPath);
    
    return net.fetch(`file://${normalizedPath}`);
  });
  
  createWindow();
});

let mainBrowserWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainBrowserWindow = new BrowserWindow();
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainBrowserWindow === null) {
    createWindow();
  }
});