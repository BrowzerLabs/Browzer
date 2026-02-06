import { BaseHandler } from './base';

import { CreateScheduledAutomationInput } from '@/shared/types';

export class SchedulerHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;
    const schedulerService = browserService.getSchedulerService();

    this.handle(
      'scheduler:create',
      async (_, input: CreateScheduledAutomationInput) => {
        return schedulerService.createScheduledAutomation(input);
      }
    );

    this.handle('scheduler:get-all', async () => {
      return schedulerService.getAll();
    });

    this.handle('scheduler:get-by-id', async (_, id: string) => {
      return schedulerService.getById(id) ?? null;
    });

    this.handle(
      'scheduler:update',
      async (
        _,
        id: string,
        updates: Partial<CreateScheduledAutomationInput>
      ) => {
        return schedulerService.updateScheduledAutomation(id, updates);
      }
    );

    this.handle('scheduler:delete', async (_, id: string) => {
      return schedulerService.deleteScheduledAutomation(id);
    });

    this.handle('scheduler:pause', async (_, id: string) => {
      return schedulerService.pauseScheduledAutomation(id);
    });

    this.handle('scheduler:resume', async (_, id: string) => {
      return schedulerService.resumeScheduledAutomation(id);
    });

    this.handle('scheduler:get-run-logs', async (_, id: string) => {
      return schedulerService.getRunLogs(id);
    });
  }
}
