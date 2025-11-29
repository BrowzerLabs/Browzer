import { useState, useCallback, useEffect } from 'react';
import { useSidebarStore } from '../store/useSidebarStore';
import { toast } from 'sonner';
import { RecordedAction } from '../../shared/types';

/**
 * React hook for action recording
 */
export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const { showSidebar } = useSidebarStore();

  // Check recording status on mount
  useEffect(() => {
    window.browserAPI.isRecording().then(setIsRecording);
  }, []);

  const startRecording = useCallback(async () => {
    setIsLoading(true);
    
    const promise = window.browserAPI.startRecording();
    
    toast.promise(promise, {
      loading: 'Starting recording...',
      success: 'Recording started successfully',
      error: 'Failed to start recording',
    });
    
    try {
      const success = await promise;
      if (success) {
        setIsRecording(true);
        setActions([]);
        showSidebar();
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, [showSidebar]);

  const stopRecording = useCallback(async () => {
    setIsLoading(true);
    
    const promise = window.browserAPI.stopRecording();
    
    toast.promise(promise, {
      loading: 'Stopping recording...',
      success: 'Recording stopped successfully',
      error: 'Failed to stop recording',
    });
    
    try {
      const recordedActions = await promise;
      setIsRecording(false);
      setActions(recordedActions.actions);
      return recordedActions;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      return await stopRecording();
    } else {
      return await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const getActions = useCallback(async () => {
    const recordedActions = await window.browserAPI.getRecordedActions();
    setActions(recordedActions || []);
    return recordedActions;
  }, []);

  return {
    isRecording,
    isLoading,
    actions,
    startRecording,
    stopRecording,
    toggleRecording,
    getActions,
  };
}