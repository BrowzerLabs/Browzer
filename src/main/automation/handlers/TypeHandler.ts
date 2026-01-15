import { Debugger, WebContentsView } from 'electron';
import { ToolExecutionResult, AutomationError } from '@/shared/types';
import { HandlerContext } from './BaseHandler';

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

  public async execute(
    params: TypeParams
  ): Promise<ToolExecutionResult> {
    try {
      const clearFirst = params.clearFirst !== false; // Default to true

      // MODE 1: Direct CDP node typing
      if (params.nodeId !== undefined) {
        await this.typeIntoNode(params.nodeId, params.value, clearFirst);
        return {
          success: true,
          tabId: this.tabId,
        };
      }

      // MODE 2: Attribute-based element finding
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

      // Build selector for input elements based on role
      const selector = params.role
        ? this.buildSelectorFromRole(params.role)
        : 'input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]';

      const { nodeIds } = await this.cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      console.log(`[TypeHandler] Found ${nodeIds.length} candidate input elements for role: ${params.role || 'any'}`);

      // Score and find best matching element
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
        console.log(`[TypeHandler] Typing into best match: nodeId=${bestMatch.nodeId}, score=${bestMatch.score}`);
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

      // Check if element is actually typeable
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
        
        if (elementText.toLowerCase().trim() === params.text.toLowerCase().trim()) {
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
          let totalAttributes = Object.keys(params.attributes).length;

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

      const attrs = node.attributes ? this.parseAttributes(node.attributes) : {};
      
      // Check if element is disabled or readonly
      if (attrs['readonly'] !== undefined) {
        return false;
      }

      // Check if it's a valid input type
      const nodeName = node.nodeName?.toLowerCase();
      if (nodeName === 'input') {
        const inputType = attrs['type']?.toLowerCase() || 'text';
        const nonTypeableInputs = ['submit', 'button', 'reset', 'image', 'file', 'hidden', 'checkbox', 'radio'];
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
    // Focus the element first
    await this.focusElement(nodeId);

    // Clear existing content if requested
    if (clearFirst) {
      await this.clearElement(nodeId);
    }

    // Type the value character by character for more realistic typing
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

    // Small delay after typing
    await this.sleep(1);
  }

  private async focusElement(nodeId: number): Promise<void> {
    try {
      const { model } = await this.cdp.sendCommand('DOM.getBoxModel', { nodeId });

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
    } catch (error) {
      console.error('[TypeHandler] Error focusing element:', error);
      throw new Error('Failed to focus element');
    }
  }

  private async clearElement(nodeId: number): Promise<void> {
    try {
      const { object } = await this.cdp.sendCommand('DOM.resolveNode', { nodeId });

      if (!object || !object.objectId) {
        throw new Error('Could not resolve element to clear');
      }

      // Clear using JavaScript for reliability
      await this.cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `
          function() {
            if (this.value !== undefined) {
              this.value = '';
            }
            if (this.textContent !== undefined && this.getAttribute('contenteditable')) {
              this.textContent = '';
            }
            // Trigger input event to notify frameworks (React, Vue, etc.)
            this.dispatchEvent(new Event('input', { bubbles: true }));
            this.dispatchEvent(new Event('change', { bubbles: true }));
          }
        `,
        returnByValue: false,
      });

      await this.cdp.sendCommand('Runtime.releaseObject', {
        objectId: object.objectId,
      });
    } catch (error) {
      console.error('[TypeHandler] Error clearing element:', error);
      // Don't throw - clearing is optional
    }
  }

  private async getElementText(nodeId: number): Promise<string | null> {
    try {
      const { object } = await this.cdp.sendCommand('DOM.resolveNode', { nodeId });

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
      textbox: 'input[type="text"], input:not([type]), textarea, [role="textbox"]',
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
