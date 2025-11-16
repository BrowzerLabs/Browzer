import { app, WebContents, dialog } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import log from 'electron-log';

export class UpdaterManager {
  private webContents: WebContents | null = null;
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private isDownloading = false;
  private downloadedUpdateInfo: UpdateInfo | null = null;

  constructor(
    webContents: WebContents
  ) {
    this.webContents = webContents;
    this.setupAutoUpdater();

    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'BrowzerLabs',
      repo: 'Browzer',
      releaseType: 'release',
    });
    
    setTimeout(() => {
      this.checkForUpdates(false);
    }, 5000);

    this.updateCheckInterval = setInterval(() => {
      log.info('[Updater] Hourly update check triggered');
      this.checkForUpdates(false);
    }, 60 * 60 * 1000); // Every hour
  }

  private setupAutoUpdater(): void {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    const currentVersion = app.getVersion();
    log.info(`[Updater] App version: ${currentVersion}`);
    log.info(`[Updater] Platform: ${process.platform} ${process.arch}`);

    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      log.info('[Updater] Checking for updates...');
      this.sendToRenderer('update:checking');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      const currentVersion = app.getVersion();
      log.info(`[Updater] Update available: v${info.version} (current: v${currentVersion})`);
      
      if (info.version === currentVersion) {
        log.warn('[Updater] Update version same as current, skipping');
        return;
      }

      this.sendToRenderer('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        currentVersion,
      });

      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version ${info.version} is available!`,
        detail: `Current version: ${currentVersion}\n\nThe update will be downloaded in the background. You'll be notified when it's ready to install.`,
        buttons: ['OK'],
        defaultId: 0,
      }).catch(err => log.error('[Updater] Error showing dialog:', err));
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      log.info(`[Updater] No updates available. Current version: ${info.version}`);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Not Available',
        message: `No updates available.`,
        detail: `Current version: ${info.version}\n\n`,
        buttons: ['OK'],
        defaultId: 0,
      }).catch(err => log.error('[Updater] Error showing dialog:', err));
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      const { bytesPerSecond, percent, transferred, total } = progress;
      
      log.info(
        `[Updater] Download progress: ${percent.toFixed(2)}% ` +
        `(${this.formatBytes(transferred)}/${this.formatBytes(total)}) ` +
        `@ ${this.formatBytes(bytesPerSecond)}/s`
      );

      this.sendToRenderer('update:download-progress', {
        percent: Math.round(percent * 100) / 100,
        transferred,
        total,
        bytesPerSecond,
        transferredFormatted: this.formatBytes(transferred),
        totalFormatted: this.formatBytes(total),
        speedFormatted: `${this.formatBytes(bytesPerSecond)}/s`,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info(`[Updater] Update downloaded successfully: v${info.version}`);
      this.isDownloading = false;
      this.downloadedUpdateInfo = info;

      // Send to renderer to hide progress indicator
      this.sendToRenderer('update:downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });

      // Show install dialog
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded`,
        detail: 'The update is ready to install. Would you like to restart now or install it later?\n\nNote: The update will be automatically installed when you quit the app.',
        buttons: ['Quit and Install', 'Install Later'],
        defaultId: 0,
        cancelId: 1,
      }).then(result => {
        if (result.response === 0) {
          log.info('[Updater] User chose to install update now');
          this.installUpdate();
        } else {
          log.info('[Updater] User chose to install update later');
        }
      }).catch(err => log.error('[Updater] Error showing dialog:', err));
    });

    autoUpdater.on('error', (error: Error) => {
      log.error('[Updater] Error:', error);
      this.isDownloading = false;

      this.sendToRenderer('update:error', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Show error dialog only for critical errors
      dialog.showMessageBox({
          type: 'error',
          title: 'Update Error',
          message: 'Failed to check for updates',
          detail: error.message,
          buttons: ['OK'],
        }).catch(err => log.error('[Updater] Error showing dialog:', err));
    });
  }

  /**
   * Check for updates (can be triggered manually or automatically)
   */
  public async checkForUpdates(isManual = false): Promise<void> {
    try {
      log.info(`[Updater] ${isManual ? 'Manual' : 'Automatic'} update check initiated`);
      
      const result = await autoUpdater.checkForUpdates();
      
      if (result && result.updateInfo) {
        log.info(`[Updater] Check complete. Latest version: ${result.updateInfo.version}`);
      }
    } catch (error) {
      log.error('[Updater] Error checking for updates:', error);
      
      if (isManual) {
        dialog.showMessageBox({
          type: 'error',
          title: 'Update Error',
          message: 'Failed to check for updates',
          detail: error.message,
          buttons: ['OK'],
        }).catch(err => log.error('[Updater] Error showing dialog:', err));
      }
    }
  }

  /**
   * Start downloading the available update
   */
  public async downloadUpdate(): Promise<void> {
    if (this.isDownloading) {
      log.warn('[Updater] Download already in progress');
      return;
    }

    try {
      log.info('[Updater] Starting update download...');
      this.isDownloading = true;
      
      this.sendToRenderer('update:download-started');
      
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error('[Updater] Error downloading update:', error);
      this.isDownloading = false;
      
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Error',
        message: 'Failed to download update',
        detail: error.message,
        buttons: ['OK'],
      }).catch(err => log.error('[Updater] Error showing dialog:', err));
      
      throw error;
    }
  }

  /**
   * Install the downloaded update and restart the app
   */
  public installUpdate(): void {
    if (!this.downloadedUpdateInfo) {
      log.error('[Updater] No update downloaded to install');
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Error',
        message: `No updates available.`,
        detail: `Current version: ${this.getCurrentVersion()}`,
        buttons: ['OK'],
        defaultId: 0,
      }).catch(err => log.error('[Updater] Error showing dialog:', err));
      return;
    }

    log.info(`[Updater] Installing update v${this.downloadedUpdateInfo.version} and restarting...`);
    
    // This will quit the app and install the update
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Get current app version
   */
  public getCurrentVersion(): string {
    return app.getVersion();
  }

  /**
   * Check if an update is currently downloading
   */
  public isUpdateDownloading(): boolean {
    return this.isDownloading;
  }

  /**
   * Check if an update has been downloaded and is ready to install
   */
  public isUpdateReady(): boolean {
    return this.downloadedUpdateInfo !== null;
  }

  /**
   * Get downloaded update info
   */
  public getDownloadedUpdateInfo(): UpdateInfo | null {
    return this.downloadedUpdateInfo;
  }

  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, data?: any): void {
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send(channel, data);
    }
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    this.webContents = null;
  }
}