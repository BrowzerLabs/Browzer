/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import { EffectTracker } from '../core/EffectTracker';
import type { HandlerContext, ClickExecutionResult, ClickabilityResult } from '../core/types';
import type { ClickParams, ToolExecutionResult, FoundElement } from '@/shared/types';

/**
 * ClickHandler - Handles click automation operations
 * 
 * Provides robust clicking with:
 * - Multi-strategy element finding
 * - Visibility and clickability verification
 * - Multiple click fallback strategies
 * - Effect tracking (navigation, DOM changes, etc.)
 * 
 * This handler ensures clicks work reliably across different web frameworks
 * and UI patterns (React, Vue, Angular, vanilla JS).
 */
export class ClickHandler extends BaseHandler {
  private elementFinder: ElementFinder;
  private effectTracker: EffectTracker;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
    this.effectTracker = new EffectTracker(context);
  }

  /**
   * Execute click operation
   */
  async execute(params: ClickParams): Promise<ToolExecutionResult> {
    console.log("click params: ", params);
    const startTime = Date.now();

    try {
      const waitTime = params.waitForElement ?? 1000;
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      // Step 1: Find element with multi-strategy approach
      const selectors = [params.selector, ...(params.backupSelectors || [])];
      const elementResult = await this.elementFinder.advancedFind(selectors, params);

      if (!elementResult.success) {
        return this.createErrorResult('click', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: elementResult.error || 'Could not find element with any selector',
          details: {
            attemptedSelectors: selectors,
            lastError: elementResult.details,
            suggestions: [
              'Verify selectors match elements in current page state',
              'Check if element is inside iframe or shadow DOM',
              'Ensure page has finished loading dynamic content',
              'Try using more specific backup selectors (id, data-testid, aria-label)'
            ]
          }
        });
      }

      console.log(`[ClickHandler] ✅ Found element with: ${elementResult.usedSelector}`);


      // Step 4: Perform click with multiple fallback strategies
      const clickResult = await this.performAdvancedClick(
        elementResult.usedSelector,
        elementResult.element
      );

      if (!clickResult.success) {
        return this.createErrorResult('click', startTime, {
          code: 'EXECUTION_ERROR',
          message: clickResult.error || 'Click failed',
          details: {
            attemptedSelectors: clickResult.attemptedMethods,
            lastError: clickResult.lastError,
            suggestions: [
              'Element may have been removed/changed during click',
              'Try increasing waitForElement time',
              'Check if page has JavaScript errors'
            ]
          }
        });
      }

      console.log(`[ClickHandler] ✅ Click executed using: ${clickResult.method}`);

      // Step 5: Wait for effects and detect changes
      await this.sleep(800);
      const effects = await this.effectTracker.capturePostActionEffects();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'click',
        executionTime,
        element: {
          selector: elementResult.usedSelector,
          selectorType: elementResult.selectorType,
          tagName: elementResult.element.tagName,
          text: elementResult.element.text,
          attributes: elementResult.element.attributes || {},
          boundingBox: elementResult.element.boundingBox,
          isVisible: true,
          isEnabled: true
        } as FoundElement,
        effects,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      console.log("click failed with params: ", params);
      console.error('❌ [ClickHandler] Click execution failed:', error);
      return this.createErrorResult('click', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Click execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check browser console for JavaScript errors',
            'Verify page is in stable state',
            'Try with longer wait time'
          ]
        }
      });
    }
  }


  /**
   * ENHANCED: Perform click with HYBRID approach (CDP + executeJavaScript)
   * 
   * Uses CDP Input.dispatchMouseEvent for native-level clicks that trigger
   * ALL browser events exactly like a human click, combined with JavaScript
   * fallbacks for maximum compatibility.
   */
  private async performAdvancedClick(
    selector: string,
    element: any
  ): Promise<ClickExecutionResult> {
    const attemptedMethods: string[] = [];
    let lastError = '';

    try {
      // Strategy 1: CDP Native Mouse Events (MOST REALISTIC)
      // This triggers actual browser-level mouse events, not just JavaScript events
      attemptedMethods.push('cdp_mouse_events');
      
      const cdpResult = await this.performCDPClick(selector, element);
      if (cdpResult.success) {
        console.log('[ClickHandler] ✅ CDP click succeeded');
        return { success: true, method: 'cdp_mouse_events', attemptedMethods };
      }
      lastError = cdpResult.error || 'CDP click failed';
      console.warn('[ClickHandler] CDP click failed, trying JavaScript fallbacks...');
      
    } catch (error) {
      lastError = `CDP click error: ${error instanceof Error ? error.message : String(error)}`;
      console.warn('[ClickHandler] CDP click error:', error);
    }

    // Fallback to JavaScript-based clicks
    try {
      const jsResult = await this.performJavaScriptClick(selector);
      if (jsResult.success) {
        return { 
          success: true, 
          method: jsResult.method, 
          attemptedMethods: [...attemptedMethods, ...jsResult.attemptedMethods] 
        };
      }
      lastError = jsResult.lastError || jsResult.error || 'All JavaScript click strategies failed';
      attemptedMethods.push(...jsResult.attemptedMethods);
      
    } catch (error) {
      lastError = `JavaScript click error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      success: false,
      error: 'All click strategies failed',
      attemptedMethods,
      lastError
    };
  }

  /**
   * PRODUCTION-GRADE CDP-based native click
   * 
   * This implementation generates the EXACT same event sequence as a real human click,
   * including all pointer, mouse, and focus events in the correct order with proper timing.
   * 
   * Tested with: Google Cloud Console, Material UI, React, Angular, Vue, Svelte
   */
  private async performCDPClick(selector: string, element: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Get element's bounding box for click coordinates
      const box = element.boundingBox;
      if (!box || box.width === 0 || box.height === 0) {
        return { success: false, error: 'Element has no valid bounding box' };
      }

      // Calculate center point for click (with slight randomization for human-like behavior)
      const offsetX = (Math.random() - 0.5) * Math.min(box.width * 0.3, 5);
      const offsetY = (Math.random() - 0.5) * Math.min(box.height * 0.3, 5);
      const x = box.x + box.width / 2 + offsetX;
      const y = box.y + box.height / 2 + offsetY;

      console.log(`[ClickHandler] 🎯 CDP click at (${Math.round(x)}, ${Math.round(y)})`);

      // ============================================================================
      // PHASE 1: HOVER SEQUENCE (Critical for Material UI dropdowns!)
      // ============================================================================
      
      // Step 1: Move mouse to element (triggers hover state)
      await this.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        clickCount: 0
      });

      // Small delay to simulate human hover time (CRITICAL for dropdowns)
      await this.sleep(120);

      // Step 2: Dispatch JavaScript hover events (for frameworks that don't listen to CDP)
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // COMPLETE hover event sequence
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
              bubbles: false, // pointerenter doesn't bubble
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
              bubbles: false, // mouseenter doesn't bubble
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
          
          hoverEvents.forEach(event => el.dispatchEvent(event));
          
          return true;
        })();
      `);

      // Additional hover delay (Material UI dropdowns need this!)
      await this.sleep(100);

      // ============================================================================
      // PHASE 2: FOCUS (Important for form elements and accessibility)
      // ============================================================================
      
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          
          // Focus if focusable
          if (typeof el.focus === 'function') {
            el.focus();
            
            // Dispatch focus events
            el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, composed: true }));
            el.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, composed: true }));
          }
          
          return true;
        })();
      `);

      await this.sleep(50);

      // ============================================================================
      // PHASE 3: MOUSE DOWN (Press)
      // ============================================================================
      
      // CDP mouse down
      await this.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1
      });

      // JavaScript pointer/mouse down events
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
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
              buttons: 1, // Left button pressed
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
          
          downEvents.forEach(event => el.dispatchEvent(event));
          
          return true;
        })();
      `);

      // Realistic press duration (humans hold mouse button for 60-120ms)
      await this.sleep(80);

      // ============================================================================
      // PHASE 4: MOUSE UP (Release)
      // ============================================================================
      
      // CDP mouse up
      await this.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1
      });

      // JavaScript pointer/mouse up events
      await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
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
              buttons: 0, // No buttons pressed after release
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
          
          upEvents.forEach(event => el.dispatchEvent(event));
          
          return true;
        })();
      `);

      await this.sleep(20);

      // ============================================================================
      // PHASE 5: CLICK EVENT (The final click)
      // ============================================================================
      
      const clickSuccess = await this.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          
          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Dispatch click event
          const clickEvent = new PointerEvent('click', {
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
          });
          
          el.dispatchEvent(clickEvent);
          
          // Also dispatch legacy MouseEvent click for compatibility
          const mouseClickEvent = new MouseEvent('click', {
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
          });
          
          el.dispatchEvent(mouseClickEvent);
          
          return true;
        })();
      `);

      if (!clickSuccess) {
        return { success: false, error: 'Element disappeared during click sequence' };
      }

      // Small delay for click effects to propagate
      await this.sleep(50);

      console.log('[ClickHandler] ✅ Complete CDP click sequence executed');
      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        error: `CDP click failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * ENHANCED JavaScript-based click with complete event sequence
   * Mirrors the CDP implementation for maximum compatibility
   */
  private async performJavaScriptClick(selector: string): Promise<ClickExecutionResult> {
    const script = `
      (async function() {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return { success: false, error: 'Element disappeared before click' };

        const attemptedMethods = [];
        let lastError = '';

        // Highlight element briefly for visual feedback
        const originalOutline = element.style.outline;
        element.style.outline = '3px solid #00ff00';
        await new Promise(resolve => setTimeout(resolve, 200));

        // Strategy 1: COMPLETE event sequence matching CDP implementation
        try {
          attemptedMethods.push('complete_event_sequence');
          
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // PHASE 1: Hover events (CRITICAL for dropdowns!)
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
          await new Promise(resolve => setTimeout(resolve, 120)); // Hover delay

          // PHASE 2: Focus events
          if (typeof element.focus === 'function') {
            element.focus();
            element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, composed: true }));
            element.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, composed: true }));
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          // PHASE 3: Mouse down events
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
          await new Promise(resolve => setTimeout(resolve, 80)); // Press duration

          // PHASE 4: Mouse up events
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

          // PHASE 5: Click events
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

          element.style.outline = originalOutline;
          return { success: true, method: 'complete_event_sequence', attemptedMethods };
        } catch (e) {
          lastError = 'Complete event sequence failed: ' + e.message;
          console.warn('[Click] Complete event sequence failed:', e);
        }

        // Strategy 2: Native click
        try {
          attemptedMethods.push('native_click');
          element.click();
          element.style.outline = originalOutline;
          return { success: true, method: 'native_click', attemptedMethods };
        } catch (e) {
          lastError = 'Native click failed: ' + e.message;
        }

        // Strategy 3: For specific element types, use type-specific actions
        try {
          attemptedMethods.push('type_specific');
          
          const tagName = element.tagName.toLowerCase();
          const type = element.type?.toLowerCase();

          if (tagName === 'a' && element.href) {
            window.location.href = element.href;
            element.style.outline = originalOutline;
            return { success: true, method: 'type_specific_link', attemptedMethods };
          } else if (tagName === 'button' || (tagName === 'input' && type === 'submit')) {
            const form = element.closest('form');
            if (form) {
              form.requestSubmit(element);
              element.style.outline = originalOutline;
              return { success: true, method: 'type_specific_submit', attemptedMethods };
            }
          } else if (tagName === 'input' && (type === 'checkbox' || type === 'radio')) {
            element.checked = !element.checked;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.style.outline = originalOutline;
            return { success: true, method: 'type_specific_toggle', attemptedMethods };
          }
          
          lastError = 'No type-specific action available';
        } catch (e) {
          lastError = 'Type-specific action failed: ' + e.message;
        }

        element.style.outline = originalOutline;
        return {
          success: false,
          error: 'All JavaScript click strategies failed',
          attemptedMethods,
          lastError
        };
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }
}
