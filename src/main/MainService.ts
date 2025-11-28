import { BrowserManager } from '@/main/BrowserManager';
import { IPCHandlers } from '@/main/ipc/IPCHandlers';
import { DeepLinkService } from '@/main/deeplink/DeepLinkService';
import { ConnectionService } from './api';
import { AuthService } from '@/main/auth/AuthService';
import { AppMenu } from '@/main/menu/AppMenu';
import { UpdateService } from './UpdateService';
import { BaseWindow, WebContentsView, dialog } from 'electron';
import path from 'node:path';

export class MainService {
  private browserManager: BrowserManager;
  private connectionService: ConnectionService;
  private authService: AuthService;
  private ipcHandlers: IPCHandlers;
  private deepLinkService: DeepLinkService;
  private appMenu: AppMenu;
  private updateService: UpdateService;
  private baseWindow: BaseWindow | null = null;
  private browserView: WebContentsView | null = null;
  private sidebarVisible = true;
  private sidebarWidthPercent = 30;
  

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

    this.browserManager = new BrowserManager(this.baseWindow, this.browserView);

    this.updateService = new UpdateService(this.browserView.webContents);

    this.deepLinkService = new DeepLinkService(this.baseWindow, this.browserView.webContents);

    this.connectionService = new ConnectionService(this.browserView.webContents);

    this.authService = new AuthService(this.browserManager, this.connectionService);
    
    this.connectionService.setRefreshCallback(() => this.authService.refreshSession());
    
    this.ipcHandlers = new IPCHandlers(
      this.baseWindow,
      this.browserManager,
      this.authService
    );

    this.appMenu = new AppMenu(this.browserManager.getTabManager(), this.updateService);
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
    if (!this.baseWindow){
      console.error('❌ Base window is not initialized');
      dialog.showMessageBox({
        type: 'error',
        title: 'Application is not initialized',
        message: 'The application is not initialized properly. Please restart the application.'
      });
      this.destroy();
      return;
    }

    this.baseWindow.on('close', () => {
      this.destroy();
    });

    this.baseWindow.on('resize', () => {
      this.updateLayout();
    });

    this.ipcHandlers.on('sidebar-state-changed', (visible: boolean) => {
      this.sidebarVisible = visible;
      this.updateLayout();
    });
    
  }

  private updateLayout(): void {
    const bounds = this.baseWindow.getBounds();
    const sidebarWidth = this.sidebarVisible 
      ? Math.floor(bounds.width * (this.sidebarWidthPercent / 100))
      : 0;

    this.browserView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });

    this.browserManager.updateLayout(bounds.width, bounds.height, sidebarWidth);
  }

  public getBaseWindow() {
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
