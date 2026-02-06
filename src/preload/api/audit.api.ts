import { AuditAPI } from '../types/audit.types';

import { invoke } from '@/preload/utils/ipc-helpers';
import { AuditFilters } from '@/shared/types/audit';

export const createAuditAPI = (): AuditAPI => ({
  getAllLogs: (limit?: number, offset?: number) =>
    invoke('audit:get-all', limit, offset),
  getLogById: (id: string) => invoke('audit:get-by-id', id),
  getFilteredLogs: (filters: AuditFilters) =>
    invoke('audit:get-filtered', filters),
  searchLogs: (query: string, limit?: number) =>
    invoke('audit:search', query, limit),
  deleteLog: (id: string) => invoke('audit:delete', id),
  clearAll: () => invoke('audit:clear-all'),
  getStats: () => invoke('audit:get-stats'),
  getVideoUrl: (auditId: string) => invoke('audit:get-video-url', auditId),
});
