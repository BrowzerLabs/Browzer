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

const browserAPI = createBrowserAPI();
const authAPI = createAuthAPI();
const subscriptionAPI = createSubscriptionAPI();
const notificationAPI = createNotificationAPI();
const updaterAPI = createUpdaterAPI();

contextBridge.exposeInMainWorld('browserAPI', browserAPI);
contextBridge.exposeInMainWorld('authAPI', authAPI);
contextBridge.exposeInMainWorld('subscriptionAPI', subscriptionAPI);
contextBridge.exposeInMainWorld('notificationAPI', notificationAPI);
contextBridge.exposeInMainWorld('updaterAPI', updaterAPI);
