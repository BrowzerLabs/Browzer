import { create } from 'zustand';

import {
  ScheduledAutomation,
  ScheduledAutomationStatus,
  CreateScheduledAutomationInput,
  ScheduledAutomationRunLog,
} from '@/shared/types';

interface SchedulerStore {
  scheduledAutomations: ScheduledAutomation[];
  isLoading: boolean;
  error: string | null;

  loadScheduledAutomations: () => Promise<void>;
  createScheduledAutomation: (
    input: CreateScheduledAutomationInput
  ) => Promise<ScheduledAutomation | null>;
  updateScheduledAutomation: (
    id: string,
    updates: Partial<CreateScheduledAutomationInput>
  ) => Promise<boolean>;
  deleteScheduledAutomation: (id: string) => Promise<boolean>;
  pauseScheduledAutomation: (id: string) => Promise<boolean>;
  resumeScheduledAutomation: (id: string) => Promise<boolean>;
  getRunLogs: (id: string) => Promise<ScheduledAutomationRunLog[]>;
  setScheduledAutomations: (automations: ScheduledAutomation[]) => void;
}

export const useSchedulerStore = create<SchedulerStore>()((set) => ({
  scheduledAutomations: [],
  isLoading: false,
  error: null,

  loadScheduledAutomations: async () => {
    set({ isLoading: true, error: null });
    try {
      const automations = await window.browserAPI.getScheduledAutomations();
      set({ scheduledAutomations: automations, isLoading: false });
    } catch (error) {
      console.error('[SchedulerStore] Failed to load:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load',
        isLoading: false,
      });
    }
  },

  createScheduledAutomation: async (input) => {
    try {
      const automation =
        await window.browserAPI.createScheduledAutomation(input);
      set((state) => ({
        scheduledAutomations: [...state.scheduledAutomations, automation],
      }));
      return automation;
    } catch (error) {
      console.error('[SchedulerStore] Failed to create:', error);
      return null;
    }
  },

  updateScheduledAutomation: async (id, updates) => {
    try {
      const updated = await window.browserAPI.updateScheduledAutomation(
        id,
        updates
      );
      if (updated) {
        set((state) => ({
          scheduledAutomations: state.scheduledAutomations.map((a) =>
            a.id === id ? updated : a
          ),
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SchedulerStore] Failed to update:', error);
      return false;
    }
  },

  deleteScheduledAutomation: async (id) => {
    try {
      const success = await window.browserAPI.deleteScheduledAutomation(id);
      if (success) {
        set((state) => ({
          scheduledAutomations: state.scheduledAutomations.filter(
            (a) => a.id !== id
          ),
        }));
      }
      return success;
    } catch (error) {
      console.error('[SchedulerStore] Failed to delete:', error);
      return false;
    }
  },

  pauseScheduledAutomation: async (id) => {
    try {
      const success = await window.browserAPI.pauseScheduledAutomation(id);
      if (success) {
        set((state) => ({
          scheduledAutomations: state.scheduledAutomations.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: ScheduledAutomationStatus.PAUSED,
                  updatedAt: Date.now(),
                }
              : a
          ),
        }));
      }
      return success;
    } catch (error) {
      console.error('[SchedulerStore] Failed to pause:', error);
      return false;
    }
  },

  resumeScheduledAutomation: async (id) => {
    try {
      const success = await window.browserAPI.resumeScheduledAutomation(id);
      if (success) {
        set((state) => ({
          scheduledAutomations: state.scheduledAutomations.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: ScheduledAutomationStatus.ACTIVE,
                  updatedAt: Date.now(),
                }
              : a
          ),
        }));
      }
      return success;
    } catch (error) {
      console.error('[SchedulerStore] Failed to resume:', error);
      return false;
    }
  },

  getRunLogs: async (id) => {
    try {
      return await window.browserAPI.getScheduledAutomationRunLogs(id);
    } catch (error) {
      console.error('[SchedulerStore] Failed to get run logs:', error);
      return [];
    }
  },

  setScheduledAutomations: (automations) => {
    set({ scheduledAutomations: automations });
  },
}));
