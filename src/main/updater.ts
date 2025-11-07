import { app, dialog, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

/**
 * Setup auto-updater for Browzer
 * Handles checking for updates, downloading, and installing new versions
 */
export function setupAutoUpdater(mainWindow: BrowserWindow | null) {
  // Configure logging
  autoUpdater.logger = log;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log environment info
  log.info(`App version: ${app.getVersion()}`);
  log.info(`Platform: ${process.platform} ${process.arch}`);

  // Configure update server (GitHub releases)
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'BrowzerLabs',      // Replace with your GitHub username
    repo: 'browzer',            // Replace with your repository name
    releaseType: 'release',     // Use 'prerelease' to include beta versions
  });

  // Check for updates on app startup
  autoUpdater.checkForUpdatesAndNotify();

  // Periodically check for updates (every 60 minutes)
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  // Handle update available
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

  // Handle update not available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available, running latest version:', info.version);
  });

  // Handle update download progress
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

  // Handle update downloaded
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
      // If no main window, install immediately
      log.info('No main window, installing update immediately');
      autoUpdater.quitAndInstall();
    }
  });

  // Handle errors
  autoUpdater.on('error', (error) => {
    log.error('Update error:', error);

    if (mainWindow) {
      mainWindow.webContents.send('update:error', {
        message: error.message,
      });
    }
  });

  // Handle checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    
    if (mainWindow) {
      mainWindow.webContents.send('update:checking');
    }
  });
}

/**
 * Manually trigger update check
 * Can be called from renderer process via IPC
 */
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

/**
 * Install update and restart
 * Can be called from renderer process via IPC
 */
export function installUpdate() {
  log.info('Installing update and restarting...');
  autoUpdater.quitAndInstall();
}

/**
 * Download update manually
 * Useful if you want to show custom UI for download progress
 */
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
