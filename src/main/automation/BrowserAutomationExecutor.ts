import { WebContentsView } from 'electron';
import type {
  AutomationError,
  ToolExecutionResult,
  XMLContextOptions,
} from '@/shared/types';
import { XMLExtractor, AccessibilityTreeExtractor } from '../context';
import { ViewportSnapshotCapture } from './ViewportSnapshotCapture';
import { ClickHandler } from './handlers/ClickHandler';
import { TypeHandler } from './handlers/TypeHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { HandlerContext } from './handlers/BaseHandler';
import { KeyHandler } from './handlers';

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

  private createErrorResult(error: AutomationError): ToolExecutionResult {
    return {
      success: false,
      error,
      tabId: this.tabId,
    };
  }
}
