import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Edit,
  MoreVertical,
} from 'lucide-react';
import { format } from 'date-fns';

import {
  ScheduledAutomation,
  ScheduleType,
  ScheduledAutomationStatus,
} from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import { Badge } from '@/renderer/ui/badge';

interface ScheduledAutomationCardProps {
  automation: ScheduledAutomation;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (automation: ScheduledAutomation) => void;
  onDelete: (id: string) => void;
  onViewHistory: (automation: ScheduledAutomation) => void;
}

export function ScheduledAutomationCard({
  automation,
  onToggle,
  onEdit,
  onDelete,
  onViewHistory,
}: ScheduledAutomationCardProps) {
  const getStatusColor = (status: ScheduledAutomationStatus) => {
    switch (status) {
      case ScheduledAutomationStatus.RUNNING:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case ScheduledAutomationStatus.COMPLETED:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case ScheduledAutomationStatus.FAILED:
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case ScheduledAutomationStatus.PAUSED:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  const getScheduleTypeLabel = (type: ScheduleType) => {
    switch (type) {
      case 'one_time':
        return 'One-time';
      case 'hourly':
        return 'Hourly';
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return type;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            {automation.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {automation.userGoal}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(automation)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewHistory(automation)}>
              <Clock className="w-4 h-4 mr-2" />
              View History
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(automation.id)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="text-xs">
            {getScheduleTypeLabel(automation.type)}
          </Badge>
          <Badge className={`text-xs ${getStatusColor(automation.status)}`}>
            {automation.status}
          </Badge>
          {!automation.enabled && (
            <Badge variant="outline" className="text-xs">
              Disabled
            </Badge>
          )}
        </div>

        {automation.nextRunAt && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="w-4 h-4" />
            <span>
              Next:{' '}
              {format(new Date(automation.nextRunAt), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
        )}

        {automation.lastRunAt && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4" />
            <span>
              Last:{' '}
              {format(new Date(automation.lastRunAt), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-slate-700">
        <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
          <span>{automation.runCount} runs</span>
          <span className="text-green-600 dark:text-green-400">
            {automation.successCount} success
          </span>
          {automation.failureCount > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {automation.failureCount} failed
            </span>
          )}
        </div>

        <Button
          size="sm"
          variant={automation.enabled ? 'outline' : 'default'}
          onClick={() => onToggle(automation.id, !automation.enabled)}
        >
          {automation.enabled ? (
            <>
              <Pause className="w-3 h-3 mr-1" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1" />
              Enable
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
