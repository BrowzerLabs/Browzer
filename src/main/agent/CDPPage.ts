import { BrowserView, WebContentsView } from 'electron';
import { PageState, wait } from '../../shared';
import { CDPPage as CDPPageInterface } from '../../shared';

export class CDPPage implements CDPPageInterface {
  private debugger: any;
  private view: BrowserView | WebContentsView;

  constructor(view: BrowserView | WebContentsView) {
    this.view = view;
    this.debugger = view.webContents.debugger;
  }

  async attach(): Promise<void> {
    try {
      await this.debugger.attach('1.3');
      await this.enableCDPDomains();
      console.log('[CDPPage] Attached to debugger');
    } catch (error) {
      throw new Error('Failed to attach debugger');
    }
  }

  private async enableCDPDomains(): Promise<void> {
    await this.debugger.sendCommand('DOM.enable');
    await this.debugger.sendCommand('Page.enable');
    await this.debugger.sendCommand('Runtime.enable');
    await this.debugger.sendCommand('Network.enable');
  }

  async detach(): Promise<void> {
    if (this.debugger.isAttached()) {
      this.debugger.detach();
      console.log('[CDPPage] Detached from debugger');
    }
  }

  async goto(url: string): Promise<void> {
    try {
      // Normalize URL
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      await this.debugger.sendCommand('Page.navigate', { url: normalizedUrl });

      return await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.evaluate('document.readyState').then((state: string) => {
            if (state === 'complete' || state === 'interactive') {
              resolve();
            } else {
              reject(new Error(`Navigation timeout after ${timeoutId}ms`));
            }
          }).catch(() => reject(new Error('Navigation timeout and readyState check failed')));
        }, 30000);

        this.debugger.on('message', (event: any, method: string, params: any) => {
          if (method === 'Page.loadEventFired' || method === 'Page.frameNavigated') {
            clearTimeout(timeoutId);
            resolve();
          }
        });
      });
    } catch (error) {
      throw new Error(`Navigation to ${url} failed: ${error.message}`);
    }
  }

  async click(selector: string, options: any = {}): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      const { model } = await this.debugger.sendCommand('DOM.getBoxModel', { nodeId });
      const x = model.content[0] + model.width / 2;
      const y = model.content[1] + model.height / 2;
      await this.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: options.button || 'left',
        clickCount: options.clickCount || 1,
      });
      await this.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: options.button || 'left',
        clickCount: options.clickCount || 1,
      });
    } catch (error) {
      throw new Error(`Click failed for selector ${selector}: ${error.message}`);
    }
  }

  async fill(selector: string, value: string): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      await this.debugger.sendCommand('DOM.focus', { nodeId });
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('${selector.replace(/'/g, "\\'")}').value = ''`,
      });
      for (const char of value) {
        await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: char });
      }
    } catch (error) {
      throw new Error(`Fill failed for selector ${selector}: ${error.message}`);
    }
  }

  async type(selector: string, text: string, options: any = {}): Promise<void> {
    try {
      await this.fill(selector, text);
      if (options.pressEnter) {
        await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
        await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter' });
      }
    } catch (error) {
      throw new Error(`Type failed for selector ${selector}: ${error.message}`);
    }
  }

  async waitForSelector(selector: string, options: any = {}): Promise<any> {
    try {
      const timeout = options.timeout || 5000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const { root } = await this.debugger.sendCommand('DOM.getDocument');
        const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
        if (nodeId) return { nodeId };
        await wait(100);
      }
      throw new Error(`Timeout waiting for selector: ${selector}`);
    } catch (error) {
      throw new Error(`Wait for selector ${selector} failed: ${error.message}`);
    }
  }

  async waitForTimeout(timeout: number): Promise<void> {
    await wait(timeout);
  }

  async evaluate(script: string | Function, ...args: any[]): Promise<any> {
    try {
      const expression = typeof script === 'function' ? `(${script.toString()})(${args.map((arg: any) => JSON.stringify(arg)).join(',')})` : script;
      const { result } = await this.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true });
      return result.value;
    } catch (error) {
      throw new Error(`Evaluate failed: ${error.message}`);
    }
  }

  locator(selector: string): any {
    return {
      selector,
      click: (options?: any) => this.click(selector, options),
      fill: (value: string) => this.fill(selector, value),
      type: (text: string, options?: any) => this.type(selector, text, options),
      waitFor: (options?: any) => this.waitForSelector(selector, options),
      evaluate: (script: string | Function, ...args: any[]) =>
        this.evaluate(`(element => ${typeof script === 'function' ? script.toString() : script})(document.querySelector('${selector.replace(/'/g, "\\'")}'))`, ...args),
    };
  }

  async selectOption(selector: string, values: string | string[]): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Select element not found: ${selector}`);
      const valuesArray = Array.isArray(values) ? values : [values];
      const script = `
        (select, values) => {
          select.value = '';
          for (const value of values) {
            const option = Array.from(select.options).find(opt => opt.value === value || opt.text === value);
            if (option) option.selected = true;
          }
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `;
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `${script}(document.querySelector('${selector.replace(/'/g, "\\'")}'), ${JSON.stringify(valuesArray)})`,
      });
    } catch (error) {
      throw new Error(`Select option failed for selector ${selector}: ${error.message}`);
    }
  }

  async screenshot(options: any = {}): Promise<Buffer> {
    try {
      const { data } = await this.debugger.sendCommand('Page.captureScreenshot', {
        format: options.format || 'png',
        clip: options.clip ? {
          x: options.clip.x,
          y: options.clip.y,
          width: options.clip.width,
          height: options.clip.height,
        } : undefined,
      });
      return Buffer.from(data, 'base64');
    } catch (error) {
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }

  async content(): Promise<string> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { outerHTML } = await this.debugger.sendCommand('DOM.getOuterHTML', { nodeId: root.nodeId });
      return outerHTML;
    } catch (error) {
      throw new Error(`Failed to get page content: ${error.message}`);
    }
  }

  async getDebugInfo(): Promise<any> {
    try {
      const url = await this.url();
      const title = await this.title();
      const interactiveElements = await this.evaluate(`
        Array.from(document.querySelectorAll('input, button, a, select, [role="button"]')).slice(0, 20).map(el => ({
          tagName: el.tagName.toLowerCase(),
          attributes: Object.fromEntries([...el.attributes].map(attr => [attr.name, attr.value])),
          textContent: el.textContent?.trim().slice(0, 100),
          isVisible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
        }))
      `);
      return { url, title, interactiveElements, timestamp: Date.now() };
    } catch (error) {
      throw new Error(`Failed to get debug info: ${error.message}`);
    }
  }

  async title(): Promise<string> {
    try {
      const { result } = await this.debugger.sendCommand('Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true,
      });
      return result.value || '';
    } catch (error) {
      throw new Error(`Failed to get page title: ${error.message}`);
    }
  }

  async url(): Promise<string> {
    try {
      const { entries } = await this.debugger.sendCommand('Page.getNavigationHistory');
      return entries[entries.length - 1]?.url || '';
    } catch (error) {
      throw new Error(`Failed to get page URL: ${error.message}`);
    }
  }

  async scroll(selector?: string): Promise<void> {
    try {
      const script = selector
        ? `document.querySelector('${selector.replace(/'/g, "\\'")}').scrollIntoView({ behavior: 'smooth', block: 'center' })`
        : `window.scrollTo({ top: window.scrollY + 500, behavior: 'smooth' })`;
      await this.debugger.sendCommand('Runtime.evaluate', { expression: script });
    } catch (error) {
      throw new Error(`Scroll failed${selector ? ` for selector ${selector}` : ''}: ${error.message}`);
    }
  }

  async clear(selector: string): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('${selector.replace(/'/g, "\\'")}').value = ''`,
      });
    } catch (error) {
      throw new Error(`Clear failed for selector ${selector}: ${error.message}`);
    }
  }

  async focus(selector: string): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      await this.debugger.sendCommand('DOM.focus', { nodeId });
    } catch (error) {
      throw new Error(`Focus failed for selector ${selector}: ${error.message}`);
    }
  }

  async hover(selector: string): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      const { model } = await this.debugger.sendCommand('DOM.getBoxModel', { nodeId });
      const x = model.content[0] + model.width / 2;
      const y = model.content[1] + model.height / 2;
      await this.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
      });
    } catch (error) {
      throw new Error(`Hover failed for selector ${selector}: ${error.message}`);
    }
  }

  async check(selector: string): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('${selector.replace(/'/g, "\\'")}').checked = true`,
      });
    } catch (error) {
      throw new Error(`Check failed for selector ${selector}: ${error.message}`);
    }
  }

  async uncheck(selector: string): Promise<void> {
    try {
      const { root } = await this.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('${selector.replace(/'/g, "\\'")}').checked = false`,
      });
    } catch (error) {
      throw new Error(`Uncheck failed for selector ${selector}: ${error.message}`);
    }
  }

  async doubleClick(selector: string, options: any = {}): Promise<void> {
    try {
      await this.click(selector, { ...options, clickCount: 2 });
    } catch (error) {
      throw new Error(`Double click failed for selector ${selector}: ${error.message}`);
    }
  }

  async rightClick(selector: string, options: any = {}): Promise<void> {
    try {
      await this.click(selector, { ...options, button: 'right' });
    } catch (error) {
      throw new Error(`Right click failed for selector ${selector}: ${error.message}`);
    }
  }

  async waitForDynamicContent(options: any = {}): Promise<void> {
    try {
      const timeout = options.timeout || 2000;
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, timeout);
        this.debugger.on('message', (event: any, method: string) => {
          if (method === 'DOM.childNodeCountUpdated' || method === 'Network.loadingFinished') {
            clearTimeout(timeoutId);
            resolve();
          }
        });
      });
    } catch (error) {
      throw new Error(`Wait for dynamic content failed: ${error.message}`);
    }
  }

  async press_enter(): Promise<void> {
    try {
      // Ensure we're focused on the current element before pressing enter
      console.log('[CDPPage] Pressing enter');
      await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13 });
      await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', windowsVirtualKeyCode: 13, text: '\r' });
      await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13 });
      await wait(500);
      console.log('[CDPPage] Pressed enter');
    } catch (error) {
      throw new Error(`Enter key press failed: ${error.message}`);
    }
  }

  keyboard = {
    press: async (key: string): Promise<void> => {
      try {
        await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key });
        await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key });
      } catch (error) {
        throw new Error(`Keyboard press failed for key ${key}: ${error.message}`);
      }
    },
    type: async (text: string): Promise<void> => {
      try {
        for (const char of text) {
          await this.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: char });
        }
      } catch (error) {
        throw new Error(`Keyboard type failed: ${error.message}`);
      }
    },
  };

  mouse = {
    click: async (x: number, y: number, options: any = {}): Promise<void> => {
      try {
        await this.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y,
          button: options.button || 'left',
          clickCount: options.clickCount || 1,
        });
        await this.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y,
          button: options.button || 'left',
          clickCount: options.clickCount || 1,
        });
      } catch (error) {
        throw new Error(`Mouse click at (${x}, ${y}) failed: ${error.message}`);
      }
    },
  };
}