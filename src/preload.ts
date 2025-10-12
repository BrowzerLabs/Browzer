/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer } from 'electron';
import type { TabInfo } from './main/BrowserManager';
import type { AppSettings } from './main/SettingsStore';
import { User, UserPreferences, HistoryEntry, HistoryQuery, HistoryStats, RecordingSession, RecordedAction, VideoRecordingMetadata } from './shared/types';

/**
 * Preload script for Agent UI (Browser Chrome)
 * 
 * Exposes safe APIs to the renderer process for browser control
 */

export type { TabInfo, AppSettings };

export interface BrowserAPI {
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
  setSidebarState: (visible: boolean, widthPercent: number) => Promise<boolean>;

  // Recording Management
  startRecording: (enableVideo?: boolean) => Promise<boolean>;
  stopRecording: () => Promise<{ actions: RecordedAction[]; video?: VideoRecordingMetadata; duration: number; startUrl: string }>;
  saveRecording: (name: string, description: string, actions: RecordedAction[], video?: VideoRecordingMetadata) => Promise<string>;
  getAllRecordings: () => Promise<RecordingSession[]>;
  deleteRecording: (id: string) => Promise<boolean>;
  isRecording: () => Promise<boolean>;
  getRecordedActions: () => Promise<RecordedAction[]>;
  discardRecording: () => Promise<void>;

  // Settings Management
  getAllSettings: () => Promise<AppSettings>;
  getSettingsCategory: (category: keyof AppSettings) => Promise<any>;
  updateSetting: (category: keyof AppSettings, key: string, value: any) => Promise<boolean>;
  updateSettingsCategory: (category: keyof AppSettings, values: any) => Promise<boolean>;
  resetAllSettings: () => Promise<boolean>;
  resetSettingsCategory: (category: keyof AppSettings) => Promise<boolean>;
  exportSettings: () => Promise<string>;
  importSettings: (jsonString: string) => Promise<boolean>;

  // User Management
  getCurrentUser: () => Promise<User | null>;
  isAuthenticated: () => Promise<boolean>;
  signIn: (email: string, password?: string) => Promise<User>;
  signOut: () => Promise<void>;
  createUser: (data: { email: string; name: string; password?: string }) => Promise<User>;
  updateProfile: (updates: any) => Promise<User>;
  updateUserPreferences: (preferences: UserPreferences) => Promise<User>;
  deleteAccount: () => Promise<void>;
  createGuestUser: () => Promise<User>;

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

  // Event listeners
  onTabsUpdated: (callback: (data: { tabs: TabInfo[]; activeTabId: string | null }) => void) => () => void;
  onRecordingAction: (callback: (action: any) => void) => () => void;
  onRecordingStarted: (callback: () => void) => () => void;
  onRecordingStopped: (callback: (data: { actions: any[]; duration: number; startUrl: string }) => void) => () => void;
  onRecordingSaved: (callback: (session: any) => void) => () => void;
  onRecordingDeleted: (callback: (id: string) => void) => () => void;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const browserAPI: BrowserAPI = {
  createTab: (url?: string) => ipcRenderer.invoke('browser:create-tab', url),
  closeTab: (tabId: string) => ipcRenderer.invoke('browser:close-tab', tabId),
  switchTab: (tabId: string) => ipcRenderer.invoke('browser:switch-tab', tabId),
  getTabs: () => ipcRenderer.invoke('browser:get-tabs'),

  navigate: (tabId: string, url: string) => ipcRenderer.invoke('browser:navigate', tabId, url),
  goBack: (tabId: string) => ipcRenderer.invoke('browser:go-back', tabId),
  goForward: (tabId: string) => ipcRenderer.invoke('browser:go-forward', tabId),
  reload: (tabId: string) => ipcRenderer.invoke('browser:reload', tabId),
  stop: (tabId: string) => ipcRenderer.invoke('browser:stop', tabId),

  canGoBack: (tabId: string) => ipcRenderer.invoke('browser:can-go-back', tabId),
  canGoForward: (tabId: string) => ipcRenderer.invoke('browser:can-go-forward', tabId),

  setSidebarState: (visible: boolean, widthPercent: number) => 
    ipcRenderer.invoke('browser:set-sidebar-state', visible, widthPercent),

  startRecording: (enableVideo?: boolean) => ipcRenderer.invoke('browser:start-recording', enableVideo),
  stopRecording: () => ipcRenderer.invoke('browser:stop-recording'),
  saveRecording: (name: string, description: string, actions: RecordedAction[], video?: VideoRecordingMetadata) => 
    ipcRenderer.invoke('browser:save-recording', name, description, actions, video),
  getAllRecordings: () => ipcRenderer.invoke('browser:get-all-recordings'),
  deleteRecording: (id: string) => ipcRenderer.invoke('browser:delete-recording', id),
  isRecording: () => ipcRenderer.invoke('browser:is-recording'),
  getRecordedActions: () => ipcRenderer.invoke('browser:get-recorded-actions'),
  discardRecording: () => ipcRenderer.invoke('browser:discard-recording'),

  onTabsUpdated: (callback) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: { tabs: TabInfo[]; activeTabId: string | null }) => callback(data);
    ipcRenderer.on('browser:tabs-updated', subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('browser:tabs-updated', subscription);
    };
  },

  onRecordingAction: (callback) => {
    const subscription = (_event: Electron.IpcRendererEvent, action: any) => callback(action);
    ipcRenderer.on('recording:action-captured', subscription);
    return () => ipcRenderer.removeListener('recording:action-captured', subscription);
  },

  onRecordingStarted: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('recording:started', subscription);
    return () => ipcRenderer.removeListener('recording:started', subscription);
  },

  onRecordingStopped: (callback) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('recording:stopped', subscription);
    return () => ipcRenderer.removeListener('recording:stopped', subscription);
  },

  onRecordingSaved: (callback) => {
    const subscription = (_event: Electron.IpcRendererEvent, session: any) => callback(session);
    ipcRenderer.on('recording:saved', subscription);
    return () => ipcRenderer.removeListener('recording:saved', subscription);
  },

  onRecordingDeleted: (callback) => {
    const subscription = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on('recording:deleted', subscription);
    return () => ipcRenderer.removeListener('recording:deleted', subscription);
  },

  // Settings API
  getAllSettings: () => ipcRenderer.invoke('settings:get-all'),
  getSettingsCategory: (category: keyof AppSettings) => ipcRenderer.invoke('settings:get-category', category),
  updateSetting: (category: keyof AppSettings, key: string, value: any) => 
    ipcRenderer.invoke('settings:update', category, key, value),
  updateSettingsCategory: (category: keyof AppSettings, values: any) => 
    ipcRenderer.invoke('settings:update-category', category, values),
  resetAllSettings: () => ipcRenderer.invoke('settings:reset-all'),
  resetSettingsCategory: (category: keyof AppSettings) => 
    ipcRenderer.invoke('settings:reset-category', category),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: (jsonString: string) => ipcRenderer.invoke('settings:import', jsonString),

  // User API
  getCurrentUser: () => ipcRenderer.invoke('user:get-current'),
  isAuthenticated: () => ipcRenderer.invoke('user:is-authenticated'),
  signIn: (email: string, password?: string) => ipcRenderer.invoke('user:sign-in', email, password),
  signOut: () => ipcRenderer.invoke('user:sign-out'),
  createUser: (data: { email: string; name: string; password?: string }) => 
    ipcRenderer.invoke('user:create', data),
  updateProfile: (updates: any) => ipcRenderer.invoke('user:update-profile', updates),
  updateUserPreferences: (preferences: any) => ipcRenderer.invoke('user:update-preferences', preferences),
  deleteAccount: () => ipcRenderer.invoke('user:delete-account'),
  createGuestUser: () => ipcRenderer.invoke('user:create-guest'),

  // History API
  getAllHistory: (limit?: number) => ipcRenderer.invoke('history:get-all', limit),
  searchHistory: (query: HistoryQuery) => ipcRenderer.invoke('history:search', query),
  getTodayHistory: () => ipcRenderer.invoke('history:get-today'),
  getLastNDaysHistory: (days: number) => ipcRenderer.invoke('history:get-last-n-days', days),
  deleteHistoryEntry: (id: string) => ipcRenderer.invoke('history:delete-entry', id),
  deleteHistoryEntries: (ids: string[]) => ipcRenderer.invoke('history:delete-entries', ids),
  deleteHistoryByDateRange: (startTime: number, endTime: number) => 
    ipcRenderer.invoke('history:delete-by-date-range', startTime, endTime),
  clearAllHistory: () => ipcRenderer.invoke('history:clear-all'),
  getHistoryStats: () => ipcRenderer.invoke('history:get-stats'),
  getMostVisited: (limit?: number) => ipcRenderer.invoke('history:get-most-visited', limit),
  getRecentlyVisited: (limit?: number) => ipcRenderer.invoke('history:get-recently-visited', limit),
};

contextBridge.exposeInMainWorld('browserAPI', browserAPI);
