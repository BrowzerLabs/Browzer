import { create } from 'zustand';

import type {
  NotionConnectionState,
  NotionWorkspace,
  NotionOwner,
} from '@/shared/types';

interface NotionSyncState {
  isSyncing: boolean;
  syncStatus: string | null;
  lastSyncAt: string | null;
  totalDocuments: number;
  syncProgress: number;
  currentStep: string | null;
  syncError: string | null;
}

interface IntegrationStore {
  notion: NotionConnectionState;
  notionSync: NotionSyncState;
  initialized: boolean;

  setNotionState: (state: Partial<NotionConnectionState>) => void;
  setNotionLoading: (loading: boolean) => void;
  setNotionError: (error: string | null) => void;
  setNotionConnected: (workspace: NotionWorkspace, owner: NotionOwner) => void;
  clearNotionConnection: () => void;
  setInitialized: (initialized: boolean) => void;
  setNotionSyncState: (state: Partial<NotionSyncState>) => void;
  startNotionSync: () => void;
  updateSyncProgress: (progress: number, step: string) => void;
  completeSyncSuccess: (totalDocuments: number) => void;
  completeSyncError: (error: string) => void;
}

const initialNotionState: NotionConnectionState = {
  isConnected: false,
  isLoading: false,
  error: null,
  workspace: null,
  owner: null,
};

const initialSyncState: NotionSyncState = {
  isSyncing: false,
  syncStatus: null,
  lastSyncAt: null,
  totalDocuments: 0,
  syncProgress: 0,
  currentStep: null,
  syncError: null,
};

export const useIntegrationStore = create<IntegrationStore>((set) => ({
  notion: initialNotionState,
  notionSync: initialSyncState,
  initialized: false,

  setNotionState: (state) =>
    set((prev) => ({
      notion: { ...prev.notion, ...state },
    })),

  setNotionLoading: (loading) =>
    set((prev) => ({
      notion: { ...prev.notion, isLoading: loading },
    })),

  setNotionError: (error) =>
    set((prev) => ({
      notion: { ...prev.notion, error, isLoading: false },
    })),

  setNotionConnected: (workspace, owner) =>
    set({
      notion: {
        isConnected: true,
        isLoading: false,
        error: null,
        workspace,
        owner,
      },
    }),

  clearNotionConnection: () =>
    set({
      notion: initialNotionState,
      notionSync: initialSyncState,
    }),

  setInitialized: (initialized) => set({ initialized }),

  setNotionSyncState: (state) =>
    set((prev) => ({
      notionSync: { ...prev.notionSync, ...state },
    })),

  startNotionSync: () =>
    set((prev) => ({
      notionSync: {
        ...prev.notionSync,
        isSyncing: true,
        syncProgress: 0,
        currentStep: 'Starting sync...',
        syncError: null,
      },
    })),

  updateSyncProgress: (progress, step) =>
    set((prev) => ({
      notionSync: {
        ...prev.notionSync,
        syncProgress: progress,
        currentStep: step,
      },
    })),

  completeSyncSuccess: (totalDocuments) =>
    set((prev) => ({
      notionSync: {
        ...prev.notionSync,
        isSyncing: false,
        syncStatus: 'completed',
        lastSyncAt: new Date().toISOString(),
        totalDocuments,
        syncProgress: 100,
        currentStep: null,
      },
    })),

  completeSyncError: (error) =>
    set((prev) => ({
      notionSync: {
        ...prev.notionSync,
        isSyncing: false,
        syncStatus: 'failed',
        syncError: error,
        currentStep: null,
      },
    })),
}));
