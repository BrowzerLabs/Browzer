import { RefreshCw, Trash2, Video } from 'lucide-react';
import { Badge } from '@/renderer/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/renderer/ui/card';
import { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { formatDate, formatDuration } from '@/renderer/lib/utils';

interface SessionsListViewProps {
  sessions: RecordingSession[];
  onRefresh: () => void;
  onDelete: (id: string) => void;
}

export function SessionsListView({ sessions, onRefresh, onDelete }: SessionsListViewProps) {

  return (
    <div className="h-full flex flex-col">
      {/* Header with refresh */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <h3 className="text-sm font-medium text-black dark:text-white">Saved Recordings</h3>
        <Button
          onClick={onRefresh}
          title="Refresh"
          size='icon'
          variant='ghost'
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Sessions List - Single scrollable container */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <Video className="w-12 h-12 mx-auto text-gray-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-300 mb-2">No Recordings Yet</h3>
            <p className="text-xs text-gray-500">
              Start recording to save your first session
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card key={session.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm truncate">
                        {session.name}
                      </CardTitle>
                      {session.description && (
                        <CardDescription className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {session.description}
                        </CardDescription>
                      )}
                    </div>
                    <Button
                      onClick={() => onDelete(session.id)}
                      title="Delete recording"
                      size='icon'
                      variant='destructive'
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Badge className="text-xs">
                      {session.actionCount} actions
                    </Badge>
                    <span>{formatDuration(session.duration)}</span>
                    <span>|</span>
                    <span>{formatDate(session.createdAt)}</span>
                  </div>
                  {session.url && (
                    <div className="mt-2 text-xs text-gray-600 truncate">
                      {session.url}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}