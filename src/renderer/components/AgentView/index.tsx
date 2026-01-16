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
    handleSessionSelect,
    handleNewSession,
    handleRecordingSelect,
    handlePromptChange,
    handleModeChange,
    handleUnifiedSubmit,
    handleUnifiedStop,
  } = useAutomation();

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const isDisabled = currentSession?.status === 'running';

  return (
    <section className="flex flex-col h-full overflow-hidden">
      {/* Only show AgentHeader in automate mode (recording-based automation) */}
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
        onSubmit={handleUnifiedSubmit}
        onStop={handleUnifiedStop}
        onModeChange={handleModeChange}
      />
    </section>
  );
}
