import {
  Clock,
  User,
  Play,
  Bot,
  CheckCircle2,
  XCircle,
  StopCircle,
  Loader2,
  Trash2,
  ChevronRight,
} from 'lucide-react';

import type { AuditLog } from '@/shared/types/audit';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { cn } from '@/renderer/lib/utils';

interface AuditLogCardProps {
  log: AuditLog;
  onView: (log: AuditLog) => void;
  onDelete: (id: string) => void;
}

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (startedAt: number, endedAt?: number) => {
  if (!endedAt) return 'Running...';
  const durationMs = endedAt - startedAt;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed':
      return {
        icon: CheckCircle2,
        color: 'text-green-600',
        bg: 'bg-green-50 dark:bg-green-950/30',
      };
    case 'failed':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bg: 'bg-red-50 dark:bg-red-950/30',
      };
    case 'stopped':
      return {
        icon: StopCircle,
        color: 'text-yellow-600',
        bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      };
    case 'running':
      return {
        icon: Loader2,
        color: 'text-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-950/30',
        spin: true,
      };
    default:
      return { icon: Play, color: 'text-gray-600', bg: '' };
  }
};

export function AuditLogCard({ log, onView, onDelete }: AuditLogCardProps) {
  const statusConfig = getStatusConfig(log.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div
      onClick={() => onView(log)}
      className={cn(
        'group relative flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all',
        'hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700',
        statusConfig.bg
      )}
    >
      <div className={cn('mt-0.5', statusConfig.color)}>
        <StatusIcon
          className={cn('w-5 h-5', statusConfig.spin && 'animate-spin')}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-medium text-sm line-clamp-2 pr-2">
            {log.userGoal}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={log.agentMode === 'automate' ? 'default' : 'secondary'}
              className="text-[10px] px-1.5 py-0"
            >
              {log.agentMode === 'automate' ? (
                <Play className="w-2.5 h-2.5 mr-0.5" />
              ) : (
                <Bot className="w-2.5 h-2.5 mr-0.5" />
              )}
              {log.agentMode}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 capitalize',
                statusConfig.color
              )}
            >
              {log.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="truncate max-w-[150px]">{log.userEmail}</span>
          </span>
          <span>{formatDate(log.startedAt)}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(log.startedAt, log.endedAt)}
          </span>
          <span>{log.totalSteps} steps</span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(log.id);
          }}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
  );
}
