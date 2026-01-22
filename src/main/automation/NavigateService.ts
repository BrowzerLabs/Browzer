import { BaseActionService } from './BaseActionService';
import { ExecutionContext } from './BaseActionService';

import type { ToolExecutionResult } from '@/shared/types';

export class NavigateService extends BaseActionService {
  constructor(context: ExecutionContext) {
    super(context);
  }

  async execute(params: { url: string }): Promise<ToolExecutionResult> {
    try {
      await this.view.webContents.loadURL(params.url);
      await this.waitForNetworkIdle({
        timeout: 30000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to navigate to ${params.url}` };
    }
  }
}
