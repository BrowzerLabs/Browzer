import { useState, useCallback, useEffect } from 'react';
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
  } = useAutomationStore();

  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    console.log('[useAutomation] Setting up automation event listeners');

    const unsubProgress = window.browserAPI.onAutomationProgress((data: any) => {
      console.log('[useAutomation] Progress event:', data.event.type);
      addEvent(data.sessionId, data.event);
    });

    const unsubComplete = window.browserAPI.onAutomationComplete((data: any) => {
      console.log('[useAutomation] Automation completed:', data.sessionId);
      completeAutomation(data.sessionId, data.result);
      setIsSubmitting(false);
    });

    const unsubError = window.browserAPI.onAutomationError((data: any) => {
      console.error('[useAutomation] Automation error:', data.error);
      errorAutomation(data.sessionId, data.error);
      setIsSubmitting(false);
    });

    return () => {
      console.log('[useAutomation] Cleaning up event listeners');
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [addEvent, completeAutomation, errorAutomation]);

  useEffect(() => {
    console.log('[useAutomation] Loading session history');
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
        // Start automation with persistent session ID
        startAutomation(userPrompt, selectedRecordingId, result.sessionId);
      } else {
        console.error('[useAutomation] Automation failed to start');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('[useAutomation] Error starting automation:', error);
      setIsSubmitting(false);
    }finally{
      setIsSubmitting(false);
    }
  }, [userPrompt, selectedRecordingId, isSubmitting, startAutomation]);

  const handleSessionSelect = useCallback(async (sessionId: string) => {
    await loadStoredSession(sessionId);
  }, [loadStoredSession]);

  const handleNewSession = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  const handleRecordingSelect = useCallback((recordingId: string | null) => {
    setSelectedRecording(recordingId);
  }, [setSelectedRecording]);

  const handlePromptChange = useCallback((prompt: string) => {
    setUserPrompt(prompt);
  }, [setUserPrompt]);

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
    loadRecordings,
    handleSubmit,
    handleSessionSelect,
    handleNewSession,
    handleRecordingSelect,
    handlePromptChange,
    setIsSubmitting,
  };
}
