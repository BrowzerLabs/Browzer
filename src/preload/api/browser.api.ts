import { desktopCapturer } from 'electron';
import type { BrowserAPI } from '@/preload/types/browser.types';
import { invoke, createEventListener, createSimpleListener, createMultiArgListener } from '@/preload/utils/ipc-helpers';
import type { TabGroup, TabInfo, TabsSnapshot, HistoryQuery, AppSettings, DownloadUpdatePayload, CreateBookmarkParams, CreateFolderParams, UpdateBookmarkParams, MoveBookmarkParams } from '@/shared/types';

export const createBrowserAPI = (): BrowserAPI => ({
  // Initialization
  initializeBrowser: () => invoke('browser:initialize'),
  
  // Tab Management
  createTab: (url?: string) => invoke('browser:create-tab', url),
  closeTab: (tabId: string) => invoke('browser:close-tab', tabId),
  restoreClosedTab: () => invoke('browser:restore-closed-tab'),
  switchTab: (tabId: string) => invoke('browser:switch-tab', tabId),
  getTabs: () => invoke('browser:get-tabs'),
  reorderTab: (tabId: string, newIndex: number) => invoke('browser:reorder-tab', tabId, newIndex),
  createTabGroup: (name?: string, color?: string) => invoke('browser:create-tab-group', name, color),
  updateTabGroup: (groupId: string, name?: string, color?: string) => invoke('browser:update-tab-group', groupId, name, color),
  assignTabGroup: (tabId: string, groupId: string | null) => invoke('browser:assign-tab-group', tabId, groupId),
  removeTabGroup: (groupId: string) => invoke('browser:remove-tab-group', groupId),
  getTabGroups: () => invoke('browser:get-tab-groups'),
  toggleTabGroupCollapse: (groupId: string) => invoke('browser:toggle-tab-group-collapse', groupId),

  // Navigation
  navigate: (tabId: string, url: string) => invoke('browser:navigate', tabId, url),
  goBack: (tabId: string) => invoke('browser:go-back', tabId),
  goForward: (tabId: string) => invoke('browser:go-forward', tabId),
  reload: (tabId: string) => invoke('browser:reload', tabId),
  stop: (tabId: string) => invoke('browser:stop', tabId),

  // State queries
  canGoBack: (tabId: string) => invoke('browser:can-go-back', tabId),
  canGoForward: (tabId: string) => invoke('browser:can-go-forward', tabId),

  // Sidebar Management
  setSidebarState: (visible: boolean) => 
    invoke('browser:set-sidebar-state', visible),

  // Window Management
  toggleMaximize: () => invoke('window:toggle-maximize'),
  isFullScreen: () => invoke('window:is-fullscreen'),
  onFullScreenChanged: (callback) =>
    createEventListener<boolean>('window:fullscreen-changed', callback),
  bringBrowserViewToFront: () => invoke('browser:bring-view-front'),
  bringBrowserViewToBottom: () => invoke('browser:bring-view-bottom'),


  getDownloads: () => invoke('download:get-all'),
  pauseDownload: (id: string) => invoke('download:pause', id),
  resumeDownload: (id: string) => invoke('download:resume', id),
  cancelDownload: (id: string) => invoke('download:cancel', id),
  retryDownload: (id: string) => invoke('download:retry', id),
  removeDownload: (id: string) => invoke('download:remove', id),
  openDownload: (id: string) => invoke('download:open', id),
  showDownloadInFolder: (id: string) => invoke('download:show-in-folder', id),

  // Recording Management
  startRecording: () => invoke('browser:start-recording'),
  stopRecording: () => invoke('browser:stop-recording'),
  saveRecording: (name: string, description: string, actions: any[]) => 
    invoke('browser:save-recording', name, description, actions),
  getAllRecordings: () => invoke('browser:get-all-recordings'),
  deleteRecording: (id: string) => invoke('browser:delete-recording', id),
  isRecording: () => invoke('browser:is-recording'),
  getRecordedActions: () => invoke('browser:get-recorded-actions'),
  exportRecording: (id: string) => invoke('browser:export-recording', id),

  // Desktop Capturer API
  getDesktopSources: async () => {
    const sources = await desktopCapturer.getSources({ 
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  },
  
  // Video File Operations
  openVideoFile: (videoPath: string) => invoke('video:open-file', videoPath),
  getVideoFileUrl: (videoPath: string) => invoke('video:get-file-url', videoPath),

  // Password Management API
  getAllPasswords: () => invoke('password:get-all'),
  savePassword: (origin: string, username: string, password: string) => 
    invoke('password:save', origin, username, password),
  getPasswordsForOrigin: (origin: string) => invoke('password:get-for-origin', origin),
  getPassword: (credentialId: string) => invoke('password:get-password', credentialId),
  updatePassword: (credentialId: string, username: string, password: string) => 
    invoke('password:update', credentialId, username, password),
  deletePassword: (credentialId: string) => invoke('password:delete', credentialId),
  deleteMultiplePasswords: (credentialIds: string[]) => 
    invoke('password:delete-multiple', credentialIds),
  searchPasswords: (query: string) => invoke('password:search', query),
  getPasswordBlacklist: () => invoke('password:get-blacklist'),
  neverSaveForSite: (origin: string) => invoke('password:add-to-blacklist', origin),
  removeFromBlacklist: (origin: string) => invoke('password:remove-from-blacklist', origin),
  isSiteBlacklisted: (origin: string) => invoke('password:is-blacklisted', origin),
  exportPasswords: () => invoke('password:export'),
  importPasswords: (data: string) => invoke('password:import', data),
  getPasswordStats: () => invoke('password:get-stats'),

  // Settings API
  getAllSettings: () => invoke('settings:get-all'),
  getSettingsCategory: (category: keyof AppSettings) => invoke('settings:get-category', category),
  updateSetting: (category: keyof AppSettings, key: string, value: any) => 
    invoke('settings:update', category, key, value),
  updateSettingsCategory: (category: keyof AppSettings, values: any) => 
    invoke('settings:update-category', category, values),
  resetAllSettings: () => invoke('settings:reset-all'),
  resetSettingsCategory: (category: keyof AppSettings) => 
    invoke('settings:reset-category', category),
  exportSettings: () => invoke('settings:export'),
  importSettings: (jsonString: string) => invoke('settings:import', jsonString),

  // History API
  getAllHistory: (limit?: number) => invoke('history:get-all', limit),
  searchHistory: (query: HistoryQuery) => invoke('history:search', query),
  getTodayHistory: () => invoke('history:get-today'),
  getLastNDaysHistory: (days: number) => invoke('history:get-last-n-days', days),
  deleteHistoryEntry: (id: string) => invoke('history:delete-entry', id),
  deleteHistoryEntries: (ids: string[]) => invoke('history:delete-entries', ids),
  deleteHistoryByDateRange: (startTime: number, endTime: number) => 
    invoke('history:delete-by-date-range', startTime, endTime),
  clearAllHistory: () => invoke('history:clear-all'),
  getHistoryStats: () => invoke('history:get-stats'),
  getMostVisited: (limit?: number) => invoke('history:get-most-visited', limit),
  getRecentlyVisited: (limit?: number) => invoke('history:get-recently-visited', limit),

  // Autocomplete API
  getAutocompleteSuggestions: (query: string) => invoke('autocomplete:get-suggestions', query),
  getSearchSuggestions: (query: string) => invoke('autocomplete:get-search-suggestions', query),

  // Find in Page
  findInPage: (tabId: string, text: string, options?: any) => invoke('browser:find-in-page', tabId, text, options),
  stopFindInPage: (tabId: string, action: 'clearSelection' | 'keepSelection' | 'activateSelection') => invoke('browser:stop-find-in-page', tabId, action),
  onFoundInPage: (callback) => createMultiArgListener('browser:found-in-page', callback),
  onRequestFind: (callback) => createSimpleListener('browser:request-find', callback),

  // LLM Automation API
  executeLLMAutomation: (userGoal: string, recordedSessionId: string) =>
    invoke('automation:execute-llm', userGoal, recordedSessionId),
  
  // Session Management API
  loadAutomationSession: (sessionId: string) => invoke('automation:load-session', sessionId),
  
  checkRestoreSession: () => invoke('browser:check-restore-session'),
  restoreSession: () => invoke('browser:restore-session'),
  discardSession: () => invoke('browser:discard-session'),

  getAutomationSessionHistory: (limit?: number) =>  
    invoke('automation:get-session-history', limit),
  getAutomationSessions: () => invoke('automation:get-sessions'),
  getAutomationSessionDetails: (sessionId: string) => 
    invoke('automation:get-session-details', sessionId),
  resumeAutomationSession: (sessionId: string) => 
    invoke('automation:resume-session', sessionId),
  deleteAutomationSession: (sessionId: string) => 
    invoke('automation:delete-session', sessionId),
  stopAutomation: (sessionId: string) => 
    invoke('automation:stop', sessionId),

  // Event listeners - Tab events
  onTabsUpdated: (callback) => 
    createEventListener<TabsSnapshot>(
      'browser:tabs-updated', 
      callback
    ),
  onTabReordered: (callback) => 
    createEventListener<{ tabId: string; from: number; to: number }>(
      'browser:tab-reordered',
      callback
    ),

  // Event listeners - Recording events
  onRecordingAction: (callback) => 
    createEventListener('recording:action-captured', callback),
  onRecordingStarted: (callback) => 
    createSimpleListener('recording:started', callback),
  onRecordingStopped: (callback) => 
    createEventListener('recording:stopped', callback),
  onRecordingSaved: (callback) => 
    createEventListener('recording:saved', callback),
  onRecordingDeleted: (callback) => 
    createEventListener('recording:deleted', callback),
  onRecordingMaxActionsReached: (callback) => 
    createSimpleListener('recording:max-actions-reached', callback),

  // Event listeners - Automation events
  onAutomationProgress: (callback) => 
    createEventListener('automation:progress', callback),
  onAutomationComplete: (callback) => 
    createEventListener('automation:complete', callback),
  onAutomationError: (callback) => 
    createEventListener('automation:error', callback),

  // Event listeners - Download events
  onDownloadsUpdated: (callback) =>
    createEventListener<DownloadUpdatePayload>('downloads:updated', callback),

  // Event listeners - Deep Link events
  onDeepLink: (callback) => 
    createEventListener<string>('deeplink:navigate', callback),

  // Event listeners - Address Bar focus
  onRequestAddressBarFocus: (callback) => 
    createSimpleListener('request-address-bar-focus', callback),

  // Event listeners - Bookmark events
  onBookmarkChanged: (callback) =>
    createSimpleListener('bookmark:changed', callback),

  // Event listeners - Settings events
  onSettingsChanged: (callback) =>
    createEventListener<{ category: string; key: string; value: unknown }>(
      'settings:changed',
      callback
    ),

  // Deep Link actions
  hideAllTabs: () => invoke('deeplink:hide-tabs'),
  showAllTabs: () => invoke('deeplink:show-tabs'),
  navigateToTab: (url: string) => invoke('deeplink:navigate-tab', url),

  getTheme: () => invoke('theme:get'),
  setTheme: (theme: 'light' | 'dark' | 'system') => invoke('theme:set', theme),
  isDarkMode: () => invoke('theme:is-dark'),

  // Bookmark Management API
  createBookmark: (params: CreateBookmarkParams) => invoke('bookmark:create', params),
  createBookmarkFolder: (params: CreateFolderParams) => invoke('bookmark:create-folder', params),
  getBookmark: (id: string) => invoke('bookmark:get', id),
  getBookmarkByUrl: (url: string) => invoke('bookmark:get-by-url', url),
  isBookmarked: (url: string) => invoke('bookmark:is-bookmarked', url),
  getBookmarkChildren: (parentId: string) => invoke('bookmark:get-children', parentId),
  getBookmarkTree: () => invoke('bookmark:get-tree'),
  getBookmarkBar: () => invoke('bookmark:get-bar'),
  updateBookmark: (params: UpdateBookmarkParams) => invoke('bookmark:update', params),
  moveBookmark: (params: MoveBookmarkParams) => invoke('bookmark:move', params),
  deleteBookmark: (id: string) => invoke('bookmark:delete', id),
  searchBookmarks: (query: string, limit?: number) => invoke('bookmark:search', query, limit),
  getAllBookmarks: () => invoke('bookmark:get-all'),
  getRecentBookmarks: (limit?: number) => invoke('bookmark:get-recent', limit),
});
