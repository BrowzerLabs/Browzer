import { BaseHandler, HandlerContext } from './BaseHandler';

import type { ToolExecutionResult, TypeParams } from '@/shared/types';

export interface CDPTypeParams extends TypeParams {
  backend_node_id?: number;
}

export class TypeHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  async execute(params: CDPTypeParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log('[TypeHandler] ⌨️  Starting type execution');

      let centerX: number;
      let centerY: number;

      if (params.backend_node_id !== undefined) {
        console.log(
          `[TypeHandler] 🔗 Using backend_node_id: ${params.backend_node_id}`
        );
        const cdpResult = await this.prepareByBackendNodeId(
          params.backend_node_id
        );

        if (!cdpResult.success) {
          if (params.tag) {
            console.warn(
              '[TypeHandler] ⚠️ CDP lookup failed, trying tag-based fallback'
            );
            const findResult = await this.executeFindAndPrepare(params);
            if (!findResult.success) {
              return this.createErrorResult('type', startTime, {
                code: 'ELEMENT_NOT_FOUND',
                message: cdpResult.error || 'Could not find input element',
                details: {
                  lastError: cdpResult.error,
                  suggestions: [
                    'Element may have been removed from DOM',
                    'Try extracting context again to get fresh backend_node_ids',
                    'Use tag-based fallback if element structure changed',
                  ],
                },
              });
            }
            centerX = findResult.centerX!;
            centerY = findResult.centerY!;
          } else {
            return this.createErrorResult('type', startTime, {
              code: 'ELEMENT_NOT_FOUND',
              message:
                cdpResult.error ||
                'Could not find input element by backend_node_id',
              details: {
                lastError: cdpResult.error,
                suggestions: [
                  'Element may have been removed from DOM',
                  'Try extracting context again to get fresh backend_node_ids',
                ],
              },
            });
          }
        } else {
          centerX = cdpResult.centerX!;
          centerY = cdpResult.centerY!;
        }
      } else {
        const findResult = await this.executeFindAndPrepare(params);
        if (!findResult.success) {
          return this.createErrorResult('type', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message: findResult.error || 'Could not find input element',
            details: {
              lastError: findResult.error,
              suggestions: [
                'Verify element attributes match the current page',
                'Check if input is dynamically loaded',
                'Ensure input is not inside iframe or shadow DOM',
                'Try adding more specific attributes (id, name, placeholder)',
              ],
            },
          });
        }
        centerX = findResult.centerX!;
        centerY = findResult.centerY!;
      }

      console.log(
        `[TypeHandler] ✅ Input found and prepared at (${centerX}, ${centerY})`
      );

      await this.focusElement(centerX, centerY);
      await this.sleep(150);

      if (params.clearFirst !== false) {
        await this.clearInput();
        await this.sleep(100);
      }

      const typeSuccess = await this.typeText(params.text);
      if (!typeSuccess) {
        return this.createErrorResult('type', startTime, {
          code: 'EXECUTION_ERROR',
          message: 'Failed to type text',
          details: {
            suggestions: [
              'Element may have lost focus',
              'Input may be disabled or readonly',
              'Try clicking the element first',
            ],
          },
        });
      }

      if (params.pressEnter) {
        await this.sleep(100);
        await this.pressKey('Enter');
        console.log('[TypeHandler] ↵ Pressed Enter');
      }

      await this.sleep(300);

      const executionTime = Date.now() - startTime;
      console.log(`[TypeHandler] ✅ Typing completed in ${executionTime}ms`);

      return {
        success: true,
        toolName: 'type',
        url: this.getUrl(),
      };
    } catch (error) {
      console.error('[TypeHandler] ❌ Type failed:', error);
      return this.createErrorResult('type', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Type execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async prepareByBackendNodeId(
    backendNodeId: number
  ): Promise<{
    success: boolean;
    error?: string;
    centerX?: number;
    centerY?: number;
  }> {
    try {
      const cdp = this.view.webContents.debugger;

      if (!cdp.isAttached()) {
        cdp.attach('1.3');
      }

      console.log(
        `[TypeHandler] 🔍 Resolving backend_node_id: ${backendNodeId}`
      );

      try {
        await cdp.sendCommand('DOM.scrollIntoViewIfNeeded', { backendNodeId });
        await this.sleep(300);
      } catch (scrollError) {
        console.warn(
          '[TypeHandler] ⚠️ scrollIntoViewIfNeeded failed:',
          scrollError
        );
      }

      try {
        const boxModel = await cdp.sendCommand('DOM.getBoxModel', {
          backendNodeId,
        });
        const content = (boxModel as any).model.content;

        const centerX = (content[0] + content[2]) / 2;
        const centerY = (content[1] + content[5]) / 2;

        console.log(
          `[TypeHandler] 📍 Element center: (${centerX}, ${centerY})`
        );

        try {
          await cdp.sendCommand('DOM.focus', { backendNodeId });
          await this.sleep(50);
        } catch (focusError) {
          console.warn(
            '[TypeHandler] ⚠️ CDP focus failed (will retry with click):',
            focusError
          );
        }

        return { success: true, centerX, centerY };
      } catch (boxError) {
        console.error('[TypeHandler] ❌ Failed to get box model:', boxError);
        return {
          success: false,
          error: `Failed to get element position: ${boxError instanceof Error ? boxError.message : String(boxError)}`,
        };
      }
    } catch (error) {
      console.error(
        '[TypeHandler] ❌ CDP backend_node_id lookup failed:',
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeFindAndPrepare(params: TypeParams): Promise<{
    success: boolean;
    error?: string;
    centerX?: number;
    centerY?: number;
  }> {
    try {
      console.log('[TypeHandler] 🔍 Executing find-and-prepare script');

      const script = `
        (async function() {
          // ============================================================================
          // CONFIGURATION
          // ============================================================================
          const targetTag = ${JSON.stringify(params.tag || 'INPUT')};
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const targetBoundingBox = ${JSON.stringify(params.boundingBox || null)};
          const targetIndex = ${JSON.stringify(params.elementIndex)};
          
          const DYNAMIC_ATTRIBUTES = [
            'class', 'style', 'aria-expanded', 'aria-selected', 'aria-checked',
            'aria-pressed', 'aria-hidden', 'aria-current', 'tabindex',
            'data-state', 'data-active', 'data-selected', 'data-focus', 'data-hover',
            'value', 'checked', 'selected'
          ];
          
          console.log('[Type] 🔍 Finding input elements with:', {
            tag: targetTag,
            hasAttrs: Object.keys(targetAttrs).length > 0
          });
          
          // ============================================================================
          // STEP 1: FIND ALL CANDIDATE INPUT ELEMENTS
          // ============================================================================
          let candidates = [];
          
          // Strategy 1: Find by specific tag
          if (targetTag) {
            candidates = Array.from(document.getElementsByTagName(targetTag));
            console.log('[Type] Found', candidates.length, 'elements with tag', targetTag);
          }
          
          // Strategy 2: If no specific tag or no results, find ALL input-like elements
          if (candidates.length === 0) {
            const inputSelectors = [
              'input[type="text"]',
              'input[type="email"]',
              'input[type="password"]',
              'input[type="search"]',
              'input[type="tel"]',
              'input[type="url"]',
              'input[type="number"]',
              'input:not([type])',  // Inputs without type default to text
              'textarea',
              '[contenteditable="true"]',
              '[role="textbox"]',
              '[role="searchbox"]',
              '[role="combobox"]'
            ];
            
            candidates = Array.from(document.querySelectorAll(inputSelectors.join(', ')));
            console.log('[Type] Broadened search, found', candidates.length, 'input elements');
          }
          
          // Filter out disabled and readonly elements
          candidates = candidates.filter(el => {
            const isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
            const isReadonly = el.readOnly || el.getAttribute('aria-readonly') === 'true';
            return !isDisabled && !isReadonly;
          });
          console.log('[Type] After filtering disabled/readonly:', candidates.length);
          
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
            return { success: false, error: 'No matching input elements found' };
          }
          
          // ============================================================================
          // STEP 2: SCORE ALL CANDIDATES
          // ============================================================================
          const scored = candidates.map(el => {
            let score = 0;
            const matchedBy = [];
            
            // Tag match (20 points)
            if (targetTag && el.tagName.toUpperCase() === targetTag.toUpperCase()) {
              score += 20;
              matchedBy.push('tag');
            }
            
            // Input type bonus (15 points for text-like inputs)
            const inputType = el.type?.toLowerCase();
            const textTypes = ['text', 'email', 'password', 'search', 'tel', 'url', 'number'];
            if (textTypes.includes(inputType) || el.tagName === 'TEXTAREA') {
              score += 15;
              matchedBy.push('inputType');
            }
            
            // Stable attribute matches (up to 60 points)
            for (const key of stableAttrKeys) {
              const elValue = el.getAttribute(key);
              if (elValue === targetAttrs[key]) {
                if (key === 'id') score += 20;
                else if (key === 'name') score += 18;
                else if (key === 'placeholder') score += 15;
                else if (key.startsWith('data-')) score += 15;
                else if (key.startsWith('aria-')) score += 12;
                else if (key === 'type') score += 10;
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
                  score += 1;
                  matchedBy.push('dyn:style');
                } else if (key.startsWith('aria-')) {
                  score += 3;
                  matchedBy.push('dyn:' + key);
                } else if (key.startsWith('data-')) {
                  score += 2;
                  matchedBy.push('dyn:' + key);
                } else {
                  score += 2;
                  matchedBy.push('dyn:' + key);
                }
              } else if (key === 'class' && elValue && targetValue) {
                const elClasses = elValue.split(/\\s+/);
                const targetClasses = targetValue.split(/\\s+/);
                const matchingClasses = targetClasses.filter(c => elClasses.includes(c));
                if (matchingClasses.length > 0) {
                  const classScore = Math.min(matchingClasses.length * 1, 4);
                  score += classScore;
                  matchedBy.push('dyn:class-partial(' + matchingClasses.length + ')');
                }
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
            
            // Empty value bonus (5 points) - prefer empty inputs for new typing
            if (!el.value || el.value.trim() === '') {
              score += 5;
              matchedBy.push('empty');
            }
            
            // Focus bonus (10 points) - if already focused, likely the right one
            if (document.activeElement === el) {
              score += 10;
              matchedBy.push('focused');
            }
            
            return { element: el, score, matchedBy };
          });
          
          // Sort by score
          scored.sort((a, b) => b.score - a.score);
          
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
          console.log('[Type] 🏆 Best match: score=' + best.score + ', matched by: ' + best.matchedBy.join(', '));
          
          if (scored.length > 1) {
            console.log('[Type] 🥈 Second best: score=' + scored[1].score);
            if (Math.abs(best.score - scored[1].score) < 10) {
              console.warn('[Type] ⚠️ AMBIGUOUS MATCH! Scores are very close.');
            }
          }
          
          // ============================================================================
          // STEP 3: PREPARE ELEMENT (Focus + Scroll + Highlight)
          // ============================================================================
          const element = best.element;
          
          // Focus
          if (typeof element.focus === 'function') {
            element.focus();
            console.log('[Type] ✅ Element focused');
          }
          
          // Scroll into view
          element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          console.log('[Type] 📍 Scrolling element into view...');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Highlight
          const originalOutline = element.style.outline;
          const originalOutlineOffset = element.style.outlineOffset;
          element.style.outline = '2px solid #0066ff';  // Blue for input
          element.style.outlineOffset = '2px';
          console.log('[Type] ✅ Element highlighted');
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Get center coordinates for CDP click
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Restore outline after a moment
          setTimeout(() => {
            element.style.outline = originalOutline;
            element.style.outlineOffset = originalOutlineOffset;
          }, 1000);
          
          console.log('[Type] ✅ Input prepared successfully');
          return { success: true, centerX, centerY };
          
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[TypeHandler] ❌  find-and-prepare failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Focus element using CDP click
   */
  private async focusElement(centerX: number, centerY: number): Promise<void> {
    try {
      const cdp = this.view.webContents.debugger;
      if (!cdp.isAttached()) cdp.attach('1.3');

      // Click to focus
      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: Math.round(centerX),
        y: Math.round(centerY),
        button: 'left',
        clickCount: 1,
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: Math.round(centerX),
        y: Math.round(centerY),
        button: 'left',
        clickCount: 1,
      });

      console.log('[TypeHandler] ✅ Element focused via CDP click');
    } catch (error) {
      console.error('[TypeHandler] ❌ Focus failed:', error);
    }
  }

  /**
   * Clear input using Ctrl+A (Cmd+A on Mac) + Backspace
   */
  private async clearInput(): Promise<void> {
    try {
      const cdp = this.view.webContents.debugger;
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      const modifierCode = modifier === 'Meta' ? 8 : 2;

      // Select all (Ctrl/Cmd + A)
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: modifierCode,
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: modifierCode,
      });

      await this.sleep(50);

      // Delete (Backspace)
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Backspace',
        code: 'Backspace',
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Backspace',
        code: 'Backspace',
      });

      console.log('[TypeHandler] ✅ Input cleared');
    } catch (error) {
      console.warn('[TypeHandler] ⚠️ Clear failed:', error);
    }
  }

  /**
   * Type text character by character using CDP
   */
  private async typeText(text: string): Promise<boolean> {
    try {
      const cdp = this.view.webContents.debugger;

      console.log(`[TypeHandler] ⌨️  Typing: "${text}"`);

      for (const char of text) {
        // Key down
        await cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char,
        });

        await this.sleep(30); // Slightly slower for more natural typing

        // Key up
        await cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          text: char,
        });

        await this.sleep(30);
      }

      console.log('[TypeHandler] ✅ Text typed successfully');
      return true;
    } catch (error) {
      console.error('[TypeHandler] ❌ Type text failed:', error);
      return false;
    }
  }

  /**
   * Press a special key (Enter, Tab, etc.)
   */
  private async pressKey(key: string): Promise<void> {
    try {
      const cdp = this.view.webContents.debugger;

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: key,
        code: key === 'Enter' ? 'Enter' : key,
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: key,
        code: key === 'Enter' ? 'Enter' : key,
      });
    } catch (error) {
      console.warn(`[TypeHandler] ⚠️ Press ${key} failed:`, error);
    }
  }
}
