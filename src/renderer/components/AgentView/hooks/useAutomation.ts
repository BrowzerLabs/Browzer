import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import {
  useAutomationStore,
  AgentMode,
} from '@/renderer/stores/automationStore';
import { RecordingSession, AutomationStatus } from '@/shared/types';

export function useAutomation() {
  const {
    agentMode,
    currentSession,
    selectedRecordingId,
    userGoal,
    setAgentMode,
    setSelectedRecording,
    setUserGoal,
    startSession,
    addEvent,
    updateSessionStatus,
    clearSession,
  } = useAutomationStore();

  const [recordings, setRecordings] = useState<RecordingSession[]>([]);

  const isRunning = currentSession?.status === AutomationStatus.RUNNING;

  const loadRecordings = useCallback(async () => {
    try {
      const allRecordings = await window.recordingAPI.getAllRecordings();
      setRecordings(allRecordings);
    } catch (error) {
      console.error('[useAutomation] Failed to load recordings:', error);
    }
  }, []);

  useEffect(() => {
    const unsubProgress = window.browserAPI.onAutomationProgress(
      (data: any) => {
        addEvent(data.sessionId, data.event);
      }
    );

    const unsubComplete = window.browserAPI.onAutomationComplete(
      (data: any) => {
        updateSessionStatus(
          data.sessionId,
          AutomationStatus.COMPLETED,
          data.result
        );
      }
    );

    const unsubError = window.browserAPI.onAutomationError((data: any) => {
      updateSessionStatus(
        data.sessionId,
        AutomationStatus.FAILED,
        undefined,
        data.error
      );
    });

    const onsubUpdateRecording = window.recordingAPI.onRecordingDeleted(
      async (recordingId: string) => {
        await loadRecordings();
        if (selectedRecordingId === recordingId) {
          toast.warning('Selected recording was deleted');
          setSelectedRecording(null);
        }
      }
    );

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      onsubUpdateRecording();
    };
  }, [
    addEvent,
    updateSessionStatus,
    setSelectedRecording,
    selectedRecordingId,
    loadRecordings,
  ]);

  const handleSubmitAutomate = useCallback(async () => {
    if (!userGoal.trim()) {
      toast.error('Please enter a goal');
      return;
    }

    if (!selectedRecordingId) {
      toast.error('Please select a recording to automate');
      return;
    }

    try {
      const result = await window.browserAPI.executeLLMAutomation(
        userGoal,
        selectedRecordingId
      );

      if (result.success) {
        startSession(
          userGoal,
          'automate',
          selectedRecordingId,
          result.sessionId
        );
      } else {
        toast.error(result.message || 'Failed to start automation');
      }
    } catch (error) {
      console.error('[useAutomation] Automate error:', error);
      toast.error('Failed to start automation');
    }
  }, [userGoal, selectedRecordingId, isRunning, startSession]);

  const handleSubmitAutopilot = useCallback(async () => {
    if (!userGoal.trim() || isRunning) {
      return;
    }

    try {
      const result = await window.browserAPI.executeAutopilot(
        userGoal,
        undefined,
        selectedRecordingId || undefined
      );

      if (result.success) {
        startSession(
          userGoal,
          'autopilot',
          selectedRecordingId,
          result.sessionId
        );
      } else {
        toast.error(result.message || 'Failed to start autopilot');
      }
    } catch (error) {
      console.error('[useAutomation] Autopilot error:', error);
      toast.error('Failed to start autopilot');
    }
  }, [userGoal, selectedRecordingId, isRunning, startSession]);

  const handleSubmitAsk = useCallback(() => {
    if (!userGoal.trim()) {
      toast.error('Please enter a prompt');
      return;
    }
    console.log('[Ask Mode] User submitted:', userGoal);
    toast.info('Ask mode coming soon!');
    setUserGoal('');
  }, [userGoal, setUserGoal]);

  const handleRecordingSelect = useCallback(
    (recordingId: string | null) => {
      setSelectedRecording(recordingId);
    },
    [setSelectedRecording]
  );

  const handleSubmit = useCallback(() => {
    switch (agentMode) {
      case 'automate':
        return handleSubmitAutomate();
      case 'autopilot':
        return handleSubmitAutopilot();
      case 'ask':
        return handleSubmitAsk();
      default:
        toast.error('Invalid agent mode');
        return;
    }
  }, [agentMode, handleSubmitAutomate, handleSubmitAutopilot, handleSubmitAsk]);

  const handleStop = useCallback(async () => {
    if (!currentSession || !isRunning) {
      return;
    }

    try {
      if (currentSession.agentMode === 'autopilot') {
        await window.browserAPI.stopAutopilot(currentSession.sessionId);
      } else {
        await window.browserAPI.stopAutomation(currentSession.sessionId);
      }

      updateSessionStatus(
        currentSession.sessionId,
        AutomationStatus.STOPPED,
        undefined,
        'Stopped by user'
      );
    } catch (error) {
      console.error('[useAutomation] Stop error:', error);
      toast.error('Failed to stop automation');
    }
  }, [currentSession, isRunning, updateSessionStatus]);

  const handleModeChange = useCallback(
    (mode: AgentMode) => {
      setAgentMode(mode);

      if (mode === 'automate') {
        if (!selectedRecordingId && recordings.length > 0) {
          setSelectedRecording(recordings[0].id);
        } else if (recordings.length === 0) {
          toast.warning(
            'No recordings available. You need to select a recording first before automate.'
          );
        }
      }
    },
    [setAgentMode, selectedRecordingId, recordings, setSelectedRecording]
  );

  return {
    agentMode,
    currentSession,
    selectedRecordingId,
    userGoal,
    recordings,
    isRunning,
    loadRecordings,
    handleSubmit,
    handleStop,
    handleRecordingSelect,
    handleModeChange,
    handleGoalChange: setUserGoal,
    handleNewSession: clearSession,
  };
}
