import { BaseWindow, WebContentsView } from 'electron';
import path from 'node:path';

/**
 * WindowManager - Handles BaseWindow and WebContentsView lifecycle
 * Responsible for creating and managing the main application window
 */
export class WindowManager {
  private baseWindow: BaseWindow | null = null;
  private agentUIView: WebContentsView | null = null;
  private readonly CHROME_HEIGHT = 88;

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
      backgroundColor: '#fff',
      show: false,
      fullscreenable: false, // Prevent fullscreen mode to keep traffic lights always visible
    });

    // Create Agent UI WebContentsView (trusted UI layer)
    this.agentUIView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.baseWindow.contentView.addChildView(this.agentUIView);
    this.setupAgentUI();
    this.setupWindowEvents();

    // Show window after loading
    setTimeout(() => {
      this.baseWindow?.show();
    }, 100);

    // Open DevTools in development
    // if (process.env.NODE_ENV === 'development') {
    //  this.agentUIView.webContents.openDevTools({ mode: 'detach' });
    // }
    // DevTools will only open via keyboard shortcut (Cmd+Shift+I) or context menu
  }

  private setupAgentUI(): void {
    if (!this.agentUIView) return;

    // Load the agent UI (React app)
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.agentUIView.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.agentUIView.webContents.loadFile(
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
      this.agentUIView = null;
    });
  }

  public updateLayout(bounds: { x: number; y: number; width: number; height: number }): void {
    if (!this.agentUIView) return;
    this.agentUIView.setBounds(bounds);
  }

  public getWindow(): BaseWindow | null {
    return this.baseWindow;
  }

  public getAgentUIView(): WebContentsView | null {
    return this.agentUIView;
  }

  public getChromeHeight(): number {
    return this.CHROME_HEIGHT;
  }

  public sendToRenderer(channel: string, ...args: any[]): void {
    if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
      this.agentUIView.webContents.send(channel, ...args);
    }
  }

  public destroy(): void {
    this.baseWindow?.close();
  }
}
