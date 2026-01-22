import { ToolExecutionResult } from '@/shared/types';
import {
  BaseActionService,
  ExecutionContext,
  NodeParams,
} from './BaseActionService';

export interface ClickParams extends NodeParams {}

export class ClickService extends BaseActionService {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public async execute(params: ClickParams): Promise<ToolExecutionResult> {
    try {
      await this.waitForNetworkIdle({
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      // MODE 1: Direct CDP node click
      if (params.nodeId !== undefined) {
        await this.performClick(params.nodeId);
        return {
          success: true,
        };
      }

      // MODE 2: Attribute-based element finding
      if (params.role || params.name || params.attributes) {
        return await this.findAndClickByAttributes(params);
      }

      return {
        success: false,
        error: `Could not find element with provided parameters: ${JSON.stringify(params)}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown click error',
      };
    }
  }

  private async findAndClickByAttributes(
    params: ClickParams
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

      const bestMatch = this.findBestMatchingNode(nodes, params);

      if (!bestMatch) {
        return { success: false, error: 'No matching node found for params' };
      }

      console.log('Matched node:', {
        nodeId: bestMatch.backendDOMNodeId,
        role: bestMatch.role?.value,
        name: bestMatch.name?.value,
        score: bestMatch.score,
      });

      await this.performClick(bestMatch.backendDOMNodeId);
      return { success: true };
    } catch (error) {
      console.error('[ClickHandler] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown click error',
      };
    }
  }

  private async performClick(nodeId: number): Promise<void> {
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

    await this.cdp.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const existing = document.getElementById('__browzer_click_indicator');
          if (existing) existing.remove();
          
          const indicator = document.createElement('div');
          indicator.id = '__browzer_click_indicator';
          indicator.style.cssText = \`
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            border: 3px solid #ff4444;
            border-radius: 50%;
            background: rgba(255, 68, 68, 0.5);
            pointer-events: none;
            z-index: 2000;
          \`;
          
          document.body.appendChild(indicator);
        })();
      `,
    });

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: centerX,
      y: centerY,
      button: 'none',
      clickCount: 0,
    });
    await this.sleep(2);

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });
    await this.sleep(2);

    await this.cdp.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: centerX,
      y: centerY,
      button: 'left',
      clickCount: 1,
    });

    await this.cdp.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const indicator = document.getElementById('__browzer_click_indicator');
          if (indicator) {
            setTimeout(() => indicator.remove(), 300);
          }
        })();
      `,
    });

    await this.sleep(1000);
  }
}
