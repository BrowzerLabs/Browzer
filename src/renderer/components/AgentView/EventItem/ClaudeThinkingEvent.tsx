/**
 * ClaudeThinkingEvent Component
 * 
 * Displays Claude's thinking/reasoning process
 */

import React from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function ClaudeThinkingEvent({ event, isLatest }: EventItemProps) {
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
        <p className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-1">
            Browzer is thinking...
        </p>
      </div>
    </Card>
  );
}
