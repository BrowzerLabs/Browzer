import { EventItemProps } from '../types';

import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';

export function TextEvent({ event, isLatest }: EventItemProps) {
  return (
    <Card
      className={cn(
        'p-4 border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
        isLatest && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
        {event.data.message}
      </p>
    </Card>
  );
}
