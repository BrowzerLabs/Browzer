import { BrowserManager } from '@/main/BrowserManager';
import { LayoutManager } from '@/main/window/LayoutManager';
import { IPCHandlers } from '@/main/ipc/IPCHandlers';
import { DeepLinkService } from '@/main/deeplink/DeepLinkService';
import { ConnectionService } from './api';
import { AuthService } from '@/main/auth/AuthService';
import { AppMenu } from '@/main/menu/AppMenu';
import { UpdaterManager } from './updater';
import { BaseWindow, WebContentsView } from 'electron';
import path from 'node:path';

export class MainWindow {
  private layoutManager: LayoutManager;
  private browserManager: BrowserManager;
  private connectionService: ConnectionService;
  private authService: AuthService;
  private ipcHandlers: IPCHandlers;
  private deepLinkService: DeepLinkService;
  private appMenu: AppMenu;
  private updaterManager: UpdaterManager;
  private baseWindow: BaseWindow | null = null;
  private browserView: WebContentsView | null = null;
  

  constructor() {
    this.baseWindow = new BaseWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 700,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 10, y: 10 },
      show: false,
      transparent: true,
      darkTheme: true,
      titleBarOverlay: false
    });

    this.browserView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        transparent: true,
        zoomFactor: 1,
      },
    });

    this.baseWindow.contentView.addChildView(this.browserView);
    
    this.layoutManager = new LayoutManager(this.baseWindow);

    this.browserManager = new BrowserManager(this.baseWindow, this.browserView);

    this.updaterManager = new UpdaterManager(this.browserView.webContents);

    this.deepLinkService = new DeepLinkService(this.baseWindow, this.browserView.webContents);

    this.connectionService = new ConnectionService(this.browserView.webContents);

    this.authService = new AuthService(this.browserManager, this.connectionService);
    
    this.connectionService.setRefreshCallback(() => this.authService.refreshSession());
    
    this.ipcHandlers = new IPCHandlers(
      this.baseWindow,
      this.browserView,
      this.browserManager,
      this.layoutManager,
      this.authService
    );

    this.appMenu = new AppMenu(this.browserManager.getTabManager(), this.updaterManager);
    this.appMenu.setupMenu();

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      this.browserView.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      this.browserView.webContents.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    this.updateLayout();

    this.setUpWindowEvents();

    setTimeout(() => {
      this.baseWindow.show();
    }, 200);
  }

  private setUpWindowEvents(): void {
    if (!this.baseWindow) return;

    this.baseWindow.on('resize', () => {
      this.updateLayout();
    });
  }

  private updateLayout(): void {
    const bounds = this.baseWindow.getBounds();
    const sidebarState = this.layoutManager.getSidebarState();
    const sidebarWidth = sidebarState.visible 
      ? Math.floor(bounds.width * (sidebarState.widthPercent / 100))
      : 0;

    if (this.browserView) {
      const browserUIBounds = this.layoutManager.calculateBrowserUIBounds();
      this.browserView.setBounds(browserUIBounds);
    }

    this.browserManager.updateLayout(bounds.width, bounds.height, sidebarWidth);
  }

  public getWindow() {
    return this.baseWindow;
  }

  public getBrowserUIView() {
    return this.browserView;
  }

  public destroy(): void {
    this.ipcHandlers.cleanup();
    this.browserManager.destroy();
    this.baseWindow = null;
    this.browserView = null;
  }
}
