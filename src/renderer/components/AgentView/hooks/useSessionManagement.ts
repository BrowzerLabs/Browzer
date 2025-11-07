/**
 * useSessionManagement Hook
 * 
 * Handles session history loading and management
 * Loads session history on mount and provides refresh capability
 */

import { useEffect, useCallback } from 'react';
import { useAutomationStore } from '@/renderer/stores/automationStore';

export function useSessionManagement() {
  const { loadSessionHistory, sessionHistory, isLoadingHistory } = useAutomationStore();

  /**
   * Load session history on mount
   */
  useEffect(() => {
    loadSessionHistory();
  }, [loadSessionHistory]);

  /**
   * Refresh session history
   */
  const refreshHistory = useCallback(() => {
    loadSessionHistory();
  }, [loadSessionHistory]);

  return {
    sessionHistory,
    isLoadingHistory,
    refreshHistory,
  };
}
