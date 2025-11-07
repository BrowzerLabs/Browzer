import { app, dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

export function setupAutoUpdater(mainWindow: BrowserWindow | null) {
  autoUpdater.logger = log;
  autoUpdater.autoInstallOnAppQuit = true;

  log.info(`App version: ${app.getVersion()}`);
  log.info(`Platform: ${process.platform} ${process.arch}`);

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'BrowzerLabs',
    repo: 'Browzer',
    releaseType: 'release',
  });

  autoUpdater.checkForUpdatesAndNotify();

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    
    if (mainWindow) {
      mainWindow.webContents.send('update:available', {
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

    if (mainWindow) {
      mainWindow.webContents.send('update:download-progress', {
        percent: Math.round(percent),
        transferred,
        total,
        bytesPerSecond,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);

    if (mainWindow) {
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Available',
          message: `Browzer v${info.version} is ready to install`,
          detail: 'The app will restart to complete the installation.',
          buttons: ['Install Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            log.info('User chose to install update immediately');
            autoUpdater.quitAndInstall();
          } else {
            log.info('User deferred update installation');
            mainWindow?.webContents.send('update:deferred');
          }
        });
    } else {
      log.info('No main window, installing update immediately');
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on('error', (error) => {
    log.error('Update error:', error);

    if (mainWindow) {
      mainWindow.webContents.send('update:error', {
        message: error.message,
      });
    }
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    
    if (mainWindow) {
      mainWindow.webContents.send('update:checking');
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
