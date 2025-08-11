import { Menu, BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

export class MenuManager {
  initialize(): void {
    this.createApplicationMenu();
  }

  private createApplicationMenu(): void {
    const template: MenuItemConstructorOptions[] = [
      // macOS app menu
      ...(process.platform === 'darwin' ? [{
        label: 'Browzer',
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          { role: 'services' as const },
          { type: 'separator' as const },
          { role: 'hide' as const },
          { role: 'hideOthers' as const },
          { role: 'unhide' as const },
          { type: 'separator' as const },
          { role: 'quit' as const }
        ]
      }] : []),
      // File menu
      {
        label: 'File',
        submenu: [
          {
            label: 'New Tab',
            accelerator: 'CmdOrCtrl+T',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_NEW_TAB);
            }
          },
          {
            label: 'New Window',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              // Create new window - this would need to be handled by WindowManager
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                // For now, just send new tab action
                this.sendMenuAction(IPC_CHANNELS.MENU_NEW_TAB);
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Close Tab',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_CLOSE_TAB);
            }
          },
          ...(process.platform !== 'darwin' ? [
            { type: 'separator' as const },
            { role: 'quit' as const }
          ] : [])
        ]
      },
      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      // View menu
      {
        label: 'View',
        submenu: [
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_RELOAD);
            }
          },
          {
            label: 'Force Reload',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: () => {
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.webContents.reloadIgnoringCache();
              }
            }
          },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          { role: 'toggleDevTools' }
        ]
      },
      // Navigate menu
      {
        label: 'Navigate',
        submenu: [
          {
            label: 'Back',
            accelerator: 'Alt+Left',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_BACK);
            }
          },
          {
            label: 'Forward',
            accelerator: 'Alt+Right',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_FORWARD);
            }
          },
          { type: 'separator' },
          {
            label: 'Home',
            accelerator: 'Alt+Home',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_NEW_TAB);
            }
          }
        ]
      },
      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' },
          ...(process.platform === 'darwin' ? [
            { type: 'separator' as const },
            { role: 'front' as const }
          ] : [])
        ]
      },
      // Settings menu
      {
        label: 'Settings',
        submenu: [
          {
            label: 'API Keys',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_SETTINGS_API_KEYS);
            }
          },
          {
            label: 'Interface',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_SETTINGS_INTERFACE);
            }
          },
          {
            label: 'AI Memory',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_SETTINGS_AI_MEMORY);
            }
          },
          {
            label: 'Privacy & Security',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_SETTINGS_PRIVACY);
            }
          },
          {
            label: 'Cache & Storage',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_SETTINGS_CACHE);
            }
          },
          { type: 'separator' },
          {
            label: 'General',
            click: () => {
              this.sendMenuAction(IPC_CHANNELS.MENU_SETTINGS_GENERAL);
            }
          }
        ]
      },
      // Help menu
      {
        label: 'Help',
        submenu: [
          {
            label: 'About Browzer',
            click: () => {
              // Could show an about dialog
              // console.log('About Browzer');
            }
          },
          {
            label: 'Learn More',
            click: () => {
              // Could open documentation
              // console.log('Learn More clicked');
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private sendMenuAction(channel: string): void {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.webContents.send(channel);
    }
  }
} 