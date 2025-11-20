/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from '../core/BaseHandler';
import { ElementFinder } from '../core/ElementFinder';
import type { HandlerContext } from '../core/types';
import type { ToolExecutionResult, FoundElement, TypeParams, ElementFinderParams } from '@/shared/types';

/**
 * SIMPLIFIED TYPE HANDLER
 * 
 * Strategy:
 * 1. Use ElementFinder to locate the input element
 * 2. Focus the element
 * 3. Clear existing content if needed
 * 4. Type character by character using CDP Input.dispatchKeyEvent (native-like)
 * 5. Press Enter if requested
 */

export class TypeHandler extends BaseHandler {
  private elementFinder: ElementFinder;

  constructor(context: HandlerContext) {
    super(context);
    this.elementFinder = new ElementFinder(context);
  }

  /**
   * Execute type action
   */
  async execute(params: TypeParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    try {

      const findParams: ElementFinderParams = {
        tag: params.tag,
        attributes: params.attributes,
        boundingBox: params.boundingBox,
        elementIndex: params.elementIndex
      };

      const findResult = await this.elementFinder.advancedFind(findParams);

      if (!findResult.success || !findResult.element) {
        return this.createErrorResult('type', startTime, {
          code: 'ELEMENT_NOT_FOUND',
          message: 'Could not find input element',
          details: {
            lastError: findResult.error,
            suggestions: [
              'Verify element attributes match the current page',
              'Check if input is inside iframe or shadow DOM',
              'Ensure page has finished loading'
            ]
          }
        });
      }

      const foundElement = findResult.element;
      console.log(`[TypeHandler] ✅ Input found`);

      // Scroll into view
      await this.scrollIntoView(foundElement.boundingBox);
      await this.sleep(200);

      // Focus the element
      const focusSuccess = await this.focusElement(foundElement.boundingBox);
      if (!focusSuccess) {
        return this.createErrorResult('type', startTime, {
          code: 'EXECUTION_ERROR',
          message: 'Failed to focus input element',
          details: {
            suggestions: ['Element may not be interactable', 'Try clicking the element first']
          }
        });
      }

      await this.sleep(100);

      // Clear existing content if requested
      if (params.clearFirst !== false) { // Default true
        await this.clearInput();
        await this.sleep(100);
      }

      // Type the text
      const typeSuccess = await this.typeText(params.text);
      if (!typeSuccess) {
        return this.createErrorResult('type', startTime, {
          code: 'EXECUTION_ERROR',
          message: 'Failed to type text',
          details: {
            suggestions: ['Element may have lost focus', 'Input may be disabled or readonly']
          }
        });
      }

      // Press Enter if requested
      if (params.pressEnter) {
        await this.sleep(100);
        await this.pressKey('Enter');
        console.log('[TypeHandler] ↵ Pressed Enter');
      }

      // Wait for effects
      await this.sleep(300);

      const executionTime = Date.now() - startTime;
      console.log(`[TypeHandler] ✅ Typing completed in ${executionTime}ms`);

      return {
        success: true,
        toolName: 'type',
        url: this.getUrl()
      };

    } catch (error) {
      console.error('[TypeHandler] ❌ Type failed:', error);
      return this.createErrorResult('type', startTime, {
        code: 'EXECUTION_ERROR',
        message: `Type execution failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          lastError: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check if input accepts the text format',
            'Verify element is not disabled or readonly'
          ]
        }
      });
    }
  }

  private async focusElement(boundingBox: { x: number; y: number; width: number; height: number }): Promise<boolean> {
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

      return true;
    } catch (error) {
      console.error('[TypeHandler] ❌ Focus failed:', error);
      return false;
    }
  }

  private async clearInput(): Promise<void> {
    try {
      const cdp = this.view.webContents.debugger;
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      
      // Select all
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: modifier === 'Meta' ? 8 : 2
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: modifier === 'Meta' ? 8 : 2
      });

      await this.sleep(50);

      // Delete
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Backspace',
        code: 'Backspace'
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Backspace',
        code: 'Backspace'
      });

    } catch (error) {
      console.warn('[TypeHandler] ⚠️ Clear failed:', error);
    }
  }

  private async typeText(text: string): Promise<boolean> {
    try {
      const cdp = this.view.webContents.debugger;

      for (const char of text) {
        await cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char
        });

        await this.sleep(20);

        await cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          text: char
        });

        await this.sleep(20);
      }

      return true;
    } catch (error) {
      console.error('[TypeHandler] ❌ Type text failed:', error);
      return false;
    }
  }

  private async pressKey(key: string): Promise<void> {
    try {
      const cdp = this.view.webContents.debugger;

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: key,
        code: key === 'Enter' ? 'Enter' : key
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: key,
        code: key === 'Enter' ? 'Enter' : key
      });

    } catch (error) {
      console.warn(`[TypeHandler] ⚠️ Press ${key} failed:`, error);
    }
  }

  private async scrollIntoView(boundingBox: { x: number; y: number; width: number; height: number }): Promise<void> {
    try {
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      const script = `
        (function() {
          const element = document.elementFromPoint(${centerX}, ${centerY});
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            return true;
          }
          return false;
        })();
      `;

      await this.view.webContents.executeJavaScript(script);
    } catch (error) {
      console.warn('[TypeHandler] ⚠️ Scroll failed:', error);
    }
  }

  private generateSelector(element: any): string {
    const attrs = element.attributes || {};
    
    if (attrs.id && !attrs.id.match(/^(:r[0-9a-z]+:|mui-|mat-)/)) {
      return `#${attrs.id}`;
    }
    if (attrs['data-testid']) {
      return `[data-testid="${attrs['data-testid']}"]`;
    }
    if (attrs.name) {
      return `[name="${attrs.name}"]`;
    }
    if (attrs.placeholder) {
      return `[placeholder="${attrs.placeholder}"]`;
    }
    
    return element.tagName?.toLowerCase() || 'unknown';
  }
}
