import { Brain, Loader2 } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function ClaudeThinkingEvent({ event, isLatest }: EventItemProps) {
  const thinkingText = event.data?.message || 'Browzer is thinking...';
  
  return (
    <Card className={cn(
      "p-4 border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20",
      isLatest && "animate-in fade-in slide-in-from-bottom-2 duration-300"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {isLatest ? (
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
          ) : (
            <Brain className="w-5 h-5 text-purple-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
            Browzer's Reasoning
          </p>
          <p className="text-sm text-purple-900 dark:text-purple-100 whitespace-pre-wrap break-words">
            {thinkingText}
          </p>
        </div>
      </div>
    </Card>
  );
}
