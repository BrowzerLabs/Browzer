import { BaseHandler, HandlerContext } from './BaseHandler';

import type {
  KeyPressParams,
  ScrollParams,
  ToolExecutionResult,
} from '@/shared/types';

export class InteractionHandler extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  async executeKeyPress(params: KeyPressParams): Promise<ToolExecutionResult> {
    try {
      if (params.focusElement) {
        const focusResult = await this.findAndFocusElement(params.focusElement);

        if (!focusResult.success) {
          console.warn(
            '[InteractionHandler] ⚠️ Could not find element to focus, pressing key anyway'
          );
        } else {
          await this.sleep(150);
        }
      }

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

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: params.key,
        code: this.getKeyCode(params.key),
        modifiers: modifiersBitmask,
      });

      await this.sleep(50);

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: params.key,
        code: this.getKeyCode(params.key),
        modifiers: modifiersBitmask,
      });

      console.log(`[InteractionHandler] ✅ Key pressed: ${params.key}`);

      await this.sleep(300);

      return { success: true };
    } catch (error) {
      console.error('[InteractionHandler] ❌ Key press failed:', error);
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: `Key press failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async executeScroll(params: ScrollParams): Promise<ToolExecutionResult> {
    console.log(`[InteractionHandler] 📜 Scroll:`, params);

    try {
      if (params.toElement) {
        const scrollScript = `
          (function() {
            const el = document.querySelector(${JSON.stringify(params.toElement)});
            if (!el) return { success: false, error: 'Element not found' };
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { success: true };
          })();
        `;

        const result =
          await this.view.webContents.executeJavaScript(scrollScript);

        if (!result.success) {
          return this.createErrorResult({
            code: 'ELEMENT_NOT_FOUND',
            message: result.error || 'Could not find element to scroll to',
          });
        }
      } else {
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

      return { success: true };
    } catch (error) {
      console.error('[InteractionHandler] ❌ Scroll failed:', error);
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async findAndFocusElement(
    params: any
  ): Promise<{ success: boolean; centerX?: number; centerY?: number }> {
    try {
      console.log('[InteractionHandler] 🔍 Finding element to focus');

      const script = `
        (async function() {
          const targetTag = ${JSON.stringify(params.tag)};
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const targetBoundingBox = ${JSON.stringify(params.boundingBox || null)};
          
          const DYNAMIC_ATTRIBUTES = [
            'class', 'style', 'aria-expanded', 'aria-selected', 'aria-checked',
            'aria-pressed', 'aria-hidden', 'aria-current', 'tabindex',
            'data-state', 'data-active', 'data-selected', 'data-focus', 'data-hover',
            'value', 'checked', 'selected'
          ];
          
          let candidates = Array.from(document.getElementsByTagName(targetTag));
          
          const stableAttrKeys = Object.keys(targetAttrs).filter(key => 
            !DYNAMIC_ATTRIBUTES.includes(key) && targetAttrs[key]
          );
          
          if (stableAttrKeys.length > 0) {
            candidates = candidates.filter(el => {
              return stableAttrKeys.some(key => el.getAttribute(key) === targetAttrs[key]);
            });
          }
          
          if (candidates.length === 0) {
            return { success: false, error: 'No matching elements found' };
          }
          
          const scored = candidates.map(el => {
            let score = 0;
            
            if (el.tagName.toUpperCase() === targetTag.toUpperCase()) score += 20;
            
            for (const key of stableAttrKeys) {
              if (el.getAttribute(key) === targetAttrs[key]) {
                if (key === 'id') score += 20;
                else if (key.startsWith('data-')) score += 15;
                else score += 10;
              }
            }
            
            if (targetBoundingBox) {
              const rect = el.getBoundingClientRect();
              const totalDiff = Math.abs(rect.x - targetBoundingBox.x) + Math.abs(rect.y - targetBoundingBox.y);
              if (totalDiff < 50) score += 30;
              else if (totalDiff < 100) score += 15;
            }
            
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && style.display !== 'none') score += 10;
            
            return { element: el, score };
          });
          
          scored.sort((a, b) => b.score - a.score);
          const best = scored[0];
          const element = best.element;
          
          if (typeof element.focus === 'function') {
            element.focus();
          }
          
          element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const rect = element.getBoundingClientRect();
          return { 
            success: true, 
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2
          };
        })();
      `;

      const result = await this.view.webContents.executeJavaScript(script);

      if (result.success && result.centerX && result.centerY) {
        const cdp = this.view.webContents.debugger;

        await cdp.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: Math.round(result.centerX),
          y: Math.round(result.centerY),
          button: 'left',
          clickCount: 1,
        });

        await this.sleep(50);

        await cdp.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: Math.round(result.centerX),
          y: Math.round(result.centerY),
          button: 'left',
          clickCount: 1,
        });

        console.log('[InteractionHandler] ✅ Element found and focused');
      }

      return result;
    } catch (error) {
      console.error('[InteractionHandler] ❌ Find and focus failed:', error);
      return { success: false };
    }
  }

  /**
   * Get key code for common keys
   */
  private getKeyCode(key: string): string {
    const keyMap: Record<string, string> = {
      Enter: 'Enter',
      Escape: 'Escape',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      Space: 'Space',
    };

    return keyMap[key] || key;
  }
}
