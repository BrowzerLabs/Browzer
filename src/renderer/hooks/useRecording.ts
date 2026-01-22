import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import { useSidebarStore } from '../store/useSidebarStore';

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showSidebar } = useSidebarStore();

  useEffect(() => {
    window.recordingAPI
      .isRecording()
      .then(setIsRecording)
      .catch(() => setIsRecording(false));
  }, []);

  const startRecording = useCallback(async () => {
    setIsLoading(true);

    const promise = window.recordingAPI.startRecording();

    toast.promise(promise, {
      loading: 'Starting recording...',
      success: 'Recording started successfully',
      error: 'Failed to start recording',
    });

    try {
      const success = await promise;
      if (success) {
        setIsRecording(true);
        showSidebar();
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, [showSidebar]);

  const stopRecording = useCallback(async () => {
    setIsLoading(true);

    const promise = window.recordingAPI.stopRecording();

    toast.promise(promise, {
      loading: 'Stopping recording...',
      success: 'Recording stopped successfully',
      error: 'Failed to stop recording',
    });

    try {
      const recordedActions = await promise;
      setIsRecording(false);
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

  return {
    isRecording,
    isLoading,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
