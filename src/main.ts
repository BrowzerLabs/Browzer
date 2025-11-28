import { app, protocol, net, dialog } from 'electron';
import started from 'electron-squirrel-startup';
import { MainWindow } from './main/MainWindow';
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

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  dialog.showMessageBox({
    type: 'error',
    title: 'Application is already running',
    message: 'Another instance of the application is already running. Only one instance is allowed at a time.'
  });
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

let mainWindow: MainWindow | null = null;

const createWindow = () => {
  mainWindow = new MainWindow();
  
  const baseWindow = mainWindow.getBaseWindow();
  if (baseWindow) {
    baseWindow.on('closed', () => {
      mainWindow = null;
    });
  }
};


app.whenReady().then(() => {
  protocol.handle('video-file', (request) => {
    const url = request.url.replace('video-file://', '');
    const decodedPath = decodeURIComponent(url);
    const normalizedPath = path.normalize(decodedPath);
    return net.fetch(`file://${normalizedPath}`);
  });
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null || mainWindow.getBaseWindow() === null) {
    mainWindow = null;
    createWindow();
  }
});