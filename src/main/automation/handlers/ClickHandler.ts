import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder.new';
import type { HandlerContext } from '../core/types';
import type { ToolExecutionResult, ClickParams, ElementFinderParams } from '@/shared/types';

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
    const startTime = Date.now();
    
    try {
      console.log('[ClickHandler] 🎯 Starting click execution');

      // Step 1: Find element using attribute-based matching
      let selector: string | null = null;
      let foundElement: any = null;

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
          foundElement = findResult.element;
          selector = this.generateSelector(foundElement);
          console.log(`[ClickHandler] ✅ Element found: ${selector}`);
        } else {
          console.warn('[ClickHandler] ⚠️ Element not found');
          
          // Try fallback to click_position if provided
          if (params.click_position) {
            console.log('[ClickHandler] 📍 Using fallback click_position');
            const positionSuccess = await this.executeClickAtPosition(
              params.click_position.x,
              params.click_position.y
            );
            
            if (positionSuccess) {
              await this.sleep(500);
              return {
                success: true,
                toolName: 'click',
                url: this.getUrl()
              };
            }
          }
          
          return this.createErrorResult('click', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message: 'Could not find element with provided attributes',
            details: { 
              lastError: findResult.error,
              suggestions: [
                'Verify element attributes match the current page',
                'Check if element is dynamically loaded',
                'Ensure page has finished loading',
                'Try adding more specific attributes (id, data-testid, aria-label)'
              ]
            }
          });
        }
      } else if (params.click_position) {
        // No tag provided, use direct position click
        console.log('[ClickHandler] 📍 Using direct click_position (no element finding)');
        const positionSuccess = await this.executeClickAtPosition(
          params.click_position.x,
          params.click_position.y
        );
        
        if (positionSuccess) {
          await this.sleep(500);
          return {
            success: true,
            toolName: 'click',
            url: this.getUrl()
          };
        }
        
        return this.createErrorResult('click', startTime, {
          code: 'CLICK_FAILED',
          message: 'Failed to execute click at position',
          details: {
            lastError: `Click failed at coordinates (${params.click_position.x}, ${params.click_position.y})`
          }
        });
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

      // Step 2: Execute click using comprehensive strategy
      // This automatically handles scrolling into view and full event sequence
      const clickSuccess = await this.executeComprehensiveClick(selector!, foundElement);

      if (!clickSuccess) {
        // Try fallback with click_position if available
        if (params.click_position) {
          console.warn('[ClickHandler] ⚠️ Comprehensive click failed, trying fallback position');
          const fallbackSuccess = await this.executeClickAtPosition(
            params.click_position.x,
            params.click_position.y
          );
          
          if (!fallbackSuccess) {
            return this.createErrorResult('click', startTime, {
              code: 'CLICK_FAILED',
              message: 'Both selector-based and position-based clicks failed',
              details: {
                suggestions: [
                  'Element may be covered by another element',
                  'Page may have changed during click execution',
                  'Try adding a wait before clicking'
                ]
              }
            });
          }
        } else {
          return this.createErrorResult('click', startTime, {
            code: 'CLICK_FAILED',
            message: 'Failed to execute click',
            details: {
              suggestions: [
                'Element may be covered by another element',
                'Try adding a wait before clicking'
              ]
            }
          });
        }
      }

      // Wait for click effects to propagate
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
   * Execute comprehensive click with full event sequence
   * 
   * This is the main click method that:
   * 1. Scrolls element into view (handles elements outside viewport)
   * 2. Waits for scroll to complete
   * 3. Dispatches complete event sequence (hover → focus → mousedown → mouseup → click)
   * 4. Uses both event dispatching AND native click() for maximum compatibility
   * 
   * Based on the old implementation's proven strategy.
   */
  private async executeComprehensiveClick(selector: string, element: any): Promise<boolean> {
    try {
      console.log(`[ClickHandler] 🎯 Executing comprehensive click on: ${selector}`);

      const script = `
        (async function() {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) return { success: false, error: 'Element not found' };

          // ============================================================================
          // PHASE 0: SCROLL INTO VIEW (CRITICAL for elements outside viewport)
          // ============================================================================
          element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          
          // Wait for scroll to complete
          await new Promise(resolve => setTimeout(resolve, 300));

          // Get bounding box AFTER scroll
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // ============================================================================
          // PHASE 1: HOVER EVENTS (Critical for dropdowns and tooltips)
          // ============================================================================
          const hoverEvents = [
            new PointerEvent('pointerover', {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            }),
            new PointerEvent('pointerenter', {
              bubbles: false,
              cancelable: false,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            }),
            new MouseEvent('mouseover', {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            }),
            new MouseEvent('mouseenter', {
              bubbles: false,
              cancelable: false,
              composed: true,
              view: window,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            })
          ];
          
          hoverEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 120));

          // ============================================================================
          // PHASE 2: FOCUS (Important for form elements and accessibility)
          // ============================================================================
          if (typeof element.focus === 'function') {
            element.focus();
            element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, composed: true }));
            element.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, composed: true }));
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          // ============================================================================
          // PHASE 3: MOUSE DOWN (Press)
          // ============================================================================
          const downEvents = [
            new PointerEvent('pointerdown', {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 1,
              pressure: 0.5
            }),
            new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              detail: 1,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 1
            })
          ];
          
          downEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 80));

          // ============================================================================
          // PHASE 4: MOUSE UP (Release)
          // ============================================================================
          const upEvents = [
            new PointerEvent('pointerup', {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0,
              pressure: 0
            }),
            new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              detail: 1,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            })
          ];
          
          upEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 20));

          // ============================================================================
          // PHASE 5: CLICK EVENTS (The final click)
          // ============================================================================
          const clickEvents = [
            new PointerEvent('click', {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              view: window,
              detail: 1,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            }),
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              detail: 1,
              clientX: centerX,
              clientY: centerY,
              screenX: centerX,
              screenY: centerY,
              button: 0,
              buttons: 0
            })
          ];
          
          clickEvents.forEach(event => element.dispatchEvent(event));

          // Also call native click() method for maximum compatibility
          element.click();

          return { success: true };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      
      if (result && result.success) {
        console.log('[ClickHandler] ✅ Comprehensive click executed successfully');
        return true;
      } else {
        console.error('[ClickHandler] ❌ Comprehensive click failed:', result?.error);
        return false;
      }

    } catch (error) {
      console.error('[ClickHandler] ❌ Comprehensive click execution failed:', error);
      return false;
    }
  }

  /**
   * Execute click at specific coordinates (fallback method)
   * 
   * Uses CDP Input.dispatchMouseEvent for native-level clicks.
   * This is a fallback when selector-based clicking fails.
   */
  private async executeClickAtPosition(x: number, y: number): Promise<boolean> {
    try {
      const cdpDebugger = this.view.webContents.debugger;
      const clickX = Math.round(x);
      const clickY = Math.round(y);

      console.log(`[ClickHandler] 🎯 Executing CDP click at position (${clickX}, ${clickY})`);

      // Mouse move
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: clickX,
        y: clickY,
        button: 'none',
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

      // Mouse up
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1
      });

      console.log('[ClickHandler] ✅ CDP position-based click executed');
      return true;

    } catch (error) {
      console.error('[ClickHandler] ❌ CDP position-based click failed:', error);
      
      // Final fallback: JavaScript click at position
      return await this.executeJavaScriptClickAtPosition(x, y);
    }
  }

  /**
   * Final fallback: Execute click using JavaScript at position
   */
  private async executeJavaScriptClickAtPosition(x: number, y: number): Promise<boolean> {
    try {
      console.log('[ClickHandler] 🔄 Trying JavaScript click fallback at position');

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
          
          // Also try native click
          element.click();
          
          return true;
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      console.log('[ClickHandler] ✅ JavaScript fallback click executed');
      return result;

    } catch (error) {
      console.error('[ClickHandler] ❌ JavaScript fallback click failed:', error);
      return false;
    }
  }

  /**
   * Generate CSS selector from element data
   * 
   * Priority order:
   * 1. ID (if not dynamic)
   * 2. data-testid
   * 3. aria-label
   * 4. name attribute
   * 5. type + role combination
   * 6. role
   * 7. tag only (fallback)
   */
  private generateSelector(element: any): string {
    const attrs = element.attributes || {};
    const tag = element.tagName?.toLowerCase() || 'unknown';
    
    // Priority 1: ID (if not dynamic)
    if (attrs.id && !attrs.id.match(/^(:r[0-9a-z]+:|mui-|mat-)/)) {
      return `#${CSS.escape(attrs.id)}`;
    }
    
    // Priority 2: data-testid
    if (attrs['data-testid']) {
      return `[data-testid="${CSS.escape(attrs['data-testid'])}"]`;
    }
    
    // Priority 3: aria-label
    if (attrs['aria-label']) {
      return `[aria-label="${CSS.escape(attrs['aria-label'])}"]`;
    }
    
    // Priority 4: name attribute (for form elements)
    if (attrs.name) {
      return `${tag}[name="${CSS.escape(attrs.name)}"]`;
    }
    
    // Priority 5: type + role combination
    if (attrs.type && attrs.role) {
      return `${tag}[type="${attrs.type}"][role="${attrs.role}"]`;
    }
    
    // Priority 6: type only
    if (attrs.type) {
      return `${tag}[type="${attrs.type}"]`;
    }
    
    // Priority 7: role
    if (attrs.role) {
      return `${tag}[role="${attrs.role}"]`;
    }
    
    // Fallback: just tag
    return tag;
  }
}
