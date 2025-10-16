import { BrowserManager } from '@/main/BrowserManager';
import { WindowManager } from '@/main/window/WindowManager';
import { LayoutManager } from '@/main/window/LayoutManager';
import { IPCHandlers } from '@/main/ipc/IPCHandlers';

export class BrowserWindow {
  private windowManager: WindowManager;
  private layoutManager: LayoutManager;
  private browserManager: BrowserManager;
  private ipcHandlers: IPCHandlers;

  constructor() {
    // 1. Initialize window and views
    this.windowManager = new WindowManager();
    
    const baseWindow = this.windowManager.getWindow();
    const agentUIView = this.windowManager.getAgentUIView();
    const chromeHeight = this.windowManager.getChromeHeight();

    if (!baseWindow || !agentUIView) {
      throw new Error('Failed to initialize window');
    }
    this.layoutManager = new LayoutManager(baseWindow, chromeHeight);

    // 3. Initialize browser manager (tabs + recording)
    this.browserManager = new BrowserManager(baseWindow, chromeHeight, agentUIView);

    // 4. Setup IPC communication
    this.ipcHandlers = new IPCHandlers(
      this.browserManager,
      this.layoutManager,
      this.windowManager
    );

    // 5. Initial layout
    this.updateLayout();

    // 6. Listen for window resize
    baseWindow.on('resize', () => {
      this.updateLayout();
    });
  }

  /**
   * Update layout when sidebar state or window size changes
   */
  private updateLayout(): void {
    const agentUIView = this.windowManager.getAgentUIView();
    const baseWindow = this.windowManager.getWindow();
    
    if (!baseWindow) return;

    const bounds = baseWindow.getBounds();
    const sidebarState = this.layoutManager.getSidebarState();
    const sidebarWidth = sidebarState.visible 
      ? Math.floor(bounds.width * (sidebarState.widthPercent / 100))
      : 0;

    // Update agent UI bounds
    if (agentUIView) {
      const agentUIBounds = this.layoutManager.calculateAgentUIBounds();
      agentUIView.setBounds(agentUIBounds);
    }

    // Update browser manager with window dimensions and sidebar width
    this.browserManager.updateLayout(bounds.width, bounds.height, sidebarWidth);
  }

  public getWindow() {
    return this.windowManager.getWindow();
  }

  public destroy(): void {
    this.ipcHandlers.cleanup();
    this.browserManager.destroy();
    this.windowManager.destroy();
  }
}

