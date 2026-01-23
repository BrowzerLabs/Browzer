import {
  BaseActionService,
  ExecutionContext,
  NodeParams,
} from './BaseActionService';

import { ToolExecutionResult } from '@/shared/types';

export interface TypeParams extends NodeParams {
  value: string;
  clearFirst?: boolean;
}

export class TypeService extends BaseActionService {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public async execute(params: TypeParams): Promise<ToolExecutionResult> {
    try {
      await this.waitForNetworkIdle({
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      const clearFirst = params.clearFirst !== false;

      // MODE 1: Direct CDP node typing
      if (params.nodeId !== undefined) {
        await this.performType(params.nodeId, params.value, clearFirst);
        return {
          success: true,
        };
      }

      // MODE 2: Attribute-based element finding
      if (params.role || params.name || params.attributes) {
        return await this.findAndTypeByAttributes(params, clearFirst);
      }

      for (const char of params.value) {
        await this.cdp.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char,
        });

        await this.cdp.sendCommand('Input.dispatchKeyEvent', {
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
    params: TypeParams,
    clearFirst: boolean
  ): Promise<ToolExecutionResult> {
    try {
      const { nodes } = await this.cdp.sendCommand(
        'Accessibility.getFullAXTree',
        {
          depth: -1,
        }
      );

      if (!nodes || nodes.length === 0) {
        return { success: false, error: 'No accessibility nodes found' };
      }

      const bestMatch = await this.findBestMatchingNode(nodes, params);

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
    nodeId: number,
    value: string,
    clearFirst: boolean
  ): Promise<void> {
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
    await this.sleep(1);

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await this.sleep(1);

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await this.sleep(1);

    if (clearFirst) {
      await this.cdp.sendCommand('Runtime.callFunctionOn', {
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
      await this.cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });

      await this.cdp.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
    }
  }
}
