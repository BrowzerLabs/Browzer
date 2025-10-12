import { BaseWindow, WebContentsView } from 'electron';
import path from 'node:path';
import { ActionRecorder } from './ActionRecorder';
import { RecordingStore } from './RecordingStore';
import { BrowserAutomation } from './automation/BrowserAutomation';
import { HistoryService } from './HistoryService';
import { RecordedAction, RecordingSession, HistoryTransition, VideoRecordingMetadata } from '../shared/types';
import { INTERNAL_PAGES } from './constants';

// Data that can be sent through IPC (serializable)
export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

// Internal tab structure (includes WebContentsView)
interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  recorder?: ActionRecorder;
  automation?: BrowserAutomation;
}

/**
 * BrowserManager - Manages multiple WebContentsView instances for tabs
 * 
 * Each tab is a separate WebContentsView with its own sandboxed browsing context.
 * All tab management is handled in the main process for better control and security.
 */
export class BrowserManager {
  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private baseWindow: BaseWindow;
  private agentUIHeight: number;
  private tabCounter = 0;
  private isRecording = false;
  private agentUIView?: WebContentsView;
  private recordingStore: RecordingStore;
  private historyService: HistoryService;
  private recordingStartTime = 0;
  private recordingStartUrl = '';

  constructor(baseWindow: BaseWindow, chromeHeight: number, agentUIView?: WebContentsView) {
    this.baseWindow = baseWindow;
    this.agentUIHeight = chromeHeight;
    this.agentUIView = agentUIView;
    this.recordingStore = new RecordingStore();
    this.historyService = new HistoryService();
    
    // Create initial tab
    this.createTab('https://www.google.com');
  }

  /**
   * Create a new tab with a WebContentsView
   */
  public createTab(url?: string): TabInfo {
    const tabId = `tab-${++this.tabCounter}`;
    
    // Create WebContentsView for this tab (sandboxed)
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true, // Fully sandboxed for security
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    // Set white background for web content
    view.setBackgroundColor('#ffffff');

    let displayUrl = url ?? 'https://www.google.com';
    let displayTitle = 'New Tab';
    
    if (url && url.startsWith('browzer://')) {
      displayUrl = url;
      const pathName = url.replace('browzer://', '');
      
      displayTitle = INTERNAL_PAGES.find(page => page.path === pathName).title || 'New Tab';
    }

    // Create tab info
    const tabInfo: TabInfo = {
      id: tabId,
      title: displayTitle,
      url: displayUrl,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };

    // Create tab with view and info
    const tab: Tab = {
      id: tabId,
      view,
      info: tabInfo,
      recorder: new ActionRecorder(view),
      automation: new BrowserAutomation(view),
    };

    // Store tab
    this.tabs.set(tabId, tab);

    // Setup WebContents event listeners
    this.setupTabEvents(tab);

    // Add view to window (hidden initially)
    this.baseWindow.contentView.addChildView(view);
    
    // Position the view (sidebar width will be 0 initially)
    this.updateTabViewBounds(view, 0);

    // Load URL (always load, even if no URL provided, use default)
    const urlToLoad = url || 'https://www.google.com';
    view.webContents.loadURL(this.normalizeURL(urlToLoad));

    // Switch to new tab
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
        // Create a new tab if all tabs are closed
        this.createTab('https://www.google.com');
      }
    }

    // Notify renderer
    this.notifyTabsChanged();
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
    // Note: updateLayout will be called with proper sidebar width

    // Notify renderer
    this.notifyTabsChanged();
    return true;
  }

  /**
   * Navigate a tab to a URL
   */
  public navigate(tabId: string, url: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    const normalizedURL = this.normalizeURL(url);
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
   * Start recording actions and video on active tab
   */
  public async startRecording(enableVideo = true): Promise<boolean> {
    if (!this.activeTabId) {
      console.error('No active tab to record');
      return false;
    }

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.recorder) {
      console.error('Tab or recorder not found');
      return false;
    }

    try {
      // Generate recording ID
      const recordingId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      tab.recorder.setActionCallback((action) => {
        if (action.verified) {
          if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
            this.agentUIView.webContents.send('recording:action-captured', action);
          }
        }
      });

      await tab.recorder.startRecording(recordingId, enableVideo);
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.recordingStartUrl = tab.info.url;
      
      console.log('🎬 Recording started with verification on tab:', this.activeTabId);
      console.log('🎥 Video recording:', enableVideo ? 'enabled' : 'disabled');
      
      if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
        this.agentUIView.webContents.send('recording:started', { enableVideo });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Stop recording and return actions with video metadata (don't save yet)
   */
  public async stopRecording(): Promise<{ actions: RecordedAction[]; video?: VideoRecordingMetadata }> {
    if (!this.activeTabId) {
      console.error('No active tab');
      return { actions: [] };
    }

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.recorder) {
      console.error('Tab or recorder not found');
      return { actions: [] };
    }

    const result = await tab.recorder.stopRecording();
    this.isRecording = false;
    
    const duration = Date.now() - this.recordingStartTime;
    console.log('⏹️ Recording stopped. Duration:', duration, 'ms, Actions:', result.actions.length);
    
    if (result.video) {
      console.log('🎥 Video recorded:', result.video.fileName, `(${(result.video.fileSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Notify renderer that recording stopped (with actions and video for preview)
    if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
      this.agentUIView.webContents.send('recording:stopped', {
        actions: result.actions,
        video: result.video,
        duration,
        startUrl: this.recordingStartUrl
      });
    }
    
    return result;
  }

  /**
   * Save recording session with video
   */
  public saveRecording(name: string, description: string, actions: RecordedAction[], video?: VideoRecordingMetadata): string {
    const session: RecordingSession = {
      id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      actions,
      createdAt: this.recordingStartTime,
      duration: Date.now() - this.recordingStartTime,
      actionCount: actions.length,
      url: this.recordingStartUrl,
      video: video || undefined
    };

    this.recordingStore.saveRecording(session);
    console.log('💾 Recording saved:', session.id, session.name);
    if (video) {
      console.log('🎥 Video included:', video.fileName);
    }

    this.clearRecordingState();

    // Notify renderer
    if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
      this.agentUIView.webContents.send('recording:saved', session);
    }
    
    return session.id;
  }

  /**
   * Get all recordings
   */
  public getAllRecordings(): RecordingSession[] {
    return this.recordingStore.getAllRecordings();
  }

  /**
   * Delete recording (including video)
   */
  public async deleteRecording(id: string): Promise<boolean> {
    const success = await this.recordingStore.deleteRecording(id);
    
    if (success && this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
      this.agentUIView.webContents.send('recording:deleted', id);
    }
    
    return success;
  }

  /**
   * Check if recording is active
   */
  public isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get recorded actions from active tab
   */
  public getRecordedActions(): RecordedAction[] {
    if (!this.activeTabId) return [];
    
    const tab = this.tabs.get(this.activeTabId);
    return tab?.recorder?.getActions() || [];
  }

  /**
   * Clear recording state after saving or discarding
   */
  public clearRecordingState(): void {
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.recordingStartUrl = '';
    
    // Clear actions from active tab recorder
    if (this.activeTabId) {
      const tab = this.tabs.get(this.activeTabId);
      if (tab?.recorder) {
        tab.recorder.clearActions();
      }
    }
    
    console.log('Recording state cleared');
  }

  /**
   * Update layout when window resizes or sidebar changes
   */
  public updateLayout(_windowWidth: number, _windowHeight: number, sidebarWidth = 0): void {
    // Update all tab views with sidebar offset
    this.tabs.forEach(tab => {
      this.updateTabViewBounds(tab.view, sidebarWidth);
    });
  }

  /**
   * Clean up all tabs
   */
  public destroy(): void {
    this.tabs.forEach(tab => {
      this.baseWindow.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    });
    this.tabs.clear();
  }

  /**
   * Setup event listeners for a tab's WebContents
   */
  private setupTabEvents(tab: Tab): void {
    const { view, info } = tab;
    const webContents = view.webContents;

    // Page title updated
    webContents.on('page-title-updated', (_, title) => {
      const internalPageTitle = this.getInternalPageTitle(info.url);
      if (internalPageTitle) {
        info.title = internalPageTitle;
      } else {
        info.title = title || 'Untitled';
      }
      this.notifyTabsChanged();
    });

    // Navigation events
    webContents.on('did-start-loading', () => {
      info.isLoading = true;
      this.notifyTabsChanged();
    });

    webContents.on('did-stop-loading', () => {
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
      
      this.notifyTabsChanged();
    });

    webContents.on('did-navigate', (_, url) => {
      // Convert internal page URLs to browzer:// protocol
      const internalPageInfo = this.getInternalPageInfo(url);
      if (internalPageInfo) {
        info.url = internalPageInfo.url;
        info.title = internalPageInfo.title;
      } else {
        info.url = url;
      }
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      this.notifyTabsChanged();
    });

    webContents.on('did-navigate-in-page', (_, url) => {
      // Convert internal page URLs to browzer:// protocol
      const internalPageInfo = this.getInternalPageInfo(url);
      if (internalPageInfo) {
        info.url = internalPageInfo.url;
        info.title = internalPageInfo.title;
      } else {
        info.url = url;
      }
      info.canGoBack = webContents.navigationHistory.canGoBack();
      info.canGoForward = webContents.navigationHistory.canGoForward();
      this.notifyTabsChanged();
    });

    // Favicon
    webContents.on('page-favicon-updated', (_, favicons) => {
      if (!info.url.includes('browzer://settings') && favicons.length > 0) {
        info.favicon = favicons[0];
        this.notifyTabsChanged();
      }
    });

    // Handle new window requests (open in new tab)
    webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: 'deny' }; // Deny the default window creation
    });

    // Error handling
    webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      if (errorCode !== -3) { // Ignore aborted loads
        console.error(`Failed to load ${validatedURL}: ${errorDescription}`);
      }
      info.isLoading = false;
      this.notifyTabsChanged();
    });
  }

  /**
   * Update bounds for a tab view
   * @param sidebarWidth - Width of sidebar in pixels (0 if hidden)
   */
  private updateTabViewBounds(view: WebContentsView, sidebarWidth = 0): void {
    const bounds = this.baseWindow.getBounds();
    view.setBounds({
      x: 0,
      y: this.agentUIHeight,
      width: bounds.width - sidebarWidth, // Reduce width when sidebar is visible
      height: bounds.height - this.agentUIHeight,
    });
  }

  /**
   * Normalize URL (add protocol if missing)
   */
  private normalizeURL(url: string): string {
    const trimmed = url.trim();
    
    if (trimmed.startsWith('browzer://')) {
      return this.handleInternalURL(trimmed);
    }
    
    // If it looks like a URL with protocol, use it as is
    if (/^[a-z]+:\/\//i.test(trimmed)) {
      return trimmed;
    }
    
    // If it looks like a domain, add https://
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    
    // Otherwise, treat as search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  /**
   * Handle internal browzer:// URLs
   * Supports: settings, history, recordings, downloads, etc.
   */
  private handleInternalURL(url: string): string {
    const internalPath = url.replace('browzer://', '');
    
    const validPages = ['settings', 'history', 'recordings', 'profile', 'signin', 'signup'];
    
    if (validPages.includes(internalPath)) {
      return this.generateInternalPageURL(internalPath);
    }
    
    console.warn(`Unknown internal page: ${internalPath}`);
    return 'https://www.google.com';
  }

  /**
   * Generate internal page URL with hash routing
   * @param pageName - Name of the internal page (settings, history, etc.)
   */
  private generateInternalPageURL(pageName: string): string {
    // In development, use the dev server with a hash route
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/${pageName}`;
    }
    
    // In production, use file protocol with hash route
    return `file://${path.join(__dirname, `../../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)}#/${pageName}`;
  }

  /**
   * Get internal page info from URL
   * Returns null if not an internal page
   */
  private getInternalPageInfo(url: string): { url: string; title: string } | null {
    for (const page of INTERNAL_PAGES) {
      if (url.includes(`#/${page.path}`)) {
        return {
          url: `browzer://${page.path}`,
          title: page.title,
        };
      }
    }

    return null;
  }

  /**
   * Get internal page title from URL
   */
  private getInternalPageTitle(url: string): string | null {
    const info = this.getInternalPageInfo(url);
    return info?.title || null;
  }

  /**
   * Get automation instance for active tab
   */
  public getActiveAutomation(): BrowserAutomation | null {
    const activeTab = this.tabs.get(this.activeTabId || '');
    return activeTab?.automation || null;
  }

  /**
   * Get history service instance
   */
  public getHistoryService(): HistoryService {
    return this.historyService;
  }

  /**
   * Notify renderer about tab changes
   */
  private notifyTabsChanged(): void {
    // Send to all agent UI views
    const allViews = this.baseWindow.contentView.children;
    allViews.forEach(view => {
      if (view instanceof WebContentsView) {
        view.webContents.send('browser:tabs-updated', this.getAllTabs());
      }
    });
  }
}
