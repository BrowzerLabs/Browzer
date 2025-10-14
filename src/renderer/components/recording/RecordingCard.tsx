import { Play, Trash2, Clock, Video, MousePointerClick, Calendar, Download, ExternalLink, HardDrive, Camera } from 'lucide-react';
import type { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/renderer/ui/card';
import { formatDate, formatDuration, formatFileSize } from '@/renderer/lib/utils';

interface RecordingCardProps {
  recording: RecordingSession;
  onPlay: (recording: RecordingSession) => void;
  onDelete: (id: string) => void;
  onOpenVideo: (videoPath: string) => void;
}

export function RecordingCard({ recording, onPlay, onDelete, onOpenVideo }: RecordingCardProps) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{recording.name}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {recording.description || 'No description'}
            </CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            {recording.videoPath && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Video className="w-3 h-3 mr-1" />
                Video
              </Badge>
            )}
            {recording.snapshotCount && recording.snapshotCount > 0 && (
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                <Camera className="w-3 h-3 mr-1" />
                {recording.snapshotCount}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* URL */}
        {recording.url && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span className="truncate">{recording.url}</span>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
            <MousePointerClick className="w-4 h-4" />
            <span>{recording.actionCount} actions</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(recording.duration)}</span>
          </div>
        </div>

        {/* Video Info */}
        {recording.videoPath && recording.videoSize && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <HardDrive className="w-4 h-4" />
            <span>{formatFileSize(recording.videoSize)}</span>
            {recording.videoFormat && (
              <Badge variant="outline" className="text-xs">
                {recording.videoFormat.toUpperCase()}
              </Badge>
            )}
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(recording.createdAt)}</span>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 pt-4 border-t">
        <Button onClick={() => onPlay(recording)} className="flex-1" size="sm">
          <Play className="w-4 h-4 mr-2" />
          View
        </Button>
        {recording.videoPath && (
          <Button onClick={() => onOpenVideo(recording.videoPath)} variant="outline" size="sm">
            <Download className="w-4 h-4" />
          </Button>
        )}
        <Button
          onClick={() => onDelete(recording.id)}
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
