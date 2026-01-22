import { Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { EventItemProps } from '../types';

import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';

export function StepEvent({ event, isLatest }: EventItemProps) {
  const isRunning = event.type === 'step_start';
  const isSuccess = event.type === 'step_complete';
  const isError = event.type === 'step_error';

  const getStatusColor = () => {
    if (isRunning)
      return 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20';
    if (isSuccess)
      return 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20';
    if (isError) return 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20';
    return '';
  };

  const getIcon = () => {
    if (isRunning)
      return <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />;
    if (isSuccess) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (isError) return <XCircle className="w-5 h-5 text-red-600" />;
    return <Play className="w-5 h-5" />;
  };

  const getTextColor = () => {
    if (isRunning) return 'text-yellow-900 dark:text-yellow-100';
    if (isSuccess) return 'text-green-900 dark:text-green-100';
    if (isError) return 'text-red-900 dark:text-red-100';
    return '';
  };

  return (
    <Card
      className={cn(
        'p-4 border-l-4',
        getStatusColor(),
        isLatest && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', getTextColor())}>
             {event.data.stepNumber}  {event.data?.toolName}
          </p>
          {event.data.params && (
              <details className="cursor-pointer">
                <summary className="text-xs text-muted-foreground hover:text-foreground">
                  View Params
                </summary>
                <pre className="mt-2 p-2 bg-muted/50 rounded overflow-x-auto text-xs">
                  {JSON.stringify(event.data.params, null, 2)}
                </pre>
              </details>
            )}
          {event.data && event.data?.error && (
            <p className="mt-2 p-3 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-700 dark:text-red-300">
              {event.data.error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
