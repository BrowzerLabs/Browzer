import {
  Play,
  Trash2,
  Clock,
  Video,
  MousePointerClick,
  Calendar,
  Download,
  ExternalLink,
  HardDrive,
  Camera,
  FileJson,
} from 'lucide-react';

import type { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/renderer/ui/card';
import {
  formatDate,
  formatDuration,
  formatFileSize,
} from '@/renderer/lib/utils';

interface RecordingCardProps {
  recording: RecordingSession;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}

export function RecordingCard({
  recording,
  onDelete,
  onExport,
}: RecordingCardProps) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">
              {recording.name?.substring(0, 20) || recording.name}
              {recording.name?.length > 20 && '...'}
            </CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {recording.description ? (
                <>
                  {recording.description.substring(0, 20)}
                  {recording.description.length > 20 && '...'}
                </>
              ) : (
                'No description'
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>


      <CardFooter className="flex gap-2 pt-4 border-t">
       
        <Button
          onClick={() => onExport(recording.id)}
          variant="outline"
          size="sm"
          title="Export as JSON"
        >
          <FileJson className="w-4 h-4" />
        </Button>
        <Button
          onClick={() => onDelete(recording.id)}
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          title="Delete recording"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
