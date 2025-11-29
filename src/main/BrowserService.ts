import { BaseWindow, WebContentsView, dialog } from 'electron';
import { AutocompleteSuggestion, RecordedAction } from '@/shared/types';
import { RecordingStore } from '@/main/recording';
import { HistoryService } from '@/main/history/HistoryService';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BrowserAutomationExecutor } from './automation';
import { SessionManager } from '@/main/llm/session/SessionManager';
import {
  TabService,
  RecordingManager,
  AutomationManager,
  NavigationManager,
  DebuggerManager,
} from './browser';

export class BrowserService {
  // Modular components
  private tabService: TabService;
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
    this.navigationManager = new NavigationManager(this.historyService);
    this.debuggerManager = new DebuggerManager();
    
    this.tabService = new TabService(
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
    const { tabs } = this.tabService.getAllTabs();
    if (tabs.length === 0) {
      this.tabService.createTab('https://www.google.com');
    }
  }

  public getTabService(): TabService {
    return this.tabService;
  }

  public async getSearchSuggestions(query: string): Promise<string[]> {
    return this.navigationManager.getSearchSuggestions(query);
  }

  public async getAutocompleteSuggestions(query: string): Promise<AutocompleteSuggestion[]> {
    return this.navigationManager.getAutocompleteSuggestions(query);
  }

  public async startRecording(): Promise<boolean> {
    const activeTab = this.tabService.getActiveTab();
    if (!activeTab) {
      dialog.showMessageBox({
        type: 'error',
        title: 'No tab active to record.',
        message: 'Please ensure at least one tab is active for recording'
      });
      return false;
    }

    return this.recordingManager.startRecording(activeTab);
  }

  public async stopRecording(): Promise<RecordedAction[]> {
    return this.recordingManager.stopRecording(this.tabService.getTabs());
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
      this.tabService.getTabs()
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

  public async executeIterativeAutomation(
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    const newTab = this.tabService.createTab();
    return this.automationManager.executeAutomation(
      newTab,
      userGoal,
      recordedSessionId,
    );
  }
  
  public stopAutomation(sessionId: string): void {
    this.automationManager.stopAutomation(sessionId);
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

  // Service Accessors (for IPCHandlers)

  public getHistoryService(): HistoryService {
    return this.historyService;
  }

  public getPasswordManager(): PasswordManager {
    return this.passwordManager;
  }

  public getActiveAutomationExecutor(): BrowserAutomationExecutor | null {
    const activeTab = this.tabService.getActiveTab();
    return activeTab.automationExecutor;
  }

  // Layout Management

  public updateLayout(_windowWidth: number, _windowHeight: number, sidebarWidth = 0): void {
    this.tabService.updateLayout(sidebarWidth);
  }

  /**
   * Hide all tabs (for fullscreen routes like auth pages)
   */
  public hideAllTabs(): void {
    this.tabService.hideAllTabs();
  }

  /**
   * Show all tabs (restore normal browsing mode)
   */
  public showAllTabs(): void {
    this.tabService.showAllTabs();
  }

  /**
   * Navigate active tab or create new tab with browzer:// URL
   */
  public navigateToBrowzerURL(url: string): void {
    const activeTab = this.tabService.getActiveTab();
    if (activeTab) {
      this.tabService.navigate(activeTab.id, url);
    } else {
      this.tabService.createTab(url);
    }
  }

  public destroy(): void {
    this.tabService.destroy();
    this.recordingManager.destroy();
    this.automationManager.destroy();
    this.sessionManager.close();
  }

  private setupTabEventListeners(): void {
    this.tabService.on('tabs:changed', () => {
      this.notifyTabsChanged();
    });

    this.tabService.on('tab:switched', (previousTabId, newTab) => {
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
        view.webContents.send('browser:tabs-updated', this.tabService.getAllTabs());
      }
    });
  }
}
