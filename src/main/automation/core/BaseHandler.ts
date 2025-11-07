/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from 'electron';
import type { HandlerContext } from './types';
import type { ToolExecutionResult, AutomationError } from '@/shared/types';

/**
 * BaseHandler - Abstract base class for all automation handlers
 * 
 * Provides common functionality and utilities for tool handlers:
 * - Access to WebContentsView and CDP debugger
 * - Error result creation
 * - URL and tab information
 * - Common helper methods
 */
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

  /**
   * Create standardized error result
   */
  protected createErrorResult(
    toolName: string,
    startTime: number,
    error: AutomationError
  ): ToolExecutionResult {
    return {
      success: false,
      toolName,
      executionTime: Date.now() - startTime,
      error,
      timestamp: Date.now(),
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

  /**
   * Get root DOM node ID
   */
  protected async getRootNodeId(): Promise<number> {
    const { root } = await this.debugger.sendCommand('DOM.getDocument');
    return root.nodeId;
  }

  /**
   * Get node attributes from CDP
   */
  protected async getNodeAttributes(nodeId: number): Promise<Record<string, string>> {
    try {
      const { attributes } = await this.debugger.sendCommand('DOM.getAttributes', { nodeId });
      const attrs: Record<string, string> = {};
      for (let i = 0; i < attributes.length; i += 2) {
        attrs[attributes[i]] = attributes[i + 1];
      }
      return attrs;
    } catch {
      return {};
    }
  }

  /**
   * Sanitize selectors - remove invalid syntax
   */
  protected sanitizeSelectors(selectors: string[]): string[] {
    const invalidPatterns = [':has-text(', ':visible', ':enabled', ':contains(', ':has('];
    
    return selectors.filter(selector => {
      const hasInvalidSyntax = invalidPatterns.some(pattern => selector.includes(pattern));
      if (hasInvalidSyntax) {
        console.log(`[Automation] ⚠️ Skipping invalid selector: ${selector}`);
        return false;
      }
      return true;
    });
  }
}
