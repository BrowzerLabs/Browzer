import type { TabInfo, HistoryEntry, HistoryQuery, HistoryStats, AppSettings, AutocompleteSuggestion, DownloadItem, DownloadUpdatePayload, Bookmark, BookmarkFolder, BookmarkTreeNode, CreateBookmarkParams, CreateFolderParams, UpdateBookmarkParams, MoveBookmarkParams } from '@/shared/types';

export interface BrowserAPI {
  // Initialization
  initializeBrowser: () => Promise<boolean>;
  
  // Tab Management
  createTab: (url?: string) => Promise<TabInfo>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  getTabs: () => Promise<{ tabs: TabInfo[]; activeTabId: string | null }>;

  // Navigation
  navigate: (tabId: string, url: string) => Promise<boolean>;
  goBack: (tabId: string) => Promise<boolean>;
  goForward: (tabId: string) => Promise<boolean>;
  reload: (tabId: string) => Promise<boolean>;
  stop: (tabId: string) => Promise<boolean>;

  // State queries
  canGoBack: (tabId: string) => Promise<boolean>;
  canGoForward: (tabId: string) => Promise<boolean>;

  // Sidebar Management
  setSidebarState: (visible: boolean) => Promise<boolean>;
  
  // Window Management
  toggleMaximize: () => Promise<void>;
  bringBrowserViewToFront: () => Promise<boolean>;
  bringBrowserViewToBottom: () => Promise<boolean>;
  
  // Desktop Capturer (for video recording)
  getDesktopSources: () => Promise<Array<{ id: string; name: string; thumbnail: any }>>;

  // Recording Management
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<{ actions: any[]; duration: number; startUrl: string }>;
  saveRecording: (name: string, description: string, actions: any[]) => Promise<string>;
  getAllRecordings: () => Promise<any[]>;
  deleteRecording: (id: string) => Promise<boolean>;
  isRecording: () => Promise<boolean>;
  getRecordedActions: () => Promise<any[]>;
  exportRecording: (id: string) => Promise<{ success: boolean; filePath?: string; error?: string; cancelled?: boolean }>;
  
  // Video File Operations
  openVideoFile: (videoPath: string) => Promise<void>;
  getVideoFileUrl: (videoPath: string) => Promise<string>;

  // Password Management
  getAllPasswords: () => Promise<any[]>;
  savePassword: (origin: string, username: string, password: string) => Promise<boolean>;
  getPasswordsForOrigin: (origin: string) => Promise<any[]>;
  getPassword: (credentialId: string) => Promise<string | null>;
  updatePassword: (credentialId: string, username: string, password: string) => Promise<boolean>;
  deletePassword: (credentialId: string) => Promise<boolean>;
  deleteMultiplePasswords: (credentialIds: string[]) => Promise<boolean>;
  searchPasswords: (query: string) => Promise<any[]>;
  getPasswordBlacklist: () => Promise<string[]>;
  neverSaveForSite: (origin: string) => Promise<boolean>;
  removeFromBlacklist: (origin: string) => Promise<boolean>;
  isSiteBlacklisted: (origin: string) => Promise<boolean>;
  exportPasswords: () => Promise<{ credentials: any[]; blacklist: string[] }>;
  importPasswords: (data: string) => Promise<{ success: boolean; imported: number; errors: number }>;
  getPasswordStats: () => Promise<{ totalPasswords: number; blacklistedSites: number; mostUsedSites: Array<{ origin: string; count: number }> }>;

  // Settings Management
  getAllSettings: () => Promise<AppSettings>;
  getSettingsCategory: (category: keyof AppSettings) => Promise<any>;
  updateSetting: (category: keyof AppSettings, key: string, value: any) => Promise<boolean>;
  updateSettingsCategory: (category: keyof AppSettings, values: any) => Promise<boolean>;
  resetAllSettings: () => Promise<boolean>;
  resetSettingsCategory: (category: keyof AppSettings) => Promise<boolean>;
  exportSettings: () => Promise<string>;
  importSettings: (jsonString: string) => Promise<boolean>;

  // History Management
  getAllHistory: (limit?: number) => Promise<HistoryEntry[]>;
  searchHistory: (query: HistoryQuery) => Promise<HistoryEntry[]>;
  getTodayHistory: () => Promise<HistoryEntry[]>;
  getLastNDaysHistory: (days: number) => Promise<HistoryEntry[]>;
  deleteHistoryEntry: (id: string) => Promise<boolean>;
  deleteHistoryEntries: (ids: string[]) => Promise<number>;
  deleteHistoryByDateRange: (startTime: number, endTime: number) => Promise<number>;
  clearAllHistory: () => Promise<boolean>;
  getHistoryStats: () => Promise<HistoryStats>;
  getMostVisited: (limit?: number) => Promise<HistoryEntry[]>;
  getRecentlyVisited: (limit?: number) => Promise<HistoryEntry[]>;

  // Autocomplete
  getAutocompleteSuggestions: (query: string) => Promise<AutocompleteSuggestion[]>;
  getSearchSuggestions: (query: string) => Promise<string[]>;

  // LLM Automation
  executeLLMAutomation: (userGoal: string, recordedSessionId: string) => Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }>;
  
  // Session Management
  loadAutomationSession: (sessionId: string) => Promise<any>;
  getAutomationSessionHistory: (limit?: number) => Promise<any[]>;
  getAutomationSessions: () => Promise<any[]>;
  getAutomationSessionDetails: (sessionId: string) => Promise<any>;
  resumeAutomationSession: (sessionId: string) => Promise<any>;
  deleteAutomationSession: (sessionId: string) => Promise<boolean>;
  stopAutomation: (sessionId: string) => Promise<{ success: boolean }>;

  // Event listeners
  onTabsUpdated: (callback: (data: { tabs: TabInfo[]; activeTabId: string | null }) => void) => () => void;
  onRecordingAction: (callback: (action: any) => void) => () => void;
  onRecordingStarted: (callback: () => void) => () => void;
  onRecordingStopped: (callback: (data: { actions: any[]; duration: number; startUrl: string }) => void) => () => void;
  onRecordingSaved: (callback: (session: any) => void) => () => void;
  onRecordingDeleted: (callback: (id: string) => void) => () => void;
  onRecordingMaxActionsReached: (callback: () => void) => () => void;
  
  // Automation event listeners
  onAutomationProgress: (callback: (data: { sessionId: string; event: any }) => void) => () => void;
  onAutomationComplete: (callback: (data: { sessionId: string; result: any }) => void) => () => void;
  onAutomationError: (callback: (data: { sessionId: string; error: string }) => void) => () => void;
  
  // Download event listeners
  onDownloadsUpdated: (callback: (data: DownloadUpdatePayload) => void) => () => void;

  // Deep Link event listeners
  onDeepLink: (callback: (path: string) => void) => () => void;
  
  // Deep Link actions
  hideAllTabs: () => Promise<boolean>;
  showAllTabs: () => Promise<boolean>;
  navigateToTab: (url: string) => Promise<boolean>;

  // Theme actions
  getTheme: () => Promise<'light' | 'dark' | 'system'>;
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<boolean>;
  isDarkMode: () => Promise<boolean>;

  // Download actions
  getDownloads: () => Promise<DownloadItem[]>;
  pauseDownload: (id: string) => Promise<boolean>,
  resumeDownload: (id: string) => Promise<boolean>,
  cancelDownload: (id: string) => Promise<boolean>,
  retryDownload: (id: string) => Promise<boolean>,
  removeDownload: (id: string) => Promise<boolean>,
  openDownload: (id: string) => Promise<boolean>,
  showDownloadInFolder: (id: string) => Promise<boolean>,


  // Bookmark Management
  createBookmark: (params: CreateBookmarkParams) => Promise<Bookmark>;
  createBookmarkFolder: (params: CreateFolderParams) => Promise<BookmarkFolder>;
  getBookmark: (id: string) => Promise<BookmarkTreeNode | null>;
  getBookmarkByUrl: (url: string) => Promise<Bookmark | null>;
  isBookmarked: (url: string) => Promise<boolean>;
  getBookmarkChildren: (parentId: string) => Promise<BookmarkTreeNode[]>;
  getBookmarkTree: () => Promise<BookmarkTreeNode[]>;
  getBookmarkBar: () => Promise<BookmarkTreeNode[]>;
  updateBookmark: (params: UpdateBookmarkParams) => Promise<boolean>;
  moveBookmark: (params: MoveBookmarkParams) => Promise<boolean>;
  deleteBookmark: (id: string) => Promise<boolean>;
  searchBookmarks: (query: string, limit?: number) => Promise<Bookmark[]>;
  getAllBookmarks: () => Promise<Bookmark[]>;
  getRecentBookmarks: (limit?: number) => Promise<Bookmark[]>;
}
