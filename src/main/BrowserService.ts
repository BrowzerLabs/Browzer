import { BaseWindow, WebContentsView, dialog } from 'electron';
import { AutocompleteSuggestion, RecordedAction } from '@/shared/types';
import { RecordingStore } from '@/main/recording';
import { HistoryService } from '@/main/history/HistoryService';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BookmarkService } from '@/main/bookmark';
import { BrowserAutomationExecutor } from './automation';
import { SessionManager } from '@/main/llm/session/SessionManager';
import {
  TabService,
  RecordingManager,
  AutomationManager,
  NavigationService,
  DebuggerService,
} from './browser';
import { SettingsService } from './settings/SettingsService';

export class BrowserService {
  // Modular components
  private tabService: TabService;
  private recordingManager: RecordingManager;
  private automationManager: AutomationManager;
  private navigationService: NavigationService;
  private debuggerService: DebuggerService;

  // Services (shared across managers)
  private settingsService: SettingsService;
  private historyService: HistoryService;
  private passwordManager: PasswordManager;
  private bookmarkService: BookmarkService;
  private recordingStore: RecordingStore;
  private sessionManager: SessionManager;

  constructor(
    private baseWindow: BaseWindow,
    private browserView: WebContentsView
  ) {
    // Initialize services
    this.settingsService = new SettingsService(this.browserView);
    this.recordingStore = new RecordingStore();
    this.historyService = new HistoryService();
    this.passwordManager = new PasswordManager();
    this.bookmarkService = new BookmarkService(this.browserView);
    this.sessionManager = new SessionManager();

    // Initialize managers
    this.navigationService = new NavigationService(this.historyService);
    this.debuggerService = new DebuggerService();
    
    this.tabService = new TabService(
      baseWindow,
      this.passwordManager,
      this.settingsService,
      this.historyService,
      this.navigationService,
      this.debuggerService,
    );
    
    this.setupTabEventListeners();

    this.recordingManager = new RecordingManager(
      this.recordingStore,
      this.browserView
    );

    this.automationManager = new AutomationManager(
      this.recordingStore,
      this.sessionManager,
      this.browserView
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
    return this.navigationService.getSearchSuggestions(query);
  }

  public async getAutocompleteSuggestions(query: string): Promise<AutocompleteSuggestion[]> {
    return this.navigationService.getAutocompleteSuggestions(query);
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
  public getSettingsService(): SettingsService {
    return this.settingsService;
  }

  public getHistoryService(): HistoryService {
    return this.historyService;
  }

  public getPasswordManager(): PasswordManager {
    return this.passwordManager;
  }

  public getBookmarkService(): BookmarkService {
    return this.bookmarkService;
  }

  public getBrowserView(): WebContentsView {
    return this.browserView;
  }

  public getActiveAutomationExecutor(): BrowserAutomationExecutor | null {
    const activeTab = this.tabService.getActiveTab();
    return activeTab.automationExecutor;
  }

  public updateLayout(_windowWidth: number, _windowHeight: number, sidebarWidth = 0): void {
    this.tabService.updateLayout(sidebarWidth);
  }

  public hideAllTabs(): void {
    this.tabService.hideAllTabs();
  }

  public showAllTabs(): void {
    this.tabService.showAllTabs();
  }

  public bringBrowserViewToFront(): void {
    if (this.browserView.webContents.isDestroyed()) {
      return;
    }

    this.baseWindow.contentView.addChildView(this.browserView);
  }

  public bringBrowserViewToBottom(): void {
    if (this.browserView.webContents.isDestroyed()) {
      return;
    }

    this.baseWindow.contentView.addChildView(this.browserView, 0);
  }

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
