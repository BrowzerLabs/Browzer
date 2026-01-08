import { WebContentsView } from 'electron';

import { XMLExtractor } from '../context';
import { CDPExtractor, EnhancedDOMTreeNode } from '../context/CDPExtractor';

import { ViewportSnapshotCapture } from './ViewportSnapshotCapture';
import { ClickHandler } from './handlers/ClickHandler';
import { TypeHandler } from './handlers/TypeHandler';
import { FormHandler } from './handlers/FormHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { InteractionHandler } from './handlers/InteractionHandler';
import { HandlerContext } from './handlers/BaseHandler';

import type { ToolExecutionResult, XMLContextOptions } from '@/shared/types';

export interface ExtractContextParams extends XMLContextOptions {
  useCDP?: boolean;
}

export class BrowserAutomationExecutor {
  private view: WebContentsView;
  private tabId: string;

  private xmlExtractor: XMLExtractor;
  private cdpExtractor: CDPExtractor;
  private snapshotCapture: ViewportSnapshotCapture;

  private clickHandler: ClickHandler;
  private typeHandler: TypeHandler;
  private formHandler: FormHandler;
  private navigationHandler: NavigationHandler;
  private interactionHandler: InteractionHandler;

  /** Selector map from CDP extraction for backend_node_id based actions */
  private selectorMap: Map<number, EnhancedDOMTreeNode> = new Map();

  constructor(view: WebContentsView, tabId: string) {
    this.view = view;
    this.tabId = tabId;

    this.xmlExtractor = new XMLExtractor(view);
    this.cdpExtractor = new CDPExtractor(view);
    this.snapshotCapture = new ViewportSnapshotCapture(view);

    const context: HandlerContext = { view, tabId };
    this.clickHandler = new ClickHandler(context);
    this.typeHandler = new TypeHandler(context);
    this.formHandler = new FormHandler(context);
    this.navigationHandler = new NavigationHandler(context);
    this.interactionHandler = new InteractionHandler(context);
  }

  getCDPExtractor(): CDPExtractor {
    return this.cdpExtractor;
  }

  getNodeByBackendId(backendNodeId: number): EnhancedDOMTreeNode | undefined {
    return this.selectorMap.get(backendNodeId);
  }

  public async executeTool(
    toolName: string,
    params: any
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
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

  private async extractContext(
    params: ExtractContextParams
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const useCDP = params.useCDP !== false; // Default to CDP

    console.log('[BrowserAutomationExecutor] 📄 extract_context called', {
      useCDP,
      params,
      url: this.view.webContents.getURL(),
    });

    if (useCDP) {
      return this.extractContextCDP();
    } else {
      return this.extractContextXML(params);
    }
  }

  private async extractContextCDP(): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    console.log('[BrowserAutomationExecutor] 🔷 Using CDP extraction');

    try {
      const result = await this.cdpExtractor.extractContext({
        paintOrderFiltering: true,
      });

      const executionTime = Date.now() - startTime;

      if (result.error) {
        console.error(
          '[BrowserAutomationExecutor] ❌ CDP extraction error:',
          result.error
        );
        return this.createErrorResult('extract_context', startTime, {
          code: 'EXECUTION_ERROR',
          message: result.error,
          details: {
            lastError: result.error,
            suggestions: [
              'Page may still be loading',
              'Try again after page loads completely',
            ],
          },
        });
      }

      this.selectorMap = result.selectorMap;

      console.log('[BrowserAutomationExecutor] ✅ CDP extraction complete', {
        executionTime: `${executionTime}ms`,
        treeLength: result.serializedTree.length,
        interactiveElements: result.selectorMap.size,
        url: result.url,
      });

      return {
        success: true,
        toolName: 'extract_context',
        context: result.serializedTree,
        url: result.url,
      };
    } catch (error) {
      console.error(
        '[BrowserAutomationExecutor] ❌ CDP extraction failed:',
        error
      );
      return this.createErrorResult('extract_context', startTime, {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'CDP extraction failed, page may still be loading',
            'Try again after page loads completely',
          ],
        },
      });
    }
  }

  private async extractContextXML(
    params: XMLContextOptions
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    console.log('[BrowserAutomationExecutor] 📜 Using XML extraction (legacy)');

    const result = await this.xmlExtractor.extractXMLContext({
      maxElements: params.maxElements || 100,
      tags: params.tags || [],
      viewport: params.viewport || 'current',
      attributes: params.attributes || {},
    });

    const executionTime = Date.now() - startTime;

    if (result.xml && !result.error) {
      console.log('[BrowserAutomationExecutor] ✅ XML extraction complete', {
        executionTime: `${executionTime}ms`,
        xmlLength: result.xml.length,
        url: this.view.webContents.getURL(),
      });

      return {
        success: true,
        toolName: 'extract_context',
        context: result.xml,
        url: this.view.webContents.getURL(),
      };
    }

    console.error(
      '[BrowserAutomationExecutor] ❌ XML extraction failed:',
      result.error
    );

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
    const executionTime = Date.now() - startTime;

    if (!result.error && result.image) {
      return {
        success: true,
        toolName: 'take_snapshot',
        executionTime,
        data: {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: result.image,
          },
        },
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.view.webContents.getURL(),
      } as ToolExecutionResult;
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
      url: this.view.webContents.getURL(),
    };
  }
}
