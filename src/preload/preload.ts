/**
 * Preload Script - Main Entry Point
 * 
 * This script runs in the preload context and exposes secure APIs to the renderer process
 * using Electron's contextBridge. It follows a modular architecture with separated concerns:
 * 
 * - types/     - TypeScript interface definitions for all APIs
 * - api/       - Individual API implementations
 * - utils/     - Shared IPC helper utilities
 * 
 * @see https://www.electronjs.org/docs/latest/tutorial/context-isolation
 */

import { contextBridge } from 'electron';

// Import API factory functions
import {
  createBrowserAPI,
  createAuthAPI,
  createSubscriptionAPI,
  createNotificationAPI,
  createUpdaterAPI,
} from './api';

// Re-export types for renderer process
export type {
  BrowserAPI,
  AuthAPI,
  SubscriptionAPI,
  NotificationAPI,
  UpdaterAPI,
} from './types';

// Create API instances
const browserAPI = createBrowserAPI();
const authAPI = createAuthAPI();
const subscriptionAPI = createSubscriptionAPI();
const notificationAPI = createNotificationAPI();
const updaterAPI = createUpdaterAPI();

// Expose APIs to renderer process via contextBridge
contextBridge.exposeInMainWorld('browserAPI', browserAPI);
contextBridge.exposeInMainWorld('authAPI', authAPI);
contextBridge.exposeInMainWorld('subscriptionAPI', subscriptionAPI);
contextBridge.exposeInMainWorld('notificationAPI', notificationAPI);
contextBridge.exposeInMainWorld('updaterAPI', updaterAPI);
