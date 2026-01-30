import { app, protocol, net, dialog } from 'electron';
import path from 'path';

import started from 'electron-squirrel-startup';

import { MainService } from './main/MainService';

if (started) {
  app.quit();
}

const isDevelopment =
  process.env.NODE_ENV !== 'production' ||
  process.defaultApp ||
  /[\\/]electron-prebuilt[\\/]/.test(process.execPath) ||
  /[\\/]electron[\\/]/.test(process.execPath);

if (isDevelopment) {
  const userDataPath = path.join(app.getPath('appData'), 'Browzer Dev');
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', path.join(userDataPath, 'Session Storage'));
  app.setPath('cache', path.join(userDataPath, 'Cache'));
  app.setPath('logs', path.join(userDataPath, 'logs'));

  console.log(
    '🔴 Development mode - Using separate data directory:',
    userDataPath
  );
}

// Set as default protocol client for browzer:// URLs
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('browzer', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('browzer');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  dialog.showMessageBox({
    type: 'error',
    title: 'Application is already running',
    message:
      'Another instance of the application is already running. Only one instance is allowed at a time.',
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
      stream: true,
    },
  },
  {
    scheme: 'browzer',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: true,
    },
  },
]);

let mainService: MainService | null = null;

const createWindow = () => {
  mainService = new MainService();

  const baseWindow = mainService.getBaseWindow();
  if (baseWindow) {
    baseWindow.on('closed', () => {
      mainService = null;
    });
  }
};

const setupDeepLinkHandlers = () => {
  app.on('open-url', (_event, url) => {
    console.log('[main.ts] Received open-url event:', url);
    if (!mainService || !mainService.getBaseWindow()) {
      console.log('[main.ts] No window exists, creating new window');
      createWindow();
    }

    setTimeout(() => {
      mainService?.handleDeepLink(url);
    }, 500);
  });

  app.on('second-instance', (_event, commandLine) => {
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith('browzer://'));
    if (deepLinkUrl) {
      console.log('[main.ts] Found deeplink in second instance:', deepLinkUrl);
      if (!mainService || !mainService.getBaseWindow()) {
        console.log('[main.ts] No window exists, creating new window');
        createWindow();
      }
      setTimeout(() => {
        mainService?.handleDeepLink(deepLinkUrl);
      }, 500);
    }
    mainService?.focusMainWindow();
  });

  if (process.platform !== 'darwin') {
    const deepLinkUrl = process.argv.find((arg) =>
      arg.startsWith('browzer://')
    );
    if (deepLinkUrl) {
      setTimeout(() => {
        mainService?.handleDeepLink(deepLinkUrl);
      }, 500);
    }
  }
};

app.whenReady().then(() => {
  protocol.handle('video-file', (request) => {
    const url = request.url.replace('video-file://', '');
    const decodedPath = decodeURIComponent(url);
    const normalizedPath = path.normalize(decodedPath);
    return net.fetch(`file://${normalizedPath}`);
  });

  setupDeepLinkHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (mainService) {
    mainService.destroy();
    mainService = null;
  }
});

app.on('activate', () => {
  if (mainService === null || mainService.getBaseWindow() === null) {
    mainService = null;
    createWindow();
  }
});
