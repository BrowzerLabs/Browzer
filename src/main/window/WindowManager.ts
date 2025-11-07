import { BaseWindow, WebContentsView } from 'electron';
import path from 'node:path';

/**
 * WindowManager - Handles BaseWindow and WebContentsView lifecycle
 * Responsible for creating and managing the main application window
 */
export class WindowManager {
  private baseWindow: BaseWindow | null = null;
  private browserUIView: WebContentsView | null = null;

  constructor() {
    this.createWindow();
  }

  private createWindow(): void {
    // Create BaseWindow (no webContents, just a container)
    this.baseWindow = new BaseWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 700,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 10, y: 10 },
      show: false,
      fullscreenable: false, // Prevent fullscreen mode to keep traffic lights always visible
    });

    // Create Browser UI WebContentsView (main browser UI)
    this.browserUIView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.baseWindow.contentView.addChildView(this.browserUIView);
    this.setupBrowserUI();
    this.setupWindowEvents();

    // Show window after loading
    setTimeout(() => {
      this.baseWindow.show();
    }, 100);

    // if (process.env.NODE_ENV === 'development') {
    //  this.browserUIView.webContents.openDevTools({ mode: 'detach' });
    // }
  }

  private setupBrowserUI(): void {
    if (!this.browserUIView) return;

    // Load the browser UI (React app)
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.browserUIView.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.browserUIView.webContents.loadFile(
        path.join(__dirname, `../../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
      );
    }
  }

  private setupWindowEvents(): void {
    if (!this.baseWindow) return;

    this.baseWindow.on('close', () => {
      console.log('Window closing...');
    });

    this.baseWindow.on('closed', () => {
      this.baseWindow = null;
      this.browserUIView = null;
    });
  }

  public updateLayout(bounds: { x: number; y: number; width: number; height: number }): void {
    if (!this.browserUIView) return;
    this.browserUIView.setBounds(bounds);
  }

  public getWindow(): BaseWindow | null {
    return this.baseWindow;
  }

  public getBrowserUIView(): WebContentsView | null {
    return this.browserUIView;
  }

  public destroy(): void {
    this.baseWindow.close();
  }
}
