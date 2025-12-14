import { BaseWindow, WebContentsView } from 'electron';
import { EventEmitter } from 'events';
import path from 'node:path';
import { TabInfo, HistoryTransition, ToastPayload, NavigationError, isNetworkError, shouldIgnoreError } from '@/shared/types';
import { VideoRecorder } from '@/main/recording';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BrowserAutomationExecutor } from '@/main/automation';
import { HistoryService } from '@/main/history/HistoryService';
import { BookmarkService } from '@/main/bookmark';
import { Tab, TabServiceEvents } from './types';
import { NavigationService } from './NavigationService';
import { DebuggerService } from './DebuggerService';
import { PasswordAutomation } from '@/main/password';
import { SettingsService, SettingsChangeEvent } from '@/main/settings/SettingsService';
import { ContextMenuService } from './ContextMenuService';
import { errorPageService } from './ErrorPageService';

const TAB_HEIGHT = {
  WITHOUT_BOOKMARKS: 75 as number,
  WITH_BOOKMARKS: 104 as number,
};

export class TabService extends EventEmitter {
  public on<K extends keyof TabServiceEvents>(event: K, listener: TabServiceEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof TabServiceEvents>(event: K, ...args: Parameters<TabServiceEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  private tabs = new Map<string, Tab>();
  private orderedTabIds: string[] = [];
  private activeTabId: string | null = null;
  private tabCounter = 0;
  private currentSidebarWidth = 0;
  private webContentsViewHeight = TAB_HEIGHT.WITHOUT_BOOKMARKS;
  private newTabUrl = 'browzer://home';
  private readonly contextMenuService = new ContextMenuService();

  constructor(
    private baseWindow: BaseWindow,
    private browserView: WebContentsView,
    private passwordManager: PasswordManager,
    private settingsService: SettingsService,
    private historyService: HistoryService,
    private navigationService: NavigationService,
    private debuggerService: DebuggerService,
    private bookmarkService: BookmarkService
  ) {
    super();
    this.initialize();
  }

  public initializeAfterAuth(): void {
    if (this.tabs.size === 0) {
      this.createTab();
    }
  }

  private initialize(): void {
    this.newTabUrl = this.settingsService.getSetting('general', 'newTabUrl') || 'browzer://home';
    this.setupEventListeners();
    this.recalculateBookmarkBarHeight();
  }

  private setupEventListeners(): void {
    this.settingsService.on('settings:general', (event: SettingsChangeEvent<'general'>) => {
      this.newTabUrl = event.newValue.newTabUrl || 'browzer://home';
    });
    
    this.settingsService.on('settings:appearance', (event: SettingsChangeEvent<'appearance'>) => {
      if (event.key === 'showBookmarksBar') {
        this.recalculateBookmarkBarHeight();
      }
    });

    this.bookmarkService.on('bookmark:changed', () => this.recalculateBookmarkBarHeight());

    this.contextMenuService.on('open-link-in-new-tab', (url: string) => this.createTab(url));
    this.contextMenuService.on('toast', (payload: ToastPayload) => {
      this.browserView.webContents.send('toast', payload);
    });
    
    this.contextMenuService.on('context-menu-action', (event) => {
      this.emit('context-menu-action', event);
    });
  }

  public recalculateBookmarkBarHeight(): void {
    const showBookmarksBar = this.settingsService.getSetting('appearance', 'showBookmarksBar');
    const hasBookmarks = this.bookmarkService.hasBookmarksInBar();
    
    this.webContentsViewHeight = showBookmarksBar && hasBookmarks
      ? TAB_HEIGHT.WITH_BOOKMARKS 
      : TAB_HEIGHT.WITHOUT_BOOKMARKS;
    
    this.updateLayout(this.currentSidebarWidth);
  }


  public createTab(url?: string): Tab {
    const previousActiveTabId = this.activeTabId;
    const tabId = `tab-${++this.tabCounter}`;
    const urlToLoad = url || this.newTabUrl;
    
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

    const internalPageInfo = this.navigationService.getInternalPageInfo(urlToLoad);
    
    const tabInfo: TabInfo = {
      id: tabId,
      title: internalPageInfo?.title || 'New Tab',
      url: internalPageInfo?.url || urlToLoad,
      favicon: internalPageInfo?.favicon,
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
        this.handleCredentialSelected.bind(this)
      ),
      automationExecutor: new BrowserAutomationExecutor(view, tabId),
    };

    this.tabs.set(tabId, tab);
    this.orderedTabIds.push(tabId);
    this.setupTabWebContentsEvents(tab);

    this.debuggerService.initializeDebugger(view, tabId).catch(err => 
      console.error('[TabService] Failed to initialize debugger:', tabId, err)
    );

    this.baseWindow.contentView.addChildView(view);
    this.updateTabViewBounds(view, this.currentSidebarWidth);
    view.webContents.loadURL(this.navigationService.normalizeURL(urlToLoad));
    this.switchToTab(tabId);
    
    this.emit('tab:created', tab, previousActiveTabId);
    return tab;
  }

  public closeTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    const wasActiveTab = this.activeTabId === tabId;
    const orderIndex = this.orderedTabIds.indexOf(tabId);

    this.baseWindow.contentView.removeChildView(tab.view);
    tab.passwordAutomation?.stop().catch(console.error);
    this.debuggerService.cleanupDebugger(tab.view);
    tab.view.webContents.close();
    
    this.tabs.delete(tabId);
    if (orderIndex !== -1) {
      this.orderedTabIds.splice(orderIndex, 1);
    }

    let newActiveTabId: string | null = null;
    if (wasActiveTab && this.orderedTabIds.length > 0) {
      const targetIndex = Math.min(orderIndex, this.orderedTabIds.length - 1);
      newActiveTabId = this.orderedTabIds[Math.max(0, targetIndex)];
      this.switchToTab(newActiveTabId);
    } else if (wasActiveTab) {
      this.activeTabId = null;
    }

    this.emit('tabs:changed');
    this.emit('tab:closed', tabId, newActiveTabId, wasActiveTab);
    
    if (this.tabs.size === 0) {
      this.baseWindow.close();
    }
    
    return true;
  }

  public switchToTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    const previousTabId = this.activeTabId;

    if (this.activeTabId && this.activeTabId !== tabId) {
      this.tabs.get(this.activeTabId)?.view.setVisible(false);
    }

    tab.view.setVisible(true);
    this.activeTabId = tabId;
    this.emit('tabs:changed');
    
    if (previousTabId && previousTabId !== tabId) {
      this.emit('tab:switched', previousTabId, tab);
    }
    
    return true;
  }

  public navigate(tabId: string, url: string): boolean {
    let tab = this.tabs.get(tabId);
    if (!tab) {
      tab = this.createTab(url);
    }
    tab.view.webContents.loadURL(this.navigationService.normalizeURL(url));
    return true;
  }

  public goBack(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    
    const history = tab.view.webContents.navigationHistory;
    if (!history.canGoBack()) return false;
    
    const currentUrl = tab.view.webContents.getURL();
    if (currentUrl.startsWith('data:text/html') && tab.info.error) {
      const currentIndex = history.getActiveIndex();
      if (currentIndex >= 2) {
        history.goToIndex(currentIndex - 2);
        return true;
      } else if (currentIndex >= 1) {
        history.goToIndex(0);
        return true;
      }
      return false;
    }
    
    history.goBack();
    return true;
  }

  public goForward(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    
    const history = tab.view.webContents.navigationHistory;
    if (!history.canGoForward()) return false;
    
    history.goForward();
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
    if (!tab) return false;
    
    const history = tab.view.webContents.navigationHistory;
    const currentUrl = tab.view.webContents.getURL();
    
    if (currentUrl.startsWith('data:text/html') && tab.info.error) {
      return history.getActiveIndex() >= 2;
    }
    
    return history.canGoBack();
  }

  public canGoForward(tabId: string): boolean {
    return this.tabs.get(tabId)?.view.webContents.navigationHistory.canGoForward() ?? false;
  }

  public retryNavigation(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    const failedUrl = tab.info.failedUrl;
    if (!failedUrl) {
      tab.view.webContents.reload();
      return true;
    }

    tab.info.error = null;
    tab.info.failedUrl = undefined;
    tab.view.webContents.loadURL(this.navigationService.normalizeURL(failedUrl));
    this.emit('tabs:changed');
    return true;
  }

  public getTabError(tabId: string): NavigationError | null {
    const tab = this.tabs.get(tabId);
    return tab?.info.error ?? null;
  }

  public hasError(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    return !!tab?.info.error;
  }

  public clearError(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.info.error = null;
      tab.info.failedUrl = undefined;
      this.emit('tabs:changed');
    }
  }

  public selectNextTab(): void {
    if (this.orderedTabIds.length === 0) return;
    const currentIndex = this.orderedTabIds.indexOf(this.activeTabId || '');
    const nextIndex = (currentIndex + 1) % this.orderedTabIds.length;
    this.switchToTab(this.orderedTabIds[nextIndex]);
  }

  public selectPreviousTab(): void {
    if (this.orderedTabIds.length === 0) return;
    const currentIndex = this.orderedTabIds.indexOf(this.activeTabId || '');
    const prevIndex = currentIndex <= 0 ? this.orderedTabIds.length - 1 : currentIndex - 1;
    this.switchToTab(this.orderedTabIds[prevIndex]);
  }

  public selectTabByIndex(index: number): void {
    if (index >= 0 && index < this.orderedTabIds.length) {
      this.switchToTab(this.orderedTabIds[index]);
    }
  }

  public reorderTab(tabId: string, newIndex: number): boolean {
    const currentIndex = this.orderedTabIds.indexOf(tabId);
    if (currentIndex === -1) {
      console.warn('[TabService] reorderTab: tab not found:', tabId);
      return false;
    }

    const clampedIndex = Math.max(0, Math.min(newIndex, this.orderedTabIds.length - 1));
    if (clampedIndex === currentIndex) return false;

    this.orderedTabIds.splice(currentIndex, 1);
    this.orderedTabIds.splice(clampedIndex, 0, tabId);
    this.reorderSingleTabView(tabId, clampedIndex);
    
    this.emit('tab:reordered', { tabId, from: currentIndex, to: clampedIndex });
    return true;
  }

  private reorderSingleTabView(tabId: string, newOrderIndex: number): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    this.baseWindow.contentView.removeChildView(tab.view);
    
    const children = this.baseWindow.contentView.children;
    let insertIndex = children.length;
    
    if (newOrderIndex < this.orderedTabIds.length - 1) {
      const nextTab = this.tabs.get(this.orderedTabIds[newOrderIndex + 1]);
      if (nextTab) {
        const nextViewIndex = children.indexOf(nextTab.view);
        if (nextViewIndex !== -1) insertIndex = nextViewIndex;
      }
    }
    
    this.baseWindow.contentView.addChildView(tab.view, Math.min(insertIndex, children.length));
  }

  public getAllTabs(): { tabs: TabInfo[]; activeTabId: string | null } {
    const tabs = this.orderedTabIds
      .map(id => this.tabs.get(id))
      .filter((tab): tab is Tab => !!tab)
      .map(tab => tab.info);
    return { tabs, activeTabId: this.activeTabId };
  }

  public getActiveTab(): Tab | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) ?? null : null;
  }

  public getTab(tabId: string): Tab | undefined {
    return this.tabs.get(tabId);
  }

  public getTabs(): Map<string, Tab> {
    return this.tabs;
  }

  public getActiveTabId(): string | null {
    return this.activeTabId;
  }

  public updateLayout(sidebarWidth = 0): void {
    this.currentSidebarWidth = sidebarWidth;
    this.tabs.forEach(tab => this.updateTabViewBounds(tab.view, sidebarWidth));
  }

  private updateTabViewBounds(view: WebContentsView, sidebarWidth = 0): void {
    const bounds = this.baseWindow.getBounds();
    view.setBounds({
      x: 0,
      y: this.webContentsViewHeight,
      width: bounds.width - sidebarWidth,
      height: bounds.height - this.webContentsViewHeight,
    });
  }


  public hideAllTabs(): void {
    this.tabs.forEach(tab => tab.view.setVisible(false));
  }

  public showAllTabs(): void {
    this.tabs.forEach(tab => {
      if (tab.id === this.activeTabId) {
        tab.view.setVisible(true);
      }
    });
  }

  public destroy(): void {
    this.contextMenuService.destroy();
    this.tabs.forEach(tab => {
      this.debuggerService.cleanupDebugger(tab.view);
      this.baseWindow.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    });
    this.tabs.clear();
    this.orderedTabIds = [];
    this.activeTabId = null;
  }

  public handleCredentialSelected(tabId: string, credentialId: string, username: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.selectedCredentialId = credentialId;
      tab.selectedCredentialUsername = username;
    }
  }

  private setupTabWebContentsEvents(tab: Tab): void {
    const { view, info } = tab;
    const wc = view.webContents;

    wc.on('page-title-updated', (_, title) => {
      info.title = this.navigationService.getInternalPageTitle(info.url) || title || 'Untitled';
      this.emit('tabs:changed');
    });

    wc.on('did-start-loading', () => {
      info.isLoading = true;
      info.error = null;
      info.failedUrl = undefined;
      this.emit('tabs:changed');
    });

    wc.on('did-stop-loading', async () => {
      info.isLoading = false;
      info.canGoBack = wc.navigationHistory.canGoBack();
      info.canGoForward = wc.navigationHistory.canGoForward();
      
      if (info.url && info.title) {
        this.historyService.addEntry(info.url, info.title, HistoryTransition.LINK, info.favicon)
          .catch(err => console.error('Failed to add history entry:', err));
      }
      
      if (tab.passwordAutomation && !this.navigationService.isInternalPage(info.url)) {
        try {
          await tab.passwordAutomation.start();
        } catch (error) {
          console.error('[TabService] Failed to start password automation:', error);
        }
      }
      
      this.emit('tabs:changed');
    });

    wc.on('will-navigate', (event, url) => {
      if (url.startsWith('browzer-action://')) {
        event.preventDefault();
        const action = url.replace('browzer-action://', '');
        
        switch (action) {
          case 'retry':
            this.retryNavigation(tab.id);
            break;
          case 'home':
            this.navigate(tab.id, 'browzer://home');
            break;
          case 'bypass-certificate':
            this.bypassCertificateError(tab.id);
            break;
        }
      }
    });

    wc.on('did-navigate', (_, url) => this.handleNavigation(info, wc, url));
    wc.on('did-navigate-in-page', (_, url) => this.handleNavigation(info, wc, url));

    wc.on('page-favicon-updated', (_, favicons) => {
      if (!this.navigationService.isInternalPage(info.url) && favicons.length > 0) {
        info.favicon = favicons[0];
        this.emit('tabs:changed');
      }
    });

    wc.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' };
    });

    wc.on('before-input-event', (event: any, input: any) => {
      const isDevToolsShortcut = (input.control || input.meta) && input.shift;
      if (isDevToolsShortcut && input.key.toLowerCase() === 'i') {
        event.preventDefault();
        wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'right', activate: true });
      } else if (isDevToolsShortcut && input.key.toLowerCase() === 'c') {
        event.preventDefault();
        wc.openDevTools({ mode: 'right', activate: true });
      }
    });

    wc.on('did-fail-load', (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || shouldIgnoreError(errorCode)) {
        return;
      }

      info.isLoading = false;
      const error = errorPageService.createNavigationError(errorCode, errorDescription, validatedURL);
      
      if (error) {
        console.error(`[TabService] Navigation failed for ${validatedURL}: ${errorDescription} (code: ${errorCode})`);
        
        info.error = error;
        info.failedUrl = validatedURL;
        info.title = error.title;
        info.url = validatedURL;
        info.favicon = undefined;
        
        const errorPageHtml = errorPageService.generateErrorPage(error);
        wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPageHtml)}`);
      }
      
      this.emit('tabs:changed');
    });

    wc.on('context-menu', (_, params) => {
      if (!this.navigationService.isInternalPage(info.url)) {
        this.contextMenuService.showContextMenu(wc, params);
      }
    });

    wc.on('certificate-error', (event, url, error, certificate, callback) => {
      const host = new URL(url).host;
      if (tab.bypassedCertificateHosts?.has(host)) {
        event.preventDefault();
        callback(true);
        return;
      }

      callback(false);
    });
  }

  public bypassCertificateError(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.info.failedUrl) return false;

    try {
      const host = new URL(tab.info.failedUrl).host;
      
      if (!tab.bypassedCertificateHosts) {
        tab.bypassedCertificateHosts = new Set();
      }
      
      tab.bypassedCertificateHosts.add(host);
      
      console.warn(`[TabService] Certificate bypass enabled for: ${host}`);
      
      return this.retryNavigation(tabId);
    } catch (error) {
      console.error('[TabService] Failed to bypass certificate:', error);
      return false;
    }
  }

  public hasCertificateBypass(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.info.failedUrl) return false;

    try {
      const host = new URL(tab.info.failedUrl).host;
      return tab.bypassedCertificateHosts?.has(host) ?? false;
    } catch {
      return false;
    }
  }

  private handleNavigation(info: TabInfo, wc: Electron.WebContents, url: string): void {

    if (url.startsWith('data:text/html')) {
      return;
    }   

    const internalPageInfo = this.navigationService.getInternalPageInfo(url);
    if (internalPageInfo) {
      info.url = internalPageInfo.url;
      info.title = internalPageInfo.title;
      info.favicon = internalPageInfo.favicon;
    } else {
      info.url = url;
    }
    info.canGoBack = wc.navigationHistory.canGoBack();
    info.canGoForward = wc.navigationHistory.canGoForward();
    this.emit('tabs:changed');
  }

   public retryNetworkFailedTabs(): void {
    const { tabs } = this.getAllTabs();
    
    for (const tabInfo of tabs) {
      if (tabInfo.error && isNetworkError(tabInfo.error.code)) {
        this.retryNavigation(tabInfo.id);
      }
    }
  }
}
