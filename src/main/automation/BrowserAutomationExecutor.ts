import { WebContentsView } from 'electron';
import type { ToolExecutionResult, XMLContextOptions } from '@/shared/types';
import { XMLExtractor } from '../context';
import { ViewportSnapshotCapture } from './ViewportSnapshotCapture';
import { ClickHandler } from './handlers/ClickHandler';
import { TypeHandler } from './handlers/TypeHandler';
import { FormHandler } from './handlers/FormHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { InteractionHandler } from './handlers/InteractionHandler';
import { HandlerContext } from './handlers/BaseHandler';

export class BrowserAutomationExecutor {
  private view: WebContentsView;
  private tabId: string;

  private contextExtractor: XMLExtractor;
  private snapshotCapture: ViewportSnapshotCapture;

  private clickHandler: ClickHandler;
  private typeHandler: TypeHandler;
  private formHandler: FormHandler;
  private navigationHandler: NavigationHandler;
  private interactionHandler: InteractionHandler;

  constructor(view: WebContentsView, tabId: string) {
    this.view = view;
    this.tabId = tabId;

    this.contextExtractor = new XMLExtractor(view);
    this.snapshotCapture = new ViewportSnapshotCapture(view);

    const context: HandlerContext = { view, tabId };
    this.clickHandler = new ClickHandler(context);
    this.typeHandler = new TypeHandler(context);
    this.formHandler = new FormHandler(context);
    this.navigationHandler = new NavigationHandler(context);
    this.interactionHandler = new InteractionHandler(context);
  }

  public async executeTool(
    toolName: string,
    params: any
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'declare_plan_metadata':
        return this.handlePlan();
      // Navigation operations
      case 'navigate':
        return this.navigationHandler.executeNavigate(params);
      case 'wait':
        return this.navigationHandler.executeWait(params);

      // Click operations
      case 'click':
        return this.clickHandler.execute(params);

      // Input operations
      case 'type':
        return this.typeHandler.execute(params);

      // Form operations
      case 'select':
        return this.formHandler.executeSelect(params);
      case 'checkbox':
        return this.formHandler.executeCheckbox(params);
      case 'submit':
        return this.formHandler.executeSubmit(params, this.clickHandler);

      // Interaction operations
      case 'keyPress':
        return this.interactionHandler.executeKeyPress(params);
      case 'scroll':
        return this.interactionHandler.executeScroll(params);

      // Context extraction
      case 'extract_context':
        return this.extractContext(params);

      // Snapshot capture
      case 'take_snapshot':
        return this.captureViewportSnapshot(params);

      default:
        return this.createErrorResult(toolName, Date.now(), {
          code: 'EXECUTION_ERROR',
          message: `Unknown tool: ${toolName}`,
          details: {
            lastError: `Unknown tool: ${toolName}`,
            suggestions: [
              'Check tool name for typos',
              'Verify tool is supported by the current browser',
              'Check if page has JavaScript errors',
            ],
          },
        });
    }
  }

  private handlePlan(): ToolExecutionResult {
    return {
      success: true,
      toolName: 'declare_plan_metadata'
    }
  }

  private async extractContext(
    params: XMLContextOptions
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const result = await this.contextExtractor.extractXMLContext({
      maxElements: params.maxElements || 100,
      tags: params.tags || [],
      viewport: params.viewport || 'current',
      attributes: params.attributes || {},
    });

    if (result.xml && !result.error) {
      return {
        success: true,
        toolName: 'extract_context',
        value: result.xml,
      };
    }

    return this.createErrorResult('extract_context', startTime, {
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to extract context',
      details: {
        lastError: result.error,
        suggestions: [
          'Page may still be loading',
          'Verify elementTags filter is correct (e.g., ["button", "input"])',
        ],
      },
    });
  }

  /**
   * Capture viewport snapshot - Visual screenshot for Claude vision analysis
   */
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
    const startTime = Date.now();
    const scrollTo = params.scrollTo || 'current';
    const result = await this.snapshotCapture.captureSnapshot(scrollTo);

    if (!result.error && result.image) {
      return {
        success: true,
        toolName: 'take_snapshot',
        value: result.image,
        tabId: this.tabId,
      };
    }

    return this.createErrorResult('take_snapshot', startTime, {
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to capture viewport snapshot',
      details: {
        lastError: result.error,
        suggestions: [],
      },
    });
  }

  private createErrorResult(
    toolName: string,
    startTime: number,
    error: any
  ): ToolExecutionResult {
    return {
      success: false,
      toolName,
      error,
    };
  }
}
