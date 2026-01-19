import { BaseHandler } from './base';

export class AutomationHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;

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

    this.handle('automation:load-session', async (_, sessionId: string) => {
      return await browserService.loadAutomationSession(sessionId);
    });

    this.handle('automation:get-session-history', async (_, limit?: number) => {
      return await browserService.getAutomationSessionHistory(limit);
    });

    this.handle('automation:get-sessions', async () => {
      return await browserService.getAutomationSessions();
    });

    this.handle(
      'automation:get-session-details',
      async (_, sessionId: string) => {
        return await browserService.getAutomationSessionDetails(sessionId);
      }
    );

    this.handle('automation:resume-session', async (_, sessionId: string) => {
      return await browserService.resumeAutomationSession(sessionId);
    });

    this.handle('automation:delete-session', async (_, sessionId: string) => {
      return await browserService.deleteAutomationSession(sessionId);
    });

    this.handle(
      'autopilot:execute',
      async (
        _,
        userGoal: string,
        startUrl?: string,
        referenceRecording?: any
      ) => {
        return await browserService.executeAutopilot(
          userGoal,
          startUrl,
          referenceRecording
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
  }
}
