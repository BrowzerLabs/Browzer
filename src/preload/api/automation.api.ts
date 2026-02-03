import { ipcRenderer } from 'electron';

import { AutomationAPI } from '@/preload/types/automation.types';
import {
  ScheduledAutomation,
  ScheduledAutomationRun,
  CreateScheduledAutomationParams,
  UpdateScheduledAutomationParams,
} from '@/shared/types';

export const createAutomationAPI = (): AutomationAPI => ({
  createScheduledAutomation: async (
    params: CreateScheduledAutomationParams
  ): Promise<{
    success: boolean;
    data?: ScheduledAutomation;
    error?: string;
  }> => {
    return ipcRenderer.invoke('scheduled-automation:create', params);
  },

  updateScheduledAutomation: async (
    params: UpdateScheduledAutomationParams
  ): Promise<{
    success: boolean;
    data?: ScheduledAutomation;
    error?: string;
  }> => {
    return ipcRenderer.invoke('scheduled-automation:update', params);
  },

  deleteScheduledAutomation: async (
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('scheduled-automation:delete', id);
  },

  getScheduledAutomation: async (
    id: string
  ): Promise<{
    success: boolean;
    data?: ScheduledAutomation;
    error?: string;
  }> => {
    return ipcRenderer.invoke('scheduled-automation:get', id);
  },

  getAllScheduledAutomations: async (): Promise<{
    success: boolean;
    data?: ScheduledAutomation[];
    error?: string;
  }> => {
    return ipcRenderer.invoke('scheduled-automation:get-all');
  },

  toggleScheduledAutomation: async (
    id: string,
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('scheduled-automation:toggle', id, enabled);
  },

  getRunHistory: async (
    scheduledAutomationId: string
  ): Promise<{
    success: boolean;
    data?: ScheduledAutomationRun[];
    error?: string;
  }> => {
    return ipcRenderer.invoke(
      'scheduled-automation:get-run-history',
      scheduledAutomationId
    );
  },

  getRecentRuns: async (
    limit?: number
  ): Promise<{
    success: boolean;
    data?: ScheduledAutomationRun[];
    error?: string;
  }> => {
    return ipcRenderer.invoke('scheduled-automation:get-recent-runs', limit);
  },
});
