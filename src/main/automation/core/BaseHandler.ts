import { WebContentsView } from 'electron';
import type { HandlerContext } from './types';
import type { ToolExecutionResult, AutomationError } from '@/shared/types';

export abstract class BaseHandler {
  protected view: WebContentsView;
  protected debugger: Electron.Debugger;
  protected tabId: string;

  constructor(context: HandlerContext) {
    this.view = context.view;
    this.debugger = context.debugger;
    this.tabId = context.tabId;
  }

  /**
   * Get current page URL
   */
  protected getUrl(): string {
    return this.view.webContents.getURL();
  }

  protected createErrorResult(
    toolName: string,
    startTime: number,
    error: AutomationError
  ): ToolExecutionResult {
    return {
      success: false,
      toolName,
      error,
      tabId: this.tabId,
      url: this.getUrl()
    };
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
