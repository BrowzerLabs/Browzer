/**
 * useAgentView Hook
 * 
 * Main state management and orchestration logic for AgentView
 * Handles view state, form submission, and coordination between sub-components
 */

import { useState, useCallback } from 'react';
import { useAutomationStore } from '@/renderer/stores/automationStore';
import { RecordingSession } from '@/shared/types';

export function useAgentView() {
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
  } = useAutomationStore();

  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Load recordings from main process
   */
  const loadRecordings = useCallback(async () => {
    try {
      const allRecordings = await window.browserAPI.getAllRecordings();
      setRecordings(allRecordings);
    } catch (error) {
      console.error('[useAgentView] Failed to load recordings:', error);
    }
  }, []);

  /**
   * Handle form submission
   */
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
        console.error('[useAgentView] Automation failed to start');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('[useAgentView] Error starting automation:', error);
      setIsSubmitting(false);
    }
  }, [userPrompt, selectedRecordingId, isSubmitting, startAutomation]);

  /**
   * Handle session selection from history
   */
  const handleSessionSelect = useCallback(async (sessionId: string) => {
    await loadStoredSession(sessionId);
  }, [loadStoredSession]);

  /**
   * Handle new session creation
   */
  const handleNewSession = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  /**
   * Handle recording selection
   */
  const handleRecordingSelect = useCallback((recordingId: string | null) => {
    setSelectedRecording(recordingId);
  }, [setSelectedRecording]);

  /**
   * Handle prompt change
   */
  const handlePromptChange = useCallback((prompt: string) => {
    setUserPrompt(prompt);
  }, [setUserPrompt]);

  return {
    // State
    viewState,
    currentSession,
    sessionHistory,
    selectedRecordingId,
    userPrompt,
    recordings,
    isSubmitting,
    isLoadingSession,
    isLoadingHistory,

    // Actions
    loadRecordings,
    handleSubmit,
    handleSessionSelect,
    handleNewSession,
    handleRecordingSelect,
    handlePromptChange,
    setIsSubmitting,
  };
}
