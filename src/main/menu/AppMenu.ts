import { app, BaseWindow, BrowserWindow, Menu } from 'electron';
import { TabService } from '@/main/browser/TabService';
import { UpdateService } from '@/main/UpdateService';

export class AppMenu {
  private tabService: TabService;
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
    history: this.isMac ? 'Cmd+Y' : 'Ctrl+H',
    settings: this.isMac ? 'Cmd+,': 'Ctrl+,',
    downloads: this.isMac ? 'Cmd+Shift+J' : 'Ctrl+J',
    enterFullscreen: this.isMac ? 'Fn+F' : 'F11',
    exitFullscreen: this.isMac ? 'Fn+F' : 'F11',
  };

  constructor(
    tabService: TabService,
    updateService: UpdateService
  ) {
    this.tabService = tabService;
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
                {
                  label: 'Settings',
                  accelerator: this.keys.settings,
                  click: () => {
                    if (this.ensureWindow()) {
                      this.tabService.createTab('browzer://settings');
                    }
                  },
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
                this.tabService.createTab();
              }
            },
          },
          {
            label: 'New Window',
            accelerator: this.keys.newWindow,
            click: () => {
              if (this.ensureWindow()) {
                this.tabService.createTab();
              }
            },
          },
          { type: 'separator' as const },
          {
            label: 'Close Tab',
            accelerator: this.keys.closeTab,
            click: () => {
              if (!this.hasActiveWindow()) return;
              const { activeTabId } = this.tabService.getAllTabs();
              if (activeTabId) {
                this.tabService.closeTab(activeTabId);
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
              const activeTabId = this.tabService.getActiveTabId();
              if (activeTabId) {
                this.tabService.goBack(activeTabId);
              }
            },
          },
          {
            label: 'Forward',
            accelerator: this.keys.forward,
            click: () => {
              if (!this.hasActiveWindow()) return;
              const activeTabId = this.tabService.getActiveTabId();
              if (activeTabId) {
                this.tabService.goForward(activeTabId);
              }
            },
          },
          {
            label: 'History',
            accelerator: this.keys.history,
            click: () => {
              if (this.ensureWindow()) {
                this.tabService.createTab('browzer://history');
              }
            },
          },
          { type: 'separator' as const },
          {
            label: 'Reload',
            accelerator: this.keys.reload,
            click: () => {
              if (!this.hasActiveWindow()) return;
              const activeTabId = this.tabService.getActiveTabId();
              if (activeTabId) {
                this.tabService.reload(activeTabId);
              }
            },
          },
          {
            label: 'Force Reload',
            accelerator: this.keys.forceReload,
            click: () => {
              if (!this.hasActiveWindow()) return;
              const activeTabId = this.tabService.getActiveTabId();
              if (activeTabId) {
                this.tabService.reload(activeTabId);
              }
            },
          },
          { type: 'separator' as const },
          {
            label: 'Downloads',
            accelerator: this.keys.downloads,
            click: () => {
              if (this.ensureWindow()){
                this.tabService.createTab('browzer://downloads');
              }
            },
          },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          {
            label: 'Toggle Full Screen',
            accelerator: this.keys.enterFullscreen,
            click: () => this.toggleFullscreen(),
          },
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
              this.tabService.selectNextTab();
            },
          },
          {
            label: 'Select Previous Tab',
            accelerator: this.keys.prevTab,
            click: () => {
              if (!this.hasActiveWindow()) return;
              this.tabService.selectPreviousTab();
            },
          },
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
                this.tabService.createTab('https://trybrowzer.com');
              }
            },
          },
          {
            label: 'Documentation',
            click: () => {
              if (this.ensureWindow()) {
                this.tabService.createTab('https://docs.trybrowzer.com');
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

  private setFullscreen(shouldBeFull: boolean): void {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused) {
      focused.setFullScreen(shouldBeFull);
    }
  }

  private toggleFullscreen(): void {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused) {
      focused.setFullScreen(!focused.isFullScreen());
    }
  }
}
