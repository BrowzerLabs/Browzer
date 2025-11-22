/**
 * EventItem Component
 * 
 * Router component that renders the appropriate event component
 * based on the event type
 */

import React from 'react';
import { ClaudeThinkingEvent } from './ClaudeThinkingEvent';
import { StepEvent } from './StepEvent';
import { ErrorEvent } from './ErrorEvent';
import { ClaudeResponseEvent } from './ClaudeResponseEvent';
import { EventItemProps } from '../types';

export function EventItem({ event, isLatest }: EventItemProps) {
  switch (event.type) {
    case 'thinking':
      return <ClaudeThinkingEvent event={event} isLatest={isLatest} />;
    
    case 'claude_response':
      return <ClaudeResponseEvent event={event} isLatest={isLatest} />;
    
    case 'plan_generated':
      // Don't show plan_generated events in UI (stored in DB only)
      return null;
    
    case 'step_start':
    case 'step_complete':
    case 'step_error':
      return <StepEvent event={event} isLatest={isLatest} />;
    
    case 'automation_error':
    case 'recovery_failed':
      return <ErrorEvent event={event} isLatest={isLatest} />;
    
    default:
      // Generic event display for unknown types
      return (
        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
          {event.type}: {JSON.stringify(event.data)}
        </div>
      );
  }
}
