import { BaseHandler } from './base';

import {
  CreateScheduledAutomationParams,
  UpdateScheduledAutomationParams,
} from '@/shared/types';

export class AutomationHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;
    const schedulerService = browserService.getSchedulerService();

    this.handle(
      'automation:execute-llm',
      async (_, userGoal: string, recordedSessionId: string) => {
        return await browserService.executeIterativeAutomation(
          userGoal,
          recordedSessionId
        );
      }
    );

    this.handle('automation:stop', async (_, sessionId: string) => {
      browserService.stopAutomation(sessionId);
      return { success: true };
    });

    this.handle(
      'autopilot:execute',
      async (
        _,
        userGoal: string,
        startUrl?: string,
        referenceRecordingId?: string
      ) => {
        return await browserService.executeAutopilot(
          userGoal,
          startUrl,
          referenceRecordingId
        );
      }
    );

    this.handle('autopilot:stop', async (_, sessionId: string) => {
      browserService.stopAutopilot(sessionId);
      return { success: true };
    });

    this.handle('autopilot:status', async (_, sessionId: string) => {
      return browserService.getAutopilotStatus(sessionId);
    });

    this.handle(
      'scheduled-automation:create',
      async (_, params: CreateScheduledAutomationParams) => {
        try {
          const automation = schedulerService.createScheduledAutomation(params);
          return { success: true, data: automation };
        } catch (error) {
          console.error('[IPC] Failed to create scheduled automation:', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      }
    );

    this.handle(
      'scheduled-automation:update',
      async (_, params: UpdateScheduledAutomationParams) => {
        try {
          const automation = schedulerService.updateScheduledAutomation(params);
          if (!automation) {
            return { success: false, error: 'Automation not found' };
          }
          return { success: true, data: automation };
        } catch (error) {
          console.error('[IPC] Failed to update scheduled automation:', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      }
    );

    this.handle('scheduled-automation:delete', async (_, id: string) => {
      try {
        const success = schedulerService.deleteScheduledAutomation(id);
        return { success };
      } catch (error) {
        console.error('[IPC] Failed to delete scheduled automation:', error);
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    });

    this.handle('scheduled-automation:get', async (_, id: string) => {
      try {
        const automation = schedulerService.getScheduledAutomation(id);
        if (!automation) {
          return { success: false, error: 'Automation not found' };
        }
        return { success: true, data: automation };
      } catch (error) {
        console.error('[IPC] Failed to get scheduled automation:', error);
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    });

    this.handle('scheduled-automation:get-all', async () => {
      try {
        const automations = schedulerService.getAllScheduledAutomations();
        return { success: true, data: automations };
      } catch (error) {
        console.error('[IPC] Failed to get all scheduled automations:', error);
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    });

    this.handle(
      'scheduled-automation:toggle',
      async (_, id: string, enabled: boolean) => {
        try {
          const success = schedulerService.toggleAutomation(id, enabled);
          return { success };
        } catch (error) {
          console.error('[IPC] Failed to toggle scheduled automation:', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      }
    );

    this.handle(
      'scheduled-automation:get-run-history',
      async (_, scheduledAutomationId: string) => {
        try {
          const runs = schedulerService.getRunHistory(scheduledAutomationId);
          return { success: true, data: runs };
        } catch (error) {
          console.error('[IPC] Failed to get run history:', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      }
    );

    this.handle(
      'scheduled-automation:get-recent-runs',
      async (_, limit?: number) => {
        try {
          const runs = schedulerService.getRecentRuns(limit);
          return { success: true, data: runs };
        } catch (error) {
          console.error('[IPC] Failed to get recent runs:', error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          };
        }
      }
    );
  }
}
