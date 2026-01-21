import { Clock } from 'lucide-react';

import {
  getActionColor,
  getActionDescription,
  RecordingActionIcon,
} from '../AgentView/utils';

import { RecordingAction } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';

interface ActionListProps {
  actions: RecordingAction[];
}

export function ActionList({ actions }: ActionListProps) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Clock className="w-12 h-12 text-muted-foreground mb-3" />
        <h3 className="text-sm font-semibold mb-2">No Actions Yet</h3>
        <p className="text-xs text-muted-foreground">
          Perform actions in your browser to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {actions.map((action, index) => {
        const colorClass = getActionColor(action);
        const description = getActionDescription(action);

        return (
          <div
            key={`${action.timestamp}-${index}`}
            className={cn(
              'p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
              'animate-in slide-in-from-top duration-200'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5', colorClass)}>
                <RecordingActionIcon type={action.type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm mb-1">
                  <span className="text-muted-foreground">
                    {description.action}
                  </span>{' '}
                  <strong className="font-medium">{description.target}</strong>
                  {action.element?.role && (
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-600 mt-0.5">
                      ({action.element.role})
                    </span>
                  )}
                </div>
                {description.detail && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {description.detail}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(action.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}