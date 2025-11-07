/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from 'electron';
import type { ToolExecutionResult } from '@/shared/types';
import { BrowserContextExtractor } from '@/main/context/BrowserContextExtractor';
import { ViewportSnapshotCapture } from './ViewportSnapshotCapture';

// Import handlers
import { ClickHandler } from './handlers/ClickHandler';
import { TypeHandler } from './handlers/TypeHandler';
import { FormHandler } from './handlers/FormHandler';
import { NavigationHandler } from './handlers/NavigationHandler';
import { InteractionHandler } from './handlers/InteractionHandler';

/**
 * BrowserAutomationExecutor - Main orchestrator for browser automation
 * 
 * Architecture:
 * - ClickHandler: Click operations with multi-strategy execution
 * - TypeHandler: Text input with React/Vue framework support
 * - FormHandler: Select, checkbox, and form submission
 * - NavigationHandler: Page navigation and wait operations
 * - InteractionHandler: Keyboard and scroll interactions
 */
export class BrowserAutomationExecutor {
  private view: WebContentsView;
  private debugger: Electron.Debugger;
  private tabId: string;
  
  // Context and snapshot services
  private contextExtractor: BrowserContextExtractor;
  private snapshotCapture: ViewportSnapshotCapture;
  
  // Specialized handlers
  private clickHandler: ClickHandler;
  private typeHandler: TypeHandler;
  private formHandler: FormHandler;
  private navigationHandler: NavigationHandler;
  private interactionHandler: InteractionHandler;

  constructor(view: WebContentsView, tabId: string) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.tabId = tabId;
    
    // Initialize services
    this.contextExtractor = new BrowserContextExtractor(view);
    this.snapshotCapture = new ViewportSnapshotCapture(view);
    
    // Initialize handlers with shared context
    const context = { view, debugger: this.debugger, tabId };
    this.clickHandler = new ClickHandler(context);
    this.typeHandler = new TypeHandler(context);
    this.formHandler = new FormHandler(context);
    this.navigationHandler = new NavigationHandler(context);
    this.interactionHandler = new InteractionHandler(context);
  }

  /**
   * Execute a tool by name - Main entry point for LLM automation
   * 
   * This method routes tool calls from the LLM to the appropriate handler.
   * Each handler is responsible for executing the tool and returning a
   * standardized ToolExecutionResult.
   * 
   * @param toolName - Name of the tool to execute
   * @param params - Tool parameters
   * @returns Tool execution result with success/error information
   */
  public async executeTool(toolName: string, params: any): Promise<ToolExecutionResult> {

    switch (toolName) {
      // Navigation operations
      case 'navigate':
        return this.navigationHandler.executeNavigate(params);
      case 'wait':
        return this.navigationHandler.executeWait(params);
      case 'waitForElement':
        return this.navigationHandler.executeWaitForElement(params);
      
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
              'Check if page has JavaScript errors'
            ]
          }
        });
    }
  }

  /**
   * Extract context - Unified method for both full and viewport extraction
   */
  private async extractContext(params: {
    full?: boolean;
    scrollTo?: 'current' | 'top' | 'bottom' | number | { 
      element: string; 
      backupSelectors: string[] 
    };
    maxElements?: number;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    const full = params.full ?? false;
    const maxElements = params.maxElements ?? 200;

    // Use unified smart context extraction
    const result = await this.contextExtractor.extractSmartContext(
      this.tabId,
      full,
      params.scrollTo,
      maxElements
    );

    if (result.success && result.context) {
      const context = result.context;
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'extract_context',
        executionTime,
        context,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: context.url
      };
    }

    return this.createErrorResult('extract_context', startTime, {
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to extract context',
      details: {
        lastError: result.error,
        suggestions: [
          'Page may still be loading',
          full ? 'Try with full=false for viewport-only extraction' : 'Try with full=true for complete page context',
          'If scrolling to element, verify selector is correct',
          'Check if page has JavaScript errors'
        ]
      }
    });
  }

  /**
   * Capture viewport snapshot - Visual screenshot for Claude vision analysis
   */
  private async captureViewportSnapshot(params: {
    scrollTo?: 'current' | 'top' | 'bottom' | number | { 
      element: string; 
      backupSelectors: string[] 
    };
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const scrollTo = params.scrollTo || 'current';
    const result = await this.snapshotCapture.captureSnapshot(scrollTo);
    const executionTime = Date.now() - startTime;
    
    if (result.success && result.image) {
      return {
        success: true,
        toolName: 'take_snapshot',
        executionTime,
        data: {
          type: 'image',
          source: {
            type: 'base64',
            media_type: result.image.mediaType,
            data: result.image.data
          },
          metadata: {
            width: result.image.width,
            height: result.image.height,
            sizeBytes: result.image.sizeBytes,
            estimatedTokens: result.image.estimatedTokens,
            viewport: result.viewport
          }
        },
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.view.webContents.getURL()
      } as ToolExecutionResult; 
    }

    return this.createErrorResult('take_snapshot', startTime, {
      code: 'EXECUTION_ERROR',
      message: result.error || 'Failed to capture viewport snapshot',
      details: {
        lastError: result.error,
        suggestions: [
          'Page may still be loading',
          'If scrolling to element, verify selector is correct',
          'Try with scrollTo: "current" to capture without scrolling',
          'Check if page has rendering issues'
        ]
      }
    });
  }

  /**
   * Helper to create error results
   */
  private createErrorResult(toolName: string, startTime: number, error: any): ToolExecutionResult {
    return {
      success: false,
      toolName,
      executionTime: Date.now() - startTime,
      error,
      timestamp: Date.now(),
      tabId: this.tabId,
      url: this.view.webContents.getURL()
    };
  }
}
