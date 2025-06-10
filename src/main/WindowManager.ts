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
        contextIsolation: false,
        webviewTag: true,
        webSecurity: true,
        preload: path.join(__dirname, '../../preload/preload.js')
      }
    });

    // Load the main HTML file
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    await this.mainWindow.loadFile(htmlPath);

    // Setup event handlers
    this.setupWindowEventHandlers();

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
} 