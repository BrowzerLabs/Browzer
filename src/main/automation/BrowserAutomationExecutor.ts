import { WebContentsView } from 'electron';

import { XMLExtractor, AccessibilityTreeExtractor } from '../context';

import { ViewportSnapshotCapture } from './ViewportSnapshotCapture';
import { ClickHandler } from './handlers/ClickHandler';
import { TypeHandler } from './handlers/TypeHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { HandlerContext } from './handlers/BaseHandler';
import { KeyHandler } from './handlers';

import type {
  AutomationError,
  ToolExecutionResult,
  XMLContextOptions,
} from '@/shared/types';

export class BrowserAutomationExecutor {
  private view: WebContentsView;
  private tabId: string;

  private contextExtractor: XMLExtractor;
  private accessibilityExtractor: AccessibilityTreeExtractor;
  private snapshotCapture: ViewportSnapshotCapture;

  private clickHandler: ClickHandler;
  private typeHandler: TypeHandler;
  private navigationHandler: NavigationHandler;
  private keyHandler: KeyHandler;

  constructor(view: WebContentsView, tabId: string) {
    this.view = view;
    this.tabId = tabId;

    this.contextExtractor = new XMLExtractor(view);
    this.accessibilityExtractor = new AccessibilityTreeExtractor(view);
    this.snapshotCapture = new ViewportSnapshotCapture(view);

    const context: HandlerContext = { view, tabId };
    this.clickHandler = new ClickHandler(context);
    this.typeHandler = new TypeHandler(context);
    this.navigationHandler = new NavigationHandler(context);
    this.keyHandler = new KeyHandler(context);
  }

  public async executeTool(
    toolName: string,
    params: any
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'navigate':
        return this.navigationHandler.executeNavigate(params);

      case 'wait':
        return this.navigationHandler.executeWait(params);

      case 'click':
        return this.clickHandler.execute(params);

      case 'type':
        return this.typeHandler.execute(params);

      case 'key':
        return this.keyHandler.execute(params);

      case 'context':
        return this.extractContext();

      case 'snapshot':
        return this.captureViewportSnapshot(params);

      case 'scroll':
        return this.executeScroll(params);

      case 'waitForNetworkIdle':
        return this.waitForNetworkIdle(params);

      default:
        return this.createErrorResult({
          code: 'EXECUTION_ERROR',
          message: `Unknown tool: ${toolName}`,
        });
    }
  }

  private async extractContext(): Promise<ToolExecutionResult> {
    const result = await this.accessibilityExtractor.extractContext();

    if (result.tree && !result.error) {
      return {
        success: true,
        value: result.tree,
      };
    }

    return this.createErrorResult({
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to extract accessibility tree',
    });
  }

  private async captureViewportSnapshot(params: {
    scrollTo?:
      | 'current'
      | 'top'
      | 'bottom'
      | number
      | {
          element: string;
          backupSelectors: string[];
        };
  }): Promise<ToolExecutionResult> {
    const scrollTo = params.scrollTo || 'current';
    const result = await this.snapshotCapture.captureSnapshot(scrollTo);

    if (!result.error && result.image) {
      return {
        success: true,
        value: result.image,
        tabId: this.tabId,
      };
    }

    return this.createErrorResult({
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to capture viewport snapshot',
    });
  }

  private async executeScroll(params: {
    direction: 'up' | 'down' | 'left' | 'right';
    amount?: number;
  }): Promise<ToolExecutionResult> {
    const amount = params.amount ?? 300;
    let deltaX = 0;
    let deltaY = 0;

    switch (params.direction) {
      case 'up':
        deltaY = -amount;
        break;
      case 'down':
        deltaY = amount;
        break;
      case 'left':
        deltaX = -amount;
        break;
      case 'right':
        deltaX = amount;
        break;
    }

    try {
      await this.view.webContents.executeJavaScript(`
        window.scrollBy({
          left: ${deltaX},
          top: ${deltaY},
          behavior: 'smooth'
        });
      `);

      await new Promise((resolve) => setTimeout(resolve, 300));

      return {
        success: true,
        value: `Scrolled ${params.direction} by ${amount}px`,
        tabId: this.tabId,
      };
    } catch (error) {
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: `Failed to scroll: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private async waitForNetworkIdle(params: {
    timeout?: number;
    idleTime?: number;
  }): Promise<ToolExecutionResult> {
    const timeout = params.timeout ?? 10000;
    const idleTime = params.idleTime ?? 500;

    try {
      const cdp = this.view.webContents.debugger;
      let pendingRequests = 0;
      let lastActivityTime = Date.now();
      let isIdle = false;

      const requestHandler = () => {
        pendingRequests++;
        lastActivityTime = Date.now();
      };

      const responseHandler = () => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        lastActivityTime = Date.now();
      };

      await cdp.sendCommand('Network.enable');

      cdp.on('message', (_event: any, method: string) => {
        if (method === 'Network.requestWillBeSent') {
          requestHandler();
        } else if (
          method === 'Network.loadingFinished' ||
          method === 'Network.loadingFailed'
        ) {
          responseHandler();
        }
      });

      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const timeSinceLastActivity = Date.now() - lastActivityTime;

        if (pendingRequests === 0 && timeSinceLastActivity >= idleTime) {
          isIdle = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await cdp.sendCommand('Network.disable');

      const elapsed = Date.now() - startTime;

      if (isIdle) {
        return {
          success: true,
          value: `Network idle after ${elapsed}ms`,
          tabId: this.tabId,
        };
      } else {
        return {
          success: true,
          value: `Network wait timeout after ${elapsed}ms (may still have pending requests)`,
          tabId: this.tabId,
        };
      }
    } catch (error) {
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: `Failed to wait for network idle: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private createErrorResult(error: AutomationError): ToolExecutionResult {
    return {
      success: false,
      error,
      tabId: this.tabId,
    };
  }
}
