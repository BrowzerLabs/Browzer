/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import type { HandlerContext } from '../core/types';
import type { NavigateParams, WaitForElementParams, ToolExecutionResult } from '@/shared/types';

/**
 * NavigationHandler - Handles navigation and waiting operations
 * 
 * Provides operations for:
 * - Page navigation with various wait strategies
 * - Simple wait/sleep operations
 * - Wait for element to appear/disappear
 * 
 * This handler ensures navigation is reliable and waits are properly timed.
 */
export class NavigationHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * Execute navigate operation
   */
  async executeNavigate(params: NavigateParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const waitUntil = params.waitUntil || 'load';
      const timeout = params.timeout || 30000;
      
      // Set up navigation promise BEFORE calling loadURL to avoid race condition
      const navigationPromise = this.waitForNavigation(waitUntil, timeout);
      
      // Start navigation
      await this.view.webContents.loadURL(params.url);
      
      // Wait for navigation to complete
      await navigationPromise;

      const executionTime = Date.now() - startTime;
      const currentUrl = this.getUrl();

      return {
        success: true,
        toolName: 'navigate',
        executionTime,
        effects: {
          navigationOccurred: true,
          newUrl: currentUrl,
          navigationTiming: executionTime,
          summary: `Successfully navigated to ${currentUrl}`
        },
        timestamp: Date.now(),
        tabId: this.tabId,
        url: currentUrl
      };

    } catch (error) {
      return this.createErrorResult('navigate', startTime, {
        code: 'NAVIGATION_FAILED',
        message: `Failed to navigate to ${params.url}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: ['Check if the URL is valid', 'Verify network connectivity']
        }
      });
    }
  }

  /**
   * Execute simple wait operation
   */
  async executeWait(params: { duration: number }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    const duration = params.duration || 1000;
    console.log(`[NavigationHandler] Waiting for ${duration}ms...`);
    
    await this.sleep(duration);
    
    const executionTime = Date.now() - startTime;
    console.log(`[NavigationHandler] ✅ Wait completed after ${executionTime}ms`);

    return {
      success: true,
      toolName: 'wait',
      executionTime,
      effects: {
        navigationOccurred: false,
        summary: `Waited for ${duration}ms`
      },
      timestamp: Date.now(),
      tabId: this.tabId,
      url: this.getUrl()
    };
  }

  /**
   * Execute wait for element operation
   */
  async executeWaitForElement(params: WaitForElementParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const timeout = params.timeout || 10000;
      const state = params.state || 'visible';
      const interval = 100;

      console.log(`[NavigationHandler] Waiting for element (${state}): ${params.selector}`);

      let elapsed = 0;
      let found = false;

      while (elapsed < timeout) {
        const checkScript = `
          (function() {
            try {
              const element = document.querySelector(${JSON.stringify(params.selector)});
              
              if (!element) {
                return { found: false, state: 'not_found' };
              }

              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              
              const isVisible = rect.width > 0 && rect.height > 0 &&
                               style.display !== 'none' &&
                               style.visibility !== 'hidden' &&
                               style.opacity !== '0';

              const isAttached = document.contains(element);

              return {
                found: true,
                isVisible,
                isAttached,
                state: isVisible ? 'visible' : (isAttached ? 'attached' : 'detached')
              };
            } catch (e) {
              return { found: false, error: e.message };
            }
          })();
        `;

        const result = await this.view.webContents.executeJavaScript(checkScript);

        // Check if desired state is met
        if (state === 'visible' && result.found && result.isVisible) {
          found = true;
          break;
        } else if (state === 'hidden' && (!result.found || !result.isVisible)) {
          found = true;
          break;
        } else if (state === 'attached' && result.found && result.isAttached) {
          found = true;
          break;
        }

        await this.sleep(interval);
        elapsed += interval;
      }

      const executionTime = Date.now() - startTime;

      if (!found) {
        return this.createErrorResult('waitForElement', startTime, {
          code: 'TIMEOUT',
          message: `Element did not reach desired state (${state}) within ${timeout}ms`,
          details: {
            attemptedSelectors: [params.selector],
            suggestions: [
              'Increase timeout value',
              'Verify the selector is correct',
              'Check if element is dynamically loaded',
              'Try a different state (visible/hidden/attached)'
            ]
          }
        });
      }

      console.log(`[NavigationHandler] ✅ Element reached state: ${state} (${executionTime}ms)`);

      return {
        success: true,
        toolName: 'waitForElement',
        executionTime,
        effects: {
          navigationOccurred: false,
          summary: `Element reached state: ${state}`
        },
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      return this.createErrorResult('waitForElement', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Wait for element failed`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Wait for navigation to complete
   */
  private async waitForNavigation(waitUntil: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Navigation timeout'));
        }
      }, timeout);
      
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve();
        }
      };
      
      if (waitUntil === 'load') {
        // Listen for successful load
        this.view.webContents.once('did-finish-load', cleanup);
        
        // Also handle navigation failures
        this.view.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            reject(new Error(`Navigation failed: ${errorDescription} (code: ${errorCode})`));
          }
        });
      } else if (waitUntil === 'domcontentloaded') {
        this.view.webContents.once('dom-ready', cleanup);
      } else {
        // For 'networkidle' or other, just wait a bit
        setTimeout(cleanup, 1000);
      }
    });
  }
}
