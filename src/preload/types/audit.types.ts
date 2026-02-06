import {
  AuditLog,
  AuditLogWithEvents,
  AuditStats,
  AuditFilters,
} from '@/shared/types/audit';

export interface AuditAPI {
  getAllLogs: (limit?: number, offset?: number) => Promise<AuditLog[]>;
  getLogById: (id: string) => Promise<AuditLogWithEvents | undefined>;
  getFilteredLogs: (filters: AuditFilters) => Promise<AuditLog[]>;
  searchLogs: (query: string, limit?: number) => Promise<AuditLog[]>;
  deleteLog: (id: string) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  getStats: () => Promise<AuditStats>;
  getVideoUrl: (auditId: string) => Promise<string | null>;
}
