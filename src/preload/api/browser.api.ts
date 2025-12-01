import { desktopCapturer } from 'electron';
import type { BrowserAPI } from '@/preload/types/browser.types';
import { invoke, createEventListener, createSimpleListener } from '@/preload/utils/ipc-helpers';
import type { TabInfo, HistoryQuery, AppSettings } from '@/shared/types';

export const createBrowserAPI = (): BrowserAPI => ({
  // Initialization
  initializeBrowser: () => invoke('browser:initialize'),
  
  // Tab Management
  createTab: (url?: string) => invoke('browser:create-tab', url),
  closeTab: (tabId: string) => invoke('browser:close-tab', tabId),
  switchTab: (tabId: string) => invoke('browser:switch-tab', tabId),
  getTabs: () => invoke('browser:get-tabs'),

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

  // LLM Automation API
  executeLLMAutomation: (userGoal: string, recordedSessionId: string) =>
    invoke('automation:execute-llm', userGoal, recordedSessionId),
  
  // Session Management API
  loadAutomationSession: (sessionId: string) => invoke('automation:load-session', sessionId),
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
    createEventListener<{ tabs: TabInfo[]; activeTabId: string | null }>(
      'browser:tabs-updated', 
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

  // Event listeners - Deep Link events
  onDeepLink: (callback) => 
    createEventListener<string>('deeplink:navigate', callback),

  // Deep Link actions
  hideAllTabs: () => invoke('deeplink:hide-tabs'),
  showAllTabs: () => invoke('deeplink:show-tabs'),
  navigateToTab: (url: string) => invoke('deeplink:navigate-tab', url),
});
