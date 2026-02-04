import { Debugger } from 'electron';

import { TabService } from '../browser';

import { BaseActionService, NodeParams } from './BaseActionService';

import { ToolExecutionResult } from '@/shared/types';

export interface TypeParams extends NodeParams {
  value: string;
  clearFirst?: boolean;
}

export class TypeService extends BaseActionService {
  constructor(tabService: TabService) {
    super(tabService);
  }

  public async execute(params: TypeParams): Promise<ToolExecutionResult> {
    try {
      const cdp = this.getCDP(params.tabId);
      if (!cdp)
        return {
          success: false,
          error: 'Tab not found, or debugger not attached',
        };
      await this.waitForNetworkIdle(cdp, {
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      const clearFirst = params.clearFirst !== false;

      // MODE 1: Direct CDP node typing
      if (params.nodeId !== undefined) {
        await this.performType(cdp, params.nodeId, params.value, clearFirst);
        return {
          success: true,
        };
      }

      // MODE 2: Attribute-based element finding
      if (params.role || params.name || params.attributes) {
        return await this.findAndTypeByAttributes(cdp, params, clearFirst);
      }

      const focusCheck = await cdp.sendCommand('Runtime.evaluate', {
        expression: 'document.activeElement?.tagName',
        returnByValue: true,
      });

      if (!focusCheck.result?.value || focusCheck.result.value === 'BODY') {
        return {
          success: false,
          error: `No element focussed for typing`,
        };
      }

      for (const char of params.value) {
        await cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char,
        });

        await cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          text: char,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown type error',
      };
    }
  }

  private async findAndTypeByAttributes(
    cdp: Debugger,
    params: TypeParams,
    clearFirst: boolean
  ): Promise<ToolExecutionResult> {
    try {
      const { nodes } = await cdp.sendCommand('Accessibility.getFullAXTree', {
        depth: -1,
      });

      if (!nodes || nodes.length === 0) {
        return { success: false, error: 'No accessibility nodes found' };
      }

      const bestMatch = await this.findBestMatchingNode(cdp, nodes, params);

      if (!bestMatch) {
        return {
          success: false,
          error: `No matching input node found for params`,
        };
      }

      console.log('Found matching input node:', {
        nodeId: bestMatch.backendDOMNodeId,
        role: bestMatch.role?.value,
        name: bestMatch.name?.value,
        score: bestMatch.score,
      });

      await this.performType(
        cdp,
        bestMatch.backendDOMNodeId,
        params.value,
        clearFirst
      );
      return { success: true };
    } catch (error) {
      console.error('Error:', error);
      return {
        success: false,
        error: `Failed to find and type into element: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async performType(
    cdp: Debugger,
    nodeId: number,
    value: string,
    clearFirst: boolean
  ): Promise<void> {
    const { object } = await cdp.sendCommand('DOM.resolveNode', {
      backendNodeId: nodeId,
    });

    if (!object || !object.objectId) {
      throw new Error('Element not found');
    }

    await cdp.sendCommand('Runtime.callFunctionOn', {
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

    await this.sleep(500);

    const { model } = await cdp.sendCommand('DOM.getBoxModel', {
      objectId: object.objectId,
    });

    if (!model || !model.content || model.content.length < 8) {
      throw new Error('Element not visible or has no box model');
    }

    const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content;
    const centerX = (x1 + x2 + x3 + x4) / 4;
    const centerY = (y1 + y2 + y3 + y4) / 4;

    await cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: centerX,
      y: centerY,
      button: 'none',
      clickCount: 0,
    });
    await this.sleep(1);

    await cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await this.sleep(1);

    await cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await this.sleep(1);

    if (clearFirst) {
      await cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `
          function() {
            if (this.value !== undefined) {
              this.value = '';
            }
            if (this.textContent !== undefined && (this.isContentEditable || this.getAttribute('contenteditable') !== null)) {
              this.textContent = '';
            }
            this.dispatchEvent(new Event('input', { bubbles: true }));
            this.dispatchEvent(new Event('change', { bubbles: true }));
          }
        `,
        returnByValue: false,
      });
      await this.sleep(5);
    }

    for (const char of value) {
      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });

      await cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
    }
  }
}
