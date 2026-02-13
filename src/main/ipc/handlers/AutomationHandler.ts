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
      'autopilot:submit-input',
      async (_, sessionId: string, requestId: string, value: string) => {
        await browserService.submitAutopilotInput(sessionId, requestId, value);
        return { success: true };
      }
    );

    this.handle(
      'autopilot:cancel-input',
      async (_, sessionId: string, requestId: string) => {
        browserService.cancelAutopilotInput(sessionId, requestId);
        return { success: true };
      }
    );
  }
}
