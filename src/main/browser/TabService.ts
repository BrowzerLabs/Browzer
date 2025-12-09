import { BaseWindow, WebContentsView, Menu } from 'electron';
import { EventEmitter } from 'events';
import path from 'node:path';
import { TabInfo, HistoryTransition } from '@/shared/types';
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

export class TabService extends EventEmitter {
  public on<K extends keyof TabServiceEvents>(
    event: K,
    listener: TabServiceEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof TabServiceEvents>(
    event: K,
    ...args: Parameters<TabServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter = 0;
  private currentSidebarWidth = 0;

  private static readonly TAB_HEIGHT_WITHOUT_BOOKMARKS = 75;
  private static readonly TAB_HEIGHT_WITH_BOOKMARKS = 104;
  
  private webContentsViewHeight = TabService.TAB_HEIGHT_WITHOUT_BOOKMARKS;

  private newTabUrl: string;

  constructor(
    private baseWindow: BaseWindow,
    private passwordManager: PasswordManager,
    private settingsService: SettingsService,
    private historyService: HistoryService,
    private navigationService: NavigationService,
    private debuggerService: DebuggerService,
    private bookmarkService: BookmarkService
  ) {
    super();
    this.initializeFromSettings();
    this.setupListeners();
    this.recalculateBookmarkBarHeight();
  }

  private initializeFromSettings(): void {
    this.newTabUrl = this.settingsService.getSetting('general', 'newTabUrl') || 'https://www.google.com';
    this.webContentsViewHeight = TabService.TAB_HEIGHT_WITHOUT_BOOKMARKS;
  }

  private setupListeners(): void {
    this.settingsService.on('settings:general', (event: SettingsChangeEvent<'general'>) => {
      const { newValue } = event;
      this.newTabUrl = newValue.newTabUrl || 'https://www.google.com';
    });
    
    this.settingsService.on('settings:appearance', (event: SettingsChangeEvent<'appearance'>) => {
      this.handleAppearanceSettingsChange(event);
    });

    this.bookmarkService.on('bookmark:changed', () => {
      this.recalculateBookmarkBarHeight();
    });
  }

  private handleAppearanceSettingsChange(event: SettingsChangeEvent<'appearance'>): void {
    const { key } = event;
    
    if (key === 'showBookmarksBar') {
      this.recalculateBookmarkBarHeight();
    }
  }

  public recalculateBookmarkBarHeight(): void {
    const showBookmarksBar = this.settingsService.getSetting('appearance', 'showBookmarksBar');
    const hasBookmarks = this.bookmarkService.hasBookmarksInBar();
    
    this.webContentsViewHeight = showBookmarksBar && hasBookmarks
      ? TabService.TAB_HEIGHT_WITH_BOOKMARKS 
      : TabService.TAB_HEIGHT_WITHOUT_BOOKMARKS;
    
    this.updateLayout(this.currentSidebarWidth);
  }

  public createTab(url?: string): Tab {
    const previousActiveTabId = this.activeTabId;
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

    const urlToLoad = url || this.newTabUrl;
    
    let displayUrl = urlToLoad;
    let displayTitle = 'New Tab';
    let displayIcon: string | undefined;
    
    const internalPageInfo = this.navigationService.getInternalPageInfo(urlToLoad);
    if (internalPageInfo) {
      displayUrl = internalPageInfo.url;
      displayTitle = internalPageInfo.title;
      displayIcon = internalPageInfo.favicon;
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
        this.handleCredentialSelected.bind(this)
      ),
      automationExecutor: new BrowserAutomationExecutor(view, tabId),
    };

    this.tabs.set(tabId, tab);
    this.setupTabEvents(tab);

    // Initialize debugger asynchronously
    this.debuggerService.initializeDebugger(view, tabId).catch(err => 
      console.error('[TabService] Failed to initialize debugger for tab:', tabId, err)
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
    let newActiveTabId: string | null = null;

    // Remove view from window
    this.baseWindow.contentView.removeChildView(tab.view);

    // Clean up password automation
    if (tab.passwordAutomation) {
      tab.passwordAutomation.stop().catch(err => 
        console.error('[TabService] Error stopping password automation:', err)
      );
    }

    this.debuggerService.cleanupDebugger(tab.view, tabId);

    tab.view.webContents.close();
    this.tabs.delete(tabId);

    // If this was the active tab, switch to another
    if (wasActiveTab) {
      const remainingTabs = Array.from(this.tabs.keys());
      if (remainingTabs.length > 0) {
        this.switchToTab(remainingTabs[0]);
        newActiveTabId = remainingTabs[0];
      } else {
        this.activeTabId = null;
      }
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

    this.emit('tabs:changed');
    
    if (previousTabId && previousTabId !== tabId) {
      this.emit('tab:switched', previousTabId, tab);
    }
    
    return true;
  }

  public navigate(tabId: string, url: string): boolean {
    let tab = this.tabs.get(tabId);
    if (!tab){
      tab = this.createTab(url);
    }

    const normalizedURL = this.navigationService.normalizeURL(url);
    tab.view.webContents.loadURL(normalizedURL);
    return true;
  }

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

  public getAllTabs(): { tabs: TabInfo[]; activeTabId: string | null } {
    const tabs = Array.from(this.tabs.values()).map(tab => tab.info);
    return { tabs, activeTabId: this.activeTabId };
  }

  public getActiveTab(): Tab | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) || null : null;
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

  public selectNextTab(): void {
    const tabs = Array.from(this.tabs.values());
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(tab => tab.id === this.activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    this.switchToTab(tabs[nextIndex].id);
  }

  public selectPreviousTab(): void {
    const tabs = Array.from(this.tabs.values());
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(tab => tab.id === this.activeTabId);
    const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
    this.switchToTab(tabs[prevIndex].id);
  }

  public selectTabByIndex(index: number): void {
    const tabs = Array.from(this.tabs.values());
    if (index >= 0 && index < tabs.length) {
      this.switchToTab(tabs[index].id);
    }
  }

  public updateLayout(sidebarWidth = 0): void {
    this.currentSidebarWidth = sidebarWidth;
    
    this.tabs.forEach(tab => {
      this.updateTabViewBounds(tab.view, sidebarWidth);
    });
  }

  public destroy(): void {
    this.tabs.forEach(tab => {
      this.debuggerService.cleanupDebugger(tab.view, tab.id);
      this.baseWindow.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    });
    this.tabs.clear();
    this.activeTabId = null;
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

  private setupTabEvents(tab: Tab): void {
    const { view, info } = tab;
    const webContents = view.webContents;

    webContents.on('page-title-updated', (_, title) => {
      const internalPageTitle = this.navigationService.getInternalPageTitle(info.url);
      if (internalPageTitle) {
        info.title = internalPageTitle;
      } else {
        info.title = title || 'Untitled';
      }
      this.emit('tabs:changed');
    });

    webContents.on('did-start-loading', () => {
      info.isLoading = true;
      this.emit('tabs:changed');
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
      
      if (tab.passwordAutomation && !this.navigationService.isInternalPage(info.url)) {
        try {
          await tab.passwordAutomation.start();
        } catch (error) {
          console.error('[TabService] Failed to start password automation:', error);
        }
      }
      
      this.emit('tabs:changed');
    });

    webContents.on('did-navigate', (_, url) => {
      const internalPageInfo = this.navigationService.getInternalPageInfo(url);
      if (internalPageInfo) {
        info.url = internalPageInfo.url;
        info.title = internalPageInfo.title;
        info.favicon = internalPageInfo.favicon;
      } else {
        info.url = url;
      }
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      this.emit('tabs:changed');
    });

    webContents.on('did-navigate-in-page', (_, url) => {
      const internalPageInfo = this.navigationService.getInternalPageInfo(url);
      if (internalPageInfo) {
        info.url = internalPageInfo.url;
        info.title = internalPageInfo.title;
        info.favicon = internalPageInfo.favicon;
      } else {
        info.url = url;
      }
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      this.emit('tabs:changed');
    });

    webContents.on('page-favicon-updated', (_, favicons) => {
      // Don't update favicon for internal browzer:// pages
      if (!this.navigationService.isInternalPage(info.url) && favicons.length > 0) {
        info.favicon = favicons[0];
        this.emit('tabs:changed');
      }
    });

    webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' };
    });

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

    webContents.on('before-input-event', (event: any, input: any) => {
      if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (webContents.isDevToolsOpened()) {
          webContents.closeDevTools();
        } else {
          webContents.openDevTools({ mode: 'right', activate: true });
        }
      }
      else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'c') {
        event.preventDefault();
        webContents.openDevTools({ mode: 'right', activate: true });
      }
    });

    webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      if (errorCode !== -3) {
        console.error(`Failed to load ${validatedURL}: ${errorDescription}`);
      }
      info.isLoading = false;
      this.emit('tabs:changed');
    });
  }

  public handleCredentialSelected(tabId: string, credentialId: string, username: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.selectedCredentialId = credentialId;
      tab.selectedCredentialUsername = username;
    }
  }

  public hideAllTabs(): void {
    this.tabs.forEach(tab => {
      tab.view.setVisible(false);
    });
  }

  public showAllTabs(): void {
    this.tabs.forEach(tab => {
      if (tab.id === this.activeTabId) {
        tab.view.setVisible(true);
      }
    });
  }
}