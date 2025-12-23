import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { DownloadItem, DownloadUpdatePayload } from '@/shared/types';

interface UseDownloadsOptions {
  notify?: boolean;
  onNewDownload?: (item: DownloadItem) => void;
}

export function useDownloads(options: UseDownloadsOptions = {}) {
  const { notify = false, onNewDownload } = options;
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const previous = useRef<Map<string, DownloadItem>>(new Map());

  const activeCount = useMemo(
    () =>
      downloads.filter((d) => d.state === 'progressing' || d.state === 'queued')
        .length,
    [downloads]
  );

  useEffect(() => {
    let isMounted = true;

    window.browserAPI
      .getDownloads()
      .then((items: DownloadItem[]) => {
        if (isMounted) {
          setDownloads(items);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    const unsubscribe = window.browserAPI.onDownloadsUpdated(
      (payload: DownloadUpdatePayload) => {
        setDownloads(payload.downloads);

        const changed = payload.changedId
          ? payload.downloads.find((d) => d.id === payload.changedId)
          : undefined;

        if (!changed) {
          return;
        }

        const prev = previous.current.get(changed.id);
        previous.current.set(changed.id, changed);

        if (!notify) return;

        if (!prev) {
          if (onNewDownload) {
            onNewDownload(changed);
          }
          if (notify) {
            toast.message(`Downloading ${changed.fileName}`, {
              duration: 2000,
            });
          }
          return;
        }

        if (prev.state !== changed.state) {
          switch (changed.state) {
            case 'completed':
              toast.success(`${changed.fileName} downloaded`, {
                duration: 2500,
              });
              break;
            case 'failed':
            case 'interrupted':
              toast.error(`${changed.fileName} failed`, { duration: 2500 });
              break;
            case 'cancelled':
              toast.error(`${changed.fileName} cancelled`, { duration: 2000 });
              break;
            case 'paused':
              toast.message(`${changed.fileName} paused`, { duration: 2000 });
              break;
            case 'progressing':
              if (prev.state === 'paused') {
                toast.message(`${changed.fileName} resumed`, {
                  duration: 2000,
                });
              }
              break;
            default:
              break;
          }
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [notify, onNewDownload]);

  const withFeedback = useCallback(
    async (fn: () => Promise<boolean>, onError: string, onSuccess?: string) => {
      try {
        const ok = await fn();
        if (ok && onSuccess) {
          toast.success(onSuccess);
        } else if (!ok) {
          toast.error(onError);
        }
        return ok;
      } catch (error) {
        console.error(error);
        toast.error(onError);
        return false;
      }
    },
    []
  );

  const pauseDownload = useCallback(
    (id: string) =>
      withFeedback(
        () => window.browserAPI.pauseDownload(id),
        'Unable to pause download'
      ),
    [withFeedback]
  );

  const resumeDownload = useCallback(
    (id: string) =>
      withFeedback(
        () => window.browserAPI.resumeDownload(id),
        'Unable to resume download'
      ),
    [withFeedback]
  );

  const cancelDownload = useCallback(
    (id: string) =>
      withFeedback(
        () => window.browserAPI.cancelDownload(id),
        'Unable to cancel download'
      ),
    [withFeedback]
  );

  const retryDownload = useCallback(
    (id: string) =>
      withFeedback(
        () => window.browserAPI.retryDownload(id),
        'Unable to retry download',
        'Retry started'
      ),
    [withFeedback]
  );

  const removeDownload = useCallback(
    async (id: string) => {
      const ok = await withFeedback(
        () => window.browserAPI.removeDownload(id),
        'Unable to remove download'
      );
      if (ok) {
        setDownloads((prev) => prev.filter((d) => d.id !== id));
      }
    },
    [withFeedback]
  );

  const openDownload = useCallback(
    (id: string) =>
      withFeedback(
        () => window.browserAPI.openDownload(id),
        'File could not be opened'
      ),
    [withFeedback]
  );

  const showInFolder = useCallback(
    (id: string) =>
      withFeedback(
        () => window.browserAPI.showDownloadInFolder(id),
        'File not found on disk'
      ),
    [withFeedback]
  );

  return {
    downloads,
    loading,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    openDownload,
    showInFolder,
    activeCount,
  };
}
