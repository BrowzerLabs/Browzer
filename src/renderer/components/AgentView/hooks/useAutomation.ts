import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import { AgentMode } from '../types';

import { useAutomationStore } from '@/renderer/stores/automationStore';
import { RecordingSession } from '@/shared/types';

export function useAutomation() {
  const {
    viewState,
    currentSession,
    sessionHistory,
    selectedRecordingId,
    userPrompt,
    isLoadingSession,
    isLoadingHistory,
    setSelectedRecording,
    setUserPrompt,
    startAutomation,
    startNewSession,
    loadStoredSession,
    loadSessionHistory,
    addEvent,
    completeAutomation,
    errorAutomation,
    stopAutomation,
  } = useAutomationStore();

  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>('automate');

  useEffect(() => {
    const unsubProgress = window.browserAPI.onAutomationProgress(
      (data: any) => {
        addEvent(data.sessionId, data.event);
      }
    );

    const unsubComplete = window.browserAPI.onAutomationComplete(
      (data: any) => {
        completeAutomation(data.sessionId, data.result);
        setIsSubmitting(false);
      }
    );

    const unsubError = window.browserAPI.onAutomationError((data: any) => {
      errorAutomation(data.sessionId, data.error);
      setIsSubmitting(false);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [addEvent, completeAutomation, errorAutomation]);

  useEffect(() => {
    loadSessionHistory();
  }, [loadSessionHistory]);

  const loadRecordings = useCallback(async () => {
    try {
      const allRecordings = await window.browserAPI.getAllRecordings();
      setRecordings(allRecordings);
    } catch (error) {
      console.error('[useAutomation] Failed to load recordings:', error);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!userPrompt.trim() || !selectedRecordingId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await window.browserAPI.executeLLMAutomation(
        userPrompt,
        selectedRecordingId
      );

      if (result.success) {
        startAutomation(userPrompt, selectedRecordingId, result.sessionId);
      } else {
        setIsSubmitting(false);
      }
    } catch (error) {
      setIsSubmitting(false);
    }
  }, [userPrompt, selectedRecordingId, isSubmitting, startAutomation]);

  const handleSessionSelect = useCallback(
    async (sessionId: string) => {
      await loadStoredSession(sessionId);
    },
    [loadStoredSession]
  );

  const handleNewSession = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  const handleRecordingSelect = useCallback(
    (recordingId: string | null) => {
      setSelectedRecording(recordingId);
    },
    [setSelectedRecording]
  );

  const handlePromptChange = useCallback(
    (prompt: string) => {
      setUserPrompt(prompt);
    },
    [setUserPrompt]
  );

  const handleStopAutomation = useCallback(async () => {
    if (currentSession && isSubmitting) {
      await stopAutomation(currentSession.sessionId);
      setIsSubmitting(false);
    }
  }, [currentSession, isSubmitting, stopAutomation]);

  const handleModeChange = useCallback((mode: AgentMode) => {
    setAgentMode(mode);
  }, []);

  const handleAskSubmit = useCallback(() => {
    if (!userPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }
    console.log('[Ask Mode] User submitted:', userPrompt);
    toast.info(userPrompt);
    setUserPrompt('');
  }, [userPrompt, setUserPrompt]);

  return {
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
    setIsSubmitting,
  };
}
