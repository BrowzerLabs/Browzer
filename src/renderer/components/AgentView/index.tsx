import { useEffect } from 'react';

import { AgentHeader } from './AgentHeader';
import { AgentChatArea } from './AgentChatArea';
import { AgentFooter } from './AgentFooter';
import { VariableInputDialog } from './VariableInputDialog';
import { useAutomation } from './hooks';

export default function AgentView() {
  const {
    agentMode,
    currentSession,
    selectedRecordingId,
    userGoal,
    recordings,
    isRunning,
    loadRecordings,
    handleNewSession,
    handleRecordingSelect,
    handleGoalChange,
    handleModeChange,
    handleSubmit,
    handleStop,
    showVariableDialog,
    setShowVariableDialog,
    selectedRecordingVariables,
    handleVariableConfirm,
    submittedInputs,
    handleInputSubmit,
    handleInputCancel,
  } = useAutomation();

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  return (
    <section className="flex flex-col h-full overflow-hidden">
      {(agentMode === 'automate' || agentMode === 'autopilot') && (
        <AgentHeader
          agentMode={agentMode}
          selectedRecordingId={selectedRecordingId}
          recordings={recordings}
          currentSession={currentSession}
          onRecordingSelect={handleRecordingSelect}
          onNewSession={handleNewSession}
        />
      )}

      <AgentChatArea
        agentMode={agentMode}
        currentSession={currentSession}
        selectedRecordingId={selectedRecordingId}
        onInputSubmit={handleInputSubmit}
        onInputCancel={handleInputCancel}
        submittedInputs={submittedInputs}
      />

      <AgentFooter
        userGoal={userGoal}
        selectedRecordingId={selectedRecordingId}
        isRunning={isRunning}
        agentMode={agentMode}
        onGoalChange={handleGoalChange}
        onSubmit={handleSubmit}
        onStop={handleStop}
        onModeChange={handleModeChange}
      />

      <VariableInputDialog
        open={showVariableDialog}
        onOpenChange={setShowVariableDialog}
        variables={selectedRecordingVariables}
        onConfirm={handleVariableConfirm}
        userGoal={userGoal}
      />
    </section>
  );
}
