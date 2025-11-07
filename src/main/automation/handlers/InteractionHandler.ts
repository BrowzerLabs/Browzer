/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import { EffectTracker } from '../core/EffectTracker';
import type { HandlerContext } from '../core/types';
import type { KeyPressParams, ScrollParams, ToolExecutionResult } from '@/shared/types';

/**
 * InteractionHandler - Handles keyboard and scroll interactions
 * 
 * Provides operations for:
 * - Key press with modifiers (Ctrl, Shift, Alt, Meta)
 * - Scroll (by direction/amount or to element)
 * 
 * This handler ensures interactions work reliably across different
 * page states and element positions.
 */
export class InteractionHandler extends BaseHandler {
  private elementFinder: ElementFinder;
  private effectTracker: EffectTracker;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
    this.effectTracker = new EffectTracker(context);
  }

  /**
   * Execute key press operation
   */
  async executeKeyPress(params: KeyPressParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[InteractionHandler] Pressing key: ${params.key}`);

      // Focus element if specified
      if (params.selector) {
        const queryResult = await this.elementFinder.findWithCDP([params.selector], true);
        if (queryResult.found && queryResult.nodeId) {
          await this.debugger.sendCommand('DOM.focus', { nodeId: queryResult.nodeId });
          await this.sleep(100); // Small delay after focus
        } else {
          return this.createErrorResult('keyPress', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message: `Could not find element to focus: ${params.selector}`,
            details: {
              suggestions: ['Verify the selector is correct', 'Try without focusing a specific element']
            }
          });
        }
      }

      // Build modifiers
      const modifiers = this.buildKeyModifiers(params.modifiers || []);

      // Press key down
      await this.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: params.key,
        code: params.key,
        windowsVirtualKeyCode: this.getKeyCode(params.key),
        nativeVirtualKeyCode: this.getKeyCode(params.key),
        ...modifiers
      });

      // Small delay between down and up
      await this.sleep(50);

      // Press key up
      await this.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: params.key,
        code: params.key,
        windowsVirtualKeyCode: this.getKeyCode(params.key),
        nativeVirtualKeyCode: this.getKeyCode(params.key),
        ...modifiers
      });

      console.log(`[InteractionHandler] ✅ Key pressed: ${params.key}`);

      await this.sleep(300);
      const effects = await this.effectTracker.capturePostActionEffects();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'keyPress',
        executionTime,
        effects,
        value: params.key,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      return this.createErrorResult('keyPress', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Key press failed`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: ['Verify the key name is correct (e.g., "Enter", "Escape", "Tab")']
        }
      });
    }
  }

  /**
   * Execute scroll operation
   */
  async executeScroll(params: ScrollParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`[InteractionHandler] Scrolling: ${JSON.stringify(params)}`);

      if (params.toElement) {
        // Scroll to element
        const scrollScript = `
          (function() {
            const el = document.querySelector(${JSON.stringify(params.toElement)});
            if (!el) return { success: false, error: 'Element not found' };
            
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            return { success: true, scrolledTo: 'element' };
          })();
        `;

        const result = await this.view.webContents.executeJavaScript(scrollScript);

        if (!result.success) {
          return this.createErrorResult('scroll', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message: `Could not find element to scroll to: ${params.toElement}`,
            details: {
              suggestions: ['Verify the element selector is correct']
            }
          });
        }

        console.log(`[InteractionHandler] ✅ Scrolled to element`);
      } else {
        // Scroll by amount
        const amount = params.amount || 500;
        let deltaX = 0;
        let deltaY = 0;

        switch (params.direction) {
          case 'down':
            deltaY = amount;
            break;
          case 'up':
            deltaY = -amount;
            break;
          case 'right':
            deltaX = amount;
            break;
          case 'left':
            deltaX = -amount;
            break;
          default:
            deltaY = amount; // Default to down
        }

        await this.view.webContents.executeJavaScript(`
          window.scrollBy({
            left: ${deltaX},
            top: ${deltaY},
            behavior: 'smooth'
          });
        `);

        console.log(`[InteractionHandler] ✅ Scrolled ${params.direction || 'down'} by ${amount}px`);
      }

      await this.sleep(500); // Wait for scroll to complete
      const effects = await this.effectTracker.capturePostActionEffects();

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'scroll',
        executionTime,
        effects,
        timestamp: Date.now(),
        tabId: this.tabId,
        url: this.getUrl()
      };

    } catch (error) {
      return this.createErrorResult('scroll', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Scroll failed`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Build key modifiers for CDP
   */
  private buildKeyModifiers(modifiers: string[]): any {
    const result: any = {};
    if (modifiers.includes('Control')) result.modifiers = (result.modifiers || 0) | 2;
    if (modifiers.includes('Shift')) result.modifiers = (result.modifiers || 0) | 8;
    if (modifiers.includes('Alt')) result.modifiers = (result.modifiers || 0) | 1;
    if (modifiers.includes('Meta')) result.modifiers = (result.modifiers || 0) | 4;
    return result;
  }

  /**
   * Get key code for CDP
   */
  private getKeyCode(key: string): number {
    // Common key codes for CDP Input.dispatchKeyEvent
    const keyCodes: Record<string, number> = {
      'Enter': 13,
      'Escape': 27,
      'Tab': 9,
      'Backspace': 8,
      'Delete': 46,
      'ArrowUp': 38,
      'ArrowDown': 40,
      'ArrowLeft': 37,
      'ArrowRight': 39,
      'Home': 36,
      'End': 35,
      'PageUp': 33,
      'PageDown': 34,
      'Space': 32,
      ' ': 32
    };

    // If it's a single character, use its char code
    if (key.length === 1) {
      return key.toUpperCase().charCodeAt(0);
    }

    // Return mapped key code or 0
    return keyCodes[key] || 0;
  }
}
