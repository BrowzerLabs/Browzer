import { StopCircle } from 'lucide-react';

import { EventItemProps } from '../types';

import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';

export function AutomationStoppedEvent({ event, isLatest }: EventItemProps) {
  const message = event.data?.message || 'Automation stopped by user';

  return (
    <Card
      className={cn(
        'p-4 border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20',
        isLatest && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <StopCircle className="w-5 h-5 text-orange-600" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-1">
            Automation Stopped
          </p>
          <p className="text-sm text-orange-700 dark:text-orange-300">
            {message}
          </p>
        </div>
      </div>
    </Card>
  );
}
