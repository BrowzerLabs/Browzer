import { app, Menu, dialog, WebContents } from 'electron';
import { checkForUpdates } from '@/main/updater';
import log from 'electron-log';
import { BrowserManager } from '@/main/BrowserManager';

export class AppMenu {
  private browserManager: BrowserManager;
  private webContents: WebContents | null;

  private isMac = process.platform === 'darwin';

  constructor(
    browserManager: BrowserManager,
    webContents: WebContents | null
  ) {
    this.browserManager = browserManager;
    this.webContents = webContents;
  }

  /**
   * Build and set the application menu
   */
  public setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      // App menu (macOS only)
      ...(this.isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                {
                  label: 'Check for Updates...',
                  click: () => this.handleCheckForUpdates(),
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),

      // File menu
      {
        label: 'File',
        submenu: [this.isMac ? { role: 'close' as const } : { role: 'quit' as const }],
      },

      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' as const },
          { role: 'redo' as const },
          { type: 'separator' as const },
          { role: 'cut' as const },
          { role: 'copy' as const },
          { role: 'paste' as const },
          ...(this.isMac
            ? [
                { role: 'pasteAndMatchStyle' as const },
                { role: 'delete' as const },
                { role: 'selectAll' as const },
                { type: 'separator' as const },
                {
                  label: 'Speech',
                  submenu: [
                    { role: 'startSpeaking' as const },
                    { role: 'stopSpeaking' as const },
                  ],
                },
              ]
            : [
                { role: 'delete' as const },
                { type: 'separator' as const },
                { role: 'selectAll' as const },
              ]),
        ],
      },

      // View menu
      {
        label: 'View',
        submenu: [
          { role: 'reload' as const },
          { role: 'forceReload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },

      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' as const },
          { role: 'zoom' as const },
          ...(this.isMac
            ? [
                { type: 'separator' as const },
                { role: 'front' as const },
                { type: 'separator' as const },
                { role: 'window' as const },
              ]
            : [{ role: 'close' as const }]),
        ],
      },

      // Help menu
      {
        role: 'help' as const,
        submenu: [
          {
            label: 'Learn More',
            click: () => {
              this.browserManager.createTab('https://trybrowzer.com');
            },
          },
          {
            label: 'Documentation',
            click: () => {
              this.browserManager.createTab('https://docs.trybrowzer.com');
            },
          },
          { type: 'separator' as const },
          // Add "Check for Updates" for non-macOS platforms
          ...(this.isMac
            ? [
                {
                  label: 'Check for Updates...',
                  click: () => this.handleCheckForUpdates(),
                },
                { type: 'separator' as const },
              ]
            : []),
          {
            label: `Version ${app.getVersion()}`,
            enabled: false,
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /**
   * Handle "Check for Updates" menu click
   */
  private async handleCheckForUpdates(): Promise<void> {
    try {
      log.info('User manually checking for updates...');

      // Show checking dialog
      if (this.webContents && !this.webContents.isDestroyed()) {
        this.webContents.send('update:checking');
      }

      const result = await checkForUpdates();

      if (result && result.updateInfo) {
        const currentVersion = app.getVersion();
        const latestVersion = result.updateInfo.version;

        if (currentVersion === latestVersion) {
          // Already up to date
          log.info('Already running the latest version');
          dialog.showMessageBox({
            type: 'info',
            title: 'No Updates Available',
            message: 'You are up to date!',
            detail: `Browzer v${currentVersion} is currently the latest version.`,
            buttons: ['OK'],
          });
        } else {
          // Update available - will download automatically
          log.info(`Update available: v${latestVersion}`);
          dialog.showMessageBox({
            type: 'info',
            title: 'Update Available',
            message: `Update to v${latestVersion} Available`,
            detail: `A new version of Browzer (v${latestVersion}) is available and will be downloaded automatically in the background. You'll be notified when it's ready to install.`,
            buttons: ['OK'],
          });
        }
      }
    } catch (error) {
      log.error('Error checking for updates:', error);
      
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Failed to check for updates',
        detail: error instanceof Error ? error.message : 'An unknown error occurred',
        buttons: ['OK'],
      });
    }
  }

  /**
   * Update the webContents reference
   */
  public updateWebContents(webContents: WebContents | null): void {
    this.webContents = webContents;
  }
}
