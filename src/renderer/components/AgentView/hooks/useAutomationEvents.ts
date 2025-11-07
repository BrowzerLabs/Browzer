/**
 * useAutomationEvents Hook
 * 
 * Handles subscription to automation events from main process
 * Updates store when progress, completion, or error events are received
 */

import { useEffect } from 'react';
import { useAutomationStore } from '@/renderer/stores/automationStore';

export function useAutomationEvents(setIsSubmitting: (value: boolean) => void) {
  const { addEvent, completeAutomation, errorAutomation } = useAutomationStore();

  useEffect(() => {
    // Subscribe to automation progress events
    const unsubProgress = window.browserAPI.onAutomationProgress((data) => {
      addEvent(data.sessionId, data.event);
    });

    // Subscribe to automation completion events
    const unsubComplete = window.browserAPI.onAutomationComplete((data) => {
      completeAutomation(data.sessionId, data.result);
      setIsSubmitting(false);
    });

    // Subscribe to automation error events
    const unsubError = window.browserAPI.onAutomationError((data) => {
      errorAutomation(data.sessionId, data.error);
      setIsSubmitting(false);
    });

    // Cleanup subscriptions on unmount
    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [addEvent, completeAutomation, errorAutomation, setIsSubmitting]);
}
