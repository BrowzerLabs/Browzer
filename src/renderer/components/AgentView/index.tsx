import { useEffect } from 'react';

import { AgentHeader } from './AgentHeader';
import { AgentChatArea } from './AgentChatArea';
import { AgentFooter } from './AgentFooter';
import { useAutomation } from './hooks';

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
    agentMode,
    loadRecordings,
    handleSubmit,
    handleSessionSelect,
    handleNewSession,
    handleRecordingSelect,
    handlePromptChange,
    handleStopAutomation,
    handleModeChange,
    handleAskSubmit,
  } = useAutomation();

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const isDisabled = currentSession?.status === 'running';
  const onSubmit = agentMode === 'ask' ? handleAskSubmit : handleSubmit;

  return (
    <section className="flex flex-col h-full overflow-hidden">
      {/* Only show AgentHeader in automate mode */}
      {agentMode === 'automate' && (
        <AgentHeader
          viewMode={viewState}
          selectedRecordingId={selectedRecordingId}
          recordings={recordings}
          currentSession={currentSession}
          onRecordingSelect={handleRecordingSelect}
          onNewSession={handleNewSession}
          isDisabled={isDisabled}
        />
      )}

      <AgentChatArea
        agentMode={agentMode}
        viewMode={viewState}
        currentSession={currentSession}
        sessionHistory={sessionHistory}
        isLoadingSession={isLoadingSession}
        isLoadingHistory={isLoadingHistory}
        onSessionSelect={handleSessionSelect}
      />

      <AgentFooter
        userPrompt={userPrompt}
        selectedRecordingId={selectedRecordingId}
        isSubmitting={isSubmitting}
        isDisabled={isDisabled}
        agentMode={agentMode}
        onPromptChange={handlePromptChange}
        onSubmit={onSubmit}
        onStop={handleStopAutomation}
        onModeChange={handleModeChange}
      />
    </section>
  );
}
