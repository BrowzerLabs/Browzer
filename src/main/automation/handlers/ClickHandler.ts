import { Debugger, WebContentsView } from 'electron';

import { HandlerContext } from './BaseHandler';

import { ToolExecutionResult, AutomationError } from '@/shared/types';

export interface ClickParams {
  nodeId?: number;
  role?: string;
  text?: string;
  attributes?: Record<string, string>;
}

export class ClickHandler {
  private view: WebContentsView;
  private tabId: string;
  private cdp: Debugger;

  constructor(context: HandlerContext) {
    this.view = context.view;
    this.tabId = context.tabId;
    this.cdp = this.view.webContents.debugger;
  }

  public async execute(params: ClickParams): Promise<ToolExecutionResult> {
    try {
      // MODE 1: Direct CDP node click
      if (params.nodeId !== undefined) {
        await this.performClick(params.nodeId);
        return {
          success: true,
          tabId: this.tabId,
        };
      }

      // MODE 2: Attribute-based element finding
      if (params.role || params.text || params.attributes) {
        const result = await this.findAndClickByAttributes(params);
        if (result.success) return result;
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `Could not find element with provided parameters: ${JSON.stringify(params)}`,
      });
    } catch (error) {
      console.error('[ClickHandler] Error:', error);
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown click error',
      });
    }
  }

  private async findAndClickByAttributes(
    params: ClickParams
  ): Promise<ToolExecutionResult> {
    try {
      const { root } = await this.cdp.sendCommand('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });

      // Build selector based on role if provided, otherwise search all interactive elements
      const selector = params.role
        ? this.buildSelectorFromRole(params.role)
        : 'button, a, input, select, textarea, [role], [onclick], [tabindex]';

      const { nodeIds } = await this.cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      console.log(
        `[ClickHandler] Found ${nodeIds.length} candidate elements for role: ${params.role || 'any'}`
      );

      // Score and find best matching element
      let bestMatch: { nodeId: number; score: number } | null = null;

      for (const nodeId of nodeIds) {
        const score = await this.scoreElementMatch(nodeId, params);

        if (score > 0) {
          console.log(`[ClickHandler] Element ${nodeId} score: ${score}`);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { nodeId, score };
          }
        }
      }

      if (bestMatch) {
        console.log(
          `[ClickHandler] Clicking best match: nodeId=${bestMatch.nodeId}, score=${bestMatch.score}`
        );
        await this.performClick(bestMatch.nodeId);
        return {
          success: true,
          tabId: this.tabId,
        };
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `No element found matching: ${JSON.stringify(params)}`,
      });
    } catch (error) {
      return this.createErrorResult({
        code: 'CLICK_FAILED',
        message: `Failed to find and click element: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async scoreElementMatch(
    nodeId: number,
    params: ClickParams
  ): Promise<number> {
    try {
      let score = 0;

      const elementText = await this.getElementText(nodeId);

      if (params.text) {
        if (!elementText) {
          return 0;
        }

        const textMatch = this.textMatches(elementText, params.text);
        if (!textMatch) {
          return 0;
        }

        if (
          elementText.toLowerCase().trim() === params.text.toLowerCase().trim()
        ) {
          score += 100;
        } else {
          score += 50;
        }
      }

      if (params.attributes && Object.keys(params.attributes).length > 0) {
        const { node } = await this.cdp.sendCommand('DOM.describeNode', {
          nodeId,
        });

        if (node.attributes) {
          const elementAttrs = this.parseAttributes(node.attributes);

          let matchedAttributes = 0;
          const totalAttributes = Object.keys(params.attributes).length;

          for (const [key, value] of Object.entries(params.attributes)) {
            const elementValue = elementAttrs[key];

            if (elementValue !== undefined) {
              // Check for exact match or partial match
              if (elementValue === value) {
                matchedAttributes++;
                score += 20; // Exact attribute match
              } else if (
                typeof elementValue === 'string' &&
                typeof value === 'string' &&
                (elementValue.includes(value) || value.includes(elementValue))
              ) {
                matchedAttributes++;
                score += 10; // Partial attribute match
              }
            }
          }

          // Require at least some attribute matches if attributes are provided
          if (matchedAttributes === 0 && totalAttributes > 0) {
            return 0; // No attribute matches when attributes were specified
          }
        }
      }

      // Role matching (implicit through selector, but add bonus if explicitly checking)
      if (params.role) {
        score += 5;
      }

      return score;
    } catch (error) {
      console.error('[ClickHandler] Error scoring element:', error);
      return 0;
    }
  }

  private async performClick(nodeId: number): Promise<void> {
    const { object } = await this.cdp.sendCommand('DOM.resolveNode', {
      backendNodeId: nodeId,
    });
    if (!object || !object.objectId) {
      throw new Error('Element not found');
    }

    // Log element text for debugging
    try {
      const textResult = await this.cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `
          function() {
            let text = (this.innerText || '').trim();
            if (!text) text = (this.textContent || '').trim();
            if (!text) text = this.getAttribute('aria-label') || '';
            if (!text) text = this.title || '';
            if (!text) text = this.getAttribute('placeholder') || '';
            return text.substring(0, 100);
          }
        `,
        returnByValue: true,
      });
      const elementText = textResult.result?.value || '(no text)';
      console.log(
        `[ClickHandler] Clicking element (nodeId=${nodeId}): "${elementText}"`
      );
    } catch {
      console.log(
        `[ClickHandler] Clicking element (nodeId=${nodeId}): (could not get text)`
      );
    }

    await this.cdp.sendCommand('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `
          function() {
            this.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'center'
            });
          }
        `,
      returnByValue: false,
    });

    const { model } = await this.cdp.sendCommand('DOM.getBoxModel', {
      objectId: object.objectId,
    });
    if (!model || !model.content || model.content.length < 8) {
      throw new Error('Element not visible or has no box model');
    }

    const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content;
    const centerX = (x1 + x2 + x3 + x4) / 4;
    const centerY = (y1 + y2 + y3 + y4) / 4;

    await this.showClickIndicator(centerX, centerY);

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: centerX,
      y: centerY,
      button: 'none',
      clickCount: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await this.removeClickIndicator();
  }

  private async getElementText(nodeId: number): Promise<string | null> {
    try {
      const { object } = await this.cdp.sendCommand('DOM.resolveNode', {
        nodeId,
      });

      if (!object || !object.objectId) {
        return null;
      }

      const textResult = await this.cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `
          function() {
            let text = (this.innerText || '').trim();
            if (!text) text = (this.textContent || '').trim();
            if (!text) text = this.getAttribute('aria-label') || '';
            if (!text) text = this.title || '';
            if (!text) text = this.getAttribute('placeholder') || '';
            if (!text && this.value) text = this.value;
            return text;
          }
        `,
        returnByValue: true,
      });

      await this.cdp.sendCommand('Runtime.releaseObject', {
        objectId: object.objectId,
      });

      if (textResult.result && textResult.result.value) {
        return String(textResult.result.value).trim();
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private textMatches(elementText: string, searchText: string): boolean {
    const normalizedElement = elementText.toLowerCase().trim();
    const normalizedSearch = searchText.toLowerCase().trim();

    if (normalizedElement === normalizedSearch) {
      return true;
    }

    if (normalizedElement.includes(normalizedSearch)) {
      return true;
    }

    if (normalizedSearch.includes(normalizedElement)) {
      return true;
    }

    const elementWords = normalizedElement.split(/\s+/);
    const searchWords = normalizedSearch.split(/\s+/);

    if (searchWords.every((word) => elementWords.includes(word))) {
      return true;
    }

    return false;
  }

  private buildSelectorFromRole(role: string): string {
    const roleMap: Record<string, string> = {
      button: 'button, [role="button"]',
      link: 'a, [role="link"]',
      textbox:
        'input[type="text"], input:not([type]), textarea, [role="textbox"]',
      searchbox: 'input[type="search"], [role="searchbox"]',
      combobox: 'select, [role="combobox"]',
      checkbox: 'input[type="checkbox"], [role="checkbox"]',
      radio: 'input[type="radio"], [role="radio"]',
      tab: '[role="tab"]',
      menuitem: '[role="menuitem"]',
      menu: '[role="menu"]',
      menubar: '[role="menubar"]',
      heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
      listbox: '[role="listbox"]',
      option: 'option, [role="option"]',
      navigation: 'nav, [role="navigation"]',
      banner: '[role="banner"]',
      complementary: '[role="complementary"]',
      contentinfo: '[role="contentinfo"]',
      main: 'main, [role="main"]',
      form: 'form, [role="form"]',
      search: '[role="search"]',
      region: '[role="region"]',
      article: 'article, [role="article"]',
      section: 'section, [role="section"]',
      img: 'img, [role="img"]',
      image: 'img, [role="image"]',
      dialog: '[role="dialog"]',
      alertdialog: '[role="alertdialog"]',
      alert: '[role="alert"]',
      status: '[role="status"]',
      progressbar: '[role="progressbar"]',
      slider: '[role="slider"]',
      spinbutton: '[role="spinbutton"]',
      switch: '[role="switch"]',
      toolbar: '[role="toolbar"]',
      tooltip: '[role="tooltip"]',
      tree: '[role="tree"]',
      treeitem: '[role="treeitem"]',
      tablist: '[role="tablist"]',
      tabpanel: '[role="tabpanel"]',
      separator: '[role="separator"]',
      group: '[role="group"]',
      list: 'ul, ol, [role="list"]',
      listitem: 'li, [role="listitem"]',
      row: '[role="row"]',
      gridcell: '[role="gridcell"]',
      cell: 'td, [role="cell"]',
      columnheader: 'th, [role="columnheader"]',
      rowheader: '[role="rowheader"]',
      table: 'table, [role="table"]',
      grid: '[role="grid"]',
    };

    return roleMap[role.toLowerCase()] || `[role="${role}"]`;
  }

  private parseAttributes(attributes: string[]): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < attributes.length; i += 2) {
      const key = attributes[i];
      const value = attributes[i + 1];
      if (key && value !== undefined) {
        attrs[key] = value;
      }
    }
    return attrs;
  }

  private async scrollIntoView(objectId: string): Promise<void> {
    try {
      await this.cdp.sendCommand('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `
          function() {
            this.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'center'
            });
          }
        `,
        returnByValue: false,
      });
    } catch (error) {
      console.warn('[ClickHandler] Failed to scroll element into view:', error);
    }
  }

  private async showClickIndicator(x: number, y: number): Promise<void> {
    try {
      await this.cdp.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const existing = document.getElementById('__browzer_click_indicator');
            if (existing) existing.remove();
            
            const indicator = document.createElement('div');
            indicator.id = '__browzer_click_indicator';
            indicator.style.cssText = \`
              position: fixed;
              left: ${x}px;
              top: ${y}px;
              width: 30px;
              height: 30px;
              border: 3px solid #ff4444;
              border-radius: 50%;
              background: rgba(255, 68, 68, 0.2);
              pointer-events: none;
              z-index: 2000;
            \`;
            
            document.body.appendChild(indicator);
          })();
        `,
      });
    } catch (error) {
      console.warn('[ClickHandler] Failed to show click indicator:', error);
    }
  }

  private async removeClickIndicator(): Promise<void> {
    try {
      await this.cdp.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const indicator = document.getElementById('__browzer_click_indicator');
            if (indicator) {
              setTimeout(() => indicator.remove(), 200);
            }
          })();
        `,
      });
    } catch (error) {
      console.warn('[ClickHandler] Failed to remove click indicator:', error);
    }
  }

  private createErrorResult(error: AutomationError): ToolExecutionResult {
    return {
      success: false,
      error,
      tabId: this.tabId,
    };
  }
}
