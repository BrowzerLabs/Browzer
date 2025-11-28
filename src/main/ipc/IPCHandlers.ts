import { BaseWindow, WebContentsView, ipcMain, shell } from 'electron';
import { BrowserManager } from '@/main/BrowserManager';
import { SettingsStore } from '@/main/settings/SettingsStore';
import { PasswordManager } from '@/main/password/PasswordManager';
import { AuthService } from '@/main/auth';
import { SubscriptionService } from '@/main/subscription/SubscriptionService';
import { RecordedAction, HistoryQuery, AppSettings, SignUpCredentials, SignInCredentials, UpdateProfileRequest, AutocompleteSuggestion, AutocompleteSuggestionType } from '@/shared/types';
import { CheckoutSessionRequest, PortalSessionRequest } from '@/shared/types/subscription';
import { TabManager } from '@/main/browser';
import { EventEmitter } from 'events';

export class IPCHandlers extends EventEmitter {
  private settingsStore: SettingsStore;
  private passwordManager: PasswordManager;
  private tabManager: TabManager;
  private authService: AuthService;
  private subscriptionService: SubscriptionService;
  private baseWindow: BaseWindow;

  constructor(
    baseWindow: BaseWindow,
    private browserManager: BrowserManager,
    authService: AuthService,
  ) {
    super();
    this.baseWindow = baseWindow;
    this.tabManager = this.browserManager.getTabManager();
    this.settingsStore = new SettingsStore();
    this.passwordManager = this.browserManager.getPasswordManager();
    this.authService = authService;
    this.subscriptionService = new SubscriptionService();
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
  }

  private setupTabHandlers(): void {
    ipcMain.handle('browser:initialize', async () => {
      this.browserManager.initializeAfterAuth();
      return true;
    });

    ipcMain.handle('browser:create-tab', async (_, url?: string) => {
      const tab = this.tabManager.createTab(url);
      return tab.info;
    });

    ipcMain.handle('browser:close-tab', async (_, tabId: string) => {
      return this.tabManager.closeTab(tabId);
    });

    ipcMain.handle('browser:switch-tab', async (_, tabId: string) => {
      return this.tabManager.switchToTab(tabId);
    });

    ipcMain.handle('browser:get-tabs', async () => {
      return this.tabManager.getAllTabs();
    });
  }

  private setupNavigationHandlers(): void {
    ipcMain.handle('browser:navigate', async (_, tabId: string, url: string) => {
      return this.tabManager.navigate(tabId, url);
    });

    ipcMain.handle('browser:go-back', async (_, tabId: string) => {
      return this.tabManager.goBack(tabId);
    });

    ipcMain.handle('browser:go-forward', async (_, tabId: string) => {
      return this.tabManager.goForward(tabId);
    });

    ipcMain.handle('browser:reload', async (_, tabId: string) => {
      return this.tabManager.reload(tabId);
    });

    ipcMain.handle('browser:stop', async (_, tabId: string) => {
      return this.tabManager.stop(tabId);
    });

    ipcMain.handle('browser:can-go-back', async (_, tabId: string) => {
      return this.tabManager.canGoBack(tabId);
    });

    ipcMain.handle('browser:can-go-forward', async (_, tabId: string) => {
      return this.tabManager.canGoForward(tabId);
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
      return this.browserManager.startRecording();
    });
    ipcMain.handle('browser:stop-recording', async () => {
      return this.browserManager.stopRecording();
    });
    ipcMain.handle('browser:save-recording', async (_, name: string, description: string, actions: RecordedAction[]) => {
      return this.browserManager.saveRecording(name, description, actions);
    });
    ipcMain.handle('browser:get-all-recordings', async () => {
      return this.browserManager.getRecordingStore().getAllRecordings();
    });
    ipcMain.handle('browser:delete-recording', async (_, id: string) => {
      return this.browserManager.deleteRecording(id);
    });
    ipcMain.handle('browser:is-recording', async () => {
      return this.browserManager.isRecordingActive();
    });
    ipcMain.handle('browser:get-recorded-actions', async () => {
      return this.browserManager.getRecordedActions();
    });
    ipcMain.handle('browser:export-recording', async (_, id: string) => {
      return await this.browserManager.getRecordingStore().exportRecording(id);
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
    const historyService = this.browserManager.getHistoryService();

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
     return await this.browserManager.executeIterativeAutomation(userGoal, recordedSessionId);
    });
    ipcMain.handle('automation:stop', async (_, sessionId: string) => {
      this.browserManager.stopAutomation(sessionId);
      return { success: true };
    });
    ipcMain.handle('automation:load-session', async (_, sessionId: string) => {
      return await this.browserManager.loadAutomationSession(sessionId);
    });
    
    ipcMain.handle('automation:get-session-history', async (_, limit?: number) => {
      return await this.browserManager.getAutomationSessionHistory(limit);
    });
    
    ipcMain.handle('automation:get-sessions', async () => {
      return await this.browserManager.getAutomationSessions();
    });
    
    ipcMain.handle('automation:get-session-details', async (_, sessionId: string) => {
      return await this.browserManager.getAutomationSessionDetails(sessionId);
    });
    
    ipcMain.handle('automation:resume-session', async (_, sessionId: string) => {
      return await this.browserManager.resumeAutomationSession(sessionId);
    });
    
    ipcMain.handle('automation:delete-session', async (_, sessionId: string) => {
      return await this.browserManager.deleteAutomationSession(sessionId);
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
      this.browserManager.hideAllTabs();
      return true;
    });
    ipcMain.handle('deeplink:show-tabs', async () => {
      this.browserManager.showAllTabs();
      return true;
    });
    ipcMain.handle('deeplink:navigate-tab', async (_, url: string) => {
      this.browserManager.navigateToBrowzerURL(url);
      return true;
    });
  }

  private setupAutocompleteHandlers(): void {
    const historyService = this.browserManager.getHistoryService();
    ipcMain.handle('autocomplete:get-suggestions', async (_, query: string): Promise<AutocompleteSuggestion[]> => {
      const suggestions: AutocompleteSuggestion[] = [];
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        const mostVisited = await historyService.getMostVisited(6);
        return mostVisited.map((entry, index) => ({
          id: `history-${entry.id}`,
          type: AutocompleteSuggestionType.HISTORY,
          title: entry.title,
          url: entry.url,
          subtitle: this.extractDomain(entry.url),
          favicon: entry.favicon,
          visitCount: entry.visitCount,
          relevanceScore: 100 - index,
        }));
      }

      const isLikelyUrl = this.isLikelyUrl(trimmedQuery);

      const historySuggestions = await historyService.getAutocompleteSuggestions(trimmedQuery, 6);
      historySuggestions.forEach((entry, index) => {
        suggestions.push({
          id: `history-${entry.id}`,
          type: AutocompleteSuggestionType.HISTORY,
          title: entry.title,
          url: entry.url,
          subtitle: this.extractDomain(entry.url),
          favicon: entry.favicon,
          visitCount: entry.visitCount,
          relevanceScore: 90 - index * 10,
        });
      });

      if (!isLikelyUrl) {
        suggestions.push({
          id: 'search-google',
          type: AutocompleteSuggestionType.SEARCH,
          title: trimmedQuery,
          url: `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`,
          subtitle: 'Search Google',
          relevanceScore: 80,
        });
      }

      return suggestions
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 8);
    });

    ipcMain.handle('autocomplete:get-search-suggestions', async (_, query: string): Promise<string[]> => {
      if (!query.trim()) return [];

      try {
        const response = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
        );
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return Array.isArray(data[1]) ? data[1].slice(0, 5) : [];
      } catch (error) {
        console.error('Error fetching search suggestions:', error);
        return [];
      }
    });
  }

  private isLikelyUrl(input: string): boolean {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return true;
    }
    
    const tldPattern = /\.(com|org|net|io|dev|co|app|edu|gov|me|info|biz|tv|cc|ai|xyz)($|\/)/i;
    if (tldPattern.test(input)) {
      return true;
    }
    
    if (input.includes('.') && !input.includes(' ') && input.length > 3) {
      return true;
    }
    
    if (input.startsWith('localhost') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(input)) {
      return true;
    }
    
    return false;
  }

  private normalizeUrl(input: string): string {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return input;
    }
    
    return `https://${input}`;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
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
    ];

    handlers.forEach(channel => {
      ipcMain.removeHandler(channel);
    });

    ipcMain.removeAllListeners();
  }
}
