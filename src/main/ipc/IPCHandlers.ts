import { BaseWindow, ipcMain, shell } from 'electron';
import { BrowserService } from '@/main/BrowserService';
import { SettingsStore } from '@/main/settings/SettingsStore';
import { PasswordManager } from '@/main/password/PasswordManager';
import { AuthService } from '@/main/auth';
import { SubscriptionService } from '@/main/subscription/SubscriptionService';
import { ThemeService } from '@/main/theme';
import { RecordedAction, HistoryQuery, AppSettings, SignUpCredentials, SignInCredentials, UpdateProfileRequest, AutocompleteSuggestion } from '@/shared/types';
import { CheckoutSessionRequest, PortalSessionRequest } from '@/shared/types/subscription';
import { TabService } from '@/main/browser';
import { EventEmitter } from 'events';

export class IPCHandlers extends EventEmitter {
  private settingsStore: SettingsStore;
  private passwordManager: PasswordManager;
  private tabService: TabService;
  private authService: AuthService;
  private subscriptionService: SubscriptionService;
  private themeService: ThemeService;
  private baseWindow: BaseWindow;

  constructor(
    baseWindow: BaseWindow,
    private browserService: BrowserService,
    authService: AuthService,
  ) {
    super();
    this.baseWindow = baseWindow;
    this.tabService = this.browserService.getTabService();
    this.settingsStore = new SettingsStore();
    this.passwordManager = this.browserService.getPasswordManager();
    this.authService = authService;
    this.subscriptionService = new SubscriptionService();
    this.themeService = ThemeService.getInstance();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.setupTabHandlers();
    this.setupNavigationHandlers();
    this.setupSidebarHandlers();
    this.setupRecordingHandlers();
    this.setupSettingsHandlers();
    this.setupHistoryHandlers();
    this.setupPasswordHandlers();
    this.setupWindowHandlers();
    this.setupAutomationHandlers();
    this.setupAuthHandlers();
    this.setupSubscriptionHandlers();
    this.setupShellHandlers();
    this.setupDeepLinkHandlers();
    this.setupAutocompleteHandlers();
    this.setupThemeHandlers();
  }

  private setupTabHandlers(): void {
    ipcMain.handle('browser:initialize', async () => {
      this.browserService.initializeAfterAuth();
      return true;
    });

    ipcMain.handle('browser:create-tab', async (_, url?: string) => {
      const tab = this.tabService.createTab(url);
      return tab.info;
    });

    ipcMain.handle('browser:close-tab', async (_, tabId: string) => {
      return this.tabService.closeTab(tabId);
    });

    ipcMain.handle('browser:switch-tab', async (_, tabId: string) => {
      return this.tabService.switchToTab(tabId);
    });

    ipcMain.handle('browser:get-tabs', async () => {
      return this.tabService.getAllTabs();
    });
  }

  private setupNavigationHandlers(): void {
    ipcMain.handle('browser:navigate', async (_, tabId: string, url: string) => {
      return this.tabService.navigate(tabId, url);
    });

    ipcMain.handle('browser:go-back', async (_, tabId: string) => {
      return this.tabService.goBack(tabId);
    });

    ipcMain.handle('browser:go-forward', async (_, tabId: string) => {
      return this.tabService.goForward(tabId);
    });

    ipcMain.handle('browser:reload', async (_, tabId: string) => {
      return this.tabService.reload(tabId);
    });

    ipcMain.handle('browser:stop', async (_, tabId: string) => {
      return this.tabService.stop(tabId);
    });

    ipcMain.handle('browser:can-go-back', async (_, tabId: string) => {
      return this.tabService.canGoBack(tabId);
    });

    ipcMain.handle('browser:can-go-forward', async (_, tabId: string) => {
      return this.tabService.canGoForward(tabId);
    });
  }

  private setupSidebarHandlers(): void {
    ipcMain.handle('browser:set-sidebar-state', async (_, visible: boolean) => {
      this.emit('sidebar-state-changed', visible);
      return true;
    });
  }

  private setupRecordingHandlers(): void {
    ipcMain.handle('browser:start-recording', async () => {
      return this.browserService.startRecording();
    });
    ipcMain.handle('browser:stop-recording', async () => {
      return this.browserService.stopRecording();
    });
    ipcMain.handle('browser:save-recording', async (_, name: string, description: string, actions: RecordedAction[]) => {
      return this.browserService.saveRecording(name, description, actions);
    });
    ipcMain.handle('browser:get-all-recordings', async () => {
      return this.browserService.getRecordingStore().getAllRecordings();
    });
    ipcMain.handle('browser:delete-recording', async (_, id: string) => {
      return this.browserService.deleteRecording(id);
    });
    ipcMain.handle('browser:is-recording', async () => {
      return this.browserService.isRecordingActive();
    });
    ipcMain.handle('browser:get-recorded-actions', async () => {
      return this.browserService.getRecordedActions();
    });
    ipcMain.handle('browser:export-recording', async (_, id: string) => {
      return await this.browserService.getRecordingStore().exportRecording(id);
    });
    ipcMain.handle('video:open-file', async (_, videoPath: string) => {
      try {
        await shell.openPath(videoPath);
      } catch (error) {
        console.error('Failed to open video file:', error);
        throw error;
      }
    });
    
    ipcMain.handle('video:get-file-url', async (_, videoPath: string) => {
      try {
        return `video-file://${encodeURIComponent(videoPath)}`;
      } catch (error) {
        console.error('Failed to get video file URL:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
  }

  private setupSettingsHandlers(): void {
    ipcMain.handle('settings:get-all', async () => {
      return this.settingsStore.getAllSettings();
    });

    ipcMain.handle('settings:get-category', async (_, category: keyof AppSettings) => {
      return this.settingsStore.getSetting(category);
    });

    ipcMain.handle('settings:update', async (_, category: keyof AppSettings, key: string, value: unknown) => {
      this.settingsStore.updateSetting(category, key as never, value as never);
      return true;
    });

    ipcMain.handle('settings:update-category', async (_, category: keyof AppSettings, values: unknown) => {
      this.settingsStore.updateCategory(category, values as never);
      return true;
    });

    ipcMain.handle('settings:reset-all', async () => {
      this.settingsStore.resetToDefaults();
      return true;
    });

    ipcMain.handle('settings:reset-category', async (_, category: keyof AppSettings) => {
      this.settingsStore.resetCategory(category);
      return true;
    });

    ipcMain.handle('settings:export', async () => {
      return this.settingsStore.exportSettings();
    });

    ipcMain.handle('settings:import', async (_, jsonString: string) => {
      return this.settingsStore.importSettings(jsonString);
    });
  }

  private setupHistoryHandlers(): void {
    const historyService = this.browserService.getHistoryService();

    ipcMain.handle('history:get-all', async (_, limit?: number) => {
      return historyService.getAll(limit);
    });

    ipcMain.handle('history:search', async (_, query: HistoryQuery) => {
      return historyService.search(query);
    });

    ipcMain.handle('history:get-today', async () => {
      return historyService.getToday();
    });

    ipcMain.handle('history:get-last-n-days', async (_, days: number) => {
      return historyService.getLastNDays(days);
    });

    ipcMain.handle('history:delete-entry', async (_, id: string) => {
      return historyService.deleteEntry(id);
    });

    ipcMain.handle('history:delete-entries', async (_, ids: string[]) => {
      return historyService.deleteEntries(ids);
    });

    ipcMain.handle('history:delete-by-date-range', async (_, startTime: number, endTime: number) => {
      return historyService.deleteByDateRange(startTime, endTime);
    });

    ipcMain.handle('history:clear-all', async () => {
      return historyService.clearAll();
    });

    ipcMain.handle('history:get-stats', async () => {
      return historyService.getStats();
    });

    ipcMain.handle('history:get-most-visited', async (_, limit?: number) => {
      return historyService.getMostVisited(limit);
    });

    ipcMain.handle('history:get-recently-visited', async (_, limit?: number) => {
      return historyService.getRecentlyVisited(limit);
    });
  }

  private setupWindowHandlers(): void {
    ipcMain.handle('window:toggle-maximize', async () => {
      if (this.baseWindow.isMaximized()) {
          this.baseWindow.unmaximize();
        } else {
          this.baseWindow.maximize();
      }
    });

    ipcMain.handle('browser:bring-view-front', async () => {
      this.browserService.bringBrowserViewToFront();
      return true;
    });

    ipcMain.handle('browser:bring-view-bottom', async () => {
      this.browserService.bringBrowserViewToBottom();
      return true;
    });
  }

   private setupPasswordHandlers(): void {
    ipcMain.handle('password:get-all', async () => {
      return this.passwordManager.getAllCredentials();
    });
    ipcMain.handle('password:save', async (_, origin: string, username: string, password: string) => {
      return this.passwordManager.saveCredential(origin, username, password);
    });
    ipcMain.handle('password:get-for-origin', async (_, origin: string) => {
      return this.passwordManager.getCredentialsForOrigin(origin);
    });
    ipcMain.handle('password:get-password', async (_, credentialId: string) => {
      return this.passwordManager.getPassword(credentialId);
    });
    ipcMain.handle('password:update', async (_, credentialId: string, username: string, password: string) => {
      return this.passwordManager.updateCredential(credentialId, username, password);
    });
    ipcMain.handle('password:delete', async (_, credentialId: string) => {
      return this.passwordManager.deleteCredential(credentialId);
    });
    ipcMain.handle('password:delete-multiple', async (_, credentialIds: string[]) => {
      return this.passwordManager.deleteMultipleCredentials(credentialIds);
    });
    ipcMain.handle('password:search', async (_, query: string) => {
      return this.passwordManager.searchCredentials(query);
    });
    ipcMain.handle('password:get-blacklist', async () => {
      return this.passwordManager.getBlacklist();
    });

    ipcMain.handle('password:add-to-blacklist', async (_, origin: string) => {
      this.passwordManager.addToBlacklist(origin);
      return true;
    });
    ipcMain.handle('password:remove-from-blacklist', async (_, origin: string) => {
      this.passwordManager.removeFromBlacklist(origin);
      return true;
    });

    ipcMain.handle('password:is-blacklisted', async (_, origin: string) => {
      return this.passwordManager.isBlacklisted(origin);
    });
    ipcMain.handle('password:export', async () => {
      return this.passwordManager.exportPasswords();
    });
    ipcMain.handle('password:import', async (_, data: string) => {
      return this.passwordManager.importPasswords(data);
    });
    ipcMain.handle('password:get-stats', async () => {
      return this.passwordManager.getStats();
    });
  }

  /**
   * Automation test handlers
   */
  private setupAutomationHandlers(): void {
    ipcMain.handle('automation:execute-llm', async (_, userGoal: string, recordedSessionId: string) => {
     return await this.browserService.executeIterativeAutomation(userGoal, recordedSessionId);
    });
    ipcMain.handle('automation:stop', async (_, sessionId: string) => {
      this.browserService.stopAutomation(sessionId);
      return { success: true };
    });
    ipcMain.handle('automation:load-session', async (_, sessionId: string) => {
      return await this.browserService.loadAutomationSession(sessionId);
    });
    
    ipcMain.handle('automation:get-session-history', async (_, limit?: number) => {
      return await this.browserService.getAutomationSessionHistory(limit);
    });
    
    ipcMain.handle('automation:get-sessions', async () => {
      return await this.browserService.getAutomationSessions();
    });
    
    ipcMain.handle('automation:get-session-details', async (_, sessionId: string) => {
      return await this.browserService.getAutomationSessionDetails(sessionId);
    });
    
    ipcMain.handle('automation:resume-session', async (_, sessionId: string) => {
      return await this.browserService.resumeAutomationSession(sessionId);
    });
    
    ipcMain.handle('automation:delete-session', async (_, sessionId: string) => {
      return await this.browserService.deleteAutomationSession(sessionId);
    });
  }

  private setupAuthHandlers(): void {
    ipcMain.handle('auth:sign-up', async (_, credentials: SignUpCredentials) => {
      return this.authService.signUp(credentials);
    });
    ipcMain.handle('auth:sign-in', async (_, credentials: SignInCredentials) => {
      return this.authService.signIn(credentials);
    });
    ipcMain.handle('auth:sign-in-google', async () => {
      return this.authService.signInWithGoogle();
    });
    ipcMain.handle('auth:sign-out', async () => {
      return this.authService.signOut();
    });
    ipcMain.handle('auth:get-session', async () => {
      return this.authService.getCurrentSession();
    });
    ipcMain.handle('auth:get-user', async () => {
      return this.authService.getCurrentUser();
    });
    ipcMain.handle('auth:refresh-session', async () => {
      return this.authService.refreshSession();
    });
    ipcMain.handle('auth:update-profile', async (_, updates: UpdateProfileRequest) => {
      return this.authService.updateProfile(updates);
    });
    ipcMain.handle('auth:verify-token', async (_, tokenHash: string, type: string) => {
      return this.authService.verifyToken(tokenHash, type);
    });
    ipcMain.handle('auth:resend-confirmation', async (_, email: string) => {
      return this.authService.resendConfirmation(email);
    });
    ipcMain.handle('auth:send-password-reset', async (_, email: string) => {
      return this.authService.sendPasswordReset(email);
    });
    ipcMain.handle('auth:update-password', async (_, newPassword: string, accessToken: string) => {
      return this.authService.updatePassword(newPassword, accessToken);
    });
  }

  private setupSubscriptionHandlers(): void {
    ipcMain.handle('subscription:get-plans', async () => {
      return this.subscriptionService.getPlans();
    });

    ipcMain.handle('subscription:get-current', async () => {
      return this.subscriptionService.getCurrentSubscription();
    });

    ipcMain.handle('subscription:create-checkout', async (_, request: CheckoutSessionRequest) => {
      return this.subscriptionService.createCheckoutSession(request);
    });

    ipcMain.handle('subscription:create-portal', async (_, request: PortalSessionRequest) => {
      return this.subscriptionService.createPortalSession(request);
    });

    ipcMain.handle('subscription:use-credits', async (_, creditsToUse: number) => {
      return this.subscriptionService.useCredits(creditsToUse);
    });

    ipcMain.handle('subscription:sync', async () => {
      return this.subscriptionService.syncSubscription();
    });
    ipcMain.handle('subscription:has-credits', async (_, creditsNeeded: number) => {
      return this.subscriptionService.hasCredits(creditsNeeded);
    });

    ipcMain.handle('subscription:get-credits-remaining', async () => {
      return this.subscriptionService.getCreditsRemaining();
    });
  }

  private setupShellHandlers(): void {
    ipcMain.handle('shell:open-external', async (_, url: string) => {
      await shell.openExternal(url);
    });
  }

  private setupDeepLinkHandlers(): void {
    ipcMain.handle('deeplink:hide-tabs', async () => {
      this.browserService.hideAllTabs();
      return true;
    });
    ipcMain.handle('deeplink:show-tabs', async () => {
      this.browserService.showAllTabs();
      return true;
    });
    ipcMain.handle('deeplink:navigate-tab', async (_, url: string) => {
      this.browserService.navigateToBrowzerURL(url);
      return true;
    });
  }

  private setupAutocompleteHandlers(): void {
    ipcMain.handle('autocomplete:get-suggestions', async (_, query: string): Promise<AutocompleteSuggestion[]> => {
      return this.browserService.getAutocompleteSuggestions(query);
    });

    ipcMain.handle('autocomplete:get-search-suggestions', async (_, query: string): Promise<string[]> => {
      return this.browserService.getSearchSuggestions(query);
    });
  }

  private setupThemeHandlers(): void {
    ipcMain.handle('theme:get', async () => {
      return this.themeService.getTheme();
    });

    ipcMain.handle('theme:set', async (_, theme: 'light' | 'dark' | 'system') => {
      this.themeService.setTheme(theme);
      return true;
    });

    ipcMain.handle('theme:is-dark', async () => {
      return this.themeService.isDarkMode();
    });
  }

  public cleanup(): void {
    const handlers = [
      // Tab handlers
      'browser:initialize',
      'browser:create-tab',
      'browser:close-tab',
      'browser:switch-tab',
      'browser:get-tabs',
      // Navigation handlers
      'browser:navigate',
      'browser:go-back',
      'browser:go-forward',
      'browser:reload',
      'browser:stop',
      'browser:can-go-back',
      'browser:can-go-forward',
      // Sidebar handlers
      'browser:set-sidebar-state',
      // Recording handlers
      'browser:start-recording',
      'browser:stop-recording',
      'browser:save-recording',
      'browser:get-all-recordings',
      'browser:delete-recording',
      'browser:is-recording',
      'browser:get-recorded-actions',
      'browser:export-recording',
      'video:open-file',
      'video:get-file-url',
      // Settings handlers
      'settings:get-all',
      'settings:get-category',
      'settings:update',
      'settings:update-category',
      'settings:reset-all',
      'settings:reset-category',
      'settings:export',
      'settings:import',
      // History handlers
      'history:get-all',
      'history:search',
      'history:get-today',
      'history:get-last-n-days',
      'history:delete-entry',
      'history:delete-entries',
      'history:delete-by-date-range',
      'history:clear-all',
      'history:get-stats',
      'history:get-most-visited',
      'history:get-recently-visited',
      // Window handlers
      'window:toggle-maximize',
      'browser:bring-view-front',
      'browser:bring-view-bottom',
      // Password handlers
      'password:get-all',
      'password:save',
      'password:get-for-origin',
      'password:get-password',
      'password:update',
      'password:delete',
      'password:delete-multiple',
      'password:search',
      'password:get-blacklist',
      'password:add-to-blacklist',
      'password:remove-from-blacklist',
      'password:is-blacklisted',
      'password:export',
      'password:import',
      'password:get-stats',
      // Automation handlers
      'automation:execute-llm',
      'automation:stop',
      'automation:load-session',
      'automation:get-session-history',
      'automation:get-sessions',
      'automation:get-session-details',
      'automation:resume-session',
      'automation:delete-session',
      // Auth handlers
      'auth:sign-up',
      'auth:sign-in',
      'auth:sign-in-google',
      'auth:sign-out',
      'auth:get-session',
      'auth:get-user',
      'auth:refresh-session',
      'auth:update-profile',
      'auth:verify-token',
      'auth:resend-confirmation',
      'auth:send-password-reset',
      'auth:update-password',
      // Subscription handlers
      'subscription:get-plans',
      'subscription:get-current',
      'subscription:create-checkout',
      'subscription:create-portal',
      'subscription:use-credits',
      'subscription:sync',
      'subscription:has-credits',
      'subscription:get-credits-remaining',
      // Shell handlers
      'shell:open-external',
      // Deep link handlers
      'deeplink:hide-tabs',
      'deeplink:show-tabs',
      'deeplink:navigate-tab',
      // Autocomplete handlers
      'autocomplete:get-suggestions',
      'autocomplete:get-search-suggestions',
      // Theme handlers
      'theme:get',
      'theme:set',
      'theme:is-dark',
    ];

    handlers.forEach(channel => {
      ipcMain.removeHandler(channel);
    });

    ipcMain.removeAllListeners();
  }
}
