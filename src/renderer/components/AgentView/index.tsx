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
    loadRecordings,
    handleSubmit,
    handleSessionSelect,
    handleNewSession,
    handleRecordingSelect,
    handlePromptChange,
  } = useAutomation();

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const isDisabled = currentSession?.status === 'running';

  return (
    <section className="flex flex-col h-full overflow-hidden">
      <AgentHeader
        viewMode={viewState}
        selectedRecordingId={selectedRecordingId}
        recordings={recordings}
        currentSession={currentSession}
        onRecordingSelect={handleRecordingSelect}
        onNewSession={handleNewSession}
        isDisabled={isDisabled}
      />

      <AgentChatArea
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
        onPromptChange={handlePromptChange}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
