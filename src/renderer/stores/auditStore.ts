import { create } from 'zustand';

import {
  AuditLog,
  AuditLogWithEvents,
  AuditStats,
  AuditFilters,
} from '@/shared/types/audit';

interface AuditStore {
  logs: AuditLog[];
  selectedLogId: string | null;
  selectedLog: AuditLogWithEvents | null;
  filters: AuditFilters;
  stats: AuditStats | null;
  isLoading: boolean;
  error: string | null;

  fetchLogs: (limit?: number, offset?: number) => Promise<void>;
  fetchLogById: (id: string) => Promise<void>;
  fetchFilteredLogs: (filters: AuditFilters) => Promise<void>;
  searchLogs: (query: string, limit?: number) => Promise<void>;
  deleteLog: (id: string) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  fetchStats: () => Promise<void>;
  setFilters: (filters: AuditFilters) => void;
  clearFilters: () => void;
  selectLog: (id: string | null) => void;
  clearError: () => void;
}

export const useAuditStore = create<AuditStore>()((set, get) => ({
  logs: [],
  selectedLogId: null,
  selectedLog: null,
  filters: {},
  stats: null,
  isLoading: false,
  error: null,

  fetchLogs: async (limit?: number, offset?: number) => {
    set({ isLoading: true, error: null });
    try {
      const logs = await window.auditAPI.getAllLogs(limit, offset);
      set({ logs, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
      });
    }
  },

  fetchLogById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const log = await window.auditAPI.getLogById(id);
      set({ selectedLog: log || null, selectedLogId: id, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch audit log:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch log',
      });
    }
  },

  fetchFilteredLogs: async (filters: AuditFilters) => {
    set({ isLoading: true, error: null, filters });
    try {
      const logs = await window.auditAPI.getFilteredLogs(filters);
      set({ logs, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch filtered audit logs:', error);
      set({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch filtered logs',
      });
    }
  },

  searchLogs: async (query: string, limit?: number) => {
    set({ isLoading: true, error: null });
    try {
      const logs = await window.auditAPI.searchLogs(query, limit);
      set({ logs, isLoading: false });
    } catch (error) {
      console.error('Failed to search audit logs:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to search logs',
      });
    }
  },

  deleteLog: async (id: string) => {
    try {
      const result = await window.auditAPI.deleteLog(id);
      if (result) {
        const { logs, selectedLogId } = get();
        set({
          logs: logs.filter((log) => log.id !== id),
          selectedLogId: selectedLogId === id ? null : selectedLogId,
          selectedLog: selectedLogId === id ? null : get().selectedLog,
        });
      }
      return result;
    } catch (error) {
      console.error('Failed to delete audit log:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete log',
      });
      return false;
    }
  },

  clearAll: async () => {
    try {
      const result = await window.auditAPI.clearAll();
      if (result) {
        set({
          logs: [],
          selectedLogId: null,
          selectedLog: null,
          stats: null,
        });
      }
      return result;
    } catch (error) {
      console.error('Failed to clear audit logs:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to clear logs',
      });
      return false;
    }
  },

  fetchStats: async () => {
    try {
      const stats = await window.auditAPI.getStats();
      set({ stats });
    } catch (error) {
      console.error('Failed to fetch audit stats:', error);
    }
  },

  setFilters: (filters: AuditFilters) => {
    set({ filters });
  },

  clearFilters: () => {
    set({ filters: {} });
  },

  selectLog: (id: string | null) => {
    set({ selectedLogId: id });
    if (id) {
      get().fetchLogById(id);
    } else {
      set({ selectedLog: null });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
