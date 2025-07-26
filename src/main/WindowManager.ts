import { BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
} 