import { BaseHandler } from './base';

import { AuditFilters } from '@/shared/types/audit';

export class AuditHandler extends BaseHandler {
  register(): void {
    const { auditService } = this.context;

    this.handle('audit:get-all', async (_, limit?: number, offset?: number) => {
      return auditService.getAllLogs(limit, offset);
    });

    this.handle('audit:get-by-id', async (_, id: string) => {
      return auditService.getLogWithEvents(id);
    });

    this.handle('audit:get-filtered', async (_, filters: AuditFilters) => {
      return auditService.getFilteredLogs(filters);
    });

    this.handle('audit:search', async (_, query: string, limit?: number) => {
      return auditService.searchLogs(query, limit);
    });

    this.handle('audit:delete', async (_, id: string) => {
      return auditService.deleteLog(id);
    });

    this.handle('audit:clear-all', async () => {
      auditService.clearAll();
      return true;
    });

    this.handle('audit:get-stats', async () => {
      return auditService.getStats();
    });

    this.handle('audit:get-video-url', async (_, auditId: string) => {
      const log = auditService.getLog(auditId);
      return log?.videoPath ? `video-file://${log.videoPath}` : null;
    });
  }
}
