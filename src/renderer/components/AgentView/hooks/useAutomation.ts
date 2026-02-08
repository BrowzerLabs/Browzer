import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import {
  extractWorkflowVariables,
  WorkflowVariable,
} from '../utils/extractVariables';
import { VariableValue } from '../VariableInputDialog';

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
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [selectedRecordingVariables, setSelectedRecordingVariables] = useState<
    WorkflowVariable[]
  >([]);
  const [pendingSubmitMode, setPendingSubmitMode] = useState<
    'automate' | 'autopilot' | null
  >(null);

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

    const unsubUpdateRecording = window.recordingAPI.onRecordingDeleted(
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
      unsubUpdateRecording();
    };
  }, [
    addEvent,
    updateSessionStatus,
    setSelectedRecording,
    selectedRecordingId,
    loadRecordings,
  ]);

  useEffect(() => {
    const loadVariables = async () => {
      if (!selectedRecordingId) {
        setSelectedRecordingVariables([]);
        return;
      }

      try {
        const recording =
          await window.recordingAPI.getRecording(selectedRecordingId);
        if (recording) {
          const variables = extractWorkflowVariables(recording.actions);
          setSelectedRecordingVariables(variables);
        }
      } catch (error) {
        console.error(
          '[useAutomation] Failed to load recording variables:',
          error
        );
        setSelectedRecordingVariables([]);
      }
    };

    loadVariables();
  }, [selectedRecordingId]);

  const buildGoalWithVariables = useCallback(
    (baseGoal: string, variableValues: VariableValue[]): string => {
      const customizations = variableValues
        .filter((v) => v.newValue !== v.originalValue)
        .map((v) => `${v.name}: ${v.newValue}`)
        .join(', ');

      if (customizations) {
        return `${baseGoal}\n\nUse the following values: ${customizations}`;
      }

      return baseGoal;
    },
    []
  );

  const executeAutomate = useCallback(
    async (finalGoal: string) => {
      if (!selectedRecordingId) {
        toast.error('Please select a recording to automate');
        return;
      }

      try {
        const result = await window.browserAPI.executeLLMAutomation(
          finalGoal,
          selectedRecordingId
        );

        if (result.success) {
          startSession(
            finalGoal,
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
    },
    [selectedRecordingId, startSession]
  );

  const executeAutopilot = useCallback(
    async (finalGoal: string) => {
      if (selectedRecordingId) {
        try {
          const recording =
            await window.recordingAPI.getRecording(selectedRecordingId);
          if (!recording) {
            toast.error(
              'Selected workflow could not be found. Please select a different workflow.'
            );
            setSelectedRecording(null);
            return;
          }
          console.log(
            '[useAutomation] Validated recording for autopilot:',
            recording.name
          );
        } catch (error) {
          console.error('[useAutomation] Failed to validate recording:', error);
          toast.error('Failed to load selected workflow. Please try again.');
          return;
        }
      }

      try {
        const result = await window.browserAPI.executeAutopilot(
          finalGoal,
          undefined,
          selectedRecordingId || undefined
        );

        if (result.success) {
          startSession(
            finalGoal,
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
    },
    [selectedRecordingId, startSession, setSelectedRecording]
  );

  const handleVariableConfirm = useCallback(
    (variableValues: VariableValue[]) => {
      const finalGoal = buildGoalWithVariables(userGoal, variableValues);

      if (pendingSubmitMode === 'automate') {
        executeAutomate(finalGoal);
      } else if (pendingSubmitMode === 'autopilot') {
        executeAutopilot(finalGoal);
      }

      setPendingSubmitMode(null);
    },
    [
      userGoal,
      pendingSubmitMode,
      buildGoalWithVariables,
      executeAutomate,
      executeAutopilot,
    ]
  );

  const handleSubmitAutomate = useCallback(async () => {
    if (!userGoal.trim()) {
      toast.error('Please enter a goal');
      return;
    }

    if (!selectedRecordingId) {
      toast.error('Please select a recording to automate');
      return;
    }

    if (selectedRecordingVariables.length > 0) {
      setPendingSubmitMode('automate');
      setShowVariableDialog(true);
      return;
    }

    await executeAutomate(userGoal);
  }, [
    userGoal,
    selectedRecordingId,
    selectedRecordingVariables,
    executeAutomate,
  ]);

  const handleSubmitAutopilot = useCallback(async () => {
    if (!userGoal.trim() || isRunning) {
      return;
    }

    if (selectedRecordingVariables.length > 0) {
      setPendingSubmitMode('autopilot');
      setShowVariableDialog(true);
      return;
    }

    await executeAutopilot(userGoal);
  }, [userGoal, isRunning, selectedRecordingVariables, executeAutopilot]);

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
    showVariableDialog,
    setShowVariableDialog,
    selectedRecordingVariables,
    handleVariableConfirm,
  };
}
