import { useEffect, useState } from 'react';
import type { UpdateProgress } from '@/shared/types';
import { toast } from 'sonner';

interface UpdateState {
  isDownloading: boolean;
  progress: number;
  version: string | null;
}

/**
 * Hook to track update download progress
 */
export function useUpdateProgress() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    isDownloading: false,
    progress: 0,
    version: null,
  });

  useEffect(() => {
    // Listen for update available
    const unsubscribeAvailable = window.updaterAPI.onUpdateAvailable((info) => {
      setUpdateState({
        isDownloading: true,
        progress: 0,
        version: info.version,
      });
    });

    // Listen for download progress
    const unsubscribeProgress = window.updaterAPI.onDownloadProgress((progress: UpdateProgress) => {
      setUpdateState(prev => ({
        ...prev,
        progress: progress.percent,
      }));
    });

    // Listen for download complete
    const unsubscribeDownloaded = window.updaterAPI.onUpdateDownloaded(() => {
      setUpdateState({
        isDownloading: false,
        progress: 100,
        version: null,
      });
      toast.success('Update downloaded successfully');
    });

    // Listen for errors
    const unsubscribeError = window.updaterAPI.onUpdateError(() => {
      setUpdateState({
        isDownloading: false,
        progress: 0,
        version: null,
      });
      toast.error('Update failed');
    });

    return () => {
      unsubscribeAvailable();
      unsubscribeProgress();
      unsubscribeDownloaded();
      unsubscribeError();
    };
  }, []);

  return updateState;
}
