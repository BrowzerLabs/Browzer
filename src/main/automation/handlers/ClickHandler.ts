import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import type { HandlerContext } from '../core/types';
import type { ToolExecutionResult, FoundElement, ClickParams, ElementFinderParams } from '@/shared/types';


export class ClickHandler extends BaseHandler {
  private elementFinder: ElementFinder;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
  }

  /**
   * Execute click action
   */
  async execute(params: ClickParams): Promise<ToolExecutionResult> {
    console.log("click position: ", params.click_position);
    const startTime = Date.now();
    try {
      let clickX: number;
      let clickY: number;
      let foundElement: any = null;

      // Try to find element using ElementFinder
      if (params.tag) {
        const findParams: ElementFinderParams = {
          tag: params.tag,
          text: params.text,
          attributes: params.attributes,
          boundingBox: params.boundingBox,
          elementIndex: params.elementIndex
        };

        const findResult = await this.elementFinder.advancedFind(findParams);

        if (findResult.success && findResult.element) {
          // Element found! Use its center position
          foundElement = findResult.element;
          const box = foundElement.boundingBox;
          clickX = box.x + box.width / 2;
          clickY = box.y + box.height / 2;
          
          console.log(`[ClickHandler] 📍 Click position: (${Math.round(clickX)}, ${Math.round(clickY)})`);
        } else {
          // Element not found, use fallback
          console.warn('[ClickHandler] ⚠️ Element not found, using fallback position');
          if (!params.click_position) {
            return this.createErrorResult('click', startTime, {
              code: 'ELEMENT_NOT_FOUND',
              message: 'Could not find element and no click_position fallback provided',
              details: { 
                lastError: findResult.error,
                suggestions: [
                  'Verify element attributes match the current page',
                  'Check if element is dynamically loaded',
                  'Ensure page has finished loading'
                ]
              }
            });
          }
          clickX = params.click_position.x;
          clickY = params.click_position.y;
        }
      } else if (params.click_position) {
        // No tag provided, use direct position
        console.log('[ClickHandler] 📍 Using direct click position');
        clickX = params.click_position.x;
        clickY = params.click_position.y;
      } else {
        return this.createErrorResult('click', startTime, {
          code: 'INVALID_PARAMS',
          message: 'Must provide either tag for element finding or click_position',
          details: {
            suggestions: [
              'Provide tag, text, and attributes for element finding',
              'Or provide click_position for direct coordinate clicking'
            ]
          }
        });
      }

      // Scroll element into view if found
      if (foundElement) {
        await this.scrollIntoView(foundElement.boundingBox);
        await this.sleep(300); // Wait for scroll to complete
      }

      // Execute native click using CDP
      const clickSuccess = await this.executeNativeClick(clickX, clickY);

      if (!clickSuccess) {
        return this.createErrorResult('click', startTime, {
          code: 'CLICK_FAILED',
          message: 'Failed to execute click at position',
          details: {
            lastError: `Click failed at coordinates (${Math.round(clickX)}, ${Math.round(clickY)})`,
            suggestions: [
              'Element may be covered by another element',
              'Page may have changed during click execution',
              'Try adding a wait before clicking'
            ]
          }
        });
      }

      // Wait for effects
      await this.sleep(500);

      const executionTime = Date.now() - startTime;
      console.log(`[ClickHandler] ✅ Click completed in ${executionTime}ms`);

      return {
        success: true,
        toolName: 'click',
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[ClickHandler] ❌ Click failed:', error);
      return this.createErrorResult('click', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Click execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check browser console for JavaScript errors',
            'Verify page is in stable state',
            'Try with longer wait time before clicking'
          ]
        }
      });
    }
  }

  /**
   * Execute native click using CDP Input.dispatchMouseEvent
   * This simulates a real mouse click with all proper events
   */
  private async executeNativeClick(x: number, y: number): Promise<boolean> {
    try {
      const cdpDebugger = this.view.webContents.debugger;

      // Round coordinates
      const clickX = Math.round(x);
      const clickY = Math.round(y);

      console.log(`[ClickHandler] 🎯 Executing native click at (${clickX}, ${clickY})`);

      // Mouse move to position
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 0
      });

      await this.sleep(50);

      // Mouse down
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1
      });

      await this.sleep(50);

      // Mouse up (completes the click)
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1
      });

      console.log('[ClickHandler] ✅ Native click executed');
      return true;

    } catch (error) {
      console.error('[ClickHandler] ❌ Native click failed:', error);
      
      // Fallback: JavaScript click
      return await this.executeJavaScriptClick(x, y);
    }
  }

  /**
   * Fallback: Execute click using JavaScript
   */
  private async executeJavaScriptClick(x: number, y: number): Promise<boolean> {
    try {
      console.log('[ClickHandler] 🔄 Trying JavaScript click fallback');

      const script = `
        (function() {
          const x = ${x};
          const y = ${y};
          
          const element = document.elementFromPoint(x, y);
          if (!element) return false;
          
          // Dispatch full event sequence
          const events = ['mousedown', 'mouseup', 'click'];
          for (const eventType of events) {
            const event = new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              button: 0
            });
            element.dispatchEvent(event);
          }
          
          return true;
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      console.log('[ClickHandler] ✅ JavaScript click executed');
      return result;

    } catch (error) {
      console.error('[ClickHandler] ❌ JavaScript click failed:', error);
      return false;
    }
  }

  /**
   * Scroll element into view
   */
  private async scrollIntoView(boundingBox: { x: number; y: number; width: number; height: number }): Promise<void> {
    try {
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      const script = `
        (function() {
          const element = document.elementFromPoint(${centerX}, ${centerY});
          if (element) {
            element.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center', 
              inline: 'center' 
            });
            return true;
          }
          return false;
        })();
      `;

      await this.view.webContents.executeJavaScript(script);
      console.log('[ClickHandler] 📜 Scrolled element into view');

    } catch (error) {
      console.warn('[ClickHandler] ⚠️ Scroll failed:', error);
    }
  }

  /**
   * Generate selector for logging
   */
  private generateSelector(element: any): string {
    const attrs = element.attributes || {};
    
    if (attrs.id && !attrs.id.match(/^(:r[0-9a-z]+:|mui-|mat-)/)) {
      return `#${attrs.id}`;
    }
    if (attrs['data-testid']) {
      return `[data-testid="${attrs['data-testid']}"]`;
    }
    if (attrs['aria-label']) {
      return `[aria-label="${attrs['aria-label']}"]`;
    }
    
    return element.tagName?.toLowerCase() || 'unknown';
  }
}
