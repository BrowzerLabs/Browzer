/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import type { HandlerContext, InputPrepResult, TypingResult } from '../core/types';
import type { TypeParams, ToolExecutionResult, FoundElement } from '@/shared/types';

export class TypeHandler extends BaseHandler {
  private elementFinder: ElementFinder;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
  }

  /**
   * Execute type operation
   */
  async execute(params: TypeParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[TypeHandler] ⌨️  Typing into: ${params.selector}`);

      const waitTime = params.waitForElement ?? 1000;
      if (waitTime > 0) await this.sleep(waitTime);

      // Find input element
      const selectors = [params.selector, ...(params.backupSelectors || [])];
      const elementResult = await this.elementFinder.advancedFind(selectors, {} as any);

      if (!elementResult.success || !elementResult.element) {
        return this.createErrorResult('type', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: `Could not find input element`,
          details: {
            attemptedSelectors: selectors,
            suggestions: [
              'Verify input selector matches current page',
              'Check if input is inside iframe or shadow DOM',
              'Try using attribute selectors: input[name="field"], input[placeholder="text"]',
              'Ensure page has loaded dynamic content'
            ]
          }
        });
      }

      console.log(`[TypeHandler] ✅ Found input: ${elementResult.usedSelector}`);

      // Prepare input (scroll, focus, clear)
      const clearFirst = params.clearFirst ?? true;
      const prepResult = await this.prepareInput(elementResult.usedSelector, clearFirst);

      if (!prepResult.success) {
        return this.createErrorResult('type', startTime, {
          code: 'EXECUTION_ERROR',
          message: prepResult.error || 'Failed to prepare input',
          details: {
            suggestions: [
              'Input may be disabled or read-only',
              'Check if input is visible and interactable',
              'Try with clearFirst: false if clearing is causing issues'
            ]
          }
        });
      }

      console.log(`[TypeHandler] ✅ Input prepared`);

      // Perform typing
      const pressEnter = params.pressEnter ?? false;
      const typingResult = await this.performRobustTyping(
        elementResult.usedSelector,
        params.text,
        pressEnter
      );

      if (!typingResult.success) {
        return this.createErrorResult('type', startTime, {
          code: 'EXECUTION_ERROR',
          message: typingResult.error || 'Typing failed',
          details: {
            lastError: typingResult.details,
            suggestions: [
              'Input may have changed during typing',
              'Check if page has JavaScript errors',
              'Try with shorter text or slower typing'
            ]
          }
        });
      }

      console.log(`[TypeHandler] ✅ Typed: "${params.text}"`);

      // Wait for effects
      await this.sleep(500);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'type',
        executionTime,
        element: {
          selector: elementResult.usedSelector,
          selectorType: elementResult.selectorType,
          tagName: elementResult.element.tagName,
          text: params.text,
          attributes: elementResult.element.attributes || {},
          boundingBox: elementResult.element.boundingBox,
          isVisible: true,
          isEnabled: true
        } as FoundElement,
        value: params.text,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      return this.createErrorResult('type', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Type execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check browser console for errors',
            'Verify input is in stable state',
            'Try with longer wait time'
          ]
        }
      });
    }
  }

  /**
   * Prepare input for typing - scroll, focus, clear with proper React/Vue handling
   */
  private async prepareInput(
    selector: string,
    clearFirst: boolean
  ): Promise<InputPrepResult> {
    const script = `
      (async function() {
        try {
          const input = document.querySelector(${JSON.stringify(selector)});
          if (!input) return { success: false, error: 'Input disappeared' };

          // Check if input is editable
          const isDisabled = input.disabled || 
                            input.readOnly ||
                            input.getAttribute('disabled') !== null ||
                            input.getAttribute('readonly') !== null;
          
          if (isDisabled) {
            return { success: false, error: 'Input is disabled or read-only' };
          }

          // Scroll into view
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 300));

          // Click to focus (more realistic than .focus())
          const rect = input.getBoundingClientRect();
          const clickEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          });
          input.dispatchEvent(clickEvent);
          
          const clickUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          });
          input.dispatchEvent(clickUpEvent);
          
          input.focus();
          await new Promise(resolve => setTimeout(resolve, 100));

          // Clear if requested - with React/Vue support
          if (${clearFirst}) {
            // Get current value for proper event triggering
            const currentValue = input.value;
            
            if (currentValue) {
              // Select all
              input.setSelectionRange(0, currentValue.length);
              
              // Trigger beforeinput event (critical for modern frameworks)
              const beforeInputEvent = new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'deleteContentBackward',
                data: null
              });
              input.dispatchEvent(beforeInputEvent);
              
              // Clear value using native setter to trigger React's property descriptor
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              ).set;
              nativeInputValueSetter.call(input, '');
              
              // Trigger input event (React/Vue listen to this)
              const inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'deleteContentBackward'
              });
              input.dispatchEvent(inputEvent);
              
              // Trigger change event
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          return { success: true };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * ENHANCED: Perform robust typing using CDP key events with PROPER modifier support
   * Handles special characters like @, #, $, etc. that require Shift key
   * This properly triggers React/Vue state updates and all validation events
   */
  private async performRobustTyping(
    selector: string,
    text: string,
    pressEnter: boolean
  ): Promise<TypingResult> {
    try {
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const keyInfo = this.getKeyInfo(char);
        
        // CRITICAL: Press Shift key first if needed (for @, #, $, etc.)
        if (keyInfo.needsShift) {
          await this.debugger.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Shift',
            code: 'ShiftLeft',
            windowsVirtualKeyCode: 16,
            nativeVirtualKeyCode: 16,
            modifiers: 8 // Shift modifier
          });
        }
        
        // Send keyDown event with proper modifiers
        await this.debugger.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char,
          key: keyInfo.key,
          code: keyInfo.code,
          windowsVirtualKeyCode: keyInfo.keyCode,
          nativeVirtualKeyCode: keyInfo.keyCode,
          modifiers: keyInfo.needsShift ? 8 : 0 // 8 = Shift modifier
        });

        // Send keyUp event
        await this.debugger.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: keyInfo.key,
          code: keyInfo.code,
          windowsVirtualKeyCode: keyInfo.keyCode,
          nativeVirtualKeyCode: keyInfo.keyCode,
          modifiers: keyInfo.needsShift ? 8 : 0
        });
        
        // Release Shift key if it was pressed
        if (keyInfo.needsShift) {
          await this.debugger.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Shift',
            code: 'ShiftLeft',
            windowsVirtualKeyCode: 16,
            nativeVirtualKeyCode: 16,
            modifiers: 0
          });
        }

        // Reset React value tracker if present
        await this.view.webContents.executeJavaScript(`
          (function() {
            const input = document.querySelector(${JSON.stringify(selector)});
            if (input && input._valueTracker) {
              input._valueTracker.setValue('');
            }
          })();
        `);

        // Small delay for realism
        await this.sleep(15);
      }

      // Trigger final change event after all typing
      await this.view.webContents.executeJavaScript(`
        (function() {
          const input = document.querySelector(${JSON.stringify(selector)});
          if (input) {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Blur and refocus to trigger any blur/focus validation
            input.blur();
            setTimeout(() => input.focus(), 10);
          }
        })();
      `);

      await this.sleep(50);

      // Press Enter if requested
      if (pressEnter) {
        await this.sleep(100);
        
        await this.debugger.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13
        });

        await this.debugger.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13
        });
      }

      return { success: true };
    } catch (e) {
      return { 
        success: false, 
        error: 'Typing failed', 
        details: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /**
   * PRODUCTION-GRADE: Get complete key information including modifiers
   * Properly handles special characters that require Shift key
   */
  private getKeyInfo(char: string): { key: string; code: string; keyCode: number; needsShift: boolean } {
    // Uppercase letters need Shift
    if (/[A-Z]/.test(char)) {
      return {
        key: char,
        code: 'Key' + char,
        keyCode: char.charCodeAt(0),
        needsShift: true
      };
    }
    
    // Lowercase letters don't need Shift
    if (/[a-z]/.test(char)) {
      return {
        key: char,
        code: 'Key' + char.toUpperCase(),
        keyCode: char.charCodeAt(0),
        needsShift: false
      };
    }
    
    // Numbers don't need Shift
    if (/[0-9]/.test(char)) {
      return {
        key: char,
        code: 'Digit' + char,
        keyCode: char.charCodeAt(0),
        needsShift: false
      };
    }
    
    // Special characters mapping with Shift requirement
    // Key format: { key: display character, code: physical key, keyCode: virtual key code, needsShift: boolean }
    const specialChars: Record<string, { key: string; code: string; keyCode: number; needsShift: boolean }> = {
      // Characters that DON'T need Shift
      ' ': { key: ' ', code: 'Space', keyCode: 32, needsShift: false },
      '-': { key: '-', code: 'Minus', keyCode: 189, needsShift: false },
      '=': { key: '=', code: 'Equal', keyCode: 187, needsShift: false },
      '[': { key: '[', code: 'BracketLeft', keyCode: 219, needsShift: false },
      ']': { key: ']', code: 'BracketRight', keyCode: 221, needsShift: false },
      '\\': { key: '\\', code: 'Backslash', keyCode: 220, needsShift: false },
      ';': { key: ';', code: 'Semicolon', keyCode: 186, needsShift: false },
      "'": { key: "'", code: 'Quote', keyCode: 222, needsShift: false },
      ',': { key: ',', code: 'Comma', keyCode: 188, needsShift: false },
      '.': { key: '.', code: 'Period', keyCode: 190, needsShift: false },
      '/': { key: '/', code: 'Slash', keyCode: 191, needsShift: false },
      '`': { key: '`', code: 'Backquote', keyCode: 192, needsShift: false },
      
      // Characters that NEED Shift (Shift + number keys)
      '!': { key: '!', code: 'Digit1', keyCode: 49, needsShift: true },  // Shift+1
      '@': { key: '@', code: 'Digit2', keyCode: 50, needsShift: true },  // Shift+2 (CRITICAL FIX!)
      '#': { key: '#', code: 'Digit3', keyCode: 51, needsShift: true },  // Shift+3
      '$': { key: '$', code: 'Digit4', keyCode: 52, needsShift: true },  // Shift+4
      '%': { key: '%', code: 'Digit5', keyCode: 53, needsShift: true },  // Shift+5
      '^': { key: '^', code: 'Digit6', keyCode: 54, needsShift: true },  // Shift+6
      '&': { key: '&', code: 'Digit7', keyCode: 55, needsShift: true },  // Shift+7
      '*': { key: '*', code: 'Digit8', keyCode: 56, needsShift: true },  // Shift+8
      '(': { key: '(', code: 'Digit9', keyCode: 57, needsShift: true },  // Shift+9
      ')': { key: ')', code: 'Digit0', keyCode: 48, needsShift: true },  // Shift+0
      
      // Characters that NEED Shift (Shift + symbol keys)
      '_': { key: '_', code: 'Minus', keyCode: 189, needsShift: true },      // Shift+-
      '+': { key: '+', code: 'Equal', keyCode: 187, needsShift: true },      // Shift+=
      '{': { key: '{', code: 'BracketLeft', keyCode: 219, needsShift: true }, // Shift+[
      '}': { key: '}', code: 'BracketRight', keyCode: 221, needsShift: true }, // Shift+]
      '|': { key: '|', code: 'Backslash', keyCode: 220, needsShift: true },  // Shift+\
      ':': { key: ':', code: 'Semicolon', keyCode: 186, needsShift: true },  // Shift+;
      '"': { key: '"', code: 'Quote', keyCode: 222, needsShift: true },     // Shift+'
      '<': { key: '<', code: 'Comma', keyCode: 188, needsShift: true },     // Shift+,
      '>': { key: '>', code: 'Period', keyCode: 190, needsShift: true },    // Shift+.
      '?': { key: '?', code: 'Slash', keyCode: 191, needsShift: true },     // Shift+/
      '~': { key: '~', code: 'Backquote', keyCode: 192, needsShift: true }  // Shift+`
    };
    
    if (specialChars[char]) {
      return specialChars[char];
    }
    
    // Fallback for unknown characters
    return {
      key: char,
      code: 'Unidentified',
      keyCode: char.charCodeAt(0),
      needsShift: false
    };
  }
}
