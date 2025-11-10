import { BrowserManager } from '@/main/BrowserManager';
import { WindowManager } from '@/main/window/WindowManager';
import { LayoutManager } from '@/main/window/LayoutManager';
import { IPCHandlers } from '@/main/ipc/IPCHandlers';
import { DeepLinkService } from '@/main/deeplink/DeepLinkService';
import { ConnectionService } from './api';
import { AuthService } from '@/main/auth/AuthService';
import { AppMenu } from '@/main/menu/AppMenu';

export class MainWindow {
  private windowManager: WindowManager;
  private layoutManager: LayoutManager;
  private browserManager: BrowserManager;
  private connectionService: ConnectionService;
  private authService: AuthService;
  private ipcHandlers: IPCHandlers;
  private deepLinkService: DeepLinkService;
  private appMenu: AppMenu;

  constructor() {
    this.windowManager = new WindowManager();
    
    const baseWindow = this.windowManager.getWindow();
    const browserUIView = this.windowManager.getBrowserUIView();
    
    this.layoutManager = new LayoutManager(baseWindow);

    this.browserManager = new BrowserManager(baseWindow, browserUIView);

    this.deepLinkService = new DeepLinkService(baseWindow, browserUIView.webContents);

    this.connectionService = new ConnectionService(browserUIView.webContents);

    this.authService = new AuthService(this.browserManager, this.connectionService);
    this.authService.restoreSession().catch(err => {
      console.error('Failed to initialize AuthService:', err);
    });
    
    // Set refresh callback for automatic token refresh
    this.connectionService.setRefreshCallback(() => this.authService.refreshSession());
    
    this.ipcHandlers = new IPCHandlers(
      this.browserManager,
      this.layoutManager,
      this.windowManager,
      this.authService
    );

    // Setup application menu
    this.appMenu = new AppMenu(this.browserManager, browserUIView.webContents);
    this.appMenu.setupMenu();

    this.windowManager.setupBrowserUI();

    this.updateLayout();

    baseWindow.on('resize', () => {
      this.updateLayout();
    });

    setTimeout(() => {
      this.windowManager.show();
    }, 100);
  }

  /**
   * Update layout when sidebar state or window size changes
   */
  private updateLayout(): void {
    const browserUIView = this.windowManager.getBrowserUIView();
    const baseWindow = this.windowManager.getWindow();
    
    if (!baseWindow) return;

    const bounds = baseWindow.getBounds();
    const sidebarState = this.layoutManager.getSidebarState();
    const sidebarWidth = sidebarState.visible 
      ? Math.floor(bounds.width * (sidebarState.widthPercent / 100))
      : 0;

    // Update agent UI bounds
    if (browserUIView) {
      const browserUIBounds = this.layoutManager.calculateBrowserUIBounds();
      browserUIView.setBounds(browserUIBounds);
    }

    // Update browser manager with window dimensions and sidebar width
    this.browserManager.updateLayout(bounds.width, bounds.height, sidebarWidth);
  }

  public getWindow() {
    return this.windowManager.getWindow();
  }

  public getBrowserUIView() {
    return this.windowManager.getBrowserUIView();
  }

  public destroy(): void {
    this.ipcHandlers.cleanup();
    this.browserManager.destroy();
    this.windowManager.destroy();
  }
}

