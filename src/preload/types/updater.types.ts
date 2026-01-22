import type { UpdateInfo, UpdateProgress } from '@/shared/types';

/**
 * Updater API - Handles application updates
 */
export interface UpdaterAPI {
  // Event listeners
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (
    callback: (info: UpdateInfo & { currentVersion: string }) => void
  ) => () => void;
  onUpdateNotAvailable: (
    callback: (info: { version: string }) => void
  ) => () => void;
  onDownloadStarted: (callback: () => void) => () => void;
  onDownloadProgress: (
    callback: (progress: UpdateProgress) => void
  ) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (
    callback: (error: {
      message: string;
      stack?: string;
      name?: string;
    }) => void
  ) => () => void;
}
