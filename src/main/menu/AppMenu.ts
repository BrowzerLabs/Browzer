import { app, BaseWindow, BrowserWindow, Menu } from 'electron';
import { TabManager } from '@/main/browser/TabManager';
import { UpdateService } from '@/main/UpdateService';

export class AppMenu {
  private tabManager: TabManager;
  private updateService: UpdateService;

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
    updateService: UpdateService
  ) {
    this.tabManager = tabManager;
    this.updateService = updateService;
  }

  private hasActiveWindow(): boolean {
    return BaseWindow.getAllWindows().length > 0;
  }

  private ensureWindow(): boolean {
    if (!this.hasActiveWindow()) {
      app.emit('activate');
      return false;
    }
    return true;
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
              if (this.ensureWindow()) {
                this.tabManager.createTab();
              }
            },
          },
          {
            label: 'New Window',
            accelerator: this.keys.newWindow,
            click: () => {
              if (this.ensureWindow()) {
                this.tabManager.createTab();
              }
            },
          },
          { type: 'separator' as const },
          {
            label: 'Close Tab',
            accelerator: this.keys.closeTab,
            click: () => {
              if (!this.hasActiveWindow()) return;
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
              if (!this.hasActiveWindow()) return;
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
              if (!this.hasActiveWindow()) return;
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
              if (!this.hasActiveWindow()) return;
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
              if (!this.hasActiveWindow()) return;
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
              if (!this.hasActiveWindow()) return;
              this.tabManager.selectNextTab();
            },
          },
          {
            label: 'Select Previous Tab',
            accelerator: this.keys.prevTab,
            click: () => {
              if (!this.hasActiveWindow()) return;
              this.tabManager.selectPreviousTab();
            },
          },
          { type: 'separator' as const },
          // Tab shortcuts 1-9
          ...Array.from({ length: 9 }, (_, i) => ({
            label: `Select Tab ${i + 1}`,
            accelerator: this.isMac ? `Cmd+${i + 1}` : `Ctrl+${i + 1}`,
            click: () => {
              if (!this.hasActiveWindow()) return;
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
              if (this.ensureWindow()) {
                this.tabManager.createTab('https://trybrowzer.com');
              }
            },
          },
          {
            label: 'Documentation',
            click: () => {
              if (this.ensureWindow()) {
                this.tabManager.createTab('https://docs.trybrowzer.com');
              }
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
    await this.updateService.checkForUpdates(true);
  }
}
