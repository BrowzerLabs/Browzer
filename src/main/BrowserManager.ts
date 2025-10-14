import { BaseWindow, WebContentsView, Menu } from 'electron';
import path from 'node:path';
import { ActionRecorder } from './ActionRecorder';
import { VideoRecorder } from './VideoRecorder';
import { RecordingStore } from './RecordingStore';
import { BrowserAutomation } from './automation/BrowserAutomation';
import { HistoryService } from './HistoryService';
import { PasswordManager } from './PasswordManager';
import { RecordedAction, RecordingSession, HistoryTransition, RecordingTabInfo } from '../shared/types';
import { INTERNAL_PAGES } from './constants';
import { stat } from 'fs/promises';

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
  videoRecorder?: VideoRecorder;
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
  private passwordManager: PasswordManager;
  private recordingStartTime = 0;
  private recordingStartUrl = '';
  private currentRecordingId: string | null = null;
  private currentSidebarWidth = 0;
  
  // Store pending password save across navigation (per tab)
  private pendingPasswordSaves: Map<string, { username: string; password: string; origin: string }> = new Map();
  
  // Track login sessions across multiple steps/pages
  private loginSessions: Map<string, {
    origin: string;
    username?: string;
    password?: string;
    startTime: number;
    lastActivity: number;
    steps: Array<{ url: string; timestamp: number; action: string; data?: any }>;
  }> = new Map();

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

      // Start action recording with tab context
      await this.centralRecorder.startRecording(
        this.activeTabId,
        tab.info.url,
        tab.info.title,
        tab.view.webContents.id
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

    // Stop centralized action recording
    const actions = this.centralRecorder.stopRecording();
    
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
      videoPath,
      videoSize,
      videoFormat: videoPath ? 'webm' : undefined,
      videoDuration
    };

    this.recordingStore.saveRecording(session);
    console.log('💾 Recording saved:', session.id, session.name);
    if (videoPath && videoSize) {
      console.log('🎥 Video included:', videoPath, `(${(videoSize / 1024 / 1024).toFixed(2)} MB)`);
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
      
      // Add to actions through the recorder (but don't send via IPC here)
      this.centralRecorder.getActions().push(tabSwitchAction);
      
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
      
      // Inject password autofill script
      this.injectPasswordAutofill(webContents);
      
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
          webContents.openDevTools({ mode: 'right' });
        }
      }
      // Cmd/Ctrl + Shift + C to open DevTools in inspect mode
      else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'c') {
        event.preventDefault();
        webContents.openDevTools({ mode: 'right', activate: true });
      }
    });

    // Listen for password manager messages from injected script
    webContents.on('console-message', (_event: any, level: number, message: string) => {
      if (message.includes('[PasswordAutofill]')) {
        console.log(`[WebView Console] ${message}`);
      }
    });

    // Listen for console messages to intercept password storage requests
    webContents.on('console-message', (_event: any, level: number, message: string) => {
      if (message.includes('[PasswordAutofill]')) {
        console.log(`[WebView Console] ${message}`);
        
        // Handle different password manager requests
        if (message.includes('STORE_PENDING:')) {
          try {
            const jsonMatch = message.match(/STORE_PENDING: (.+)$/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              const tabId = this.getTabIdForWebContents(webContents);
              if (tabId) {
                this.pendingPasswordSaves.set(tabId, data);
                console.log('[PasswordManager] Stored pending password save for tab:', tabId);
              }
            }
          } catch (e) {
            console.warn('[PasswordManager] Failed to parse pending password data');
          }
        }
        // Handle username storage for multi-step login
        else if (message.includes('STORE_USERNAME:')) {
          try {
            const jsonMatch = message.match(/STORE_USERNAME: (.+)$/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              const tabId = this.getTabIdForWebContents(webContents);
              if (tabId) {
                // Store or update login session
                const existing = this.loginSessions.get(tabId) || {
                  origin: data.origin,
                  startTime: Date.now(),
                  lastActivity: Date.now(),
                  steps: []
                };
                
                existing.username = data.username;
                existing.lastActivity = Date.now();
                existing.steps.push({
                  url: data.url,
                  timestamp: data.timestamp,
                  action: data.action || 'username_entered',
                  data: { username: data.username }
                });
                
                this.loginSessions.set(tabId, existing);
                console.log('[PasswordManager] Stored username for multi-step login:', data.username);
              }
            }
          } catch (e) {
            console.warn('[PasswordManager] Failed to parse username data');
          }
        }
        // Handle password submission with username retrieval
        else if (message.includes('GET_STORED_USERNAME:')) {
          try {
            const jsonMatch = message.match(/GET_STORED_USERNAME: (.+)$/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              const tabId = this.getTabIdForWebContents(webContents);
              const session = tabId ? this.loginSessions.get(tabId) : null;
              
              if (session && session.username) {
                console.log('[PasswordManager] Retrieved stored username for password submission:', session.username);
                
                // Check if this exact username+password combination already exists
                const existingCreds = this.passwordManager.getCredentialsForOrigin(data.origin);
                const existingCred = existingCreds.find(c => c.username === session.username);
                
                if (existingCred) {
                  // Check if the password is different (user might be updating password)
                  const existingPassword = this.passwordManager.getPassword(existingCred.id);
                  if (existingPassword === data.password) {
                    console.log('[PasswordManager] Identical credential already exists, skipping save prompt');
                  } else {
                    console.log('[PasswordManager] Same username but different password, showing update prompt');
                    // Store for update prompt
                    this.pendingPasswordSaves.set(tabId, {
                      username: session.username,
                      password: data.password,
                      origin: data.origin,
                      isUpdate: true
                    });
                    
                    setTimeout(() => {
                      const promptScript = this.generateSavePromptScript(session.username, data.password, data.origin);
                      webContents.executeJavaScript(promptScript);
                    }, 100);
                  }
                } else {
                  console.log('[PasswordManager] New username for this site, showing save prompt');
                  
                  // Store complete credentials for save prompt
                  this.pendingPasswordSaves.set(tabId, {
                    username: session.username,
                    password: data.password,
                    origin: data.origin
                  });
                  
                  // Inject save prompt into the current page
                  setTimeout(() => {
                    const promptScript = this.generateSavePromptScript(session.username, data.password, data.origin);
                    webContents.executeJavaScript(promptScript);
                  }, 100);
                }
                
                // Clean up login session
                this.loginSessions.delete(tabId);
              } else {
                console.warn('[PasswordManager] No stored username found for password submission');
              }
            }
          } catch (e) {
            console.warn('[PasswordManager] Failed to handle password submission');
          }
        }
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

  /**
   * Inject password autofill script into web content
   */
  private injectPasswordAutofill(webContents: any): void {
    // Skip for internal pages
    const url = webContents.getURL();
    if (url.startsWith('browzer://') || url.startsWith('file://') || url.startsWith('about:')) {
      return;
    }

    // Check if there's a pending password save for this tab
    const tabId = this.getTabIdForWebContents(webContents);
    const pendingSave = tabId ? this.pendingPasswordSaves.get(tabId) : null;
    
    // Get saved credentials for this origin with decrypted passwords
    const origin = new URL(url).origin;
    let savedCredentials: any[] = [];
    let credentialsWithPasswords: any[] = [];
    
    try {
      savedCredentials = this.passwordManager.getCredentialsForOrigin(origin);
      console.log(`[PasswordAutofill] Found ${savedCredentials.length} credentials for ${origin}`);
      
      // Decrypt passwords for injection (only for autofill, not for storage)
      credentialsWithPasswords = savedCredentials.map(cred => {
        console.log(`[PasswordAutofill] Attempting to decrypt password for ${cred.username} (ID: ${cred.id})`);
        const decryptedPassword = this.passwordManager.getPassword(cred.id);
        console.log(`[PasswordAutofill] Decryption result for ${cred.username}:`, decryptedPassword ? 'SUCCESS' : 'FAILED');
        return {
          ...cred,
          password: decryptedPassword // Add decrypted password for autofill
        };
      });
    } catch (error) {
      console.warn('[PasswordAutofill] Failed to get credentials:', error);
    }

    // Generate and inject password autofill script
    const script = `
(function() {
  'use strict';
  
  // Inject pending password save if exists
  ${pendingSave ? `window.pendingPasswordSave = ${JSON.stringify(pendingSave)};` : ''}
  
  // Inject saved credentials for this origin (with decrypted passwords for autofill)
  window.savedCredentials = ${JSON.stringify(savedCredentials)};
  window.savedCredentialsWithPasswords = ${JSON.stringify(credentialsWithPasswords)};
  
  // Detect all types of login forms and fields
  function detectLoginElements() {
    const result = {
      emailFields: [],
      usernameFields: [],
      passwordFields: [],
      loginForms: [],
      isMultiStep: false
    };

    // Find all email fields
    result.emailFields = Array.from(document.querySelectorAll(
      'input[type="email"], input[name*="email"], input[id*="email"], input[autocomplete="email"]'
    ));

    // Find all username fields
    result.usernameFields = Array.from(document.querySelectorAll(
      'input[type="text"][name*="user"], input[type="text"][id*="user"], input[type="text"][name*="login"], input[autocomplete="username"]'
    ));

    // Find all visible password fields (exclude hidden ones)
    result.passwordFields = Array.from(document.querySelectorAll('input[type="password"]'))
      .filter(field => {
        const style = window.getComputedStyle(field);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               field.offsetWidth > 0 && 
               field.offsetHeight > 0;
      });

    // Find traditional login forms (email/username + visible password on same page)
    const forms = Array.from(document.querySelectorAll('form'));
    for (const form of forms) {
      const passwordFields = Array.from(form.querySelectorAll('input[type="password"]'))
        .filter(field => {
          const style = window.getComputedStyle(field);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 field.offsetWidth > 0 && 
                 field.offsetHeight > 0;
        });
      
      const emailField = form.querySelector('input[type="email"], input[name*="email"]');
      const usernameField = form.querySelector('input[type="text"][name*="user"], input[autocomplete="username"]');
      
      if (passwordFields.length > 0 && (emailField || usernameField)) {
        result.loginForms.push({
          form,
          usernameField: emailField || usernameField,
          passwordField: passwordFields[0]
        });
      }
    }

    // Detect multi-step login (email field without password, or password field without email)
    const hasEmailWithoutPassword = result.emailFields.length > 0 && result.passwordFields.length === 0;
    const hasPasswordWithoutEmail = result.passwordFields.length > 0 && result.emailFields.length === 0;
    const hasStandaloneFields = (result.emailFields.length > 0 || result.usernameFields.length > 0) && result.loginForms.length === 0;
    
    result.isMultiStep = hasEmailWithoutPassword || hasPasswordWithoutEmail || hasStandaloneFields;

    return result;
  }

  // Show save password prompt
  function showSavePasswordPrompt(username, password, origin) {
    console.log('[PasswordAutofill] 🔑 showSavePasswordPrompt called with:', { username, origin });
    
    // Check if prompt already exists
    const existing = document.getElementById('browzer-password-prompt');
    if (existing) {
      console.log('[PasswordAutofill] Prompt already exists, skipping');
      return;
    }

    console.log('[PasswordAutofill] Creating new save prompt');
    const prompt = document.createElement('div');
    prompt.id = 'browzer-password-prompt';
    prompt.style.cssText = \`
      position: fixed;
      top: 60px;
      right: 20px;
      background: white;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      min-width: 300px;
    \`;

    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    // Create elements safely without innerHTML (to avoid TrustedHTML issues)
    const container = document.createElement('div');
    container.style.cssText = 'position: relative;';
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.id = 'browzer-close-prompt';
    closeBtn.textContent = '×';
    closeBtn.style.cssText = \`
      position: absolute;
      top: 8px;
      right: 8px;
      background: transparent;
      color: #666;
      border: none;
      padding: 4px;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      border-radius: 4px;
    \`;
    
    // Main content
    const content = document.createElement('div');
    content.style.cssText = 'display: flex; align-items: flex-start; gap: 12px; padding-right: 24px;';
    
    const icon = document.createElement('div');
    icon.textContent = '🔑';
    icon.style.cssText = 'font-size: 24px;';
    
    const textArea = document.createElement('div');
    textArea.style.cssText = 'flex: 1;';
    
    const title = document.createElement('div');
    title.textContent = 'Save password?';
    title.style.cssText = 'font-weight: 500; margin-bottom: 8px; color: #000;';
    
    const usernameText = document.createElement('div');
    usernameText.textContent = \`Username: \${username}\`;
    usernameText.style.cssText = 'color: #5f6368; font-size: 13px; margin-bottom: 4px;';
    
    const passwordText = document.createElement('div');
    passwordText.textContent = \`Password: \${'•'.repeat(password.length)}\`;
    passwordText.style.cssText = 'color: #5f6368; font-size: 13px; margin-bottom: 12px;';
    
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = 'display: flex; gap: 8px;';
    
    const saveBtn = document.createElement('button');
    saveBtn.id = 'browzer-save-password';
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = \`
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    \`;
    
    const neverBtn = document.createElement('button');
    neverBtn.id = 'browzer-never-save';
    neverBtn.textContent = 'Never';
    neverBtn.style.cssText = \`
      background: transparent;
      color: #5f6368;
      border: 1px solid #dadce0;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
    \`;
    
    // Assemble the prompt
    buttonArea.appendChild(saveBtn);
    buttonArea.appendChild(neverBtn);
    textArea.appendChild(title);
    textArea.appendChild(usernameText);
    textArea.appendChild(passwordText);
    textArea.appendChild(buttonArea);
    content.appendChild(icon);
    content.appendChild(textArea);
    container.appendChild(closeBtn);
    container.appendChild(content);
    prompt.appendChild(container);

    document.body.appendChild(prompt);
    console.log('[PasswordAutofill] ✅ Save prompt added to DOM');

    // Send messages to main process (works in sandboxed context)
    const savePassword = () => {
      // Clear flags to allow future prompts
      window.pendingPasswordSave = null;
      window.passwordPromptShown = false;
      
      // Try multiple communication methods
      if (window.browserAPI) {
        window.browserAPI.savePassword(origin, username, password);
      } else if (window.electronAPI) {
        // Use electron IPC if available
        window.electronAPI.invoke('password:save', origin, username, password);
      } else {
        // Fallback: try to access ipcRenderer directly
        try {
          const { ipcRenderer } = require('electron');
          ipcRenderer.invoke('password:save', origin, username, password);
        } catch (e) {
          console.error('[PasswordAutofill] No IPC method available');
        }
      }
      console.log('[PasswordAutofill] Sent save password request');
      prompt.remove();
    };

    const neverSave = () => {
      // Clear flags to allow future prompts
      window.pendingPasswordSave = null;
      window.passwordPromptShown = false;
      
      if (window.browserAPI) {
        window.browserAPI.neverSaveForSite(origin);
      } else if (window.electronAPI) {
        window.electronAPI.invoke('password:add-to-blacklist', origin);
      } else {
        try {
          const { ipcRenderer } = require('electron');
          ipcRenderer.invoke('password:add-to-blacklist', origin);
        } catch (e) {
          console.error('[PasswordAutofill] No IPC method available');
        }
      }
      console.log('[PasswordAutofill] Sent never save request');
      prompt.remove();
    };

    document.getElementById('browzer-save-password').addEventListener('click', savePassword);
    document.getElementById('browzer-never-save').addEventListener('click', neverSave);
    closeBtn.addEventListener('click', () => {
      // Clear flags when manually closed
      window.pendingPasswordSave = null;
      window.passwordPromptShown = false;
      prompt.remove();
    });

    // No auto-hide timeout - prompt stays until user takes action
  }

  // Setup traditional single-page login forms
  function setupTraditionalForms(loginForms) {
    for (const { form, usernameField, passwordField } of loginForms) {
      // Set up autofill
      if (window.savedCredentials && window.savedCredentials.length > 0) {
        setupAutofillForField(usernameField);
      }
      
      // Set up save on submit
      form.addEventListener('submit', () => {
        const username = usernameField.value;
        const password = passwordField.value;
        handleCredentialSubmission(username, password, origin);
      });
    }
  }

  // Setup multi-step login (email first, then password)
  function setupMultiStepLogin(elements) {
    // Handle email/username fields (first step)
    const allUsernameFields = [...elements.emailFields, ...elements.usernameFields];
    
    for (const field of allUsernameFields) {
      // Set up autofill for email/username
      if (window.savedCredentials && window.savedCredentials.length > 0) {
        setupAutofillForField(field);
      }
      
      // Track email/username entry with debouncing
      let inputTimeout;
      field.addEventListener('input', () => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
          if (field.value && field.value.length > 3) { // Only track meaningful input
            // Store in main process via console log
            console.log('[PasswordAutofill] STORE_USERNAME:', JSON.stringify({ 
              username: field.value, 
              origin: origin,
              timestamp: Date.now(),
              url: location.href
            }));
            console.log('[PasswordAutofill] Username captured in multi-step:', field.value);
          }
        }, 500); // Debounce to avoid spam
      });
      
      // Handle form submission (email step)
      const form = field.closest('form');
      if (form) {
        form.addEventListener('submit', () => {
          if (field.value) {
            // Store in main process for persistence
            console.log('[PasswordAutofill] STORE_USERNAME:', JSON.stringify({ 
              username: field.value, 
              origin: origin,
              timestamp: Date.now(),
              url: location.href,
              action: 'email_submitted'
            }));
            console.log('[PasswordAutofill] Email step submitted:', field.value);
          }
        });
      }
    }

    // Handle password fields (second step)
    for (const passwordField of elements.passwordFields) {
      console.log('[PasswordAutofill] Setting up password field for multi-step');
      
      // Check if we have saved credentials with passwords for auto-fill
      if (window.savedCredentialsWithPasswords && window.savedCredentialsWithPasswords.length > 0) {
        console.log('[PasswordAutofill] Found saved credentials with passwords, auto-filling password');
        
        setTimeout(() => {
          // For multi-step, we need to match the username that was entered in step 1
          // Since we can't easily access the stored username from the webview,
          // we'll auto-fill with the most recently used credential for now
          const mostRecentCred = window.savedCredentialsWithPasswords
            .sort((a, b) => b.lastUsed - a.lastUsed)[0];
          
          if (mostRecentCred && mostRecentCred.password) {
            console.log('[PasswordAutofill] Auto-filling password for most recent user:', mostRecentCred.username);
            passwordField.value = mostRecentCred.password;
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Show tooltip
            const tooltip = document.createElement('div');
            tooltip.style.cssText = \`
              position: absolute;
              top: -35px;
              left: 50%;
              transform: translateX(-50%);
              background: #333;
              color: white;
              padding: 6px 12px;
              border-radius: 4px;
              font-size: 12px;
              z-index: 999999;
              white-space: nowrap;
            \`;
            tooltip.textContent = \`Password auto-filled for \${mostRecentCred.username}\`;
            
            passwordField.style.position = 'relative';
            if (passwordField.parentElement) {
              passwordField.parentElement.style.position = 'relative';
              passwordField.parentElement.appendChild(tooltip);
              
              setTimeout(() => {
                if (tooltip.parentElement) {
                  tooltip.remove();
                }
              }, 3000);
            }
            
            console.log('[PasswordAutofill] ✅ Password auto-filled for:', mostRecentCred.username);
          }
        }, 500);
      }
      
      // Handle password form submission
      const form = passwordField.closest('form');
      if (form) {
        form.addEventListener('submit', () => {
          const password = passwordField.value;
          if (password) {
            console.log('[PasswordAutofill] Password submitted, requesting stored username');
            // Request stored username from main process
            console.log('[PasswordAutofill] GET_STORED_USERNAME:', JSON.stringify({ 
              origin: origin,
              password: password,
              timestamp: Date.now()
            }));
          }
        });
      }
    }
  }

  // Setup autofill for any field
  function setupAutofillForField(field) {
    // Show dropdown immediately if field is already focused
    if (document.activeElement === field) {
      setTimeout(() => showAutofillDropdown(field, window.savedCredentials), 100);
    }
    
    // Add event listeners
    field.addEventListener('focus', () => {
      showAutofillDropdown(field, window.savedCredentials);
    });
    
    field.addEventListener('click', () => {
      showAutofillDropdown(field, window.savedCredentials);
    });
  }

  // Handle credential submission (unified for all login types)
  function handleCredentialSubmission(username, password, origin) {
    console.log('[PasswordAutofill] ⚡ CREDENTIALS SUBMITTED!');
    console.log('[PasswordAutofill] Username:', username ? 'present' : 'empty');
    console.log('[PasswordAutofill] Password:', password ? 'present' : 'empty');

    if (username && password) {
      // Check if we already have this credential saved
      const existingCred = window.savedCredentials?.find(c => 
        c.origin === origin && c.username === username
      );
      
      if (existingCred) {
        console.log('[PasswordAutofill] Credential already exists, skipping save prompt');
        return;
      }
      
      console.log('[PasswordAutofill] New credential, storing for post-navigation prompt');
      
      // Store credentials in main process
      console.log('[PasswordAutofill] STORE_PENDING:', JSON.stringify({ username, password, origin }));
      
      // Show prompt immediately
      showSavePasswordPrompt(username, password, origin);
    }
  }

  // Initialize password autofill
  async function initializePasswordAutofill() {
    const origin = window.location.origin;

    try {
      console.log('[PasswordAutofill] Starting initialization for:', origin);
      
      // Check for pending password save from previous page (only show once)
      if (window.pendingPasswordSave && !window.passwordPromptShown) {
        const pending = window.pendingPasswordSave;
        console.log('[PasswordAutofill] Found pending password save, showing prompt');
        showSavePasswordPrompt(pending.username, pending.password, pending.origin);
        window.pendingPasswordSave = null; // Clear after showing
        window.passwordPromptShown = true; // Prevent multiple prompts
      }
      
      const loginElements = detectLoginElements();
      console.log('[PasswordAutofill] Login detection result:', {
        emailFields: loginElements.emailFields.length,
        usernameFields: loginElements.usernameFields.length,
        passwordFields: loginElements.passwordFields.length,
        loginForms: loginElements.loginForms.length,
        isMultiStep: loginElements.isMultiStep
      });
      
      // Initialize login session tracking
      if (!window.loginSession) {
        window.loginSession = {
          origin,
          startTime: Date.now(),
          lastActivity: Date.now(),
          steps: []
        };
      }
      
      // Handle different login patterns
      if (loginElements.loginForms.length > 0) {
        // Traditional single-page login forms
        console.log('[PasswordAutofill] Setting up traditional login forms');
        setupTraditionalForms(loginElements.loginForms);
      } else if (loginElements.isMultiStep) {
        // Multi-step login process
        console.log('[PasswordAutofill] Setting up multi-step login');
        setupMultiStepLogin(loginElements);
      } else {
        console.log('[PasswordAutofill] No login elements detected');
      }

      // Legacy cleanup - this is now handled by setupTraditionalForms and setupMultiStepLogin

      console.log('[PasswordAutofill] Initialized for', origin);
    } catch (error) {
      console.error('[PasswordAutofill] Initialization error:', error);
    }
  }

  // Show autofill dropdown
  function showAutofillDropdown(usernameField, credentials) {
    const existing = document.getElementById('browzer-autofill-dropdown');
    if (existing) existing.remove();

    if (credentials.length === 0) return;

    const rect = usernameField.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.id = 'browzer-autofill-dropdown';
    dropdown.style.cssText = \`
      position: fixed;
      top: \${rect.bottom + window.scrollY}px;
      left: \${rect.left + window.scrollX}px;
      width: \${rect.width}px;
      background: white;
      border: 1px solid #dadce0;
      border-radius: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      max-height: 200px;
      overflow-y: auto;
    \`;

    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    // Create dropdown items safely without innerHTML
    credentials.forEach(cred => {
      const item = document.createElement('div');
      item.className = 'browzer-autofill-item';
      item.setAttribute('data-credential-id', cred.id);
      item.style.cssText = \`
        padding: 10px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid #f0f0f0;
        color: #000;
        transition: background-color 0.2s;
      \`;
      
      // Add hover effects
      item.addEventListener('mouseenter', () => item.style.backgroundColor = '#f5f5f5');
      item.addEventListener('mouseleave', () => item.style.backgroundColor = 'white');
      
      const usernameSpan = document.createElement('span');
      usernameSpan.textContent = cred.username;
      usernameSpan.style.cssText = 'color: #000;';
      
      item.appendChild(usernameSpan);
      dropdown.appendChild(item);
    });

    document.body.appendChild(dropdown);

    dropdown.addEventListener('click', async (e) => {
      const target = e.target.closest('.browzer-autofill-item');
      if (target) {
        const credentialId = target.dataset.credentialId;
        const credential = credentials.find(c => c.id === credentialId);
        
        console.log('[PasswordAutofill] Credential selected:', credentialId);
        
        if (credential) {
          // Fill username immediately
          usernameField.value = credential.username;
          usernameField.dispatchEvent(new Event('input', { bubbles: true }));
          
          // Fill actual password if available (match by credential ID)
          const passwordField = document.querySelector('input[type="password"]');
          if (passwordField) {
            // Find the exact matching credential with decrypted password
            const credWithPassword = window.savedCredentialsWithPasswords?.find(c => c.id === credential.id);
            if (credWithPassword && credWithPassword.password) {
              passwordField.value = credWithPassword.password;
              passwordField.dispatchEvent(new Event('input', { bubbles: true }));
              console.log('[PasswordAutofill] ✅ Autofilled both username and password for:', credential.username);
            } else {
              console.log('[PasswordAutofill] Username filled, no decrypted password available for:', credential.username);
            }
          }
          
          console.log('[PasswordAutofill] Autofilled credentials for:', credential.username);
        }
        dropdown.remove();
      }
    });

    // Close on click outside
    setTimeout(() => {
      const handleClickOutside = (e) => {
        if (!dropdown.contains(e.target) && e.target !== usernameField) {
          dropdown.remove();
          document.removeEventListener('click', handleClickOutside);
        }
      };
      document.addEventListener('click', handleClickOutside);
    }, 100);
  }

  // Initialize when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializePasswordAutofill, 500);
    });
  } else {
    setTimeout(initializePasswordAutofill, 500);
  }

  // Re-initialize on navigation (for SPAs)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(initializePasswordAutofill, 500);
    }
  }).observe(document, { subtree: true, childList: true });

  console.log('[PasswordAutofill] Script injected');
})();
`;
    
    webContents.executeJavaScript(script).then(() => {
      console.log('[PasswordAutofill] Script injected successfully for:', url);
    }).catch((error: Error) => {
      console.warn('[PasswordAutofill] Failed to inject script:', error.message);
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
   * Generate a script to show save prompt on current page
   */
  private generateSavePromptScript(username: string, password: string, origin: string): string {
    return `
(function() {
  console.log('[PasswordAutofill] Showing save prompt for multi-step login: ${username}');
  
  // Create save prompt directly
  const existing = document.getElementById('browzer-password-prompt');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.id = 'browzer-password-prompt';
  prompt.style.cssText = \`
    position: fixed;
    top: 60px;
    right: 20px;
    background: white;
    border: 1px solid #dadce0;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    min-width: 300px;
  \`;

  // Create elements safely without innerHTML (to avoid TrustedHTML issues)
  const container = document.createElement('div');
  container.style.cssText = 'position: relative;';
  
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.id = 'browzer-close-prompt';
  closeBtn.textContent = '×';
  closeBtn.style.cssText = \`
    position: absolute;
    top: 8px;
    right: 8px;
    background: transparent;
    color: #666;
    border: none;
    padding: 4px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    border-radius: 4px;
  \`;
  
  // Main content
  const content = document.createElement('div');
  content.style.cssText = 'display: flex; align-items: flex-start; gap: 12px; padding-right: 24px;';
  
  const icon = document.createElement('div');
  icon.textContent = '🔑';
  icon.style.cssText = 'font-size: 24px;';
  
  const textArea = document.createElement('div');
  textArea.style.cssText = 'flex: 1;';
  
  const title = document.createElement('div');
  title.textContent = 'Save password?';
  title.style.cssText = 'font-weight: 500; margin-bottom: 8px; color: #000;';
  
  const usernameText = document.createElement('div');
  usernameText.textContent = \`Username: \${username}\`;
  usernameText.style.cssText = 'color: #5f6368; font-size: 13px; margin-bottom: 4px;';
  
  const passwordText = document.createElement('div');
  passwordText.textContent = \`Password: \${'•'.repeat(password.length)}\`;
  passwordText.style.cssText = 'color: #5f6368; font-size: 13px; margin-bottom: 12px;';
  
  const buttonArea = document.createElement('div');
  buttonArea.style.cssText = 'display: flex; gap: 8px;';
  
  const saveBtn = document.createElement('button');
  saveBtn.id = 'browzer-save-password';
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = \`
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  \`;
  
  const neverBtn = document.createElement('button');
  neverBtn.id = 'browzer-never-save';
  neverBtn.textContent = 'Never';
  neverBtn.style.cssText = \`
    background: transparent;
    color: #5f6368;
    border: 1px solid #dadce0;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
  \`;
  
  // Assemble the prompt
  buttonArea.appendChild(saveBtn);
  buttonArea.appendChild(neverBtn);
  textArea.appendChild(title);
  textArea.appendChild(usernameText);
  textArea.appendChild(passwordText);
  textArea.appendChild(buttonArea);
  content.appendChild(icon);
  content.appendChild(textArea);
  container.appendChild(closeBtn);
  container.appendChild(content);
  prompt.appendChild(container);

  document.body.appendChild(prompt);
  console.log('[PasswordAutofill] Multi-step save prompt shown');

  // Add event listeners
  document.getElementById('browzer-save-password').addEventListener('click', () => {
    console.log('[PasswordAutofill] SAVE_PASSWORD:', JSON.stringify({ username: '${username}', password: '${password}', origin: '${origin}' }));
    prompt.remove();
  });

  document.getElementById('browzer-never-save').addEventListener('click', () => {
    console.log('[PasswordAutofill] NEVER_SAVE:', JSON.stringify({ origin: '${origin}' }));
    prompt.remove();
  });

  document.getElementById('browzer-close-prompt').addEventListener('click', () => {
    prompt.remove();
  });
})();
`;
  }

  /**
   * Handle password actions from injected script
   */
  private async handlePasswordAction(action: any): Promise<void> {
    try {
      if (action.type === 'save-password') {
        const success = await this.passwordManager.saveCredential(
          action.origin, 
          action.username, 
          action.password
        );
        console.log('[PasswordManager] Save result:', success);
      } else if (action.type === 'never-save') {
        this.passwordManager.addToBlacklist(action.origin);
        console.log('[PasswordManager] Added to blacklist:', action.origin);
      }
    } catch (error) {
      console.error('[PasswordManager] Error handling action:', error);
    }
  }
}
