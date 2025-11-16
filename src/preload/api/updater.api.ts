import type { UpdaterAPI } from '@/preload/types/updater.types';
import { invoke, createEventListener, createSimpleListener } from '@/preload/utils/ipc-helpers';
import type { UpdateInfo, UpdateProgress } from '@/shared/types';

/**
 * Updater API implementation
 * Handles application auto-update functionality
 */
export const createUpdaterAPI = (): UpdaterAPI => ({
  // Actions
  checkForUpdates: () => invoke('updater:check-for-updates'),
  downloadUpdate: () => invoke('updater:download-update'),
  installUpdate: () => invoke('updater:install-update'),
  getVersion: () => invoke('updater:get-version'),
  getStatus: () => invoke('updater:get-status'),
  
  // Event listeners
  onUpdateChecking: (callback) => 
    createSimpleListener('update:checking', callback),
  onUpdateAvailable: (callback) => 
    createEventListener('update:available', callback),
  onUpdateNotAvailable: (callback) => 
    createEventListener('update:not-available', callback),
  onDownloadStarted: (callback) => 
    createSimpleListener('update:download-started', callback),
  onDownloadProgress: (callback) => 
    createEventListener<UpdateProgress>('update:download-progress', callback),
  onUpdateDownloaded: (callback) => 
    createEventListener<UpdateInfo>('update:downloaded', callback),
  onUpdateError: (callback) => 
    createEventListener('update:error', callback),
});
