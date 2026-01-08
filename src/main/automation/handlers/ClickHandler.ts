import { BaseHandler, HandlerContext } from './BaseHandler';

import type { ToolExecutionResult, ClickParams } from '@/shared/types';

export interface CDPClickParams extends ClickParams {
  backend_node_id?: number;
}

export class ClickHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  async execute(params: CDPClickParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log('[ClickHandler] 🎯 Starting unified click execution');

      // Priority 1: Use backend_node_id if provided (CDP-based click)
      if (params.backend_node_id !== undefined) {
        console.log(
          `[ClickHandler] 🔗 Using backend_node_id: ${params.backend_node_id}`
        );
        const result = await this.executeClickByBackendNodeId(
          params.backend_node_id
        );

        if (result.success) {
          await this.sleep(500);
          return {
            success: true,
            toolName: 'click',
            url: this.getUrl(),
          };
        } else {
          // Fallback to tag-based or position-based click
          if (params.tag) {
            console.warn(
              '[ClickHandler] ⚠️ CDP click failed, trying tag-based fallback'
            );
            const tagResult = await this.executeFindAndClick(params);
            if (tagResult.success) {
              await this.sleep(500);
              return {
                success: true,
                toolName: 'click',
                url: this.getUrl(),
              };
            }
          }

          if (params.click_position) {
            console.warn('[ClickHandler] ⚠️ Trying position fallback');
            const positionSuccess = await this.executeClickAtPosition(
              params.click_position.x,
              params.click_position.y
            );
            if (positionSuccess) {
              await this.sleep(500);
              return {
                success: true,
                toolName: 'click',
                url: this.getUrl(),
              };
            }
          }

          return this.createErrorResult('click', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message:
              result.error || 'Could not click element by backend_node_id',
            details: {
              lastError: result.error,
              suggestions: [
                'Element may have been removed from DOM',
                'Try extracting context again to get fresh backend_node_ids',
                'Use tag-based fallback if element structure changed',
              ],
            },
          });
        }
      }

      // Priority 2: Use tag-based element finding
      if (params.tag) {
        const result = await this.executeFindAndClick(params);

        if (result.success) {
          await this.sleep(500);
          return {
            success: true,
            toolName: 'click',
            url: this.getUrl(),
          };
        } else {
          if (params.click_position) {
            console.warn(
              '[ClickHandler] ⚠️  click failed, trying position fallback'
            );
            const positionSuccess = await this.executeClickAtPosition(
              params.click_position.x,
              params.click_position.y
            );

            if (positionSuccess) {
              await this.sleep(500);
              return {
                success: true,
                toolName: 'click',
                url: this.getUrl(),
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
                'Try adding more specific attributes (id, data-testid, aria-label)',
              ],
            },
          });
        }
      } else if (params.click_position) {
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
            url: this.getUrl(),
          };
        }

        return this.createErrorResult('click', startTime, {
          code: 'CLICK_FAILED',
          message: 'Failed to execute click at position',
          details: {
            lastError: `Click failed at coordinates (${params.click_position.x}, ${params.click_position.y})`,
          },
        });
      } else {
        return this.createErrorResult('click', startTime, {
          code: 'INVALID_PARAMS',
          message:
            'Must provide backend_node_id, tag for element finding, or click_position',
        });
      }
    } catch (error) {
      console.error('[ClickHandler] ❌ Click failed:', error);
      return this.createErrorResult('click', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Click execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async executeClickByBackendNodeId(
    backendNodeId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const cdp = this.view.webContents.debugger;

      if (!cdp.isAttached()) {
        cdp.attach('1.3');
      }

      console.log(
        `[ClickHandler] 🔍 Resolving backend_node_id: ${backendNodeId}`
      );

      try {
        await cdp.sendCommand('DOM.scrollIntoViewIfNeeded', { backendNodeId });
        await this.sleep(300);
      } catch (scrollError) {
        console.warn(
          '[ClickHandler] ⚠️ scrollIntoViewIfNeeded failed:',
          scrollError
        );
      }

      let centerX: number;
      let centerY: number;

      try {
        const boxModel = await cdp.sendCommand('DOM.getBoxModel', {
          backendNodeId,
        });
        const content = (boxModel as any).model.content;

        centerX = (content[0] + content[2]) / 2;
        centerY = (content[1] + content[5]) / 2;

        console.log(
          `[ClickHandler] 📍 Element center: (${centerX}, ${centerY})`
        );
      } catch (boxError) {
        console.error('[ClickHandler] ❌ Failed to get box model:', boxError);
        return {
          success: false,
          error: `Failed to get element position: ${boxError instanceof Error ? boxError.message : String(boxError)}`,
        };
      }

      try {
        await cdp.sendCommand('DOM.focus', { backendNodeId });
        await this.sleep(50);
      } catch (focusError) {
        console.warn(
          '[ClickHandler] ⚠️ Focus failed (non-critical):',
          focusError
        );
      }

      await this.showClickRipple(centerX, centerY);
      await this.sleep(200);

      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: centerX,
        y: centerY,
        button: 'none',
        clickCount: 0,
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1,
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1,
      });

      console.log('[ClickHandler] ✅ CDP click executed successfully');

      await this.sleep(300);
      await this.removeClickRipple();

      return { success: true };
    } catch (error) {
      console.error(
        '[ClickHandler] ❌ CDP backend_node_id click failed:',
        error
      );
      await this.removeClickRipple();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeFindAndClick(
    params: ClickParams
  ): Promise<{ success: boolean; error?: string }> {
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
          
          console.log('[Click] 🔍 Finding elements with:', {
            tag: targetTag,
            text: targetText.substring(0, 50),
            hasAttrs: Object.keys(targetAttrs).length > 0
          });
          
          // ============================================================================
          // STEP 1: FIND ALL CANDIDATE ELEMENTS
          // ============================================================================
          let candidates = Array.from(document.getElementsByTagName(targetTag));
          console.log('[Click] Found', candidates.length, 'elements with tag', targetTag);
          
          if (candidates.length === 0 && targetText) {
            candidates = Array.from(document.querySelectorAll(
              'button, a, input, textarea, path, svg, label, span, div, [role="button"], [role="link"]'
            ));
            console.log('[Click] Broadened search, found', candidates.length, 'interactive elements');
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
            console.log('[Click] After text filter:', candidates.length);
          }
          
          const stableAttrKeys = Object.keys(targetAttrs).filter(key => 
            !DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
          );
          const dynamicAttrKeys = Object.keys(targetAttrs).filter(key => 
            DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
          );
          
          if (stableAttrKeys.length > 0) {
            candidates = candidates.filter(el => {
              return stableAttrKeys.some(key => el.getAttribute(key) === targetAttrs[key]);
            });
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
            
            for (const key of dynamicAttrKeys) {
              const elValue = el.getAttribute(key);
              const targetValue = targetAttrs[key];
              
              if (elValue === targetValue) {
                if (key === 'class') {
                  const elClasses = (elValue || '').split(/\\s+/);
                  const targetClasses = (targetValue || '').split(/\\s+/);
                  const matchingClasses = targetClasses.filter(c => elClasses.includes(c));
                  if (matchingClasses.length > 0) {
                    const classScore = Math.min(matchingClasses.length * 1, 4);
                    score += classScore;
                    matchedBy.push('dyn:class(' + matchingClasses.length + ')');
                  }
                } else if (key === 'style') {
                  score += 1; // Minimal score for style match
                  matchedBy.push('dyn:style');
                } else if (key.startsWith('aria-')) {
                  score += 3; // Dynamic aria attributes (expanded, selected, etc.)
                  matchedBy.push('dyn:' + key);
                } else if (key.startsWith('data-')) {
                  score += 2; // Dynamic data attributes (state, active, etc.)
                  matchedBy.push('dyn:' + key);
                } else {
                  score += 2; // Other dynamic attributes (value, checked, tabindex, etc.)
                  matchedBy.push('dyn:' + key);
                }
              } else if (key === 'class' && elValue && targetValue) {
                const elClasses = elValue.split(/\\s+/);
                const targetClasses = targetValue.split(/\\s+/);
                const matchingClasses = targetClasses.filter(c => elClasses.includes(c));
                if (matchingClasses.length > 0) {
                  const classScore = Math.min(matchingClasses.length * 1, 4); // Max 4 points
                  score += classScore;
                  matchedBy.push('dyn:class-partial(' + matchingClasses.length + ')');
                }
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
            
            // Modal/Dialog priority bonus (20 points)
            let current = el;
            let depth = 0;
            let isInModal = false;
            
            while (current && depth < 10) {
              const role = current.getAttribute('role');
              const ariaModal = current.getAttribute('aria-modal');
              const className = current.className?.toString().toLowerCase() || '';
              
              // Check for modal/dialog indicators
              if (role === 'dialog' || 
                  role === 'alertdialog' || 
                  ariaModal === 'true' ||
                  className.includes('modal') ||
                  className.includes('dialog') ||
                  className.includes('overlay') ||
                  className.includes('popup')) {
                
                // Verify it's actually visible and on top
                const modalStyle = window.getComputedStyle(current);
                const zIndex = parseInt(modalStyle.zIndex) || 0;
                
                if (zIndex > 50) {
                  console.log('[Click] Found modal with zIndex:', zIndex);
                  isInModal = true;
                  break;
                }
              }
              
              current = current.parentElement;
              depth++;
            }
            
            if (isInModal) {
              score += 20;
              matchedBy.push('in-modal');
            }
            
            return { element: el, score, matchedBy };
          });
          
          // Sort by score
          scored.sort((a, b) => b.score - a.score);
          console.log('[Click] Scored candidates:', scored);
          
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
          console.log('[Click] 🏆 Best match: score=' + best.score + ', matched by: ' + best.matchedBy.join(', '));
          
          if (scored.length > 1) {
            console.log('[Click] 🥈 Second best: score=' + scored[1].score);
            if (Math.abs(best.score - scored[1].score) < 10) {
              console.warn('[Click] ⚠️ AMBIGUOUS MATCH! Scores are very close.');
            }
          }
          
          // ============================================================================
          // STEP 3: CHECK IF ELEMENT IS DISABLED
          // ============================================================================
          const element = best.element;
          console.log('[Click] Checking if element is disabled:', element);
          
          // Check if element is disabled
          const isDisabled = element.disabled || 
                            element.getAttribute('disabled') !== null ||
                            element.getAttribute('aria-disabled') === 'true';
          
          if (isDisabled) {
            console.error('[Click] ❌ Element is DISABLED');
            return { 
              success: false, 
              error: 'Element is disabled - cannot be clicked. This may indicate missing form validation or conditional requirements.' 
            };
          }
          
          // ============================================================================
          // STEP 4: FOCUS ELEMENT
          // ============================================================================
          if (typeof element.focus === 'function') {
            element.focus();
            console.log('[Click] ✅ Element focused');
          }
          
          // ============================================================================
          // STEP 5: SCROLL INTO VIEW
          // ============================================================================
          element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          console.log('[Click] 📍 Scrolling element into view...');
          await new Promise(resolve => setTimeout(resolve, 600));
          
          // ============================================================================
          // STEP 6: HIGHLIGHT ELEMENT
          // ============================================================================
          const originalOutline = element.style.border;
          const originalOutlineOffset = element.style.outlineOffset;
          element.style.border = '3px solid #00ff00';
          element.style.outlineOffset = '2px';
          console.log('[Click] ✅ Element highlighted');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // ============================================================================
          // STEP 7: VERIFY IN VIEWPORT
          // ============================================================================
          element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
          await new Promise(resolve => setTimeout(resolve, 400));
          
          // ============================================================================
          // STEP 8: EXECUTE FULL CLICK SEQUENCE
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
          // clickEvents.forEach(event => element.dispatchEvent(event));
          element.click();
          
          console.log('[Click] ✅ Click events dispatched and native click() called');
          
          // Wait and restore
          await new Promise(resolve => setTimeout(resolve, 300));
          element.style.border = originalOutline;
          element.style.outlineOffset = originalOutlineOffset;
          
          console.log('[Click] ✅ Click completed successfully');
          return { success: true };
          
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[ClickHandler] ❌  click execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fallback: Execute click at specific coordinates using CDP
   * WITH VISUAL FEEDBACK (ripple effect)
   */
  private async executeClickAtPosition(x: number, y: number): Promise<boolean> {
    try {
      const cdpDebugger = this.view.webContents.debugger;
      const clickX = Math.round(x);
      const clickY = Math.round(y);

      console.log(
        `[ClickHandler] 🎯 Executing CDP click at position (${clickX}, ${clickY})`
      );

      // ============================================================================
      // VISUAL FEEDBACK: Show ripple effect at click position
      // ============================================================================
      await this.showClickRipple(clickX, clickY);
      await this.sleep(200);

      // Mouse move
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: clickX,
        y: clickY,
        button: 'none',
        clickCount: 0,
      });

      await this.sleep(50);

      // Mouse down
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1,
      });

      await this.sleep(50);

      // Mouse up
      await cdpDebugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'left',
        clickCount: 1,
      });

      console.log('[ClickHandler] ✅ CDP position-based click executed');

      // Keep ripple visible for a moment
      await this.sleep(300);
      await this.removeClickRipple();

      return true;
    } catch (error) {
      console.error(
        '[ClickHandler] ❌ CDP position-based click failed:',
        error
      );
      await this.removeClickRipple();
      return false;
    }
  }

  /**
   * Show visual ripple effect at click coordinates
   */
  private async showClickRipple(x: number, y: number): Promise<void> {
    try {
      const script = `
        (function() {
          // Remove any existing ripple
          const existing = document.getElementById('browzer-click-ripple');
          if (existing) existing.remove();
          
          // Create ripple container
          const ripple = document.createElement('div');
          ripple.id = 'browzer-click-ripple';
          ripple.style.cssText = \`
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 0;
            height: 0;
            pointer-events: none;
            z-index: 2147483647;
          \`;
          
          // Create outer ring (red)
          const outerRing = document.createElement('div');
          outerRing.style.cssText = \`
            position: absolute;
            left: -20px;
            top: -20px;
            width: 40px;
            height: 40px;
            border: 3px solid #ff0000;
            border-radius: 50%;
            animation: browzer-ripple-expand 0.6s ease-out;
            opacity: 0.8;
          \`;
          
          // Create center dot (red)
          const centerDot = document.createElement('div');
          centerDot.style.cssText = \`
            position: absolute;
            left: -6px;
            top: -6px;
            width: 12px;
            height: 12px;
            background: #ff0000;
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 0 8px rgba(255, 0, 0, 0.8);
          \`;
          
          // Create crosshair
          const crosshairV = document.createElement('div');
          crosshairV.style.cssText = \`
            position: absolute;
            left: -1px;
            top: -30px;
            width: 2px;
            height: 60px;
            background: linear-gradient(to bottom, transparent, #ff0000 40%, #ff0000 60%, transparent);
          \`;
          
          const crosshairH = document.createElement('div');
          crosshairH.style.cssText = \`
            position: absolute;
            left: -30px;
            top: -1px;
            width: 60px;
            height: 2px;
            background: linear-gradient(to right, transparent, #ff0000 40%, #ff0000 60%, transparent);
          \`;
          
          // Add animation keyframes
          if (!document.getElementById('browzer-ripple-style')) {
            const style = document.createElement('style');
            style.id = 'browzer-ripple-style';
            style.textContent = \`
              @keyframes browzer-ripple-expand {
                0% {
                  transform: scale(0.5);
                  opacity: 1;
                }
                100% {
                  transform: scale(2);
                  opacity: 0;
                }
              }
            \`;
            document.head.appendChild(style);
          }
          
          ripple.appendChild(outerRing);
          ripple.appendChild(centerDot);
          ripple.appendChild(crosshairV);
          ripple.appendChild(crosshairH);
          document.body.appendChild(ripple);
          
          console.log('[ClickRipple] 🎯 Visual feedback shown at (' + ${x} + ', ' + ${y} + ')');
        })();
      `;

      await this.view.webContents.executeJavaScript(script);
    } catch (error) {
      console.warn('[ClickHandler] ⚠️ Failed to show ripple:', error);
    }
  }

  /**
   * Remove click ripple effect
   */
  private async removeClickRipple(): Promise<void> {
    try {
      const script = `
        (function() {
          const ripple = document.getElementById('browzer-click-ripple');
          if (ripple) {
            ripple.style.transition = 'opacity 0.3s';
            ripple.style.opacity = '0';
            setTimeout(() => ripple.remove(), 300);
          }
        })();
      `;

      await this.view.webContents.executeJavaScript(script);
    } catch (error) {
      console.warn('[ClickHandler] ⚠️ Failed to remove ripple:', error);
    }
  }
}
