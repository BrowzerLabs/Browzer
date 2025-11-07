/**
 * ClaudeResponseEvent Component
 * 
 * Displays Claude's response/reasoning text
 */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function ClaudeResponseEvent({ event, isLatest }: EventItemProps) {
  return (
    <Card className={cn(
      "p-4 border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
      isLatest && "animate-in fade-in slide-in-from-bottom-2 duration-300"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <MessageSquare className="w-5 h-5 text-blue-600" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            Claude's Analysis
          </p>
          <div className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
            {event.data.message}
          </div>
          
          {event.data.reasoning && (
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                Reasoning
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {event.data.reasoning}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
