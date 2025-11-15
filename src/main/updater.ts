import { app, dialog, WebContents, BaseWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import log from 'electron-log';
import Store from 'electron-store';

// Store to persist update state
const updateStore = new Store({
  name: 'update-state',
  defaults: {
    pendingUpdateVersion: null,
    lastUpdateCheckTime: null,
  }
});

let pendingUpdateInfo: UpdateInfo | null = null;

export function setupAutoUpdater(webContents: WebContents | null, window?: BaseWindow | null) {
  autoUpdater.logger = log;
  autoUpdater.autoInstallOnAppQuit = true;

  const currentVersion = app.getVersion();
  log.info(`App version: ${currentVersion}`);
  log.info(`Platform: ${process.platform} ${process.arch}`);

  autoUpdater.allowDowngrade = false;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'BrowzerLabs',
    repo: 'Browzer',
    releaseType: 'release',
  });

  const pendingVersion = updateStore.get('pendingUpdateVersion') as string | null;
  if (pendingVersion && pendingVersion !== currentVersion) {
    log.info(`Pending update found from previous session: v${pendingVersion}`);
    autoUpdater.checkForUpdatesAndNotify();
  } else if (pendingVersion === currentVersion) {
    updateStore.delete('pendingUpdateVersion');
    log.info('Update successfully installed and applied');
  }

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    const currentVersion = app.getVersion();
    log.info(`Update available: v${info.version} (current: v${currentVersion})`);
    
    if (info.version === currentVersion) {
      log.warn(`Update version ${info.version} is same as current version. Skipping.`);
      return;
    }
    
    pendingUpdateInfo = info;
    
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available, running latest version:', info.version);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const { bytesPerSecond, percent, transferred, total } = progressObj;
    
    log.info(
      `Download progress: ${percent.toFixed(2)}% (${transferred}/${total} bytes, ${bytesPerSecond} bytes/sec)`
    );

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('update:download-progress', {
        percent: Math.round(percent),
        transferred,
        total,
        bytesPerSecond,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    
    updateStore.set('pendingUpdateVersion', info.version);

    if (webContents && !webContents.isDestroyed()) {
      const parentWindow = window && !window.isDestroyed() ? window : undefined;
      
      dialog
        .showMessageBox(parentWindow, {
          type: 'info',
          title: 'Update Ready to Install',
          message: `Browzer v${info.version} is ready to install`,
          detail: 'The app will restart to complete the installation.',
          buttons: ['Install Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            log.info('User chose to install update immediately');
            updateStore.delete('pendingUpdateVersion');
            autoUpdater.quitAndInstall();
          } else {
            log.info('User deferred update installation. Update will be installed on next app quit.');
            if (webContents && !webContents.isDestroyed()) {
              webContents.send('update:deferred');
            }
          }
        })
    } else {
      log.info('No webContents, installing update immediately');
      updateStore.delete('pendingUpdateVersion');
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    log.error('Update error:', error);

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('update:error', {
        message: error.message,
      });
    }
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('update:checking');
    }
  });
}

export async function checkForUpdates() {
  try {
    log.info('Manual update check triggered');
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    log.error('Error checking for updates:', error);
    throw error;
  }
}

export function installUpdate() {
  log.info('Installing update and restarting...');
  autoUpdater.quitAndInstall();
}

export async function downloadUpdate() {
  try {
    log.info('Manually downloading update...');
    await autoUpdater.downloadUpdate();
    log.info('Update downloaded successfully');
  } catch (error) {
    log.error('Error downloading update:', error);
    throw error;
  }
}
