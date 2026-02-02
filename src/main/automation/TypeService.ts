import { Debugger, WebContentsView } from 'electron';

import log from 'electron-log';

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
  constructor(protected context: ExecutionContext) {
    super(context);
  }

  public async execute(params: TypeParams): Promise<ToolExecutionResult> {
    try {
      const cdp = this.getCDP(params.tabId);
      const view = this.getView(params.tabId);
      if (!cdp || !view)
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
        let valueToType = params.value;
        if (params.value === '*******') {
          const elementInfo = await this.getElementInfo(cdp, params.nodeId);
          const fieldType = this.detectFieldType(elementInfo);
          const credentialValue = await this.resolveCredentialValue(
            fieldType,
            view.webContents.getURL()
          );

          if (credentialValue) {
            valueToType = credentialValue;
          } else {
            return {
              success: false,
              error: 'No saved credentials found for this domain',
            };
          }
        }

        await this.performType(cdp, params.nodeId, valueToType, clearFirst);
        return {
          success: true,
        };
      }

      // MODE 2: Attribute-based element finding
      if (params.role || params.name || params.attributes) {
        return await this.findAndTypeByAttributes(
          cdp,
          view,
          params,
          clearFirst
        );
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
      log.error('Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown type error',
      };
    }
  }

  private async findAndTypeByAttributes(
    cdp: Debugger,
    view: WebContentsView,
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

      let valueToType = params.value;
      if (params.value === '*******') {
        const elementInfo = await this.getElementInfo(
          cdp,
          bestMatch.backendDOMNodeId
        );
        const fieldType = this.detectFieldType(elementInfo);
        const credentialValue = await this.resolveCredentialValue(
          fieldType,
          view.webContents.getURL()
        );

        if (credentialValue) {
          valueToType = credentialValue;
        } else {
          return {
            success: false,
            error: 'No saved credentials found for this domain',
          };
        }
      }

      await this.performType(
        cdp,
        bestMatch.backendDOMNodeId,
        valueToType,
        clearFirst
      );
      return { success: true };
    } catch (error) {
      log.error('Error:', error);
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

  private async getElementInfo(
    cdp: Debugger,
    nodeId: number
  ): Promise<{
    attributes: Record<string, string>;
    axName: string;
  }> {
    try {
      const { object } = await cdp.sendCommand('DOM.resolveNode', {
        backendNodeId: nodeId,
      });

      if (!object || !object.objectId) {
        return { attributes: {}, axName: '' };
      }

      const attributesResult = await cdp.sendCommand('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          const attrs = {};
          if (this.attributes) {
            for (let i = 0; i < this.attributes.length; i++) {
              const attr = this.attributes[i];
              attrs[attr.name] = attr.value;
            }
          }
          return attrs;
        }`,
        returnByValue: true,
      });

      const attributes = attributesResult.result?.value || {};

      const { nodes } = await cdp.sendCommand(
        'Accessibility.getPartialAXTree',
        {
          backendNodeId: nodeId,
          fetchRelatives: false,
        }
      );

      let axName = '';
      if (nodes) {
        const axNode = nodes.find((n: any) => n.backendDOMNodeId === nodeId);
        if (axNode) {
          axName = axNode.name?.value || '';
        }
      }

      return { attributes, axName };
    } catch (error) {
      log.error('[TypeService] Error getting element info:', error);
      return { attributes: {}, axName: '' };
    }
  }

  private detectFieldType(elementInfo: {
    attributes: Record<string, string>;
    axName: string;
  }): 'username' | 'password' | 'unknown' {
    const { attributes, axName } = elementInfo;

    const attrType = attributes.type?.toLowerCase() || '';
    const attrName = attributes.name?.toLowerCase() || '';
    const attrId = attributes.id?.toLowerCase() || '';
    const attrAutocomplete = attributes.autocomplete?.toLowerCase() || '';
    const attrPlaceholder = attributes.placeholder?.toLowerCase() || '';
    const axNameLower = axName.toLowerCase();

    if (
      attrType === 'password' ||
      attrAutocomplete === 'current-password' ||
      attrAutocomplete === 'new-password' ||
      attrName.includes('password') ||
      attrName.includes('passwd') ||
      attrName.includes('pwd') ||
      attrId.includes('password') ||
      attrId.includes('passwd') ||
      attrId.includes('pwd') ||
      attrPlaceholder.includes('password') ||
      axNameLower.includes('password') ||
      axNameLower.includes('passwd')
    ) {
      return 'password';
    }

    if (
      attrType === 'email' ||
      attrAutocomplete === 'username' ||
      attrAutocomplete === 'email' ||
      attrName.includes('user') ||
      attrName.includes('email') ||
      attrName.includes('login') ||
      attrId.includes('user') ||
      attrId.includes('email') ||
      attrId.includes('login') ||
      attrPlaceholder.includes('user') ||
      attrPlaceholder.includes('email') ||
      attrPlaceholder.includes('login') ||
      axNameLower.includes('user') ||
      axNameLower.includes('email') ||
      axNameLower.includes('login')
    ) {
      return 'username';
    }

    return 'unknown';
  }

  private async resolveCredentialValue(
    fieldType: 'username' | 'password' | 'unknown',
    url: string
  ): Promise<string | null> {
    try {
      const suggestions =
        this.context.passwordService.getSuggestionsForUrl(url);

      if (!suggestions || suggestions.length === 0) {
        log.log('[TypeService] No credentials found for URL:', url);
        return null;
      }

      const credential = suggestions[0].credential;
      if (fieldType === 'password') {
        this.context.passwordService.markCredentialUsed(credential.id);
        return credential.password;
      } else if (fieldType === 'username') {
        this.context.passwordService.markCredentialUsed(credential.id);
        return credential.username;
      }

      return null;
    } catch (error) {
      log.error('[TypeService] Error resolving credential:', error);
      return null;
    }
  }
}
