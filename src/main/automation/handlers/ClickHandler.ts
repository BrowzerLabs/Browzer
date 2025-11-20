import { BaseHandler } from '../core/BaseHandler';
import type { HandlerContext } from '../core/types';
import type { ToolExecutionResult, ClickParams } from '@/shared/types';

export class ClickHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * Execute click action using unified single-script approach
   */
  async execute(params: ClickParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      console.log('[ClickHandler] 🎯 Starting unified click execution');

      if (params.tag) {
        // Execute unified find + click script
        const result = await this.executeFindAndClick(params);
        
        if (result.success) {
          await this.sleep(500);
          return {
            success: true,
            toolName: 'click',
            url: this.getUrl()
          };
        } else {
          // Try fallback to click_position if provided
          if (params.click_position) {
            console.warn('[ClickHandler] ⚠️ Unified click failed, trying position fallback');
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
            message: result.error || 'Could not find or click element',
            details: {
              lastError: result.error,
              suggestions: [
                'Verify element attributes match the current page',
                'Check if element is dynamically loaded',
                'Try adding more specific attributes (id, data-testid, aria-label)'
              ]
            }
          });
        }
      } else if (params.click_position) {
        // Direct position click
        console.log('[ClickHandler] 📍 Using direct click_position');
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
          message: 'Must provide either tag for element finding or click_position'
        });
      }

    } catch (error) {
      console.error('[ClickHandler] ❌ Click failed:', error);
      return this.createErrorResult('click', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Click execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * UNIFIED SCRIPT: Find + Score + Click in ONE browser execution
   * 
   * This is the core of the unified approach - everything happens in browser context.
   */
  private async executeFindAndClick(params: ClickParams): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[ClickHandler] 🔍 Executing unified find-and-click script');

      const script = `
        (async function() {
          // ============================================================================
          // CONFIGURATION
          // ============================================================================
          const targetTag = ${JSON.stringify(params.tag)};
          const targetText = ${JSON.stringify(params.text || '')}.toLowerCase().trim();
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const targetBoundingBox = ${JSON.stringify(params.boundingBox || null)};
          const targetIndex = ${JSON.stringify(params.elementIndex)};
          
          const DYNAMIC_ATTRIBUTES = [
            'class', 'style', 'aria-expanded', 'aria-selected', 'aria-checked',
            'aria-pressed', 'aria-hidden', 'aria-current', 'tabindex',
            'data-state', 'data-active', 'data-selected', 'data-focus', 'data-hover',
            'value', 'checked', 'selected'
          ];
          
          console.log('[UnifiedClick] 🔍 Finding elements with:', {
            tag: targetTag,
            text: targetText.substring(0, 50),
            hasAttrs: Object.keys(targetAttrs).length > 0
          });
          
          // ============================================================================
          // STEP 1: FIND ALL CANDIDATE ELEMENTS
          // ============================================================================
          let candidates = Array.from(document.getElementsByTagName(targetTag));
          console.log('[UnifiedClick] Found', candidates.length, 'elements with tag', targetTag);
          
          if (candidates.length === 0 && targetText) {
            candidates = Array.from(document.querySelectorAll(
              'button, a, input, textarea, path, svg, label, span, div, [role="button"], [role="link"]'
            ));
            console.log('[UnifiedClick] Broadened search, found', candidates.length, 'interactive elements');
          }
          
          // Filter by text
          if (targetText) {
            candidates = candidates.filter(el => {
              const elText = (el.innerText || el.textContent || '').toLowerCase().trim();
              const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
              const placeholder = (el.getAttribute('placeholder') || '').toLowerCase().trim();
              const title = (el.getAttribute('title') || '').toLowerCase().trim();
              const value = (el.value || '').toLowerCase().trim();
              
              return elText.includes(targetText) || 
                     ariaLabel.includes(targetText) ||
                     placeholder.includes(targetText) ||
                     title.includes(targetText) ||
                     value.includes(targetText);
            });
            console.log('[UnifiedClick] After text filter:', candidates.length);
          }
          
          // Filter by stable attributes
          const stableAttrKeys = Object.keys(targetAttrs).filter(key => 
            !DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
          );
          
          if (stableAttrKeys.length > 0) {
            candidates = candidates.filter(el => {
              return stableAttrKeys.some(key => el.getAttribute(key) === targetAttrs[key]);
            });
            console.log('[UnifiedClick] After attribute filter:', candidates.length);
          }
          
          if (candidates.length === 0) {
            return { success: false, error: 'No matching elements found' };
          }
          
          // ============================================================================
          // STEP 2: SCORE ALL CANDIDATES
          // ============================================================================
          const scored = candidates.map(el => {
            let score = 0;
            const matchedBy = [];
            
            // Tag match (20 points)
            if (el.tagName.toUpperCase() === targetTag.toUpperCase()) {
              score += 20;
              matchedBy.push('tag');
            }
            
            // Stable attribute matches (up to 60 points)
            for (const key of stableAttrKeys) {
              const elValue = el.getAttribute(key);
              if (elValue === targetAttrs[key]) {
                if (key === 'id') score += 20;
                else if (key.startsWith('data-')) score += 15;
                else if (key.startsWith('aria-')) score += 12;
                else if (['name', 'type', 'role'].includes(key)) score += 10;
                else score += 5;
                matchedBy.push('attr:' + key);
              }
            }
            
            // Text match (up to 50 points)
            if (targetText) {
              const elText = (el.innerText || el.textContent || '').toLowerCase().trim();
              if (elText === targetText) {
                score += 50;
                matchedBy.push('text:exact');
              } else if (elText.includes(targetText)) {
                score += 20;
                matchedBy.push('text:contains');
              }
            }
            
            // Position match (up to 40 points)
            if (targetBoundingBox) {
              const rect = el.getBoundingClientRect();
              const xDiff = Math.abs(rect.x - targetBoundingBox.x);
              const yDiff = Math.abs(rect.y - targetBoundingBox.y);
              const totalDiff = xDiff + yDiff;
              
              if (totalDiff < 5) score += 40;
              else if (totalDiff < 20) score += 30;
              else if (totalDiff < 50) score += 20;
              else if (totalDiff < 100) score += 10;
              else if (totalDiff < 200) score += 5;
              
              if (totalDiff < 50) matchedBy.push('position');
            }
            
            // Visibility bonus (10 points)
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible = rect.width > 0 && rect.height > 0 && 
                             style.display !== 'none' && 
                             style.visibility !== 'hidden' &&
                             style.opacity !== '0';
            if (isVisible) {
              score += 10;
              matchedBy.push('visible');
            }
            
            return { element: el, score, matchedBy };
          });
          
          // Sort by score
          scored.sort((a, b) => b.score - a.score);
          console.log('[UnifiedClick] Scored candidates:', scored);
          
          // Apply element index disambiguation
          if (targetIndex !== undefined && scored.length > 1) {
            const topScore = scored[0].score;
            const closeMatches = scored.filter(s => Math.abs(s.score - topScore) < 15);
            
            if (closeMatches.length > 1) {
              for (const candidate of closeMatches) {
                const elIndex = candidate.element.parentElement 
                  ? Array.from(candidate.element.parentElement.children).indexOf(candidate.element)
                  : 0;
                if (elIndex === targetIndex) {
                  candidate.score += 50;
                  candidate.matchedBy.push('index');
                  break;
                }
              }
              scored.sort((a, b) => b.score - a.score);
            }
          }
          
          const best = scored[0];
          console.log('[UnifiedClick] 🏆 Best match: score=' + best.score + ', matched by: ' + best.matchedBy.join(', '));
          
          if (scored.length > 1) {
            console.log('[UnifiedClick] 🥈 Second best: score=' + scored[1].score);
            if (Math.abs(best.score - scored[1].score) < 10) {
              console.warn('[UnifiedClick] ⚠️ AMBIGUOUS MATCH! Scores are very close.');
            }
          }
          
          // ============================================================================
          // STEP 3: FOCUS ELEMENT
          // ============================================================================
          const element = best.element;
          console.log('[UnifiedClick] Focusing element:', element);
          
          if (typeof element.focus === 'function') {
            element.focus();
            console.log('[UnifiedClick] ✅ Element focused');
          }
          
          // ============================================================================
          // STEP 4: SCROLL INTO VIEW
          // ============================================================================
          element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          console.log('[UnifiedClick] 📍 Scrolling element into view...');
          await new Promise(resolve => setTimeout(resolve, 600));
          
          // ============================================================================
          // STEP 5: HIGHLIGHT ELEMENT
          // ============================================================================
          const originalOutline = element.style.outline;
          const originalOutlineOffset = element.style.outlineOffset;
          element.style.border = '3px solid #00ff00';
          element.style.outlineOffset = '2px';
          console.log('[UnifiedClick] ✅ Element highlighted');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // ============================================================================
          // STEP 6: VERIFY IN VIEWPORT
          // ============================================================================
          element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
          await new Promise(resolve => setTimeout(resolve, 400));
          
          // ============================================================================
          // STEP 7: EXECUTE FULL CLICK SEQUENCE
          // ============================================================================
          // Get fresh bounding box after scrolling
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Hover events
          const hoverEvents = [
            new PointerEvent('pointerover', {
              bubbles: true, cancelable: true, composed: true,
              pointerId: 1, pointerType: 'mouse', isPrimary: true,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 0
            }),
            new MouseEvent('mouseover', {
              bubbles: true, cancelable: true, composed: true,
              view: window, clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 0
            })
          ];
          hoverEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 120));
          
          // Focus events
          if (typeof element.focus === 'function') {
            element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
            element.dispatchEvent(new FocusEvent('focus', { bubbles: false, composed: true }));
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          // Mouse down
          const downEvents = [
            new PointerEvent('pointerdown', {
              bubbles: true, cancelable: true, composed: true,
              pointerId: 1, pointerType: 'mouse', isPrimary: true,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 1, pressure: 0.5
            }),
            new MouseEvent('mousedown', {
              bubbles: true, cancelable: true, composed: true,
              view: window, detail: 1,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 1
            })
          ];
          downEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 80));
          
          // Mouse up
          const upEvents = [
            new PointerEvent('pointerup', {
              bubbles: true, cancelable: true, composed: true,
              pointerId: 1, pointerType: 'mouse', isPrimary: true,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 0, pressure: 0
            }),
            new MouseEvent('mouseup', {
              bubbles: true, cancelable: true, composed: true,
              view: window, detail: 1,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 0
            })
          ];
          upEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 20));
          
          // Click events
          const clickEvents = [
            new PointerEvent('click', {
              bubbles: true, cancelable: true, composed: true,
              pointerId: 1, pointerType: 'mouse', isPrimary: true,
              view: window, detail: 1,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 0
            }),
            new MouseEvent('click', {
              bubbles: true, cancelable: true, composed: true,
              view: window, detail: 1,
              clientX: centerX, clientY: centerY,
              screenX: centerX, screenY: centerY,
              button: 0, buttons: 0
            })
          ];
          clickEvents.forEach(event => element.dispatchEvent(event));
          // element.click();
          
          console.log('[UnifiedClick] ✅ Click events dispatched and native click() called');
          
          // Wait and restore
          await new Promise(resolve => setTimeout(resolve, 300));
          element.style.outline = originalOutline;
          element.style.outlineOffset = originalOutlineOffset;
          
          console.log('[UnifiedClick] ✅ Click completed successfully');
          return { success: true };
          
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      return result;

    } catch (error) {
      console.error('[ClickHandler] ❌ Unified click execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Fallback: Execute click at specific coordinates using CDP
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
      return false;
    }
  }
}
