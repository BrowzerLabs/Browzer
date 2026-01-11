import { WebContentsView } from 'electron';
import type {
  AutomationError,
  ToolExecutionResult,
  XMLContextOptions,
} from '@/shared/types';
import { XMLExtractor, AccessibilityTreeExtractor } from '../context';
import { ViewportSnapshotCapture } from './ViewportSnapshotCapture';
import { ClickHandler } from './handlers/ClickHandler';
import { ClickHandler as AccessibilityClickHandler } from './handlers/AccessibilityClickHandler';
import { TypeHandler } from './handlers/TypeHandler';
import { FormHandler } from './handlers/FormHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { InteractionHandler } from './handlers/InteractionHandler';
import { HandlerContext } from './handlers/BaseHandler';

export class BrowserAutomationExecutor {
  private view: WebContentsView;
  private tabId: string;

  private contextExtractor: XMLExtractor;
  private accessibilityExtractor: AccessibilityTreeExtractor;
  private snapshotCapture: ViewportSnapshotCapture;

  private clickHandler: ClickHandler;
  private accessibilityClickHandler: AccessibilityClickHandler;
  private typeHandler: TypeHandler;
  private formHandler: FormHandler;
  private navigationHandler: NavigationHandler;
  private interactionHandler: InteractionHandler;

  constructor(view: WebContentsView, tabId: string) {
    this.view = view;
    this.tabId = tabId;

    this.contextExtractor = new XMLExtractor(view);
    this.accessibilityExtractor = new AccessibilityTreeExtractor(view);
    this.snapshotCapture = new ViewportSnapshotCapture(view);

    const context: HandlerContext = { view, tabId };
    this.clickHandler = new ClickHandler(context);
    this.accessibilityClickHandler = new AccessibilityClickHandler(context);
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
      case 'navigate':
        return this.navigationHandler.executeNavigate(params);
      case 'wait':
        return this.navigationHandler.executeWait(params);

      case 'old_click':
        return this.clickHandler.execute(params);

      case 'click':
        return this.accessibilityClickHandler.execute(params);

      case 'type':
        return this.typeHandler.execute(params);

      case 'select':
        return this.formHandler.executeSelect(params);
      case 'checkbox':
        return this.formHandler.executeCheckbox(params);
      case 'submit':
        return this.formHandler.executeSubmit(params, this.clickHandler);

      case 'keyPress':
        return this.interactionHandler.executeKeyPress(params);
      case 'scroll':
        return this.interactionHandler.executeScroll(params);

      case 'extract_context':
        return this.extractContext(params);

      case 'context':
        return this.extractAccessibilityTree();

      case 'take_snapshot':
        return this.captureViewportSnapshot(params);

      default:
        return this.createErrorResult({
          code: 'EXECUTION_ERROR',
          message: `Unknown tool: ${toolName}`,
        });
    }
  }

  private handlePlan(): ToolExecutionResult {
    return {
      success: true,
    };
  }

  private async extractContext(
    params: XMLContextOptions
  ): Promise<ToolExecutionResult> {
    const result = await this.contextExtractor.extractXMLContext({
      maxElements: params.maxElements || 100,
      tags: params.tags || [],
      viewport: params.viewport || 'current',
      attributes: params.attributes || {},
    });

    if (result.xml && !result.error) {
      return {
        success: true,
        value: result.xml,
      };
    }

    return this.createErrorResult({
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to extract context',
    });
  }

  private async extractAccessibilityTree(): Promise<ToolExecutionResult> {
    const result = await this.accessibilityExtractor.extractAccessibilityTree();

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
