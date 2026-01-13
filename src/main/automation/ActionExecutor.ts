/**
 * Action Executor
 *
 * Executes individual actions on elements in the browser.
 */

import { FoundElement } from './types';

export class ActionExecutor {
  // ═══════════════════════════════════════════════════════════════════════════
  // CLICK ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click an element
   */
  async click(
    element: FoundElement,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        let el;

        // Try CSS selector first
        try {
          el = document.querySelector(selector);
        } catch (e) {
          // If CSS fails, try XPath
          if (selector.startsWith('//') || selector.startsWith('/')) {
            const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            el = result.singleNodeValue;
          }
        }

        if (!el) {
          throw new Error('Element not found: ' + selector);
        }

        // Scroll element into view
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait for scroll
        setTimeout(() => {
          // Focus the element first
          if (el.focus) el.focus();

          // Dispatch click events
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(clickEvent);
        }, 100);
      })();
    `);

    // Wait for click to process
    await this.sleep(150);
  }

  /**
   * Double-click an element
   */
  async doubleClick(
    element: FoundElement,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);

        if (!el) {
          throw new Error('Element not found: ' + selector);
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
          const dblClickEvent = new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(dblClickEvent);
        }, 100);
      })();
    `);

    await this.sleep(150);
  }

  /**
   * Right-click an element
   */
  async rightClick(
    element: FoundElement,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);

        if (!el) {
          throw new Error('Element not found: ' + selector);
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
          const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2
          });
          el.dispatchEvent(contextMenuEvent);
        }, 100);
      })();
    `);

    await this.sleep(150);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Clear an input and type new value
   */
  async clearAndType(
    element: FoundElement,
    value: string,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const value = ${JSON.stringify(value)};
        let el;

        try {
          el = document.querySelector(selector);
        } catch (e) {
          if (selector.startsWith('//') || selector.startsWith('/')) {
            const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            el = result.singleNodeValue;
          }
        }

        if (!el) {
          throw new Error('Element not found: ' + selector);
        }

        // Scroll into view
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Focus the element
        el.focus();

        // Clear existing value
        if (el.value !== undefined) {
          el.value = '';
        } else if (el.isContentEditable) {
          el.textContent = '';
        }

        // Dispatch input event for clearing
        el.dispatchEvent(new Event('input', { bubbles: true }));

        // Set new value
        if (el.value !== undefined) {
          el.value = value;
        } else if (el.isContentEditable) {
          el.textContent = value;
        }

        // Dispatch input and change events
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })();
    `);

    await this.sleep(100);
  }

  /**
   * Type text character by character (for apps that need it)
   */
  async typeSlowly(
    element: FoundElement,
    value: string,
    webContents: Electron.WebContents,
    delayMs = 50
  ): Promise<void> {
    const selector = element.selector;

    // Focus the element first
    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      })();
    `);

    // Type each character
    for (const char of value) {
      await webContents.executeJavaScript(`
        (function() {
          const selector = ${JSON.stringify(selector)};
          const char = ${JSON.stringify(char)};
          const el = document.querySelector(selector);

          if (el) {
            // Dispatch keydown
            el.dispatchEvent(new KeyboardEvent('keydown', {
              key: char,
              code: 'Key' + char.toUpperCase(),
              bubbles: true
            }));

            // Add character
            if (el.value !== undefined) {
              el.value += char;
            } else if (el.isContentEditable) {
              el.textContent += char;
            }

            // Dispatch input and keyup
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', {
              key: char,
              code: 'Key' + char.toUpperCase(),
              bubbles: true
            }));
          }
        })();
      `);

      await this.sleep(delayMs);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Press a key
   */
  async pressKey(
    key: string,
    webContents: Electron.WebContents
  ): Promise<void> {
    const keyCode = this.getKeyCode(key);

    await webContents.executeJavaScript(`
      (function() {
        const key = ${JSON.stringify(key)};
        const keyCode = ${keyCode};
        const activeElement = document.activeElement || document.body;

        // Dispatch keydown
        activeElement.dispatchEvent(new KeyboardEvent('keydown', {
          key: key,
          code: key,
          keyCode: keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true
        }));

        // Dispatch keypress for printable characters
        if (key.length === 1) {
          activeElement.dispatchEvent(new KeyboardEvent('keypress', {
            key: key,
            code: key,
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
          }));
        }

        // Dispatch keyup
        activeElement.dispatchEvent(new KeyboardEvent('keyup', {
          key: key,
          code: key,
          keyCode: keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true
        }));
      })();
    `);

    await this.sleep(50);
  }

  /**
   * Press key combination (e.g., Ctrl+A)
   */
  async pressKeyCombination(
    keys: string[],
    webContents: Electron.WebContents
  ): Promise<void> {
    const modifiers = {
      ctrl: keys.includes('Control') || keys.includes('Ctrl'),
      alt: keys.includes('Alt'),
      shift: keys.includes('Shift'),
      meta: keys.includes('Meta') || keys.includes('Command'),
    };

    const mainKey = keys.find(
      (k) => !['Control', 'Ctrl', 'Alt', 'Shift', 'Meta', 'Command'].includes(k)
    );

    if (!mainKey) return;

    await webContents.executeJavaScript(`
      (function() {
        const key = ${JSON.stringify(mainKey)};
        const modifiers = ${JSON.stringify(modifiers)};
        const activeElement = document.activeElement || document.body;

        activeElement.dispatchEvent(new KeyboardEvent('keydown', {
          key: key,
          code: 'Key' + key.toUpperCase(),
          ctrlKey: modifiers.ctrl,
          altKey: modifiers.alt,
          shiftKey: modifiers.shift,
          metaKey: modifiers.meta,
          bubbles: true,
          cancelable: true
        }));

        activeElement.dispatchEvent(new KeyboardEvent('keyup', {
          key: key,
          code: 'Key' + key.toUpperCase(),
          ctrlKey: modifiers.ctrl,
          altKey: modifiers.alt,
          shiftKey: modifiers.shift,
          metaKey: modifiers.meta,
          bubbles: true,
          cancelable: true
        }));
      })();
    `);

    await this.sleep(50);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Select an option from a dropdown
   */
  async selectOption(
    element: FoundElement,
    optionText: string,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const optionText = ${JSON.stringify(optionText)};
        const el = document.querySelector(selector);

        if (!el) {
          throw new Error('Element not found: ' + selector);
        }

        if (el.tagName === 'SELECT') {
          // Native select element
          const options = el.options;
          for (let i = 0; i < options.length; i++) {
            if (options[i].text === optionText || options[i].value === optionText) {
              el.selectedIndex = i;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }
        } else {
          // Custom dropdown - try to click the option
          const option = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li'))
            .find(opt => opt.textContent?.trim() === optionText);

          if (option) {
            option.click();
          }
        }
      })();
    `);

    await this.sleep(100);
  }

  /**
   * Select option by value
   */
  async selectByValue(
    element: FoundElement,
    value: string,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const value = ${JSON.stringify(value)};
        const el = document.querySelector(selector);

        if (!el || el.tagName !== 'SELECT') {
          throw new Error('Select element not found: ' + selector);
        }

        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })();
    `);

    await this.sleep(100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Scroll to element
   */
  async scrollToElement(
    element: FoundElement,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);

        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      })();
    `);

    await this.sleep(300);
  }

  /**
   * Scroll by pixels
   */
  async scrollBy(
    x: number,
    y: number,
    webContents: Electron.WebContents
  ): Promise<void> {
    await webContents.executeJavaScript(`
      window.scrollBy({ left: ${x}, top: ${y}, behavior: 'smooth' });
    `);

    await this.sleep(300);
  }

  /**
   * Scroll to position
   */
  async scrollTo(
    x: number,
    y: number,
    webContents: Electron.WebContents
  ): Promise<void> {
    await webContents.executeJavaScript(`
      window.scrollTo({ left: ${x}, top: ${y}, behavior: 'smooth' });
    `);

    await this.sleep(300);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOVER ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Hover over an element
   */
  async hover(
    element: FoundElement,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    await webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);

        if (!el) return;

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        el.dispatchEvent(new MouseEvent('mouseenter', {
          bubbles: true,
          clientX: centerX,
          clientY: centerY
        }));

        el.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          clientX: centerX,
          clientY: centerY
        }));
      })();
    `);

    await this.sleep(200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private getKeyCode(key: string): number {
    const keyCodes: Record<string, number> = {
      Enter: 13,
      Tab: 9,
      Escape: 27,
      Backspace: 8,
      Delete: 46,
      ArrowUp: 38,
      ArrowDown: 40,
      ArrowLeft: 37,
      ArrowRight: 39,
      Home: 36,
      End: 35,
      PageUp: 33,
      PageDown: 34,
      Space: 32,
      ' ': 32,
    };

    if (keyCodes[key]) {
      return keyCodes[key];
    }

    // For single characters, return char code
    if (key.length === 1) {
      return key.toUpperCase().charCodeAt(0);
    }

    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
