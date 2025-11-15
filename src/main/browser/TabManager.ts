import { BaseWindow, WebContentsView, Menu } from 'electron';
import path from 'node:path';
import { TabInfo, HistoryTransition } from '@/shared/types';
import { VideoRecorder } from '@/main/recording';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BrowserAutomationExecutor } from '@/main/automation';
import { HistoryService } from '@/main/history/HistoryService';
import { Tab, TabEventHandlers } from './types';
import { NavigationManager } from './NavigationManager';
import { DebuggerManager } from './DebuggerManager';
import { PasswordAutomation } from '@/main/password';

export class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter = 0;
  private currentSidebarWidth = 0;

  private readonly webContentsViewHeight = 88;

  constructor(
    private baseWindow: BaseWindow,
    private passwordManager: PasswordManager,
    private historyService: HistoryService,
    private navigationManager: NavigationManager,
    private debuggerManager: DebuggerManager,
    private eventHandlers: TabEventHandlers
  ) {}

  public createTab(url?: string): TabInfo {
    const tabId = `tab-${++this.tabCounter}`;
    
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    let displayUrl = url ?? 'https://www.google.com';
    let displayTitle = 'New Tab';
    
    const internalPageInfo = this.navigationManager.getInternalPageInfo(url || '');
    if (internalPageInfo) {
      displayUrl = internalPageInfo.url;
      displayTitle = internalPageInfo.title;
    }

    const tabInfo: TabInfo = {
      id: tabId,
      title: displayTitle,
      url: displayUrl,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };

    const tab: Tab = {
      id: tabId,
      view,
      info: tabInfo,
      videoRecorder: new VideoRecorder(view),
      passwordAutomation: new PasswordAutomation(
        view, 
        this.passwordManager, 
        tabId,
        this.eventHandlers.onCredentialSelected
      ),
      automationExecutor: new BrowserAutomationExecutor(view, tabId),
    };

    this.tabs.set(tabId, tab);
    this.setupTabEvents(tab);

    // Initialize debugger asynchronously
    this.debuggerManager.initializeDebugger(view, tabId).catch(err => 
      console.error('[TabManager] Failed to initialize debugger for tab:', tabId, err)
    );

    this.baseWindow.contentView.addChildView(view);
    this.updateTabViewBounds(view, this.currentSidebarWidth);

    const urlToLoad = url || 'https://www.google.com';
    view.webContents.loadURL(this.navigationManager.normalizeURL(urlToLoad));

    this.switchToTab(tabId);

    return tabInfo;
  }

  /**
   * Close a tab
   */
  public closeTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Remove view from window
    this.baseWindow.contentView.removeChildView(tab.view);

    // Clean up password automation
    if (tab.passwordAutomation) {
      tab.passwordAutomation.stop().catch(err => 
        console.error('[TabManager] Error stopping password automation:', err)
      );
    }

    this.debuggerManager.cleanupDebugger(tab.view, tabId);

    // Clean up
    tab.view.webContents.close();
    this.tabs.delete(tabId);

    // If this was the active tab, switch to another
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      if (remainingTabs.length > 0) {
        this.switchToTab(remainingTabs[0]);
      } else {
        this.activeTabId = null;
      }
    }

    this.eventHandlers.onTabsChanged();
    return true;
  }

  /**
   * Switch to a specific tab
   */
  public switchToTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;


    // Hide current active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab) {
        currentTab.view.setVisible(false);
      }
    }

    // Show new tab
    tab.view.setVisible(true);
    this.activeTabId = tabId;

    // Bring to front (re-add to ensure it's on top)
    this.baseWindow.contentView.removeChildView(tab.view);
    this.baseWindow.contentView.addChildView(tab.view);

    this.eventHandlers.onTabsChanged();
    return true;
  }

  /**
   * Navigate a tab to a URL
   */
  public navigate(tabId: string, url: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    const normalizedURL = this.navigationManager.normalizeURL(url);
    tab.view.webContents.loadURL(normalizedURL);
    return true;
  }

  /**
   * Navigation controls
   */
  public goBack(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view.webContents.navigationHistory.canGoBack()) return false;
    tab.view.webContents.navigationHistory.goBack();
    return true;
  }

  public goForward(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view.webContents.navigationHistory.canGoForward()) return false;
    tab.view.webContents.navigationHistory.goForward();
    return true;
  }

  public reload(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.view.webContents.reload();
    return true;
  }

  public stop(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    tab.view.webContents.stop();
    return true;
  }

  public canGoBack(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    return tab ? tab.view.webContents.navigationHistory.canGoBack() : false;
  }

  public canGoForward(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    return tab ? tab.view.webContents.navigationHistory.canGoForward() : false;
  }

  /**
   * Get all tabs info
   */
  public getAllTabs(): { tabs: TabInfo[]; activeTabId: string | null } {
    const tabs = Array.from(this.tabs.values()).map(tab => tab.info);
    return { tabs, activeTabId: this.activeTabId };
  }

  /**
   * Get active tab
   */
  public getActiveTab(): Tab | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) || null : null;
  }

  /**
   * Get tab by ID
   */
  public getTab(tabId: string): Tab | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * Get all tabs (internal)
   */
  public getTabs(): Map<string, Tab> {
    return this.tabs;
  }

  /**
   * Get active tab ID
   */
  public getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * Select the next tab in the tab list
   */
  public selectNextTab(): void {
    const tabs = Array.from(this.tabs.values());
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(tab => tab.id === this.activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    this.switchToTab(tabs[nextIndex].id);
  }

  /**
   * Select the previous tab in the tab list
   */
  public selectPreviousTab(): void {
    const tabs = Array.from(this.tabs.values());
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(tab => tab.id === this.activeTabId);
    const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
    this.switchToTab(tabs[prevIndex].id);
  }

  /**
   * Select a tab by its index
   */
  public selectTabByIndex(index: number): void {
    const tabs = Array.from(this.tabs.values());
    if (index >= 0 && index < tabs.length) {
      this.switchToTab(tabs[index].id);
    }
  }

  /**
   * Update layout when window resizes or sidebar changes
   */
  public updateLayout(sidebarWidth = 0): void {
    this.currentSidebarWidth = sidebarWidth;
    
    this.tabs.forEach(tab => {
      this.updateTabViewBounds(tab.view, sidebarWidth);
    });
  }

  /**
   * Clean up all tabs
   */
  public destroy(): void {
    this.tabs.forEach(tab => {
      this.debuggerManager.cleanupDebugger(tab.view, tab.id);
      this.baseWindow.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    });
    this.tabs.clear();
  }

  /**
   * Update bounds for a tab view
   */
  private updateTabViewBounds(view: WebContentsView, sidebarWidth = 0): void {
    const bounds = this.baseWindow.getBounds();
    view.setBounds({
      x: 0,
      y: this.webContentsViewHeight,
      width: bounds.width - sidebarWidth,
      height: bounds.height - this.webContentsViewHeight,
    });
  }

  /**
   * Setup event listeners for a tab's WebContents
   */
  private setupTabEvents(tab: Tab): void {
    const { view, info } = tab;
    const webContents = view.webContents;

    // Page title updated
    webContents.on('page-title-updated', (_, title) => {
      const internalPageTitle = this.navigationManager.getInternalPageTitle(info.url);
      if (internalPageTitle) {
        info.title = internalPageTitle;
      } else {
        info.title = title || 'Untitled';
      }
      this.eventHandlers.onTabsChanged();
    });

    // Navigation events
    webContents.on('did-start-loading', () => {
      info.isLoading = true;
      this.eventHandlers.onTabsChanged();
    });

    webContents.on('did-stop-loading', async () => {
      info.isLoading = false;
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      
      if (info.url && info.title) {
        this.historyService.addEntry(
          info.url,
          info.title,
          HistoryTransition.LINK,
          info.favicon
        ).catch(err => console.error('Failed to add history entry:', err));
      }
      
      // Start CDP-based password automation
      if (tab.passwordAutomation && !this.navigationManager.isInternalPage(info.url)) {
        try {
          await tab.passwordAutomation.start();
        } catch (error) {
          console.error('[TabManager] Failed to start password automation:', error);
        }
      }
      
      this.eventHandlers.onTabsChanged();
    });

    webContents.on('did-navigate', (_, url) => {
      const internalPageInfo = this.navigationManager.getInternalPageInfo(url);
      if (internalPageInfo) {
        info.url = internalPageInfo.url;
        info.title = internalPageInfo.title;
      } else {
        info.url = url;
      }
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      this.eventHandlers.onTabsChanged();
    });

    webContents.on('did-navigate-in-page', (_, url) => {
      const internalPageInfo = this.navigationManager.getInternalPageInfo(url);
      if (internalPageInfo) {
        info.url = internalPageInfo.url;
        info.title = internalPageInfo.title;
      } else {
        info.url = url;
      }
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      this.eventHandlers.onTabsChanged();
    });

    // Favicon
    webContents.on('page-favicon-updated', (_, favicons) => {
      if (!info.url.includes('browzer://settings') && favicons.length > 0) {
        info.favicon = favicons[0];
        this.eventHandlers.onTabsChanged();
      }
    });

    // Handle new window requests (open in new tab)
    webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' };
    });

    // Add context menu for right-click
    webContents.on('context-menu', (_event: any, params: any) => {
      const menu = Menu.buildFromTemplate([
        {
          label: 'Inspect Element',
          click: () => {
            webContents.inspectElement(params.x, params.y);
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ]);
      menu.popup();
    });

    // Handle keyboard shortcuts
    webContents.on('before-input-event', (event: any, input: any) => {
      // Cmd/Ctrl + Shift + I to open DevTools
      if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (webContents.isDevToolsOpened()) {
          webContents.closeDevTools();
        } else {
          webContents.openDevTools({ mode: 'right', activate: true });
        }
      }
      // Cmd/Ctrl + Shift + C to open DevTools in inspect mode
      else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'c') {
        event.preventDefault();
        webContents.openDevTools({ mode: 'right', activate: true });
      }
    });

    // Error handling
    webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      if (errorCode !== -3) { // Ignore aborted loads
        console.error(`Failed to load ${validatedURL}: ${errorDescription}`);
      }
      info.isLoading = false;
      this.eventHandlers.onTabsChanged();
    });
  }

  /**
   * Handle credential selection for multi-step flows
   */
  public handleCredentialSelected(tabId: string, credentialId: string, username: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.selectedCredentialId = credentialId;
      tab.selectedCredentialUsername = username;
    }
  }

  /**
   * Hide all tabs (for fullscreen routes)
   */
  public hideAllTabs(): void {
    this.tabs.forEach(tab => {
      tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    });
  }

  /**
   * Show all tabs (restore normal browsing)
   */
  public showAllTabs(): void {
    this.tabs.forEach(tab => {
      if (tab.id === this.activeTabId) {
        this.updateTabViewBounds(tab.view, this.currentSidebarWidth);
      }
    });
  }
}