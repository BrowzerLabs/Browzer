import { BaseWindow, WebContentsView } from 'electron';
import { EventEmitter } from 'events';
import path from 'node:path';

import Store from 'electron-store';

import { Tab } from './types';
import { NavigationService } from './NavigationService';
import { DebuggerService } from './DebuggerService';
import { ContextMenuService } from './ContextMenuService';
import { errorPageService } from './ErrorPageService';

import {
  TabInfo,
  HistoryTransition,
  ToastPayload,
  NavigationError,
  isNetworkError,
  shouldIgnoreError,
  TabGroup,
  TabsSnapshot,
  ClosedTabInfo,
} from '@/shared/types';
import { GROUP_COLORS } from '@/shared/constants/tabs';
import { PasswordManager } from '@/main/password/PasswordManager';
import { HistoryService } from '@/main/history/HistoryService';
import { BookmarkService } from '@/main/bookmark';
import {
  SettingsService,
  SettingsChangeEvent,
} from '@/main/settings/SettingsService';
import { RecordingService } from '@/main/recording/RecordingService';
import { PasswordAutomation } from '@/main/password';

const TAB_HEIGHT = {
  WITHOUT_BOOKMARKS: 75 as number,
  WITH_BOOKMARKS: 104 as number,
};

export class TabService extends EventEmitter {
  private tabs = new Map<string, Tab>();
  private orderedTabIds: string[] = [];
  private activeTabId: string | null = null;
  private tabCounter = 0;
  private tabGroupCounter = 0;
  private currentSidebarWidth = 0;
  private webContentsViewHeight = TAB_HEIGHT.WITHOUT_BOOKMARKS;
  private newTabUrl = 'browzer://home';
  private readonly contextMenuService = new ContextMenuService();
  private tabGroups = new Map<string, TabGroup>();
  private closedTabs: ClosedTabInfo[] = [];
  private sessionStore: Store<{ lastSession: TabsSnapshot | null }>;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isRestorePending = false;
  private restoreCheckFired = false;

  constructor(
    private baseWindow: BaseWindow,
    private browserView: WebContentsView,
    private passwordManager: PasswordManager,
    private settingsService: SettingsService,
    private historyService: HistoryService,
    private navigationService: NavigationService,
    private debuggerService: DebuggerService,
    private bookmarkService: BookmarkService,
    private recordingService: RecordingService
  ) {
    super();
    this.sessionStore = new Store<{ lastSession: TabsSnapshot | null }>({
      name: 'session-tabs',
      defaults: { lastSession: null },
    });

    const savedSession = this.sessionStore.get('lastSession');
    if (savedSession?.tabs && savedSession.tabs.length > 0) {
      if (
        !(
          savedSession.tabs.length === 1 &&
          savedSession.tabs[0].url.startsWith('browzer://home')
        )
      ) {
        this.isRestorePending = true;
      }
    }

    this.initialize();
  }

  public initializeAfterAuth(): void {
    if (this.tabs.size === 0) this.createTab();

    if (this.restoreCheckFired) return;
    this.restoreCheckFired = true;

    setTimeout(() => {
      this.checkAndNotifyRestoreSession();
    }, 5000);
  }

  private checkAndNotifyRestoreSession(): void {
    if (this.tabs.size === 0) return;
    if (!this.isRestorePending) return;

    this.browserView.webContents.send('browser:show-restore-session');
  }

  private initialize(): void {
    this.newTabUrl =
      this.settingsService.getSetting('general', 'newTabUrl') ||
      'browzer://home';
    this.setupEventListeners();
    this.recalculateBookmarkBarHeight();
  }

  private setupEventListeners(): void {
    this.settingsService.on(
      'settings:general',
      (event: SettingsChangeEvent<'general'>) => {
        this.newTabUrl = event.newValue.newTabUrl || 'browzer://home';
      }
    );
    this.settingsService.on(
      'settings:appearance',
      (event: SettingsChangeEvent<'appearance'>) => {
        if (event.key === 'showBookmarksBar')
          this.recalculateBookmarkBarHeight();
      }
    );
    this.bookmarkService.on('bookmark:changed', () =>
      this.recalculateBookmarkBarHeight()
    );
    this.contextMenuService.on('open-link-in-new-tab', (url: string) =>
      this.createTab(url)
    );
    this.contextMenuService.on('toast', (payload: ToastPayload) => {
      this.browserView.webContents.send('toast', payload);
    });
    this.contextMenuService.on('context-menu-action', (event) => {
      this.emit('context-menu-action', event);
    });
    this.on('tabs:changed', () => this.triggerSaveSession());
    this.on('tab:created', () => this.triggerSaveSession());
    this.on('tab:closed', () => this.triggerSaveSession());
    this.on('tab:reordered', () => this.triggerSaveSession());
  }

  public recalculateBookmarkBarHeight(): void {
    const showBookmarksBar = this.settingsService.getSetting(
      'appearance',
      'showBookmarksBar'
    );
    const hasBookmarks = this.bookmarkService.hasBookmarksInBar();
    this.webContentsViewHeight =
      showBookmarksBar && hasBookmarks
        ? TAB_HEIGHT.WITH_BOOKMARKS
        : TAB_HEIGHT.WITHOUT_BOOKMARKS;
    this.updateLayout(this.currentSidebarWidth);
  }

  public async startRecording(): Promise<boolean> {
    try {
      const activeTab = this.getActiveTab();
      const startUrl = activeTab?.info.url || 'browzer://home';
      this.recordingService.startRecordingSession(startUrl);

      const enablePromises = Array.from(this.tabs.values()).map((tab) =>
        this.recordingService.enableClickTracking(tab).catch(console.error)
      );

      await Promise.allSettled(enablePromises);
      return true;
    } catch (error) {
      console.error('[TabService] Failed to start recording:', error);
      return false;
    }
  }

  public async stopRecording(): Promise<{
    actions: any[];
    duration: number;
    startUrl: string;
  } | null> {
    try {
      const disablePromises = Array.from(this.tabs.values()).map((tab) =>
        this.recordingService.disableClickTracking(tab).catch(console.error)
      );

      await Promise.allSettled(disablePromises);
      return this.recordingService.stopRecordingSession();
    } catch (error) {
      console.error('[TabService] Failed to stop recording:', error);
      return null;
    }
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

    const internalPageInfo =
      this.navigationService.getInternalPageInfo(urlToLoad);
    const tabInfo: TabInfo = {
      id: tabId,
      title: internalPageInfo?.title || 'New Tab',
      url: internalPageInfo?.url || urlToLoad,
      favicon: internalPageInfo?.favicon,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      group: undefined,
    };

    const tab: Tab = {
      id: tabId,
      view,
      info: tabInfo,
      passwordAutomation: new PasswordAutomation(
        view,
        this.passwordManager,
        tabId,
        this.handleCredentialSelected.bind(this)
      ),
    };

    this.tabs.set(tabId, tab);
    this.orderedTabIds.push(tabId);
    this.setupTabWebContentsEvents(tab);
    this.debuggerService
      .initializeDebugger(view, tabId)
      .catch((err) =>
        console.error('[TabService] Failed to initialize debugger:', tabId, err)
      );

    if (this.recordingService.isRecording()) {
      this.recordingService.enableClickTracking(tab).catch(console.error);
    }
    this.baseWindow.contentView.addChildView(view);
    this.updateTabViewBounds(view, this.currentSidebarWidth);
    view.webContents.loadURL(this.navigationService.normalizeURL(urlToLoad));
    this.switchToTab(tabId);
    this.emit('tab:created', tab, previousActiveTabId);
    const focusDelay = process.platform === 'win32' ? 220 : 100;
    setTimeout(() => {
      this.browserView.webContents.focus();
      this.browserView.webContents.send('request-address-bar-focus');
    }, focusDelay);

    return tab;
  }

  public closeTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    const wasActiveTab = this.activeTabId === tabId;
    const orderIndex = this.orderedTabIds.indexOf(tabId);

    if (tab.info.url) {
      this.closedTabs.push({
        url: tab.info.url,
        title: tab.info.title,
        favicon: tab.info.favicon,
        index: orderIndex,
        groupId: tab.info.group?.id,
      });

      if (this.closedTabs.length > 20) {
        this.closedTabs.shift();
      }
    }

    this.baseWindow.contentView.removeChildView(tab.view);
    tab.passwordAutomation?.stop().catch(console.error);
    this.debuggerService.cleanupDebugger(tab.view);

    // Remove all event listeners before closing to prevent memory leaks
    tab.view.webContents.removeAllListeners();
    tab.view.webContents.close();
    this.tabs.delete(tabId);
    if (orderIndex !== -1) this.orderedTabIds.splice(orderIndex, 1);

    let newActiveTabId: string | null = null;
    if (wasActiveTab && this.orderedTabIds.length > 0) {
      newActiveTabId =
        this.orderedTabIds[
          Math.max(0, Math.min(orderIndex, this.orderedTabIds.length - 1))
        ];
      this.switchToTab(newActiveTabId);
    } else if (wasActiveTab) {
      this.activeTabId = null;
    }

    this.cleanupEmptyGroups();
    this.emit('tabs:changed');
    this.emit('tab:closed', tabId, newActiveTabId, wasActiveTab);
    if (this.tabs.size === 0) this.baseWindow.close();
    return true;
  }

  public restoreLastClosedTab(): boolean {
    const lastClosedTab = this.closedTabs.pop();
    if (!lastClosedTab) return false;

    const tab = this.createTab(lastClosedTab.url);

    if (lastClosedTab.groupId && this.tabGroups.has(lastClosedTab.groupId)) {
      this.assignTabToGroup(tab.id, lastClosedTab.groupId);
    }

    // Attempt to restore position
    // We can't guarantee exact position if tabs shifted, but we can try
    if (
      lastClosedTab.index >= 0 &&
      lastClosedTab.index < this.orderedTabIds.length
    ) {
      this.reorderTab(tab.id, lastClosedTab.index);
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
      if (this.recordingService.isRecording()) {
        this.recordingService.addAction({
          type: 'tab-switch',
          tabId: this.activeTabId,
          url: tab.info.url,
          timestamp: Date.now(),
        });
      }
    }
    return true;
  }

  public navigate(tabId: string, url: string): boolean {
    const tab = this.tabs.get(tabId) ?? this.createTab(url);
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
      }
      if (currentIndex >= 1) {
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
    if (!tab || !tab.view.webContents.navigationHistory.canGoForward())
      return false;
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
    if (!tab) return false;
    const history = tab.view.webContents.navigationHistory;
    const currentUrl = tab.view.webContents.getURL();
    if (currentUrl.startsWith('data:text/html') && tab.info.error)
      return history.getActiveIndex() >= 2;
    return history.canGoBack();
  }

  public canGoForward(tabId: string): boolean {
    return (
      this.tabs.get(tabId)?.view.webContents.navigationHistory.canGoForward() ??
      false
    );
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
    tab.view.webContents.loadURL(
      this.navigationService.normalizeURL(failedUrl)
    );
    this.emit('tabs:changed');
    return true;
  }

  public getTabError(tabId: string): NavigationError | null {
    return this.tabs.get(tabId)?.info.error ?? null;
  }

  public hasError(tabId: string): boolean {
    return !!this.tabs.get(tabId)?.info.error;
  }

  public clearError(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.info.error = null;
    tab.info.failedUrl = undefined;
    this.emit('tabs:changed');
  }

  public selectNextTab(): void {
    if (this.orderedTabIds.length === 0) return;
    const currentIndex = this.orderedTabIds.indexOf(this.activeTabId || '');
    this.switchToTab(
      this.orderedTabIds[(currentIndex + 1) % this.orderedTabIds.length]
    );
  }

  public selectPreviousTab(): void {
    if (this.orderedTabIds.length === 0) return;
    const currentIndex = this.orderedTabIds.indexOf(this.activeTabId || '');
    this.switchToTab(
      this.orderedTabIds[
        currentIndex <= 0 ? this.orderedTabIds.length - 1 : currentIndex - 1
      ]
    );
  }

  public selectTabByIndex(index: number): void {
    if (index >= 0 && index < this.orderedTabIds.length)
      this.switchToTab(this.orderedTabIds[index]);
  }

  public reorderTab(tabId: string, newIndex: number): boolean {
    const currentIndex = this.orderedTabIds.indexOf(tabId);
    if (currentIndex === -1) {
      console.warn('[TabService] reorderTab: tab not found:', tabId);
      return false;
    }

    const clampedIndex = Math.max(
      0,
      Math.min(newIndex, this.orderedTabIds.length - 1)
    );
    if (clampedIndex === currentIndex) return false;

    this.orderedTabIds.splice(currentIndex, 1);
    this.orderedTabIds.splice(clampedIndex, 0, tabId);
    this.reorderSingleTabView(tabId, clampedIndex);
    this.emit('tab:reordered', { tabId, from: currentIndex, to: clampedIndex });

    const movedTab = this.tabs.get(tabId);
    if (movedTab) {
      const movedGroupId = movedTab.info.group?.id;
      const prevTab = this.tabs.get(this.orderedTabIds[clampedIndex - 1]);
      const nextTab = this.tabs.get(this.orderedTabIds[clampedIndex + 1]);
      const prevGroupId = prevTab?.info.group?.id;
      const nextGroupId = nextTab?.info.group?.id;

      let targetGroupId: string | undefined;
      if (prevGroupId && nextGroupId && prevGroupId === nextGroupId)
        targetGroupId = prevGroupId;
      else if (nextGroupId) targetGroupId = nextGroupId;
      else if (prevGroupId) targetGroupId = prevGroupId;

      if (targetGroupId) {
        if (movedGroupId !== targetGroupId) {
          const group = this.tabGroups.get(targetGroupId);
          if (group) {
            movedTab.info.group = group;
            this.cleanupEmptyGroups();
            this.emit('tabs:changed');
            return true;
          }
        }
      } else if (movedGroupId) {
        const isNextToOwnGroup =
          prevGroupId === movedGroupId || nextGroupId === movedGroupId;
        if (!isNextToOwnGroup) {
          movedTab.info.group = undefined;
          this.cleanupEmptyGroups();
          this.emit('tabs:changed');
        }
      }
    }
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
    this.baseWindow.contentView.addChildView(
      tab.view,
      Math.min(insertIndex, children.length)
    );
  }

  public getAllTabs(): TabsSnapshot {
    return {
      tabs: this.orderedTabIds
        .map((id) => this.tabs.get(id))
        .filter((t): t is Tab => !!t)
        .map((t) => t.info),
      activeTabId: this.activeTabId,
      groups: Array.from(this.tabGroups.values()),
    };
  }

  public getActiveTab(): Tab | null {
    return this.activeTabId ? (this.tabs.get(this.activeTabId) ?? null) : null;
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
    this.tabs.forEach((tab) =>
      this.updateTabViewBounds(tab.view, sidebarWidth)
    );
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
    this.tabs.forEach((tab) => tab.view.setVisible(false));
  }

  public showAllTabs(): void {
    this.tabs.forEach((tab) => {
      if (tab.id === this.activeTabId) tab.view.setVisible(true);
    });
  }

  public destroy(): void {
    this.isRestorePending = false;
    this.saveSession();
    this.contextMenuService.destroy();
    this.tabs.forEach((tab) => {
      this.debuggerService.cleanupDebugger(tab.view);
      this.baseWindow.contentView.removeChildView(tab.view);
      tab.view.webContents.removeAllListeners();
      tab.view.webContents.close();
    });
    this.tabs.clear();
    this.orderedTabIds = [];
    this.activeTabId = null;
  }

  public handleCredentialSelected(
    tabId: string,
    credentialId: string,
    username: string
  ): void {
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
      info.title =
        this.navigationService.getInternalPageTitle(info.url) ||
        title ||
        'Untitled';
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
        this.historyService
          .addEntry(info.url, info.title, HistoryTransition.LINK, info.favicon)
          .catch((err) => console.error('Failed to add history entry:', err));
      }

      if (
        tab.passwordAutomation &&
        !this.navigationService.isInternalPage(info.url)
      ) {
        try {
          await tab.passwordAutomation.start();
        } catch (error) {
          console.error(
            '[TabService] Failed to start password automation:',
            error
          );
        }
      }
      this.emit('tabs:changed');
    });

    wc.on('will-navigate', (event, url) => {
      if (!url.startsWith('browzer-action://')) return;
      event.preventDefault();
      const action = url.replace('browzer-action://', '');
      if (action === 'retry') this.retryNavigation(tab.id);
      else if (action === 'home') this.navigate(tab.id, 'browzer://home');
      else if (action === 'bypass-certificate')
        this.bypassCertificateError(tab.id);
    });

    wc.on('did-navigate', (_, url) => this.handleNavigation(info, wc, url));
    wc.on('did-navigate-in-page', (_, url) =>
      this.handleNavigation(info, wc, url)
    );

    wc.on('page-favicon-updated', (_, favicons) => {
      if (
        !this.navigationService.isInternalPage(info.url) &&
        favicons.length > 0
      ) {
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
        wc.isDevToolsOpened()
          ? wc.closeDevTools()
          : wc.openDevTools({ mode: 'right', activate: true });
      } else if (isDevToolsShortcut && input.key.toLowerCase() === 'c') {
        event.preventDefault();
        wc.openDevTools({ mode: 'right', activate: true });
      } else if (
        (input.control || input.meta) &&
        !input.shift &&
        input.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        this.browserView.webContents.send('browser:request-find');
      }
    });

    wc.on(
      'did-fail-load',
      (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || shouldIgnoreError(errorCode)) return;

        info.isLoading = false;
        const error = errorPageService.createNavigationError(
          errorCode,
          errorDescription,
          validatedURL
        );

        if (error) {
          console.error(
            `[TabService] Navigation failed for ${validatedURL}: ${errorDescription} (code: ${errorCode})`
          );
          info.error = error;
          info.failedUrl = validatedURL;
          info.title = error.title;
          info.url = validatedURL;
          info.favicon = undefined;
          wc.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(errorPageService.generateErrorPage(error))}`
          );
        }
        this.emit('tabs:changed');
      }
    );

    wc.on('context-menu', (_, params) => {
      if (!this.navigationService.isInternalPage(info.url))
        this.contextMenuService.showContextMenu(wc, params);
    });

    wc.on('found-in-page', (_, result: Electron.Result) => {
      this.browserView.webContents.send(
        'browser:found-in-page',
        tab.id,
        result
      );
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
      if (!tab.bypassedCertificateHosts)
        tab.bypassedCertificateHosts = new Set();
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
      return (
        tab.bypassedCertificateHosts?.has(new URL(tab.info.failedUrl).host) ??
        false
      );
    } catch {
      return false;
    }
  }

  public startFindInPage(
    tabId: string,
    text: string,
    options: Electron.FindInPageOptions = {}
  ): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) return false;
    tab.view.webContents.findInPage(text, options);
    return true;
  }

  public stopFindInPage(
    tabId: string,
    action: 'clearSelection' | 'keepSelection' | 'activateSelection'
  ): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) return false;
    tab.view.webContents.stopFindInPage(action);
    return true;
  }

  private handleNavigation(
    info: TabInfo,
    wc: Electron.WebContents,
    url: string
  ): void {
    if (url.startsWith('data:text/html')) return;

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
    for (const tabInfo of this.getAllTabs().tabs) {
      if (tabInfo.error && isNetworkError(tabInfo.error.code))
        this.retryNavigation(tabInfo.id);
    }
  }

  public createTabGroup(name?: string, color?: string): TabGroup {
    const groupId = `group-${++this.tabGroupCounter}`;
    const group: TabGroup = {
      id: groupId,
      name: name?.trim() || `Group ${this.tabGroupCounter}`,
      color:
        color || GROUP_COLORS[(this.tabGroupCounter - 1) % GROUP_COLORS.length],
      collapsed: false,
    };
    this.tabGroups.set(groupId, group);
    this.emit('tabs:changed');
    return group;
  }

  public updateTabGroup(
    groupId: string,
    name?: string,
    color?: string
  ): boolean {
    const group = this.tabGroups.get(groupId);
    if (!group) return false;
    if (name !== undefined) group.name = name.trim();
    if (color !== undefined) group.color = color;
    this.emit('tabs:changed');
    return true;
  }

  public toggleTabGroupCollapse(groupId: string): boolean {
    const group = this.tabGroups.get(groupId);
    if (!group) return false;
    group.collapsed = !group.collapsed;
    this.emit('tabs:changed');
    return true;
  }

  public assignTabToGroup(tabId: string, groupId: string | null): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    if (groupId === null) {
      tab.info.group = undefined;
      this.cleanupEmptyGroups();
      this.emit('tabs:changed');
      return true;
    }

    const group = this.tabGroups.get(groupId);
    if (!group) {
      console.warn('[TabService] assignTabToGroup: group not found', groupId);
      return false;
    }

    tab.info.group = group;

    // Move tab to be contiguous with other group members
    const groupIndices = this.orderedTabIds
      .map((id, index) => ({ id, index }))
      .filter(
        ({ id }) =>
          this.tabs.get(id)?.info.group?.id === groupId && id !== tabId
      )
      .map((x) => x.index);

    if (groupIndices.length > 0) {
      const lastGroupIndex = Math.max(...groupIndices);
      const currentIndex = this.orderedTabIds.indexOf(tabId);
      this.orderedTabIds.splice(currentIndex, 1);
      const insertIndex =
        currentIndex > lastGroupIndex ? lastGroupIndex + 1 : lastGroupIndex;
      this.orderedTabIds.splice(insertIndex, 0, tabId);
      this.reorderSingleTabView(tabId, insertIndex);
    }

    this.emit('tabs:changed');
    return true;
  }

  public removeTabGroup(groupId: string): boolean {
    if (!this.tabGroups.has(groupId)) return false;
    this.tabGroups.delete(groupId);
    this.tabs.forEach((tab) => {
      if (tab.info.group?.id === groupId) tab.info.group = undefined;
    });
    this.cleanupEmptyGroups();
    this.emit('tabs:changed');
    return true;
  }

  public getTabGroups(): TabGroup[] {
    return Array.from(this.tabGroups.values());
  }

  private triggerSaveSession(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveSession(), 1000);
  }

  private saveSession(): void {
    if (this.isRestorePending) return;

    const snapshot = this.getAllTabs();
    try {
      this.sessionStore.set('lastSession', snapshot);
    } catch (err) {
      console.error('[TabService] Failed to save session:', err);
    }
  }

  public async restoreSession(): Promise<boolean> {
    try {
      this.isRestorePending = true;
      const snapshot = this.sessionStore.get('lastSession');
      console.log(
        '[TabService] Attempting to restore session:',
        snapshot ? `${snapshot.tabs.length} tabs` : 'null'
      );

      if (!snapshot || !snapshot.tabs || snapshot.tabs.length === 0) {
        this.isRestorePending = false;
        return false;
      }

      const oldTabIds = [...this.orderedTabIds];

      this.tabGroups.clear();
      snapshot.groups.forEach((g) => this.tabGroups.set(g.id, g));

      const restoredTabIds: string[] = [];
      let newActiveTabId: string | null = null;

      for (const tabInfo of snapshot.tabs) {
        console.log('[TabService] Restoring tab:', tabInfo.url);
        const tab = this.createTab(tabInfo.url);

        if (snapshot.activeTabId === tabInfo.id) {
          newActiveTabId = tab.id;
        }

        if (tabInfo.group) {
          const group = this.tabGroups.get(tabInfo.group.id);
          if (group) {
            tab.info.group = group;
          }
        }
        restoredTabIds.push(tab.id);
      }

      if (newActiveTabId && this.tabs.has(newActiveTabId)) {
        this.switchToTab(newActiveTabId);
      }

      this.orderedTabIds = restoredTabIds;

      for (const id of oldTabIds) {
        this.closeTab(id);
      }

      this.isRestorePending = false;
      this.emit('tabs:changed');
      console.log('[TabService] Session restore complete');
      return true;
    } catch (err) {
      console.error('[TabService] Failed to restore session:', err);
      this.isRestorePending = false;
      return false;
    }
  }

  public async discardSession(): Promise<boolean> {
    try {
      this.isRestorePending = false;
      this.saveSession();
      return true;
    } catch {
      return false;
    }
  }

  public handleScroll(
    deltaX: number,
    deltaY: number,
    x: number,
    y: number
  ): boolean {
    const activeTab = this.getActiveTab();
    if (!activeTab || activeTab.view.webContents.isDestroyed()) return false;

    const adjustedY = y - this.webContentsViewHeight;
    activeTab.view.webContents.sendInputEvent({
      type: 'mouseWheel',
      x: x,
      y: adjustedY,
      deltaX: -deltaX,
      deltaY: -deltaY,
      canScroll: true,
    });
    return true;
  }

  private cleanupEmptyGroups(): void {
    const groupsInUse = new Set<string>();
    this.tabs.forEach((tab) => {
      if (tab.info.group?.id) groupsInUse.add(tab.info.group.id);
    });
    this.tabGroups.forEach((_, groupId) => {
      if (!groupsInUse.has(groupId)) this.tabGroups.delete(groupId);
    });
  }
}
