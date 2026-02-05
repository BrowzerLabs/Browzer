import { create } from 'zustand';

import {
  ScheduledAutomation,
  ScheduledAutomationRun,
  CreateScheduledAutomationParams,
  UpdateScheduledAutomationParams,
} from '@/shared/types';

interface ScheduledAutomationStore {
  scheduledAutomations: ScheduledAutomation[];
  recentRuns: ScheduledAutomationRun[];
  isLoading: boolean;
  error: string | null;

  loadScheduledAutomations: () => Promise<void>;
  createScheduledAutomation: (
    params: CreateScheduledAutomationParams
  ) => Promise<ScheduledAutomation | null>;
  updateScheduledAutomation: (
    params: UpdateScheduledAutomationParams
  ) => Promise<ScheduledAutomation | null>;
  deleteScheduledAutomation: (id: string) => Promise<boolean>;
  toggleScheduledAutomation: (id: string, enabled: boolean) => Promise<boolean>;
  loadRecentRuns: (limit?: number) => Promise<void>;
  loadRunHistory: (
    scheduledAutomationId: string
  ) => Promise<ScheduledAutomationRun[]>;
  clearError: () => void;
}

export const useScheduledAutomationStore = create<ScheduledAutomationStore>(
  (set) => ({
    scheduledAutomations: [],
    recentRuns: [],
    isLoading: false,
    error: null,

    loadScheduledAutomations: async () => {
      set({ isLoading: true, error: null });
      try {
        const result =
          await window.scheduledAutomationAPI.getAllScheduledAutomations();
        if (result.success && result.data) {
          set({ scheduledAutomations: result.data, isLoading: false });
        } else {
          set({
            error: result.error || 'Failed to load automations',
            isLoading: false,
          });
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
      }
    },

    createScheduledAutomation: async (params) => {
      set({ isLoading: true, error: null });
      try {
        const result =
          await window.scheduledAutomationAPI.createScheduledAutomation(params);
        if (result.success && result.data) {
          const automation = result.data;
          set((state) => ({
            scheduledAutomations: [...state.scheduledAutomations, automation],
            isLoading: false,
          }));
          return automation;
        } else {
          set({
            error: result.error || 'Failed to create automation',
            isLoading: false,
          });
          return null;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
        return null;
      }
    },

    updateScheduledAutomation: async (params) => {
      set({ isLoading: true, error: null });
      try {
        const result =
          await window.scheduledAutomationAPI.updateScheduledAutomation(params);
        if (result.success && result.data) {
          const updatedAutomation = result.data;
          set((state) => ({
            scheduledAutomations: state.scheduledAutomations.map((a) =>
              a.id === params.id ? updatedAutomation : a
            ),
            isLoading: false,
          }));
          return updatedAutomation;
        } else {
          set({
            error: result.error || 'Failed to update automation',
            isLoading: false,
          });
          return null;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
        return null;
      }
    },

    deleteScheduledAutomation: async (id) => {
      set({ isLoading: true, error: null });
      try {
        const result =
          await window.scheduledAutomationAPI.deleteScheduledAutomation(id);
        if (result.success) {
          set((state) => ({
            scheduledAutomations: state.scheduledAutomations.filter(
              (a) => a.id !== id
            ),
            isLoading: false,
          }));
          return true;
        } else {
          set({
            error: result.error || 'Failed to delete automation',
            isLoading: false,
          });
          return false;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
        return false;
      }
    },

    toggleScheduledAutomation: async (id, enabled) => {
      set({ isLoading: true, error: null });
      try {
        const result =
          await window.scheduledAutomationAPI.toggleScheduledAutomation(
            id,
            enabled
          );
        if (result.success) {
          set((state) => ({
            scheduledAutomations: state.scheduledAutomations.map((a) =>
              a.id === id ? { ...a, enabled } : a
            ),
            isLoading: false,
          }));
          return true;
        } else {
          set({
            error: result.error || 'Failed to toggle automation',
            isLoading: false,
          });
          return false;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
        return false;
      }
    },

    loadRecentRuns: async (limit) => {
      set({ isLoading: true, error: null });
      try {
        const result = await window.scheduledAutomationAPI.getRecentRuns(limit);
        if (result.success && result.data) {
          set({ recentRuns: result.data, isLoading: false });
        } else {
          set({
            error: result.error || 'Failed to load runs',
            isLoading: false,
          });
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
      }
    },

    loadRunHistory: async (scheduledAutomationId) => {
      set({ isLoading: true, error: null });
      try {
        const result = await window.scheduledAutomationAPI.getRunHistory(
          scheduledAutomationId
        );
        if (result.success && result.data) {
          set({ isLoading: false });
          return result.data;
        } else {
          set({
            error: result.error || 'Failed to load run history',
            isLoading: false,
          });
          return [];
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
          isLoading: false,
        });
        return [];
      }
    },

    clearError: () => set({ error: null }),
  })
);
