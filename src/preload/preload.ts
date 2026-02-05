/**
 * Preload Script - Main Entry Point
 *
 * This script runs in the preload context and exposes secure APIs to the renderer process
 * using Electron's contextBridge. It follows a modular architecture with separated concerns:
 *
 * - types/     - TypeScript interface definitions for all APIs
 * - api/       - Individual API implementations
 * - utils/     - Shared IPC helper utilities
 */

import { contextBridge } from 'electron';

import {
  createBrowserAPI,
  createAuthAPI,
  createSubscriptionAPI,
  createNotificationAPI,
  createUpdaterAPI,
} from './api';
import { createRecordingAPI } from './api/recording.api';
import { createPasswordAPI } from './api/password.api';

export type RecordingAPI = ReturnType<typeof createRecordingAPI>;
export type PasswordAPI = ReturnType<typeof createPasswordAPI>;
export type BrowserAPI = ReturnType<typeof createBrowserAPI>;
export type AuthAPI = ReturnType<typeof createAuthAPI>;
export type SubscriptionAPI = ReturnType<typeof createSubscriptionAPI>;
export type NotificationAPI = ReturnType<typeof createNotificationAPI>;
export type UpdaterAPI = ReturnType<typeof createUpdaterAPI>;

const browserAPI = createBrowserAPI();
const authAPI = createAuthAPI();
const subscriptionAPI = createSubscriptionAPI();
const notificationAPI = createNotificationAPI();
const updaterAPI = createUpdaterAPI();
const recordingAPI = createRecordingAPI();
const passwordAPI = createPasswordAPI();

contextBridge.exposeInMainWorld('browserAPI', browserAPI);
contextBridge.exposeInMainWorld('authAPI', authAPI);
contextBridge.exposeInMainWorld('subscriptionAPI', subscriptionAPI);
contextBridge.exposeInMainWorld('notificationAPI', notificationAPI);
contextBridge.exposeInMainWorld('updaterAPI', updaterAPI);
contextBridge.exposeInMainWorld('recordingAPI', recordingAPI);
contextBridge.exposeInMainWorld('passwordAPI', passwordAPI);
