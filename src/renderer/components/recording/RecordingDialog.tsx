import {
  Video,
  MousePointerClick,
  Download,
  Loader2Icon,
  Camera,
  FileJson,
} from 'lucide-react';

import { SnapshotGallery } from './SnapshotGallery';

import type { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/ui/dialog';
import {
  formatDate,
  formatDuration,
  formatFileSize,
} from '@/renderer/lib/utils';

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
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Video className="w-6 h-6" />
            {recording.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
            {/* Left Column - Video & Snapshots */}
            <div className="lg:col-span-2 space-y-6">
              {/* Video Player */}
             

          

              {/* Snapshots Gallery */}
              {<SnapshotGallery actions={recording.actions} />}

              {/* Recording Info */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Recording Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem
                    label="Description"
                    value={recording.description || 'No description provided'}
                  />
                  <DetailItem
                    label="Created"
                    value={formatDate(recording.createdAt)}
                  />
                  <DetailItem
                    label="Duration"
                    value={formatDuration(recording.duration)}
                  />
                </div>
              </div>
            </div>

            {/* Right Column - Actions List */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 sticky top-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <MousePointerClick className="w-5 h-5 text-blue-600" />
                  Recorded Actions ({recording.actions.length})
                </h3>
                <div className="max-h-[600px] overflow-y-auto space-y-2 pr-2">
                  {recording.actions.map((action, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 text-sm p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 transition-colors"
                    >
                      <Badge
                        variant="outline"
                        className="shrink-0 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      >
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900 dark:text-white capitalize">
                            {action.type}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900">
          <Button onClick={() => onExport(recording.id)} variant="outline">
            <FileJson className="w-4 h-4 mr-2" />
            Export as JSON
          </Button>
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
        {value || 'N/A'}
      </p>
    </div>
  );
}
