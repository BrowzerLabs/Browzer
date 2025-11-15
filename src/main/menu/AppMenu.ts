import { app, Menu, dialog, WebContents } from 'electron';
import { checkForUpdates } from '@/main/updater';
import log from 'electron-log';
import { TabManager } from '@/main/browser/TabManager';

export class AppMenu {
  private tabManager: TabManager;

  private isMac = process.platform === 'darwin';

  private keys = {
    newTab: this.isMac ? 'Cmd+T' : 'Ctrl+T',
    newWindow: this.isMac ? 'Cmd+N' : 'Ctrl+N',
    closeTab: this.isMac ? 'Cmd+W' : 'Ctrl+W',
    back: this.isMac ? 'Cmd+[' : 'Alt+Left',
    forward: this.isMac ? 'Cmd+]' : 'Alt+Right',
    reload: this.isMac ? 'Cmd+R' : 'Ctrl+R',
    forceReload: this.isMac ? 'Cmd+Shift+R' : 'Ctrl+Shift+R',
    nextTab: this.isMac ? 'Cmd+Option+Right' : 'Ctrl+Tab',
    prevTab: this.isMac ? 'Cmd+Option+Left' : 'Ctrl+Shift+Tab',
  };

  constructor(
    tabManager: TabManager,
  ) {
    this.tabManager = tabManager;
  }

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

      {
        label: 'File',
        submenu: [
          {
            label: 'New Tab',
            accelerator: this.keys.newTab,
            click: () => {
              this.tabManager.createTab();
            },
          },
          {
            label: 'New Window',
            accelerator: this.keys.newWindow,
            click: () => {
              // For now, create a new tab. In future, this could open a new window
              this.tabManager.createTab();
            },
          },
          { type: 'separator' as const },
          {
            label: 'Close Tab',
            accelerator: this.keys.closeTab,
            click: () => {
              const { activeTabId } = this.tabManager.getAllTabs();
              if (activeTabId) {
                this.tabManager.closeTab(activeTabId);
              }
            },
          },
          { type: 'separator' as const },
          this.isMac ? { role: 'close' as const } : { role: 'quit' as const },
        ],
      },

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

      {
        label: 'View',
        submenu: [
          {
            label: 'Back',
            accelerator: this.keys.back,
            click: () => {
              const activeTabId = this.tabManager.getActiveTabId();
              if (activeTabId) {
                this.tabManager.goBack(activeTabId);
              }
            },
          },
          {
            label: 'Forward',
            accelerator: this.keys.forward,
            click: () => {
              const activeTabId = this.tabManager.getActiveTabId();
              if (activeTabId) {
                this.tabManager.goForward(activeTabId);
              }
            },
          },
          { type: 'separator' as const },
          {
            label: 'Reload',
            accelerator: this.keys.reload,
            click: () => {
              const activeTabId = this.tabManager.getActiveTabId();
              if (activeTabId) {
                this.tabManager.reload(activeTabId);
              }
            },
          },
          {
            label: 'Force Reload',
            accelerator: this.keys.forceReload,
            click: () => {
              const activeTabId = this.tabManager.getActiveTabId();
              if (activeTabId) {
                this.tabManager.reload(activeTabId);
              }
            },
          },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },

      {
        label: 'Window',
        submenu: [
          { role: 'minimize' as const },
          { role: 'zoom' as const },
          { type: 'separator' as const },
          {
            label: 'Select Next Tab',
            accelerator: this.keys.nextTab,
            click: () => {
              this.tabManager.selectNextTab();
            },
          },
          {
            label: 'Select Previous Tab',
            accelerator: this.keys.prevTab,
            click: () => {
              this.tabManager.selectPreviousTab();
            },
          },
          { type: 'separator' as const },
          // Tab shortcuts 1-9
          ...Array.from({ length: 9 }, (_, i) => ({
            label: `Select Tab ${i + 1}`,
            accelerator: this.isMac ? `Cmd+${i + 1}` : `Ctrl+${i + 1}`,
            click: () => {
              this.tabManager.selectTabByIndex(i);
            },
          })),
          ...(this.isMac
            ? [
                { type: 'separator' as const },
                { role: 'front' as const },
                { type: 'separator' as const },
                { role: 'window' as const },
              ]
            : [
                { type: 'separator' as const },
                { role: 'close' as const },
              ]),
        ],
      },

      // Help menu
      {
        role: 'help' as const,
        submenu: [
          {
            label: 'Learn More',
            click: () => {
              this.tabManager.createTab('https://trybrowzer.com');
            },
          },
          {
            label: 'Documentation',
            click: () => {
              this.tabManager.createTab('https://docs.trybrowzer.com');
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

  private async handleCheckForUpdates(): Promise<void> {
    try {

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
}
