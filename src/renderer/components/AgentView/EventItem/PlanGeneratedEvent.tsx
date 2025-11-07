/**
 * PlanGeneratedEvent Component
 * 
 * Displays generated automation plan with steps
 */

import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { Badge } from '@/renderer/ui/badge';
import { Button } from '@/renderer/ui/button';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function PlanGeneratedEvent({ event, isLatest }: EventItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const plan = event.data.plan;

  return (
    <Card className={cn(
      "p-4 border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20",
      isLatest && "animate-in fade-in slide-in-from-bottom-2 duration-300"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <FileText className="w-5 h-5 text-green-600" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Plan Generated
              </p>
              <Badge variant="outline" className="text-xs">
                {event.data.totalSteps} steps
              </Badge>
              {event.data.planType && (
                <Badge variant="secondary" className="text-xs">
                  {event.data.planType}
                </Badge>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>

          {event.data.reasoning && (
            <p className="text-sm text-green-700 dark:text-green-300 mb-3">
              {event.data.reasoning}
            </p>
          )}

          {isExpanded && plan?.steps && (
            <div className="mt-3 space-y-2">
              {plan.steps.map((step: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm p-2 bg-white/50 dark:bg-black/20 rounded"
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-green-900 dark:text-green-100">
                      {step.tool}
                    </p>
                    {step.reasoning && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {step.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
