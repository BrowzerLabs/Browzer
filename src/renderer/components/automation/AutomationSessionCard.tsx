import {
  Eye,
  Play,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  MessageSquare,
  ListChecks,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { SessionListItem } from '@/renderer/stores/automationStore';
import { Card, CardContent, CardFooter, CardHeader } from '@/renderer/ui/card';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { AutomationStatus } from '@/shared/types';

interface AutomationSessionCardProps {
  session: SessionListItem;
  onView: (session: SessionListItem) => void;
  onResume: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export function AutomationSessionCard({
  session,
  onView,
  onResume,
  onDelete,
}: AutomationSessionCardProps) {
  const getStatusIcon = () => {
    switch (session.status) {
      case 'running':
        return <Clock className="w-4 h-4 animate-pulse" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      case 'stopped':
        return <Pause className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (session.status) {
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'stopped':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold text-sm text-gray-900 dark:text-white truncate"
              title={session.userGoal}
            >
              {session.userGoal.substring(0, 20)}...
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatDistanceToNow(session.createdAt, { addSuffix: true })}
            </p>
          </div>
          <Badge
            className={`${getStatusColor()} flex items-center gap-1 flex-shrink-0`}
          >
            {getStatusIcon()}
            {session.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="space-y-2">
          {/* Session ID */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">Session ID</span>
            <span
              className="font-mono text-gray-900 dark:text-white truncate ml-2 max-w-[150px]"
              title={session.sessionId}
            >
              {session.sessionId.slice(0, 8)}...
            </span>
          </div>

          {/* Recording ID */}
          {session.recordingId && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">
                Recording
              </span>
              <span
                className="font-mono text-gray-900 dark:text-white truncate ml-2 max-w-[150px]"
                title={session.recordingId}
              >
                {session.recordingId.slice(0, 8)}...
              </span>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <ListChecks className="w-3 h-3" />
              <span>{session.stepCount} steps</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <MessageSquare className="w-3 h-3" />
              <span>{session.messageCount} msgs</span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onView(session)}
        >
          <Eye className="w-3 h-3 mr-1" />
          View
        </Button>

        {/* {(session.status === AutomationStatus.FAILED || session.status === AutomationStatus.STOPPED) && (
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onResume(session.sessionId)}
          >
            <Play className="w-3 h-3 mr-1" />
            Resume
          </Button>
        )} */}

        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(session.sessionId)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </CardFooter>
    </Card>
  );
}
