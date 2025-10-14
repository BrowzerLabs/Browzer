import { BaseWindow, WebContentsView, Menu } from 'electron';
import path from 'node:path';
import { ActionRecorder, VideoRecorder, RecordingStore } from '@/main/recording';
import { HistoryService } from '@/main/history/HistoryService';
import { PasswordManager } from '@/main/password/PasswordManager';
import { RecordedAction, RecordingSession, HistoryTransition, RecordingTabInfo, TabInfo } from '@/shared/types';
import { INTERNAL_PAGES } from '@/main/constants';
import { stat } from 'fs/promises';
import { PasswordUtil } from '@/main/utils/PasswordUtil';
import { BrowserAutomation, PasswordAutomation } from './automation';

// Internal tab structure (includes WebContentsView)
interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  videoRecorder?: VideoRecorder;
  automation?: BrowserAutomation;
  passwordAutomation?: PasswordAutomation;
  // Track selected credential for multi-step flows
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
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
  private passwordManager: PasswordManager;
  private recordingStartTime = 0;
  private recordingStartUrl = '';
  private currentRecordingId: string | null = null;
  private currentSidebarWidth = 0;
  

   // Centralized recorder for multi-tab recording
  private centralRecorder: ActionRecorder;
  private recordingTabs: Map<string, RecordingTabInfo> = new Map();
  private lastActiveTabId: string | null = null;
  private activeVideoRecorder: VideoRecorder | null = null;

  constructor(baseWindow: BaseWindow, chromeHeight: number, agentUIView?: WebContentsView) {
    this.baseWindow = baseWindow;
    this.agentUIHeight = chromeHeight;
    this.agentUIView = agentUIView;
    this.recordingStore = new RecordingStore();
    this.historyService = new HistoryService();
    this.passwordManager = new PasswordManager();
    
    // Initialize centralized recorder (without view initially)
    this.centralRecorder = new ActionRecorder();
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
      videoRecorder: new VideoRecorder(view),
      automation: new BrowserAutomation(view),
      passwordAutomation: new PasswordAutomation(
        view, 
        this.passwordManager, 
        tabId,
        (tabId: string, credentialId: string, username: string) => this.handleCredentialSelected(tabId, credentialId, username),
        (tabId: string) => this.handleAutoFillPassword(tabId)
      ),
    };

    // Store tab
    this.tabs.set(tabId, tab);

    // Setup WebContents event listeners
    this.setupTabEvents(tab);

    // Add view to window (hidden initially)
    this.baseWindow.contentView.addChildView(view);
    
    // Position the view with current sidebar width
    this.updateTabViewBounds(view, this.currentSidebarWidth);

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

    // Clean up password automation
    if (tab.passwordAutomation) {
      tab.passwordAutomation.stop().catch(err => 
        console.error('[BrowserManager] Error stopping password automation:', err)
      );
    }

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

    // Bring to front (re-add to ensure it's on top)
    this.baseWindow.contentView.removeChildView(tab.view);
    this.baseWindow.contentView.addChildView(tab.view);
    // Note: updateLayout will be called with proper sidebar width

    // Handle recording tab switch (only if actually switching between different tabs)
    if (this.isRecording && previousTabId && previousTabId !== tabId) {
      this.handleRecordingTabSwitch(previousTabId, tabId, tab);
    }

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
  public async startRecording(): Promise<boolean> {
    if (!this.activeTabId) {
      console.error('No active tab to record');
      return false;
    }

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.videoRecorder) {
      console.error('Tab or recorders not found');
      return false;
    }

    try {
      // Generate unique recording ID
      this.currentRecordingId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize recording tabs map
      this.recordingTabs.clear();
      this.lastActiveTabId = this.activeTabId;
      
      // Add initial tab to recording tabs
      this.recordingTabs.set(this.activeTabId, {
        tabId: this.activeTabId,
        webContentsId: tab.view.webContents.id,
        title: tab.info.title,
        url: tab.info.url,
        firstActiveAt: Date.now(),
        lastActiveAt: Date.now(),
        actionCount: 0
      });

       // Set up centralized recorder with current tab
      this.centralRecorder.setView(tab.view);
      this.centralRecorder.setActionCallback((action) => {
        if (action.verified) {
          // Update action count for the tab
          const tabInfo = this.recordingTabs.get(action.tabId || this.activeTabId || '');
          if (tabInfo) {
            tabInfo.actionCount++;
          }
          
          if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
            this.agentUIView.webContents.send('recording:action-captured', action);
          }
        }
      });

      // Start action recording with tab context and recordingId for snapshots
      await this.centralRecorder.startRecording(
        this.activeTabId,
        tab.info.url,
        tab.info.title,
        tab.view.webContents.id,
        this.currentRecordingId
      );
      
      // Start video recording on active tab
      this.activeVideoRecorder = tab.videoRecorder;
      const videoStarted = await this.activeVideoRecorder.startRecording(this.currentRecordingId);
      
      if (!videoStarted) {
        console.warn('⚠️ Video recording failed to start, continuing with action recording only');
        this.activeVideoRecorder = null;
      }
      
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.recordingStartUrl = tab.info.url;
      
      console.log('🎬 Recording started (actions + video) on tab:', this.activeTabId);
      
      if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
        this.agentUIView.webContents.send('recording:started');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Stop recording and return actions (don't save yet)
   */
  public async stopRecording(): Promise<RecordedAction[]> {
    if (!this.activeTabId) {
      console.error('No active tab');
      return [];
    }

    const tab = this.tabs.get(this.activeTabId);
    if (!tab) {
      console.error('Tab not found');
      return [];
    }

    // Stop centralized action recording (now async for snapshot finalization)
    const actions = await this.centralRecorder.stopRecording();
    
    // Stop video recording from active video recorder
    let videoPath: string | null = null;
    if (this.activeVideoRecorder && this.activeVideoRecorder.isActive()) {
      videoPath = await this.activeVideoRecorder.stopRecording();
      console.log('🎥 Video recording stopped:', videoPath || 'no video');
      this.activeVideoRecorder = null;
    } else {
      console.warn('⚠️ No active video recorder to stop');
    }
    
    this.isRecording = false;
    
    const duration = Date.now() - this.recordingStartTime;
    console.log('⏹️ Recording stopped. Duration:', duration, 'ms, Actions:', actions.length);

    const tabSwitchCount = this.countTabSwitchActions(actions);
    
    // Notify renderer that recording stopped (with actions for preview)
    if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
      this.agentUIView.webContents.send('recording:stopped', {
        actions,
        duration,
        startUrl: this.recordingStartUrl,
        videoPath,
        tabs: Array.from(this.recordingTabs.values()),
        tabSwitchCount
      });
    }
    
    return actions;
  }

  /**
   * Save recording session with video and multi-tab metadata
   */
  public async saveRecording(name: string, description: string, actions: RecordedAction[]): Promise<string> {
    let videoPath = this.activeVideoRecorder?.getVideoPath();
    
    if (!videoPath && this.currentRecordingId) {
      for (const tab of this.tabs.values()) {
        const tabVideoPath = tab.videoRecorder?.getVideoPath();
        if (tabVideoPath && tabVideoPath.includes(this.currentRecordingId)) {
          videoPath = tabVideoPath;
          console.log('📹 Found video path from tab recorder:', videoPath);
          break;
        }
      }
    }
    
    // Get video metadata if available
    let videoSize: number | undefined;
    let videoDuration: number | undefined;
    
    if (videoPath) {
      try {
        const stats = await stat(videoPath);
        videoSize = stats.size;
        videoDuration = Date.now() - this.recordingStartTime;
      } catch (error) {
        console.error('Failed to get video stats:', error);
      }
    }

    // Get snapshot statistics
    const snapshotStats = await this.centralRecorder.getSnapshotStats();
    
    const tabSwitchCount = this.countTabSwitchActions(actions);
    const firstTab = this.recordingTabs.values().next().value;
    
    const session: RecordingSession = {
      id: this.currentRecordingId || `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      actions,
      createdAt: this.recordingStartTime,
      duration: Date.now() - this.recordingStartTime,
      actionCount: actions.length,
      url: this.recordingStartUrl,

      // Multi-tab metadata
      startTabId: firstTab?.tabId,
      tabs: Array.from(this.recordingTabs.values()),
      tabSwitchCount,
      
      // Video metadata
      videoPath,
      videoSize,
      videoFormat: videoPath ? 'webm' : undefined,
      videoDuration,
      
      // Snapshot metadata
      snapshotCount: snapshotStats.count,
      snapshotsDirectory: snapshotStats.directory,
      totalSnapshotSize: snapshotStats.totalSize
    };

    this.recordingStore.saveRecording(session);
    console.log('💾 Recording saved:', session.id, session.name);
    console.log('📊 Multi-tab session:', this.recordingTabs.size, 'tabs,', tabSwitchCount, 'switches');
    if (videoPath && videoSize) {
      console.log('🎥 Video included:', videoPath, `(${(videoSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    if (snapshotStats.count > 0) {
      console.log('📸 Snapshots captured:', snapshotStats.count, `(${(snapshotStats.totalSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Notify renderer
    if (this.agentUIView && !this.agentUIView.webContents.isDestroyed()) {
      this.agentUIView.webContents.send('recording:saved', session);
    }
    
    // Reset recording ID
    this.currentRecordingId = null;
    this.recordingTabs.clear();
    this.lastActiveTabId = null;
    
    return session.id;
  }

  /**
   * Get all recordings
   */
  public getAllRecordings(): RecordingSession[] {
    return this.recordingStore.getAllRecordings();
  }

  /**
   * Delete recording (including video file)
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
   * Get recorded actions from centralized recorder
   */
  public getRecordedActions(): RecordedAction[] {
    return this.centralRecorder.getActions();
  }

  /**
   * Handle tab switch during recording
   */
  private async handleRecordingTabSwitch(previousTabId: string | null, newTabId: string, newTab: Tab): Promise<void> {
    try {
      console.log(`🔄 Tab switch detected during recording: ${previousTabId} -> ${newTabId}`);
      
      // Record tab-switch action
      const tabSwitchAction: RecordedAction = {
        type: 'tab-switch',
        timestamp: Date.now(),
        tabId: newTabId,
        tabUrl: newTab.info.url,
        tabTitle: newTab.info.title,
        webContentsId: newTab.view.webContents.id,
        metadata: {
          fromTabId: previousTabId,
          toTabId: newTabId,
          fromTabUrl: previousTabId ? this.tabs.get(previousTabId)?.info.url : undefined,
          toTabUrl: newTab.info.url
        },
        verified: true,
        verificationTime: 0
      };
      
      // Add to actions through the recorder
      this.centralRecorder.addAction(tabSwitchAction);
      
      // Notify renderer via the action callback (which is already set up)
      // This ensures it goes through the same path as other actions
      const callback = this.centralRecorder['onActionCallback'];
      if (callback) {
        callback(tabSwitchAction);
      }
      
      // Update or add tab to recording tabs
      const now = Date.now();
      if (!this.recordingTabs.has(newTabId)) {
        this.recordingTabs.set(newTabId, {
          tabId: newTabId,
          webContentsId: newTab.view.webContents.id,
          title: newTab.info.title,
          url: newTab.info.url,
          firstActiveAt: now,
          lastActiveAt: now,
          actionCount: 0
        });
      } else {
        const tabInfo = this.recordingTabs.get(newTabId);
        if (tabInfo) {
          tabInfo.lastActiveAt = now;
          tabInfo.title = newTab.info.title; // Update in case it changed
          tabInfo.url = newTab.info.url;
        }
      }
      
      // Switch the centralized recorder to the new tab
      await this.centralRecorder.switchWebContents(
        newTab.view,
        newTabId,
        newTab.info.url,
        newTab.info.title
      );
      
      this.lastActiveTabId = newTabId;
      
      console.log('✅ Recording switched to new tab successfully');
      
    } catch (error) {
      console.error('Failed to handle recording tab switch:', error);
    }
  }

  /**
   * Count tab-switch actions in recorded actions
   */
  private countTabSwitchActions(actions: RecordedAction[]): number {
    return actions.filter(action => action.type === 'tab-switch').length;
  }

  /**
   * Get the full outer HTML of the document for a given tab
   */
  public async getTabOuterHTML(tabId: string): Promise<string | null> {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    try {
      const html: string = await tab.view.webContents.executeJavaScript(
        'document.documentElement.outerHTML',
        true
      );
      return html;
    } catch (err) {
      console.error('Failed to get outerHTML for tab', tabId, err);
      return null;
    }
  }

  /**
   * Update layout when window resizes or sidebar changes
   */
  public updateLayout(_windowWidth: number, _windowHeight: number, sidebarWidth = 0): void {
    // Store current sidebar width
    this.currentSidebarWidth = sidebarWidth;
    
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
    this.recordingTabs.clear();
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
      if (tab.passwordAutomation && !this.isInternalPage(info.url)) {
        try {
          await tab.passwordAutomation.start();
        } catch (error) {
          console.error('[BrowserManager] Failed to start password automation:', error);
        }
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
   * Check if URL is an internal page
   */
  private isInternalPage(url: string): boolean {
    return url.startsWith('browzer://') || 
           url.includes('index.html#/') ||
           INTERNAL_PAGES.some(page => url.includes(`#/${page.path}`));
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
   * Get password manager instance
   */
  public getPasswordManager(): PasswordManager {
    return this.passwordManager;
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

  /**
   * Get tab ID for a given webContents
   */
  private getTabIdForWebContents(webContents: any): string | null {
    for (const [tabId, tab] of this.tabs) {
      if (tab.view.webContents === webContents) {
        return tabId;
      }
    }
    return null;
  }

  /**
   * Handle credential selection for multi-step flows
   */
  private handleCredentialSelected(tabId: string, credentialId: string, username: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.selectedCredentialId = credentialId;
      tab.selectedCredentialUsername = username;
      // console.log('[BrowserManager] Stored selected credential for tab:', tabId, 'username:', username);
    }
  }

  /**
   * Handle auto-fill password request
   */
  private async handleAutoFillPassword(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.selectedCredentialId) {
      return;
    }
    
    const password = this.passwordManager.getPassword(tab.selectedCredentialId);
    if (!password) {
      return;
    }
    
    console.log('[BrowserManager] Auto-filling password for:', tab.selectedCredentialUsername);
    
    try {
      // Use PasswordUtil for the actual password filling logic
      await PasswordUtil.fillPassword(
        tab.view,
        password,
        tab.selectedCredentialUsername
      );
      
      // Clear selected credential after use
      tab.selectedCredentialId = undefined;
      tab.selectedCredentialUsername = undefined;
      
    } catch (error) {
      console.error('[BrowserManager] Error auto-filling password:', error);
    }
  }
}
