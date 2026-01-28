import {
  MousePointerClick,
  Loader2Icon,
  Camera,
  FileJson,
  Keyboard,
  Navigation,
  FileUp,
  Menu,
  ArrowRightLeft,
} from 'lucide-react';
import { useState } from 'react';

import type { RecordingSession, RecordingAction } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { Dialog, DialogContent, DialogFooter } from '@/renderer/ui/dialog';
import { formatDate, formatDuration } from '@/renderer/lib/utils';

interface RecordingDialogProps {
  recording: RecordingSession | null;
  videoUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (id: string) => void;
}

export function RecordingDialog({
  recording,
  videoUrl,
  open,
  onOpenChange,
  onExport,
}: RecordingDialogProps) {
  if (!recording) return null;

  // const hasSnapshots = recording.snapshotCount && recording.snapshotCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[1400px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
            {/* Left Column - Video & Snapshots */}
            <div className="lg:col-span-2 space-y-6">
              {/* Video Player */}
              {recording.videoPath && videoUrl && (
                <div className="bg-black rounded-lg overflow-hidden shadow-lg">
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    className="w-full"
                    style={{ maxHeight: '600px' }}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              )}

              {recording.videoPath && !videoUrl && (
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-12 text-center">
                  <Loader2Icon className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                  <p className="text-base text-gray-600 dark:text-gray-400">
                    Loading video...
                  </p>
                </div>
              )}

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MousePointerClick className="w-5 h-5 text-blue-600" />
                Recorded Actions ({recording.actions.length})
              </h3>
              <div className="overflow-y-auto space-y-3 pr-2">
                {recording.actions.map((action, index) => (
                  <ActionItem key={index} action={action} index={index} />
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recording Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <DetailItem label="Name" value={recording.name} />
                <DetailItem label="Description" value={recording.description} />
                <DetailItem label="URL" value={recording.startUrl} />
                <DetailItem
                  label="Created"
                  value={formatDate(recording.createdAt)}
                />
                <DetailItem
                  label="Duration"
                  value={formatDuration(recording.duration)}
                />
                <DetailItem
                  label="Actions"
                  value={`${recording.actions.length} recorded`}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900">
          {/* <Button onClick={() => onExport(recording.id)} variant="outline">
            <FileJson className="w-4 h-4 mr-2" />
            Export as JSON
          </Button> */}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DetailItemProps {
  label: string;
  value: string | undefined;
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {value || ''}
      </p>
    </div>
  );
}

interface ActionItemProps {
  action: RecordingAction;
  index: number;
}

function ActionItem({ action, index }: ActionItemProps) {
  const [showSnapshot, setShowSnapshot] = useState(false);

  const getActionIcon = () => {
    switch (action.type) {
      case 'click':
        return <MousePointerClick className="w-4 h-4" />;
      case 'type':
        return <Keyboard className="w-4 h-4" />;
      case 'key':
        return <Keyboard className="w-4 h-4" />;
      case 'navigate':
        return <Navigation className="w-4 h-4" />;
      case 'file':
        return <FileUp className="w-4 h-4" />;
      case 'context-menu':
        return <Menu className="w-4 h-4" />;
      case 'tab-switch':
        return <ArrowRightLeft className="w-4 h-4" />;
      default:
        return <MousePointerClick className="w-4 h-4" />;
    }
  };

  const snapshotUrl = action.snapshotPath
    ? `video-file://${encodeURIComponent(action.snapshotPath)}`
    : null;

  return (
    <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-3 bg-gray-50 dark:bg-gray-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="shrink-0 bg-white/50 dark:bg-black/20"
            >
              {index + 1}
            </Badge>
            <div className="flex items-center gap-2">
              {getActionIcon()}
              <span className="font-semibold capitalize">{action.type}</span>
            </div>
          </div>
          {action.snapshotPath && (
            <button
              onClick={() => setShowSnapshot(!showSnapshot)}
              className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded transition-colors"
              title={showSnapshot ? 'Hide snapshot' : 'Show snapshot'}
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(action.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Snapshot */}
      {showSnapshot && snapshotUrl && (
        <div className="p-2 bg-slate-50 dark:bg-slate-900">
          <img
            src={snapshotUrl}
            alt={`Snapshot for ${action.type} action`}
            className="w-full rounded border border-gray-200 dark:border-slate-700"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      <details className="cursor-pointer p-4">
        <summary className="text-xs text-muted-foreground hover:text-foreground">
          View Details
        </summary>
        <pre className="mt-2 p-2 bg-muted/50 rounded overflow-x-auto text-xs">
          {JSON.stringify(action, null, 2)}
        </pre>
      </details>
    </div>
  );
}
