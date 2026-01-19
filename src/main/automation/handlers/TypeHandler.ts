import { Debugger, WebContentsView } from 'electron';

import { HandlerContext } from './BaseHandler';

import { ToolExecutionResult, AutomationError } from '@/shared/types';

export interface TypeParams {
  nodeId?: number;
  role?: string;
  text?: string;
  attributes?: Record<string, string>;
  value: string;
  clearFirst?: boolean;
}

export class TypeHandler {
  private view: WebContentsView;
  private tabId: string;
  private cdp: Debugger;

  constructor(context: HandlerContext) {
    this.view = context.view;
    this.tabId = context.tabId;
    this.cdp = this.view.webContents.debugger;
  }

  public async execute(params: TypeParams): Promise<ToolExecutionResult> {
    try {
      const clearFirst = params.clearFirst !== false;

      if (params.nodeId !== undefined) {
        await this.typeIntoNode(params.nodeId, params.value, clearFirst);
        return {
          success: true,
          tabId: this.tabId,
        };
      }

      if (params.role || params.text || params.attributes) {
        const result = await this.findAndType(params, clearFirst);
        if (result.success) return result;
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `Could not find input element with provided parameters: ${JSON.stringify(params)}`,
      });
    } catch (error) {
      console.error('[TypeHandler] Error:', error);
      return this.createErrorResult({
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown type error',
      });
    }
  }

  private async findAndType(
    params: TypeParams,
    clearFirst: boolean
  ): Promise<ToolExecutionResult> {
    try {
      const { root } = await this.cdp.sendCommand('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });

      const selector = params.role
        ? this.buildSelectorFromRole(params.role)
        : 'input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]';

      const { nodeIds } = await this.cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      console.log(
        `[TypeHandler] Found ${nodeIds.length} candidate input elements for role: ${params.role || 'any'}`
      );

      let bestMatch: { nodeId: number; score: number } | null = null;

      for (const nodeId of nodeIds) {
        const score = await this.scoreElementMatch(nodeId, params);

        if (score > 0) {
          console.log(`[TypeHandler] Element ${nodeId} score: ${score}`);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { nodeId, score };
          }
        }
      }

      if (bestMatch) {
        console.log(
          `[TypeHandler] Typing into best match: nodeId=${bestMatch.nodeId}, score=${bestMatch.score}`
        );
        await this.typeIntoNode(bestMatch.nodeId, params.value, clearFirst);
        return {
          success: true,
          tabId: this.tabId,
        };
      }

      return this.createErrorResult({
        code: 'ELEMENT_NOT_FOUND',
        message: `No input element found matching: ${JSON.stringify(params)}`,
      });
    } catch (error) {
      return this.createErrorResult({
        code: 'TYPE_FAILED',
        message: `Failed to find and type into element: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async scoreElementMatch(
    nodeId: number,
    params: TypeParams
  ): Promise<number> {
    try {
      let score = 0;

      const isTypeable = await this.isElementTypeable(nodeId);
      if (!isTypeable) {
        return 0;
      }

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
              if (elementValue === value) {
                matchedAttributes++;
                score += 20;
              } else if (
                typeof elementValue === 'string' &&
                typeof value === 'string' &&
                (elementValue.includes(value) || value.includes(elementValue))
              ) {
                matchedAttributes++;
                score += 10;
              }
            }
          }

          if (matchedAttributes === 0 && totalAttributes > 0) {
            return 0;
          }
        }
      }

      if (params.role) {
        score += 5;
      }

      return score;
    } catch (error) {
      console.error('[TypeHandler] Error scoring element:', error);
      return 0;
    }
  }

  private async isElementTypeable(nodeId: number): Promise<boolean> {
    try {
      const { node } = await this.cdp.sendCommand('DOM.describeNode', {
        nodeId,
      });

      const attrs = node.attributes
        ? this.parseAttributes(node.attributes)
        : {};

      if (attrs['readonly'] !== undefined) {
        return false;
      }

      const nodeName = node.nodeName?.toLowerCase();
      if (nodeName === 'input') {
        const inputType = attrs['type']?.toLowerCase() || 'text';
        const nonTypeableInputs = [
          'submit',
          'button',
          'reset',
          'image',
          'file',
          'hidden',
          'checkbox',
          'radio',
        ];
        if (nonTypeableInputs.includes(inputType)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async typeIntoNode(
    nodeId: number,
    value: string,
    clearFirst: boolean
  ): Promise<void> {
    const coords = await this.focusElementWithCoords(nodeId);

    if (!coords) {
      throw new Error('Failed to focus element');
    }

    const { object } = await this.cdp.sendCommand('DOM.resolveNode', {
      backendNodeId: nodeId,
    });

    let isContentEditable = false;
    if (object?.objectId) {
      const editableCheck = await this.cdp.sendCommand(
        'Runtime.callFunctionOn',
        {
          objectId: object.objectId,
          functionDeclaration: `function() {
            return this.isContentEditable || this.contentEditable === 'true' || this.contentEditable === 'plaintext-only';
          }`,
          returnByValue: true,
        }
      );
      isContentEditable = editableCheck.result?.value === true;
      console.log(
        `[TypeHandler] Element isContentEditable: ${isContentEditable}`
      );
    }

    if (clearFirst) {
      if (isContentEditable) {
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 4 : 2;
        console.log(
          `[TypeHandler] Using ${isMac ? 'Cmd' : 'Ctrl'}+A to select all in contenteditable element`
        );
        await this.cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'a',
          code: 'KeyA',
          windowsVirtualKeyCode: 65,
          modifiers: modifier,
        });
        await this.sleep(10);
        await this.cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'a',
          code: 'KeyA',
          windowsVirtualKeyCode: 65,
          modifiers: modifier,
        });
        await this.sleep(50);
        console.log('[TypeHandler] Select-all completed for contenteditable');
      } else {
        console.log(
          `[TypeHandler] Triple-clicking at (${coords.x}, ${coords.y}) to select all`
        );

        await this.cdp.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: coords.x,
          y: coords.y,
          button: 'left',
          clickCount: 3,
        });
        await this.sleep(10);

        await this.cdp.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: coords.x,
          y: coords.y,
          button: 'left',
          clickCount: 3,
        });
        await this.sleep(50);
        console.log('[TypeHandler] Triple-click completed');
      }
    }

    for (const char of value) {
      await this.cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });
      await this.sleep(1);

      await this.cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
      await this.sleep(1);
    }

    await this.sleep(10);
  }

  private async focusElementWithCoords(
    nodeId: number
  ): Promise<{ x: number; y: number } | null> {
    try {
      const { object } = await this.cdp.sendCommand('DOM.resolveNode', {
        backendNodeId: nodeId,
      });
      if (!object || !object.objectId) {
        throw new Error('Element not found');
      }

      await this.cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `
          function() {
            const findScrollableParent = (el) => {
              let parent = el.parentElement;
              while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                const overflowY = style.overflowY;
                const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight;
                if (isScrollable) {
                  return parent;
                }
                parent = parent.parentElement;
              }
              return null;
            };

            const scrollableParent = findScrollableParent(this);

            if (scrollableParent) {
              const rect = this.getBoundingClientRect();
              const parentRect = scrollableParent.getBoundingClientRect();
              const elementCenterY = rect.top + rect.height / 2;
              const parentCenterY = parentRect.top + parentRect.height / 2;
              const scrollOffset = elementCenterY - parentCenterY;
              scrollableParent.scrollBy({ top: scrollOffset, behavior: 'instant' });
            } else {
              this.scrollIntoView({
                behavior: 'instant',
                block: 'center',
                inline: 'center'
              });
            }
          }
        `,
        returnByValue: false,
      });

      await this.sleep(150);

      const viewportCheck = await this.cdp.sendCommand(
        'Runtime.callFunctionOn',
        {
          objectId: object.objectId,
          functionDeclaration: `
          function() {
            const rect = this.getBoundingClientRect();
            const viewHeight = window.innerHeight;
            const viewWidth = window.innerWidth;
            return {
              inViewport: rect.top >= -5 && rect.bottom <= viewHeight + 5 && rect.left >= -5 && rect.right <= viewWidth + 5,
              rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
              viewport: { width: viewWidth, height: viewHeight }
            };
          }
        `,
          returnByValue: true,
        }
      );

      const viewportInfo = viewportCheck.result?.value;
      if (viewportInfo && !viewportInfo.inViewport) {
        console.log(
          `[TypeHandler] Element not fully in viewport after scroll:`,
          viewportInfo
        );
        await this.cdp.sendCommand('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: `
            function() {
              this.scrollIntoView({
                behavior: 'instant',
                block: 'center',
                inline: 'center'
              });
            }
          `,
          returnByValue: false,
        });
        await this.sleep(100);
      }

      const { model } = await this.cdp.sendCommand('DOM.getBoxModel', {
        objectId: object.objectId,
      });
      if (!model || !model.content || model.content.length < 8) {
        throw new Error('Element not visible or has no box model');
      }

      const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content;
      const centerX = (x1 + x2 + x3 + x4) / 4;
      const centerY = (y1 + y2 + y3 + y4) / 4;

      await this.cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: centerX,
        y: centerY,
        button: 'none',
        clickCount: 0,
      });
      await this.sleep(10);

      await this.cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1,
      });
      await this.sleep(10);

      await this.cdp.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1,
      });
      await this.sleep(10);

      return { x: centerX, y: centerY };
    } catch (error) {
      console.error('[TypeHandler] Error focusing element:', error);
      throw new Error('Failed to focus element');
    }
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
            let text = this.getAttribute('aria-label') || '';
            if (!text) text = this.getAttribute('placeholder') || '';
            if (!text) text = this.getAttribute('name') || '';
            if (!text) text = this.title || '';
            if (!text) text = this.getAttribute('aria-labelledby') || '';
            if (!text && this.labels && this.labels.length > 0) {
              text = this.labels[0].textContent || '';
            }
            if (!text) text = (this.innerText || '').trim();
            if (!text) text = (this.textContent || '').trim();
            return text.trim();
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
      textbox:
        'input[type="text"], input:not([type]), textarea, [role="textbox"]',
      searchbox: 'input[type="search"], [role="searchbox"]',
      combobox: 'select, input[list], [role="combobox"]',
      spinbutton: 'input[type="number"], [role="spinbutton"]',
      slider: 'input[type="range"], [role="slider"]',
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

  private createErrorResult(error: AutomationError): ToolExecutionResult {
    return {
      success: false,
      error,
      tabId: this.tabId,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
