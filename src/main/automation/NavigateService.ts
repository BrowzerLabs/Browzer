import { BaseActionService } from './BaseActionService';
import type { ExecutionContext, NetworkIdleOptions } from './BaseActionService';

import type { ToolExecutionResult } from '@/shared/types';

export interface ExecuteNetworkIdleParams extends NetworkIdleOptions {
  tabId: string;
}

export class NavigateService extends BaseActionService {
  constructor(context: ExecutionContext) {
    super(context);
  }

  async execute(params: {
    url: string;
    tabId: string;
  }): Promise<ToolExecutionResult> {
    try {
      const view = this.getView(params.tabId);
      const cdp = this.getCDP(params.tabId);
      if (!cdp || !view) {
        return {
          success: false,
          error: `tab not found or debugger not attached for tab ${params.tabId}`,
        };
      }
      await view.webContents.loadURL(params.url);
      await this.waitForNetworkIdle(cdp, {
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to navigate to ${params.url}` };
    }
  }

  public async executeNetworkIdle(
    params: ExecuteNetworkIdleParams
  ): Promise<ToolExecutionResult> {
    const cdp = this.getCDP(params.tabId);
    if (!cdp)
      return {
        success: false,
        error: `tab not found or debugger not attached for tab ${params.tabId}`,
      };
    await this.waitForNetworkIdle(cdp, params);
    return { success: true, value: '✅' };
  }
}
