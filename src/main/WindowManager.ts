import { BrowserWindow, shell, Menu, app, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from '../shared/types';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  async createMainWindow(): Promise<BrowserWindow> {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Browzer',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true, // Enable context isolation for security and contextBridge
        webviewTag: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/preload.js') // Fixed path: dist/src/main -> dist/src/preload
      }
    });

    // Enable DevTools for the main window in development
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      this.mainWindow.webContents.openDevTools();
    }

    // Load the main HTML file
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    await this.mainWindow.loadFile(htmlPath);

    // Setup event handlers
    this.setupWindowEventHandlers();
    this.setupDevToolsShortcuts();

    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  private setupWindowEventHandlers(): void {
    if (!this.mainWindow) return;

    // Handle renderer process crashes
    this.mainWindow.webContents.on('crashed', (event, killed) => {
      console.error('Renderer process crashed:', killed ? 'killed' : 'crashed');
      this.logCrash(`Renderer process ${killed ? 'killed' : 'crashed'}`);
    });

    // Handle renderer process gone
    this.mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('Renderer process gone:', details.reason);
      this.logCrash(`Renderer process gone: ${details.reason}`);
    });

    // Handle unresponsive window
    this.mainWindow.on('unresponsive', () => {
      console.error('Browser window is unresponsive');
      this.logCrash('Browser window became unresponsive');
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://chrome.google.com/webstore')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // Setup context menu handling for webviews
    this.setupContextMenuHandling();
  }

  private logCrash(message: string): void {
    const timestamp = new Date().toISOString();
    const logPath = path.join(__dirname, '../../crash-log.txt');
    try {
      fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Failed to write crash log:', error);
    }
  }

  private setupDevToolsShortcuts(): void {
    if (!this.mainWindow) return;

    // Register global shortcuts for DevTools
    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      // F12 key
      if (input.key === 'F12') {
        event.preventDefault();
        this.mainWindow!.webContents.toggleDevTools();
      }
      
      // Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac)
      if ((input.control || input.meta) && input.shift && input.key === 'I') {
        event.preventDefault();
        this.mainWindow!.webContents.toggleDevTools();
      }
      
      // Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac) - Console
      if ((input.control || input.meta) && input.shift && input.key === 'J') {
        event.preventDefault();
        this.mainWindow!.webContents.openDevTools({ mode: 'detach' });
      }
    });

    console.log('DevTools shortcuts registered for main window');
  }

  private setupContextMenuHandling(): void {
    if (!this.mainWindow) return;

    // Listen for context menu events from all webContents (including webviews)
    app.on('web-contents-created', (event, webContents) => {
      webContents.on('context-menu', (event, params) => {
        // Create context menu based on what was right-clicked
        const menuTemplate = [];

        // Navigation items
        if (params.linkURL) {
          menuTemplate.push(
            { 
              label: 'Open Link', 
              click: () => {
                // Navigate current webview to the link
                webContents.loadURL(params.linkURL);
              }
            },
            { 
              label: 'Open Link in New Tab', 
              click: () => {
                // Send IPC message to create new tab with URL
                if (this.mainWindow) {
                  this.mainWindow.webContents.send(IPC_CHANNELS.MENU_NEW_TAB_WITH_URL, params.linkURL);
                }
              }
            },
            { label: 'Copy Link Address', click: () => this.copyToClipboard(params.linkURL) },
            { type: 'separator' }
          );
        }

        // Edit items (if text is selected or in input field)
        if (params.isEditable || params.selectionText) {
          if (params.isEditable) {
            menuTemplate.push(
              { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
              { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
              { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
              { type: 'separator' }
            );
          } else if (params.selectionText) {
            menuTemplate.push(
              { label: 'Copy', role: 'copy' },
              { type: 'separator' }
            );
          }
        }

        // Page items
        menuTemplate.push(
          { label: 'Back', click: () => webContents.goBack(), enabled: webContents.canGoBack() },
          { label: 'Forward', click: () => webContents.goForward(), enabled: webContents.canGoForward() },
          { label: 'Reload', click: () => webContents.reload() },
          { type: 'separator' }
        );

        // Image items
        if (params.hasImageContents) {
          menuTemplate.push(
            { label: 'Copy Image', click: () => webContents.copyImageAt(params.x, params.y) },
            { label: 'Copy Image Address', click: () => this.copyToClipboard(params.srcURL) },
            { type: 'separator' }
          );
        }

        // Developer items
        menuTemplate.push(
          { label: 'Inspect Element', click: () => webContents.inspectElement(params.x, params.y) },
          { label: 'View Page Source', click: () => this.viewPageSource(webContents) }
        );

        // Only show menu if there are items
        if (menuTemplate.length > 0) {
          const contextMenu = Menu.buildFromTemplate(menuTemplate as any);
          contextMenu.popup({ window: this.mainWindow! });
        }
      });
    });
  }

  private copyToClipboard(text: string): void {
    clipboard.writeText(text);
  }

  private viewPageSource(webContents: Electron.WebContents): void {
    webContents.executeJavaScript('document.documentElement.outerHTML').then((html) => {
      // Create a new window to show the page source
      const sourceWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Page Source',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Source</title>
          <style>
            body { font-family: monospace; white-space: pre-wrap; padding: 10px; }
          </style>
        </head>
        <body>${this.escapeHtml(html)}</body>
        </html>
      `;

      sourceWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }).catch(console.error);
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
} 