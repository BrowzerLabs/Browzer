import { useState, useCallback } from 'react';
import { Download, Pause, Play, XCircle } from 'lucide-react';
import { formatBytes, formatSpeed, formatRemainingTime } from '@/renderer/lib/utils';
import { useDownloads } from '@/renderer/hooks/useDownloads';
import { Progress } from '@/renderer/ui/progress';
import { Button } from '@/renderer/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import type { DownloadItem } from '@/shared/types';

interface DownloadsDropdownProps {
  onNavigate: (url: string) => void;
}

export function DownloadsDropdown({ onNavigate }: DownloadsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const openMenu = useCallback(() => {
    window.browserAPI.bringBrowserViewToFront();
    setIsOpen(true);
  }, []);

  const { downloads, activeCount, pauseDownload, resumeDownload, cancelDownload } = useDownloads({
    notify: true,
    onNewDownload: openMenu,
  });

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      window.browserAPI.bringBrowserViewToFront();
    } else {
      window.browserAPI.bringBrowserViewToBottom();
    }
  }, []);

  const handleViewAll = useCallback(() => {
    setIsOpen(false);
    window.browserAPI.bringBrowserViewToBottom();
    setTimeout(() => onNavigate('browzer://downloads'), 0);
  }, [onNavigate]);

  if (downloads.length === 0) {
    return null;
  }

  const recentDownloads = [...downloads]
    .sort((a, b) => {
      const timeA = a.endTime ?? a.startTime;
      const timeB = b.endTime ?? b.startTime;
      return timeB - timeA;
    })
    .slice(0, 3);

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          title="Downloads"
          className="relative"
          onClick={openMenu}
        >
          <Download className="w-4 h-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white px-1">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Downloads</span>
          <button
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            onClick={handleViewAll}
          >
            View all
          </button>
        </div>
        <div className="space-y-2 pr-1">
          {recentDownloads.map((item) => (
            <DownloadItemCard
              key={item.id}
              item={item}
              onPause={pauseDownload}
              onResume={resumeDownload}
              onCancel={cancelDownload}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DownloadItemCardProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}

function DownloadItemCard({ item, onPause, onResume, onCancel }: DownloadItemCardProps) {
  const percent = Math.round((item.progress || 0) * 100);
  const isActive = item.state === 'progressing';
  const isPaused = item.state === 'paused';
  const isDone = item.state === 'completed';
  const isCancelled = item.state === 'cancelled';
  const isFailed = item.state === 'failed' || item.state === 'interrupted';
  const isTerminal = isDone || isCancelled || isFailed;

  const statusText = isDone
    ? 'Completed'
    : isPaused
    ? 'Paused'
    : isFailed
    ? 'Failed'
    : isCancelled
    ? 'Cancelled'
    : 'In progress';

  return (
    <div className="border border-gray-200 dark:border-slate-800 rounded-md p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
            {item.fileName}
          </div>
          <div className="text-[9px] text-gray-500 dark:text-gray-400">
            <span>{statusText}</span>
            {!isCancelled && (
              <span>
                {' '}• {formatBytes(item.receivedBytes)}/{item.totalBytes > 0 ? formatBytes(item.totalBytes) : '?'}
              </span>
            )}
            <br />
            {isActive && formatSpeed(item.speed) && (
              <span className="text-blue-600 dark:text-blue-400">
                {formatSpeed(item.speed)}
              </span>
            )}
            {isActive && formatRemainingTime(item.remainingTime) && (
              <span> • {formatRemainingTime(item.remainingTime)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <button
              title="Pause"
              onClick={() => onPause(item.id)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          {isPaused && (
            <button
              title="Resume"
              onClick={() => onResume(item.id)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          {(isActive || isPaused) && (
            <button
              title="Cancel"
              onClick={() => onCancel(item.id)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {!isTerminal && <Progress value={percent} className="h-1.5" />}
    </div>
  );
}
