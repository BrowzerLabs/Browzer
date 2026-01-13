/**
 * Recording Store
 *
 * Zustand store for managing recording state in the renderer process.
 */

import { create } from 'zustand';

import type {
  RecordedAction,
  RecordingStatus,
  StoredWorkflowMetadata,
  WorkflowDefinition,
} from '@/preload/types/recording.types';

interface RecordingState {
  // Recording state
  status: RecordingStatus;
  sessionId: string | null;
  actions: RecordedAction[];
  isLoading: boolean;
  error: string | null;

  // Workflow management state
  workflows: StoredWorkflowMetadata[];
  selectedWorkflow: WorkflowDefinition | null;
  workflowsLoading: boolean;

  // View state
  activeTab: 'recording' | 'workflows';

  // Recording actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  discardRecording: () => Promise<void>;
  generateWorkflow: (name: string, description: string) => Promise<boolean>;

  // Workflow actions
  loadWorkflows: () => Promise<void>;
  loadWorkflow: (workflowId: string) => Promise<void>;
  deleteWorkflow: (workflowId: string) => Promise<boolean>;
  updateWorkflow: (
    workflowId: string,
    updates: { name?: string; description?: string }
  ) => Promise<boolean>;
  searchWorkflows: (query: string) => Promise<void>;
  clearSelectedWorkflow: () => void;
  enhanceWorkflow: (workflowId: string) => Promise<boolean>;

  // State setters
  setStatus: (status: RecordingStatus) => void;
  addAction: (action: RecordedAction) => void;
  setActiveTab: (tab: 'recording' | 'workflows') => void;
  setError: (error: string | null) => void;

  // Initialization
  initialize: () => void;
  cleanup: () => void;
}

export const useRecordingStore = create<RecordingState>((set, get) => {
  // Store cleanup functions for event listeners
  let cleanupFns: (() => void)[] = [];

  return {
    // Initial state
    status: 'idle',
    sessionId: null,
    actions: [],
    isLoading: false,
    error: null,
    workflows: [],
    selectedWorkflow: null,
    workflowsLoading: false,
    activeTab: 'recording',

    // Recording actions
    startRecording: async () => {
      set({ isLoading: true, error: null });
      try {
        const result = await window.recordingAPI.startRecording();
        set({
          status: 'recording',
          sessionId: result.sessionId,
          actions: [],
          isLoading: false,
        });
      } catch (error) {
        set({
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to start recording',
        });
      }
    },

    stopRecording: async () => {
      set({ isLoading: true });
      try {
        const session = await window.recordingAPI.stopRecording();
        if (session) {
          set({
            status: 'stopped',
            actions: session.actions,
            isLoading: false,
          });
        } else {
          set({ isLoading: false });
        }
      } catch (error) {
        set({
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to stop recording',
        });
      }
    },

    discardRecording: async () => {
      try {
        await window.recordingAPI.discardRecording();
        set({
          status: 'idle',
          sessionId: null,
          actions: [],
          error: null,
        });
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to discard recording',
        });
      }
    },

    generateWorkflow: async (name: string, description: string) => {
      set({ isLoading: true });
      try {
        const result = await window.recordingAPI.generateWorkflow(
          name,
          description
        );
        if (result) {
          set({
            status: 'idle',
            sessionId: null,
            actions: [],
            isLoading: false,
          });
          // Reload workflows list
          await get().loadWorkflows();
          return true;
        }
        set({ isLoading: false });
        return false;
      } catch (error) {
        set({
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to generate workflow',
        });
        return false;
      }
    },

    // Workflow actions
    loadWorkflows: async () => {
      set({ workflowsLoading: true });
      try {
        const workflows = await window.recordingAPI.listWorkflows();
        set({ workflows, workflowsLoading: false });
      } catch (error) {
        set({
          workflowsLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to load workflows',
        });
      }
    },

    loadWorkflow: async (workflowId: string) => {
      set({ isLoading: true });
      try {
        const workflow = await window.recordingAPI.getWorkflow(workflowId);
        set({ selectedWorkflow: workflow, isLoading: false });
      } catch (error) {
        set({
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to load workflow',
        });
      }
    },

    deleteWorkflow: async (workflowId: string) => {
      try {
        const success = await window.recordingAPI.deleteWorkflow(workflowId);
        if (success) {
          set((state) => ({
            workflows: state.workflows.filter((w) => w.id !== workflowId),
            selectedWorkflow:
              state.selectedWorkflow?.id === workflowId
                ? null
                : state.selectedWorkflow,
          }));
        }
        return success;
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to delete workflow',
        });
        return false;
      }
    },

    updateWorkflow: async (
      workflowId: string,
      updates: { name?: string; description?: string }
    ) => {
      try {
        const success = await window.recordingAPI.updateWorkflow(
          workflowId,
          updates
        );
        if (success) {
          await get().loadWorkflows();
          if (get().selectedWorkflow?.id === workflowId) {
            await get().loadWorkflow(workflowId);
          }
        }
        return success;
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update workflow',
        });
        return false;
      }
    },

    searchWorkflows: async (query: string) => {
      set({ workflowsLoading: true });
      try {
        const workflows = await window.recordingAPI.searchWorkflows(query);
        set({ workflows, workflowsLoading: false });
      } catch (error) {
        set({
          workflowsLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to search workflows',
        });
      }
    },

    clearSelectedWorkflow: () => {
      set({ selectedWorkflow: null });
    },

    enhanceWorkflow: async (workflowId: string) => {
      set({ isLoading: true, error: null });
      try {
        const result = await window.recordingAPI.enhanceWorkflow(workflowId, {
          improveDescriptions: true,
          detectVariables: true,
        });

        if (result.success && result.workflow) {
          // Update the selected workflow with enhanced version
          set({
            selectedWorkflow: result.workflow,
            isLoading: false,
          });
          // Refresh workflows list
          await get().loadWorkflows();
          return true;
        } else {
          set({
            isLoading: false,
            error: result.error || 'Failed to enhance workflow',
          });
          return false;
        }
      } catch (error) {
        set({
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to enhance workflow',
        });
        return false;
      }
    },

    // State setters
    setStatus: (status: RecordingStatus) => set({ status }),

    addAction: (action: RecordedAction) => {
      set((state) => ({
        actions: [...state.actions, action],
      }));
    },

    setActiveTab: (tab: 'recording' | 'workflows') => set({ activeTab: tab }),

    setError: (error: string | null) => set({ error }),

    // Initialization - subscribe to IPC events
    initialize: () => {
      // Subscribe to recording events
      const unsubStarted = window.recordingAPI.onRecordingStarted((data) => {
        set({
          status: 'recording',
          sessionId: data.sessionId,
          actions: [],
        });
      });

      const unsubStopped = window.recordingAPI.onRecordingStopped((data) => {
        set({
          status: 'stopped',
          actions: data.session?.actions || [],
        });
      });

      const unsubAction = window.recordingAPI.onRecordingAction((action) => {
        set((state) => ({
          actions: [...state.actions, action],
        }));
      });

      const unsubStateChanged = window.recordingAPI.onRecordingStateChanged(
        (state) => {
          set({
            status: state.status,
            sessionId: state.sessionId || null,
          });
        }
      );

      cleanupFns = [unsubStarted, unsubStopped, unsubAction, unsubStateChanged];

      // Load initial status
      window.recordingAPI.getStatus().then((status) => {
        set({
          status: status.status,
          sessionId: status.sessionId || null,
          actions: status.actions || [],
        });
      });

      // Load workflows
      get().loadWorkflows();
    },

    cleanup: () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
    },
  };
});
