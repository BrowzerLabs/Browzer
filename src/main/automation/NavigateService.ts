import { TabService } from '../browser';

import { BaseActionService } from './BaseActionService';
import type { NetworkIdleOptions } from './BaseActionService';

import type { ToolExecutionResult } from '@/shared/types';

export interface ExecuteNetworkIdleParams extends NetworkIdleOptions {
  tabId: string;
}

export class NavigateService extends BaseActionService {
  constructor(tabService: TabService) {
    super(tabService);
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
      // Wait for network idle with longer timeout for SPAs and heavy pages
      await this.waitForNetworkIdle(cdp, {
        timeout: 10000,
        idleTime: 1000,
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
