import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import type { HandlerContext } from '../core/types';
import type { KeyPressParams, ScrollParams, ToolExecutionResult, ElementFinderParams } from '@/shared/types';

export class InteractionHandler extends BaseHandler {
  private elementFinder: ElementFinder;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
  }

  async executeKeyPress(params: KeyPressParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Focus element if specified
      if (params.focusElement) {
        const findResult = await this.elementFinder.advancedFind(params.focusElement);
        
        if (findResult.success && findResult.element) {
          await this.focusElement(findResult.element.boundingBox);
          await this.sleep(100);
        } else {
          console.warn('[InteractionHandler] ⚠️ Could not find element to focus, pressing key anyway');
        }
      }

      // Build modifiers
      let modifiersBitmask = 0;
      if (params.modifiers) {
        for (const mod of params.modifiers) {
          if (mod === 'Alt') modifiersBitmask |= 1;
          if (mod === 'Control') modifiersBitmask |= 2;
          if (mod === 'Meta') modifiersBitmask |= 4;
          if (mod === 'Shift') modifiersBitmask |= 8;
        }
      }

      const cdp = this.view.webContents.debugger;
      if (!cdp.isAttached()) cdp.attach('1.3');

      // Key down
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: params.key,
        code: this.getKeyCode(params.key),
        modifiers: modifiersBitmask
      });

      await this.sleep(50);

      // Key up
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: params.key,
        code: this.getKeyCode(params.key),
        modifiers: modifiersBitmask
      });

      console.log(`[InteractionHandler] ✅ Key pressed: ${params.key}`);

      await this.sleep(300);

      return {
        success: true,
        toolName: 'keyPress',
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[InteractionHandler] ❌ Key press failed:', error);
      return this.createErrorResult('keyPress', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Key press failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Verify the key name is correct (e.g., "Enter", "Escape", "Tab")',
            'Check if modifiers are supported'
          ]
        }
      });
    }
  }

  /**
   * Execute scroll operation
   */
  async executeScroll(params: ScrollParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    console.log(`[InteractionHandler] 📜 Scroll:`, params);

    try {
      if (params.toElement) {
        // Scroll to element
        const scrollScript = `
          (function() {
            const el = document.querySelector(${JSON.stringify(params.toElement)});
            if (!el) return { success: false, error: 'Element not found' };
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { success: true };
          })();
        `;

        const result = await this.view.webContents.executeJavaScript(scrollScript);
        
        if (!result.success) {
          return this.createErrorResult('scroll', startTime, {
            code: 'ELEMENT_NOT_FOUND',
            message: result.error || 'Could not find element to scroll to',
            details: {
              suggestions: ['Verify the element selector is correct']
            }
          });
        }
      } else {
        // Scroll by direction/amount
        const direction = params.direction || 'down';
        const amount = params.amount || 500;

        let deltaX = 0;
        let deltaY = 0;

        if (direction === 'down') deltaY = amount;
        else if (direction === 'up') deltaY = -amount;
        else if (direction === 'right') deltaX = amount;
        else if (direction === 'left') deltaX = -amount;

        await this.view.webContents.executeJavaScript(`
          window.scrollBy({ left: ${deltaX}, top: ${deltaY}, behavior: 'smooth' });
        `);
      }

      console.log('[InteractionHandler] ✅ Scrolled');

      await this.sleep(500);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName: 'scroll',
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[InteractionHandler] ❌ Scroll failed:', error);
      return this.createErrorResult('scroll', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Focus element by clicking
   */
  private async focusElement(boundingBox: { x: number; y: number; width: number; height: number }): Promise<void> {
    try {
      const centerX = Math.round(boundingBox.x + boundingBox.width / 2);
      const centerY = Math.round(boundingBox.y + boundingBox.height / 2);

      const cdp = this.view.webContents.debugger;
      if (!cdp.isAttached()) cdp.attach('1.3');

      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1
      });

    } catch (error) {
      console.warn('[InteractionHandler] ⚠️ Focus failed:', error);
    }
  }

  /**
   * Get key code for common keys
   */
  private getKeyCode(key: string): string {
    const keyMap: Record<string, string> = {
      'Enter': 'Enter',
      'Escape': 'Escape',
      'Tab': 'Tab',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'Space': 'Space'
    };

    return keyMap[key] || key;
  }
}
