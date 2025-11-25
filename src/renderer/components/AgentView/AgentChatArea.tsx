import { useRef, useEffect } from 'react';
import { EventItem } from './EventItem';
import { AgentChatAreaProps } from './types';

export function AgentChatArea({
  viewMode,
  currentSession,
}: AgentChatAreaProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewMode === 'existing_session' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentSession?.events, viewMode]);

  if (viewMode === 'new_session') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <h3 className="text-lg font-semibold mb-2">Record & Automate</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Select a recorded session from above select and describe what you want to automate in the input below to get started.
        </p>
      </div>
    );
  }

  if (viewMode === 'existing_session' && currentSession) {
    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="py-4 space-y-3 max-w-4xl mx-auto">
          <div className="bg-background/20 border border-background/20 px-4 sticky top-0 z-10 backdrop-blur-md">
            <p className="text-sm font-medium text-primary mb-1">Goal</p>
            <p className="text-sm">{currentSession.userGoal}</p>
          </div>

            <div className="space-y-2 px-6">
            {currentSession.events.map((event, index) => (
              <EventItem
                key={event.id}
                event={event}
                isLatest={index === currentSession.events.length - 1}
              />
            ))}

          </div>
          <div ref={chatEndRef} className="h-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading session...</p>
      </div>
    </div>
  );
}
