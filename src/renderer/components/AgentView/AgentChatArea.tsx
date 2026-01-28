import { useRef, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { EventItem } from './EventItem';
import { RecordingActions } from './RecordingActions';
import { AgentChatAreaProps } from './types';

import { RecordingSession } from '@/shared/types';

export function AgentChatArea({
  agentMode,
  currentSession,
  selectedRecordingId,
}: AgentChatAreaProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [selectedRecording, setSelectedRecording] =
    useState<RecordingSession | null>(null);
  const [isLoadingRecording, setIsLoadingRecording] = useState(false);

  useEffect(() => {
    if (currentSession && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentSession?.events, currentSession]);

  useEffect(() => {
    const fetchRecording = async () => {
      if (!selectedRecordingId) {
        setSelectedRecording(null);
        return;
      }

      setIsLoadingRecording(true);
      try {
        const recording =
          await window.recordingAPI.getRecording(selectedRecordingId);
        setSelectedRecording(recording);
      } catch (error) {
        console.error('[AgentChatArea] Failed to fetch recording:', error);
        setSelectedRecording(null);
      } finally {
        setIsLoadingRecording(false);
      }
    };

    fetchRecording();
  }, [selectedRecordingId]);

  if (!currentSession) {
    if (agentMode === 'automate' && selectedRecordingId) {
      if (isLoadingRecording) {
        return (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin" />
          </div>
        );
      }

      if (selectedRecording) {
        return <RecordingActions actions={selectedRecording.actions} />;
      }
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <h3 className="text-lg font-semibold mb-2">
          {agentMode === 'ask'
            ? 'Ask anything about the current page...'
            : agentMode === 'autopilot'
              ? 'Describe what you want to accomplish...'
              : 'Describe what you want to automate...'}
        </h3>
      </div>
    );
  }

  if (currentSession) {
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

  return null;
}
