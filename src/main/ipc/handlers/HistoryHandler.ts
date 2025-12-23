import { BaseHandler } from './base';

import { HistoryQuery } from '@/shared/types';

export class HistoryHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;
    const historyService = browserService.getHistoryService();

    this.handle('history:get-all', async (_, limit?: number) => {
      return historyService.getAll(limit);
    });

    this.handle('history:search', async (_, query: HistoryQuery) => {
      return historyService.search(query);
    });

    this.handle('history:get-today', async () => {
      return historyService.getToday();
    });

    this.handle('history:get-last-n-days', async (_, days: number) => {
      return historyService.getLastNDays(days);
    });

    this.handle('history:delete-entry', async (_, id: string) => {
      return historyService.deleteEntry(id);
    });

    this.handle('history:delete-entries', async (_, ids: string[]) => {
      return historyService.deleteEntries(ids);
    });

    this.handle(
      'history:delete-by-date-range',
      async (_, startTime: number, endTime: number) => {
        return historyService.deleteByDateRange(startTime, endTime);
      }
    );

    this.handle('history:clear-all', async () => {
      return historyService.clearAll();
    });

    this.handle('history:get-stats', async () => {
      return historyService.getStats();
    });

    this.handle('history:get-most-visited', async (_, limit?: number) => {
      return historyService.getMostVisited(limit);
    });

    this.handle('history:get-recently-visited', async (_, limit?: number) => {
      return historyService.getRecentlyVisited(limit);
    });
  }
}
