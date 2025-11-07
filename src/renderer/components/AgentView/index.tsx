/**
 * AgentView - Main Component
 * 
 * Orchestrates the entire AgentView with modular sub-components
 * 
 * Features:
 * - Two view modes: new_session and existing_session
 * - Session history display
 * - Real-time event streaming
 * - Persistent session storage
 * - Recording selection
 * - Prompt input
 */

import React, { useEffect } from 'react';
import { AgentHeader } from './AgentHeader';
import { AgentChatArea } from './AgentChatArea';
import { AgentFooter } from './AgentFooter';
import { useAgentView, useAutomationEvents, useSessionManagement } from './hooks';

export default function AgentView() {
  const {
    viewState,
    currentSession,
    sessionHistory,
    selectedRecordingId,
    userPrompt,
    recordings,
    isSubmitting,
    isLoadingSession,
    isLoadingHistory,
    loadRecordings,
    handleSubmit,
    handleSessionSelect,
    handleNewSession,
    handleRecordingSelect,
    handlePromptChange,
    setIsSubmitting,
  } = useAgentView();

  // Subscribe to automation events
  useAutomationEvents(setIsSubmitting);

  // Load session history
  useSessionManagement();

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const isDisabled = currentSession?.status === 'running';

  return (
    <section className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <AgentHeader
        viewMode={viewState}
        selectedRecordingId={selectedRecordingId}
        recordings={recordings}
        currentSession={currentSession}
        onRecordingSelect={handleRecordingSelect}
        onNewSession={handleNewSession}
        isDisabled={isDisabled}
      />

      {/* Chat Area - Takes remaining space and handles overflow */}
      <AgentChatArea
          viewMode={viewState}
          currentSession={currentSession}
          sessionHistory={sessionHistory}
          isLoadingSession={isLoadingSession}
          isLoadingHistory={isLoadingHistory}
          onSessionSelect={handleSessionSelect}
        />

      {/* Footer */}
      <AgentFooter
        userPrompt={userPrompt}
        selectedRecordingId={selectedRecordingId}
        isSubmitting={isSubmitting}
        isDisabled={isDisabled}
        onPromptChange={handlePromptChange}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
