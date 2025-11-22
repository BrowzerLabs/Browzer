import { BaseWindow, WebContentsView } from 'electron';
import { RecordedAction, TabInfo } from '@/shared/types';
import { RecordingStore } from '@/main/recording';
import { HistoryService } from '@/main/history/HistoryService';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BrowserAutomationExecutor } from './automation';
import { SessionManager } from '@/main/llm/session/SessionManager';
import {
  TabManager,
  RecordingManager,
  AutomationManager,
  NavigationManager,
  DebuggerManager,
} from './browser';

/**
 * BrowserManager - Orchestrates browser functionality using modular components
 * - TabManager: Tab lifecycle and state
 * - RecordingManager: Recording orchestration
 * - AutomationManager: LLM automation sessions
 * - NavigationManager: URL handling
 * - DebuggerManager: CDP debugger lifecycle
 */
export class BrowserManager {
  // Modular components
  private tabManager: TabManager;
  private recordingManager: RecordingManager;
  private automationManager: AutomationManager;
  private navigationManager: NavigationManager;
  private debuggerManager: DebuggerManager;

  // Services (shared across managers)
  private historyService: HistoryService;
  private passwordManager: PasswordManager;
  private recordingStore: RecordingStore;
  private sessionManager: SessionManager;

  constructor(
    private baseWindow: BaseWindow,
    browserUIView?: WebContentsView
  ) {
    // Initialize services
    this.recordingStore = new RecordingStore();
    this.historyService = new HistoryService();
    this.passwordManager = new PasswordManager();
    this.sessionManager = new SessionManager();

    // Initialize managers
    this.navigationManager = new NavigationManager();
    this.debuggerManager = new DebuggerManager();
    
    this.tabManager = new TabManager(
      baseWindow,
      this.passwordManager,
      this.historyService,
      this.navigationManager,
      this.debuggerManager,
    );
    
    this.setupTabEventListeners();

    this.recordingManager = new RecordingManager(
      this.recordingStore,
      browserUIView
    );

    this.automationManager = new AutomationManager(
      this.recordingStore,
      this.sessionManager,
      browserUIView
    );
  }

  public initializeAfterAuth(): void {
    const { tabs } = this.tabManager.getAllTabs();
    if (tabs.length === 0) {
      this.tabManager.createTab('https://www.google.com');
    }
  }

  public getTabManager(): TabManager {
    return this.tabManager;
  }

  // ============================================================================
  // Recording Management (delegated to RecordingManager)
  // ============================================================================

  public async startRecording(): Promise<boolean> {
    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) {
      alert('No active tab to record')
      return false;
    }

    return this.recordingManager.startRecording(activeTab);
  }

  public async stopRecording(): Promise<RecordedAction[]> {
    return this.recordingManager.stopRecording(this.tabManager.getTabs());
  }

  public async saveRecording(
    name: string,
    description: string,
    actions: RecordedAction[]
  ): Promise<string> {
    return this.recordingManager.saveRecording(
      name,
      description,
      actions,
      this.tabManager.getTabs()
    );
  }

  public isRecordingActive(): boolean {
    return this.recordingManager.isRecordingActive();
  }

  public getRecordedActions(): RecordedAction[] {
    return this.recordingManager.getRecordedActions();
  }

  public getRecordingStore(): RecordingStore {
    return this.recordingManager.getRecordingStore();
  }

  public async deleteRecording(id: string): Promise<boolean> {
    return this.recordingManager.deleteRecording(id);
  }

  // ============================================================================
  // Automation Management (delegated to AutomationManager)
  // ============================================================================

  public async executeIterativeAutomation(
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    const newTab = this.tabManager.createTab();
    return this.automationManager.executeAutomation(
      newTab,
      userGoal,
      recordedSessionId,
    );
  }

  public async loadAutomationSession(sessionId: string): Promise<any> {
    return this.automationManager.loadAutomationSession(sessionId);
  }

  public async getAutomationSessionHistory(limit = 5): Promise<any[]> {
    return this.automationManager.getAutomationSessionHistory(limit);
  }

  public async getAutomationSessions(): Promise<any[]> {
    return this.automationManager.getAutomationSessions();
  }

  public async getAutomationSessionDetails(sessionId: string): Promise<any> {
    return this.automationManager.getAutomationSessionDetails(sessionId);
  }

  public async resumeAutomationSession(sessionId: string): Promise<any> {
    return this.automationManager.resumeAutomationSession(sessionId);
  }

  public async deleteAutomationSession(sessionId: string): Promise<boolean> {
    return this.automationManager.deleteAutomationSession(sessionId);
  }

  // ============================================================================
  // Service Accessors (for IPCHandlers)
  // ============================================================================

  public getHistoryService(): HistoryService {
    return this.historyService;
  }

  public getPasswordManager(): PasswordManager {
    return this.passwordManager;
  }

  public getActiveAutomationExecutor(): BrowserAutomationExecutor | null {
    const activeTab = this.tabManager.getActiveTab();
    return activeTab.automationExecutor;
  }

  // ============================================================================
  // Layout Management
  // ============================================================================

  public updateLayout(_windowWidth: number, _windowHeight: number, sidebarWidth = 0): void {
    this.tabManager.updateLayout(sidebarWidth);
  }

  /**
   * Hide all tabs (for fullscreen routes like auth pages)
   */
  public hideAllTabs(): void {
    this.tabManager.hideAllTabs();
  }

  /**
   * Show all tabs (restore normal browsing mode)
   */
  public showAllTabs(): void {
    this.tabManager.showAllTabs();
  }

  /**
   * Navigate active tab or create new tab with browzer:// URL
   */
  public navigateToBrowzerURL(url: string): void {
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab) {
      this.tabManager.navigate(activeTab.id, url);
    } else {
      this.tabManager.createTab(url);
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  public destroy(): void {
    this.tabManager.destroy();
    this.recordingManager.destroy();
    this.automationManager.destroy();
    this.sessionManager.close();
  }

  private setupTabEventListeners(): void {
    this.tabManager.on('tabs:changed', () => {
      this.notifyTabsChanged();
    });

    this.tabManager.on('tab:switched', (previousTabId, newTab) => {
      if (this.recordingManager.isRecordingActive()) {
        this.recordingManager.handleTabSwitch(previousTabId, newTab);
      }
    });
  }

  /**
   * Notify renderer about tab changes
   */
  private notifyTabsChanged(): void {
    const allViews = this.baseWindow.contentView.children;
    allViews.forEach(view => {
      if (view instanceof WebContentsView) {
        view.webContents.send('browser:tabs-updated', this.tabManager.getAllTabs());
      }
    });
  }
}
