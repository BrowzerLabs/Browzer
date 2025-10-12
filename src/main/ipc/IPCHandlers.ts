import { ipcMain } from 'electron';
import { BrowserManager } from '../BrowserManager';
import { LayoutManager } from '../window/LayoutManager';
import { WindowManager } from '../window/WindowManager';
import { SettingsStore, AppSettings } from '../SettingsStore';
import { UserService } from '../UserService';
import { RecordedAction, HistoryQuery, VideoRecordingMetadata } from '../../shared/types';

/**
 * IPCHandlers - Centralized IPC communication setup
 * Registers all IPC handlers for main <-> renderer communication
 */
export class IPCHandlers {
  private settingsStore: SettingsStore;
  private userService: UserService;

  constructor(
    private browserManager: BrowserManager,
    private layoutManager: LayoutManager,
    private windowManager: WindowManager
  ) {
    this.settingsStore = new SettingsStore();
    this.userService = new UserService();
    this.setupHandlers();

    console.log('IPCHandlers initialized');
  }

  private setupHandlers(): void {
    this.setupTabHandlers();
    this.setupNavigationHandlers();
    this.setupSidebarHandlers();
    this.setupRecordingHandlers();
    this.setupSettingsHandlers();
    this.setupUserHandlers();
    this.setupHistoryHandlers();
  }

  private setupTabHandlers(): void {
    ipcMain.handle('browser:create-tab', async (_, url?: string) => {
      return this.browserManager.createTab(url);
    });

    ipcMain.handle('browser:close-tab', async (_, tabId: string) => {
      return this.browserManager.closeTab(tabId);
    });

    ipcMain.handle('browser:switch-tab', async (_, tabId: string) => {
      return this.browserManager.switchToTab(tabId);
    });

    ipcMain.handle('browser:get-tabs', async () => {
      return this.browserManager.getAllTabs();
    });
  }

  private setupNavigationHandlers(): void {
    ipcMain.handle('browser:navigate', async (_, tabId: string, url: string) => {
      return this.browserManager.navigate(tabId, url);
    });

    ipcMain.handle('browser:go-back', async (_, tabId: string) => {
      return this.browserManager.goBack(tabId);
    });

    ipcMain.handle('browser:go-forward', async (_, tabId: string) => {
      return this.browserManager.goForward(tabId);
    });

    ipcMain.handle('browser:reload', async (_, tabId: string) => {
      return this.browserManager.reload(tabId);
    });

    ipcMain.handle('browser:stop', async (_, tabId: string) => {
      return this.browserManager.stop(tabId);
    });

    ipcMain.handle('browser:can-go-back', async (_, tabId: string) => {
      return this.browserManager.canGoBack(tabId);
    });

    ipcMain.handle('browser:can-go-forward', async (_, tabId: string) => {
      return this.browserManager.canGoForward(tabId);
    });
  }

  private setupSidebarHandlers(): void {
    ipcMain.handle('browser:set-sidebar-state', async (_, visible: boolean, widthPercent: number) => {
      this.layoutManager.setSidebarState(visible, widthPercent);
      this.updateLayout();
      return true;
    });
  }

  private setupRecordingHandlers(): void {
    // Start recording with optional video
    ipcMain.handle('browser:start-recording', async (_, enableVideo = true) => {
      return this.browserManager.startRecording(enableVideo);
    });

    // Stop recording - returns actions and video metadata
    ipcMain.handle('browser:stop-recording', async () => {
      return this.browserManager.stopRecording();
    });

    // Save recording with video metadata
    ipcMain.handle('browser:save-recording', async (_, name: string, description: string, actions: RecordedAction[], video?: VideoRecordingMetadata) => {
      return this.browserManager.saveRecording(name, description, actions, video);
    });

    // Get all recordings (includes video metadata)
    ipcMain.handle('browser:get-all-recordings', async () => {
      return this.browserManager.getAllRecordings();
    });

    // Delete recording (includes video file)
    ipcMain.handle('browser:delete-recording', async (_, id: string) => {
      return this.browserManager.deleteRecording(id);
    });

    // Check if recording is active
    ipcMain.handle('browser:is-recording', async () => {
      return this.browserManager.isRecordingActive();
    });

    // Get recorded actions
    ipcMain.handle('browser:get-recorded-actions', async () => {
      return this.browserManager.getRecordedActions();
    });

    // Discard current recording (clear state without saving)
    ipcMain.handle('browser:discard-recording', async () => {
      return this.browserManager.clearRecordingState();
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

  private setupUserHandlers(): void {
    ipcMain.handle('user:get-current', async () => {
      return this.userService.getCurrentUser();
    });

    ipcMain.handle('user:is-authenticated', async () => {
      return this.userService.isAuthenticated();
    });

    ipcMain.handle('user:sign-in', async (_, email: string, password?: string) => {
      return this.userService.signIn(email, password);
    });

    ipcMain.handle('user:sign-out', async () => {
      return this.userService.signOut();
    });

    ipcMain.handle('user:create', async (_, data: { email: string; name: string; password?: string }) => {
      return this.userService.createUser(data);
    });

    ipcMain.handle('user:update-profile', async (_, updates: Parameters<typeof this.userService.updateProfile>[0]) => {
      return this.userService.updateProfile(updates);
    });

    ipcMain.handle('user:update-preferences', async (_, preferences: Parameters<typeof this.userService.updatePreferences>[0]) => {
      return this.userService.updatePreferences(preferences);
    });

    ipcMain.handle('user:delete-account', async () => {
      return this.userService.deleteAccount();
    });

    ipcMain.handle('user:create-guest', async () => {
      return this.userService.createGuestUser();
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

  private updateLayout(): void {
    const agentUIView = this.windowManager.getAgentUIView();
    const baseWindow = this.windowManager.getWindow();
    
    if (!baseWindow) return;

    const bounds = baseWindow.getBounds();
    const sidebarState = this.layoutManager.getSidebarState();
    const sidebarWidth = sidebarState.visible 
      ? Math.floor(bounds.width * (sidebarState.widthPercent / 100))
      : 0;

    if (agentUIView) {
      const agentUIBounds = this.layoutManager.calculateAgentUIBounds();
      agentUIView.setBounds(agentUIBounds);
    }
    
    this.browserManager.updateLayout(bounds.width, bounds.height, sidebarWidth);
  }

  public cleanup(): void {
    ipcMain.removeAllListeners('browser:create-tab');
    ipcMain.removeAllListeners('browser:close-tab');
    ipcMain.removeAllListeners('browser:switch-tab');
    ipcMain.removeAllListeners('browser:get-tabs');
    ipcMain.removeAllListeners('browser:navigate');
    ipcMain.removeAllListeners('browser:go-back');
    ipcMain.removeAllListeners('browser:go-forward');
    ipcMain.removeAllListeners('browser:reload');
    ipcMain.removeAllListeners('browser:stop');
    ipcMain.removeAllListeners('browser:can-go-back');
    ipcMain.removeAllListeners('browser:can-go-forward');
    ipcMain.removeAllListeners('browser:set-sidebar-state');
    ipcMain.removeAllListeners('browser:start-recording');
    ipcMain.removeAllListeners('browser:stop-recording');
    ipcMain.removeAllListeners('browser:save-recording');
    ipcMain.removeAllListeners('browser:get-all-recordings');
    ipcMain.removeAllListeners('browser:delete-recording');
    ipcMain.removeAllListeners('browser:is-recording');
    ipcMain.removeAllListeners('browser:get-recorded-actions');
    ipcMain.removeAllListeners('settings:get-all');
    ipcMain.removeAllListeners('settings:get-category');
    ipcMain.removeAllListeners('settings:update');
    ipcMain.removeAllListeners('settings:update-category');
    ipcMain.removeAllListeners('settings:reset-all');
    ipcMain.removeAllListeners('settings:reset-category');
    ipcMain.removeAllListeners('settings:export');
    ipcMain.removeAllListeners('settings:import');
    ipcMain.removeAllListeners('user:get-current');
    ipcMain.removeAllListeners('user:is-authenticated');
    ipcMain.removeAllListeners('user:sign-in');
    ipcMain.removeAllListeners('user:sign-out');
    ipcMain.removeAllListeners('user:create');
    ipcMain.removeAllListeners('user:update-profile');
    ipcMain.removeAllListeners('user:update-preferences');
    ipcMain.removeAllListeners('user:delete-account');
    ipcMain.removeAllListeners('user:create-guest');
    ipcMain.removeAllListeners('history:get-all');
    ipcMain.removeAllListeners('history:search');
    ipcMain.removeAllListeners('history:get-today');
    ipcMain.removeAllListeners('history:get-last-n-days');
    ipcMain.removeAllListeners('history:delete-entry');
    ipcMain.removeAllListeners('history:delete-entries');
    ipcMain.removeAllListeners('history:delete-by-date-range');
    ipcMain.removeAllListeners('history:clear-all');
    ipcMain.removeAllListeners('history:get-stats');
    ipcMain.removeAllListeners('history:get-most-visited');
    ipcMain.removeAllListeners('history:get-recently-visited');
  }
}
