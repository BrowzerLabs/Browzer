import { Video, MousePointerClick, Download, Loader2Icon, Camera } from 'lucide-react';
import type { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/renderer/ui/dialog';
import { formatDate, formatDuration, formatFileSize } from '@/renderer/lib/utils';
import { SnapshotGallery } from './SnapshotGallery';
import { WorkflowVariables } from './WorkflowVariables';
import React, { useState } from 'react';

interface RecordingDialogProps {
  recording: RecordingSession | null;
  videoUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenVideo: (videoPath: string) => void;
  onRecordingUpdated?: () => void;
}

export function RecordingDialog({ 
  recording, 
  videoUrl, 
  open, 
  onOpenChange,
  onOpenVideo,
  onRecordingUpdated 
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
                  <p className="text-base text-gray-600 dark:text-gray-400">Loading video...</p>
                </div>
              )}

              {/* Snapshots Gallery */}
              {<SnapshotGallery actions={recording.actions} />}

              {/* Recording Info */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recording Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem label="Description" value={recording.description || 'No description provided'} />
                  <DetailItem label="URL" value={recording.url} />
                  <DetailItem label="Created" value={formatDate(recording.createdAt)} />
                  <DetailItem label="Duration" value={formatDuration(recording.duration)} />
                  <DetailItem label="Actions" value={`${recording.actionCount} recorded`} />
                  
                  {recording.videoSize && (
                    <>
                      <DetailItem label="Video Size" value={formatFileSize(recording.videoSize)} />
                      <DetailItem label="Format" value={recording.videoFormat?.toUpperCase() || 'N/A'} />
                    </>
                  )}
                  
                  { (
                    <>
                      <DetailItem label="Snapshots" value={`${recording.snapshotCount} captured`} />
                      {recording.totalSnapshotSize && (
                        <DetailItem label="Snapshot Size" value={formatFileSize(recording.totalSnapshotSize)} />
                      )}
                    </>
                  )}
                  
                  {recording.tabs && recording.tabs.length > 1 && (
                    <>
                      <DetailItem label="Tabs" value={`${recording.tabs.length} tabs`} />
                      <DetailItem label="Tab Switches" value={`${recording.tabSwitchCount || 0} switches`} />
                    </>
                  )}
                </div>
              </div>

              {/* Variables */}
              {recording.variables && recording.variables.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Workflow Variables</h4>
                  <WorkflowVariables 
                    variables={recording.variables} 
                    editable={true} 
                    recordingId={recording.id}
                    onVariablesChange={onRecordingUpdated}
                  />
                </div>
              )}
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
                      <Badge variant="outline" className="shrink-0 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900 dark:text-white capitalize">
                            {action.type}
                          </p>
                          {action.snapshotPath && (
                            <Camera className="w-3 h-3 text-purple-500" />
                          )}
                        </div>
                        {action.value && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            Value: {action.value}
                          </p>
                        )}
                        {action.target?.text && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            Target: {action.target.text}
                          </p>
                        )}
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
          {recording.videoPath && (
            <Button onClick={() => onOpenVideo(recording.videoPath || '')} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Open Video File
            </Button>
          )}
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
