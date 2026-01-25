import { BaseWindow, WebContentsView } from 'electron';

import {
  TabService,
  AutomationManager,
  NavigationService,
  DebuggerService,
} from './browser';
import { SettingsService } from './settings/SettingsService';
import { DownloadService } from './download/DownloadService';
import { AdBlockerService } from './adblocker/AdBlockerService';
import { RecordingService } from './recording/RecordingService';

import { AutocompleteSuggestion } from '@/shared/types';
import { HistoryService } from '@/main/history/HistoryService';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BookmarkService } from '@/main/bookmark';
import { AutopilotService } from '@/main/llm/autopilot';

export class BrowserService {
  private tabService: TabService;
  private automationManager: AutomationManager;
  private autopilotService: AutopilotService;
  private navigationService: NavigationService;
  private debuggerService: DebuggerService;
  private downloadService: DownloadService;
  private adBlockerService: AdBlockerService;

  private settingsService: SettingsService;
  private historyService: HistoryService;
  private passwordManager: PasswordManager;
  private bookmarkService: BookmarkService;
  private recordingService: RecordingService;

  constructor(
    private baseWindow: BaseWindow,
    private browserView: WebContentsView
  ) {
    // Initialize services
    this.settingsService = new SettingsService(this.browserView);
    this.recordingService = new RecordingService(
      this.baseWindow,
      this.browserView
    );
    this.historyService = new HistoryService();
    this.passwordManager = new PasswordManager();
    this.bookmarkService = new BookmarkService(this.browserView);
    this.adBlockerService = new AdBlockerService();

    // Initialize managers
    this.navigationService = new NavigationService(
      this.settingsService,
      this.historyService
    );
    this.debuggerService = new DebuggerService();
    this.downloadService = new DownloadService(
      this.baseWindow,
      this.browserView.webContents
    );

    this.tabService = new TabService(
      baseWindow,
      browserView,
      this.passwordManager,
      this.settingsService,
      this.historyService,
      this.navigationService,
      this.debuggerService,
      this.bookmarkService,
      this.recordingService
    );

    this.automationManager = new AutomationManager(
      this.recordingService.getRecordingStore(),
      this.browserView,
      this.tabService
    );

    this.autopilotService = new AutopilotService(
      this.tabService,
      this.browserView
    );

    this.setupTabEventListeners();
    this.setupAdBlocker();
  }

  public getTabService(): TabService {
    return this.tabService;
  }

  public async getSearchSuggestions(query: string): Promise<string[]> {
    return this.navigationService.getSearchSuggestions(query);
  }

  public async getAutocompleteSuggestions(
    query: string
  ): Promise<AutocompleteSuggestion[]> {
    return this.navigationService.getAutocompleteSuggestions(query);
  }
  public async executeIterativeAutomation(
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    return this.automationManager.executeAutomation(
      userGoal,
      recordedSessionId
    );
  }

  public stopAutomation(sessionId: string): void {
    this.automationManager.stopAutomation(sessionId);
  }

  public async executeAutopilot(
    userGoal: string,
    startUrl?: string,
    referenceRecordingId?: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    const referenceRecording = referenceRecordingId
      ? this.recordingService
          .getRecordingStore()
          .getRecording(referenceRecordingId)
      : undefined;
    const effectiveStartUrl = startUrl || referenceRecording?.startUrl;
    return this.autopilotService.executeAutopilot(
      userGoal,
      effectiveStartUrl,
      referenceRecording
    );
  }

  public async stopAutopilot(sessionId: string): Promise<void> {
    this.autopilotService.stopAutopilot(sessionId);
  }

  public getAutopilotStatus(sessionId: string): {
    exists: boolean;
    status?: string;
  } {
    return this.autopilotService.getSessionStatus(sessionId);
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

  public getDownloadService(): DownloadService {
    return this.downloadService;
  }

  public getRecordingService(): RecordingService {
    return this.recordingService;
  }

  public updateLayout(
    _windowWidth: number,
    _windowHeight: number,
    sidebarWidth = 0
  ): void {
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
    this.recordingService.destroy();
    this.automationManager.destroy();
    this.autopilotService.destroy();
    this.downloadService.destroy();
  }

  private setupTabEventListeners(): void {
    this.tabService.on('tabs:changed', () => {
      this.notifyTabsChanged();
    });

    this.tabService.on(
      'tab:reordered',
      (data: { tabId: string; from: number; to: number }) => {
        this.notifyTabReordered(data);
      }
    );
  }

  private setupAdBlocker(): void {
    const privacySettings = this.settingsService.getSetting('privacy');
    if (privacySettings.enableAdBlocker) {
      this.adBlockerService.enable();
    }

    this.settingsService.on('settings:privacy', (event) => {
      if (event.key === 'enableAdBlocker') {
        if (event.value as boolean) {
          this.adBlockerService.enable();
        } else {
          this.adBlockerService.disable();
        }
      }
    });

    // Register WebContents for cosmetic filtering when tabs are created
    this.tabService.on('tab:created', (tab) => {
      this.adBlockerService.registerWebContents(tab.view.webContents);
    });
  }

  public async notify(channel: string, data: any): Promise<void> {
    this.browserView.webContents.send(channel, data);
  }

  /**
   * Notify renderer about tab changes
   */
  private notifyTabsChanged(): void {
    if (this.baseWindow.isDestroyed()) {
      return;
    }
    const allViews = this.baseWindow.contentView.children;
    allViews.forEach((view) => {
      if (view instanceof WebContentsView && !view.webContents.isDestroyed()) {
        view.webContents.send(
          'browser:tabs-updated',
          this.tabService.getAllTabs()
        );
      }
    });
  }

  private notifyTabReordered(data: {
    tabId: string;
    from: number;
    to: number;
  }): void {
    if (this.baseWindow.isDestroyed()) {
      return;
    }
    const allViews = this.baseWindow.contentView.children;
    allViews.forEach((view) => {
      if (view instanceof WebContentsView && !view.webContents.isDestroyed()) {
        view.webContents.send('browser:tab-reordered', data);
      }
    });
  }
}
