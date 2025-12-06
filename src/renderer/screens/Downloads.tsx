import { useMemo } from 'react';
import { Badge } from '@/renderer/ui/badge';
import { Button } from '@/renderer/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Progress } from '@/renderer/ui/progress';
import { useDownloads } from '@/renderer/hooks/useDownloads';
import type { DownloadItem } from '@/shared/types';
import {
  Download,
  Pause,
  Play,
  RotateCcw,
  X,
  FolderOpen,
  Loader2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { formatBytes, formatSpeed, formatRemainingTime } from '@/renderer/lib/utils';

const statusStyles: Record<DownloadItem['state'], string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  progressing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  cancelled: 'bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-gray-200',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  interrupted: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const statusLabel: Record<DownloadItem['state'], string> = {
  completed: 'Completed',
  progressing: 'In Progress',
  paused: 'Paused',
  cancelled: 'Cancelled',
  failed: 'Failed',
  interrupted: 'Interrupted',
  queued: 'Queued',
};

export function Downloads() {
  const {
    downloads,
    loading,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    openDownload,
    showInFolder,
  } = useDownloads();

  const activeCount = useMemo(
    () => downloads.filter((d) => d.state === 'progressing' || d.state === 'queued').length,
    [downloads]
  );

  const completedCount = useMemo(
    () => downloads.filter((d) => d.state === 'completed').length,
    [downloads]
  );

  const renderActions = (item: DownloadItem) => {
    const commonClasses = 'h-9';

    if (item.state === 'progressing') {
      return (
        <div className="flex flex-wrap gap-2 pointer-events-auto">
          <Button variant="outline" size="sm" className={commonClasses} onClick={() => pauseDownload(item.id)}>
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </Button>
          <Button variant="ghost" size="sm" className={commonClasses} onClick={() => cancelDownload(item.id)}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      );
    }

    if (item.state === 'paused') {
      return (
        <div className="flex flex-wrap gap-2 pointer-events-auto">
          <Button
            variant="outline"
            size="sm"
            className={commonClasses}
            onClick={() => resumeDownload(item.id)}
            disabled={!item.canResume}
          >
            <Play className="w-4 h-4 mr-2" />
            Resume
          </Button>
          <Button variant="ghost" size="sm" className={commonClasses} onClick={() => cancelDownload(item.id)}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      );
    }

    if (item.state === 'completed') {
      return (
        <div className="flex flex-wrap gap-2 pointer-events-auto">
          <Button variant="outline" size="sm" className={commonClasses} onClick={() => openDownload(item.id)}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open
          </Button>
          <Button variant="outline" size="sm" className={commonClasses} onClick={() => showInFolder(item.id)}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Show in Folder
          </Button>
          <Button variant="ghost" size="sm" className={commonClasses} onClick={() => removeDownload(item.id)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Remove
          </Button>
        </div>
      );
    }

    if (item.state === 'failed' || item.state === 'interrupted' || item.state === 'cancelled') {
      return (
        <div className="flex flex-wrap gap-2 pointer-events-auto">
          <Button variant="outline" size="sm" className={commonClasses} onClick={() => retryDownload(item.id)}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Retry
          </Button>
          <Button variant="ghost" size="sm" className={commonClasses} onClick={() => removeDownload(item.id)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Remove
          </Button>
        </div>
      );
    }

    return null;
  };

  const renderProgress = (item: DownloadItem) => {
    const showProgressBar = item.state !== 'completed' && item.state !== 'cancelled';
    const percent = Math.round((item.progress || 0) * 100);
    const speed = formatSpeed(item.speed);
    const remaining = formatRemainingTime(item.remainingTime);

    return (
      <div className="space-y-1">
        {showProgressBar && (
          <Progress value={percent} className="h-2 bg-gray-200 dark:bg-slate-800" />
        )}
        <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2 flex-wrap">
          <span>
            {formatBytes(item.receivedBytes)} of {item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Unknown'}
          </span>
          {showProgressBar && <span className="text-gray-400">•</span>}
          {showProgressBar && <span>{percent}%</span>}
          {item.state === 'progressing' && speed && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-primary">{speed}</span>
            </>
          )}
          {item.state === 'progressing' && remaining && (
            <>
              <span className="text-gray-400">•</span>
              <span>{remaining}</span>
            </>
          )}
          {item.error && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-red-500 dark:text-red-300">{item.error}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Downloads</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View and manage your recent downloads with progress and retry controls.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {activeCount} active
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              {completedCount} complete
            </Badge>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading downloads...
          </div>
        ) : downloads.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                <Download className="w-5 h-5" />
                No downloads yet
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 dark:text-gray-400">
              Start a download and it will appear here with live progress.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {downloads.map((item) => (
              <Card
                key={item.id}
                className="border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm pointer-events-auto"
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base text-gray-900 dark:text-white">
                      {item.fileName}
                    </CardTitle>
                    <div className="text-xs text-gray-500 dark:text-gray-400 break-all">
                      {item.url}
                    </div>
                  </div>
                  <Badge className={statusStyles[item.state]}>
                    {statusLabel[item.state]}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {renderProgress(item)}
                  {renderActions(item)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

