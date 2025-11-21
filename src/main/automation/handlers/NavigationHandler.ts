import { BaseHandler, HandlerContext } from '../core/BaseHandler';
import type { NavigateParams, WaitForElementParams, ToolExecutionResult } from '@/shared/types';


export class NavigationHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  async executeNavigate(params: NavigateParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      await this.view.webContents.loadURL(params.url);

      return {
        success: true,
        toolName: 'navigate',
        url: this.getUrl()
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
      url: this.getUrl()
    };
  }

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

}
