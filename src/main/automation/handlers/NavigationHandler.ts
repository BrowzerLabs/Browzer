import { BaseHandler, HandlerContext } from './BaseHandler';

import type { NavigateParams, ToolExecutionResult } from '@/shared/types';

export class NavigationHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  async executeNavigate(params: NavigateParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      await this.view.webContents.loadURL(params.url);

      return {
        success: true,
        toolName: 'navigate',
        url: this.getUrl(),
      };
    } catch (error) {
      return this.createErrorResult('navigate', startTime, {
        code: 'NAVIGATION_FAILED',
        message: `Failed to navigate to ${params.url}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check if the URL is valid',
            'Verify network connectivity',
          ],
        },
      });
    }
  }

  async executeWait(params: {
    duration: number;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    const duration = params.duration || 1000;
    console.log(`[NavigationHandler] Waiting for ${duration}ms...`);

    await this.sleep(duration);

    const executionTime = Date.now() - startTime;
    console.log(
      `[NavigationHandler] ✅ Wait completed after ${executionTime}ms`
    );

    return {
      success: true,
      toolName: 'wait',
      url: this.getUrl(),
    };
  }
}
