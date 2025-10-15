/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ToolExecutor - Base class for tool execution
 * 
 * Provides common functionality for all tools:
 * - Error handling with retry logic
 * - Execution timing and metrics
 * - Result verification
 * - CDP command execution with timeout
 * - Logging and debugging
 */

import { WebContentsView } from 'electron';
import { 
  ToolResult, 
  ToolErrorCode,
  VerificationResult,
  WaitCondition
} from './types';

export abstract class ToolExecutor {
  protected view: WebContentsView;
  protected cdpDebugger: Electron.Debugger;
  protected defaultTimeout = 10000;
  protected defaultRetries = 2;

  constructor(view: WebContentsView) {
    this.view = view;
    this.cdpDebugger = view.webContents.debugger;
  }

  /**
   * Execute CDP command with timeout and error handling
   */
  protected async executeCDP<T = any>(
    method: string,
    params?: any,
    timeout = this.defaultTimeout
  ): Promise<T> {
    return Promise.race([
      this.cdpDebugger.sendCommand(method, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`CDP command '${method}' timed out after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Execute JavaScript in page context with timeout
   */
  protected async evaluateInPage<T = any>(
    expression: string,
    timeout = this.defaultTimeout
  ): Promise<T> {
    const result = await this.executeCDP('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout
    }, timeout);

    if (result.exceptionDetails) {
      throw new Error(`JavaScript evaluation failed: ${result.exceptionDetails.text}`);
    }

    return result.result?.value;
  }

  /**
   * Wait for condition with timeout
   */
  protected async waitForCondition(
    condition: WaitCondition,
    timeout = this.defaultTimeout
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const conditionMet = await this.checkCondition(condition);
        if (conditionMet) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }

      await this.sleep(100);
    }

    return false;
  }

  /**
   * Check if a condition is met
   */
  private async checkCondition(condition: WaitCondition): Promise<boolean> {
    switch (condition.type) {
      case 'element':
        return await this.checkElementExists(condition.selector.value);

      case 'url':
        const currentUrl = this.view.webContents.getURL();
        if (typeof condition.pattern === 'string') {
          return currentUrl.includes(condition.pattern);
        } else {
          return condition.pattern.test(currentUrl);
        }

      case 'text':
        return await this.checkTextExists(condition.text, condition.selector);

      case 'networkIdle':
        // Simple implementation - wait for no network activity
        await this.sleep(condition.timeout || 1000);
        return true;

      case 'custom':
        const result = await this.evaluateInPage(condition.evaluator);
        return Boolean(result);

      default:
        return false;
    }
  }

  /**
   * Check if element exists
   */
  private async checkElementExists(selector: string): Promise<boolean> {
    try {
      const { root } = await this.executeCDP('DOM.getDocument');
      const { nodeId } = await this.executeCDP('DOM.querySelector', {
        nodeId: root.nodeId,
        selector
      });
      return nodeId > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if text exists on page
   */
  private async checkTextExists(text: string, selector?: string): Promise<boolean> {
    const script = selector
      ? `document.querySelector('${selector}')?.textContent?.includes('${text}')`
      : `document.body.textContent?.includes('${text}')`;

    try {
      return await this.evaluateInPage(script);
    } catch {
      return false;
    }
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create success result
   */
  protected createSuccessResult(
    message: string,
    data?: any,
    executionTime?: number
  ): ToolResult {
    return {
      success: true,
      message,
      data,
      metadata: executionTime ? { executionTime } : undefined
    };
  }

  /**
   * Create error result
   */
  protected createErrorResult(
    code: ToolErrorCode,
    message: string,
    details?: any,
    suggestions?: string[]
  ): ToolResult {
    return {
      success: false,
      message,
      error: {
        code,
        message,
        details,
        recoverable: this.isRecoverableError(code),
        suggestions
      }
    };
  }

  /**
   * Determine if error is recoverable
   */
  private isRecoverableError(code: ToolErrorCode): boolean {
    const recoverableErrors = [
      ToolErrorCode.ELEMENT_NOT_FOUND,
      ToolErrorCode.TIMEOUT,
      ToolErrorCode.PAGE_NOT_READY,
      ToolErrorCode.NAVIGATION_TIMEOUT
    ];
    return recoverableErrors.includes(code);
  }

  /**
   * Execute with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries = this.defaultRetries,
    delay = 500
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries) {
          console.log(`  ⚠️ Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await this.sleep(delay * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Verify result matches expectation
   */
  protected async verifyResult(
    expected: any,
    actual: any,
    type: 'equals' | 'contains' | 'matches' | 'custom' = 'equals',
    customVerifier?: (expected: any, actual: any) => boolean
  ): Promise<VerificationResult> {
    let passed = false;

    switch (type) {
      case 'equals':
        passed = expected === actual;
        break;

      case 'contains':
        passed = String(actual).includes(String(expected));
        break;

      case 'matches':
        const regex = expected instanceof RegExp ? expected : new RegExp(expected);
        passed = regex.test(String(actual));
        break;

      case 'custom':
        passed = customVerifier ? customVerifier(expected, actual) : false;
        break;
    }

    return {
      passed,
      expected,
      actual,
      message: passed
        ? 'Verification passed'
        : `Verification failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    };
  }

  /**
   * Ensure debugger is attached
   */
  protected async ensureDebuggerAttached(): Promise<void> {
    if (!this.cdpDebugger.isAttached()) {
      this.cdpDebugger.attach('1.3');
      await this.enableCDPDomains();
    }
  }

  /**
   * Enable required CDP domains
   */
  protected async enableCDPDomains(): Promise<void> {
    await this.executeCDP('DOM.enable');
    await this.executeCDP('Page.enable');
    await this.executeCDP('Runtime.enable');
    await this.executeCDP('Input.enable');
    await this.executeCDP('Network.enable');
  }

  /**
   * Get current page URL
   */
  protected getCurrentURL(): string {
    return this.view.webContents.getURL();
  }

  /**
   * Get current page title
   */
  protected getCurrentTitle(): string {
    return this.view.webContents.getTitle();
  }

  /**
   * Check if page is loading
   */
  protected isPageLoading(): boolean {
    return this.view.webContents.isLoading();
  }

  /**
   * Capture screenshot
   */
  protected async captureScreenshot(): Promise<string> {
    try {
      const image = await this.view.webContents.capturePage();
      return image.toDataURL();
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      return '';
    }
  }

  /**
   * Log tool execution
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [Tool] ${message}`, data || '');
  }
}

