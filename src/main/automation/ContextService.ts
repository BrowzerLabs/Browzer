import { WebContentsView } from 'electron';

import { TabService } from '../browser';

import { BaseActionService } from './BaseActionService';

import { ToolExecutionResult } from '@/shared/types';

export class ContextService extends BaseActionService {
  constructor(tabService: TabService) {
    super(tabService);
  }

  public async execute(params: {
    tabId: string;
  }): Promise<ToolExecutionResult> {
    try {
      const cdp = this.getCDP(params.tabId);
      const view = this.getView(params.tabId);
      if (!cdp || !view) {
        return {
          success: false,
          error: 'Tab not found, or debugger not attached',
        };
      }
      await this.waitForNetworkIdle(cdp, {
        timeout: 3000,
        idleTime: 500,
        maxInflightRequests: 0,
      });

      await cdp.sendCommand('Accessibility.enable');

      const { nodes } = await cdp.sendCommand('Accessibility.getFullAXTree', {
        depth: -1,
      });

      await cdp.sendCommand('Accessibility.disable');

      if (!nodes || nodes.length === 0) {
        return { success: false, error: 'No accessibility nodes found' };
      }

      const treeString = this.formatAccessibilityTree(
        params.tabId,
        view,
        nodes
      );
      return { success: true, value: treeString };
    } catch (error) {
      console.error('[ContextService] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private formatAccessibilityTree(
    tabId: string,
    view: WebContentsView,
    nodes: any[]
  ): string {
    const lines: string[] = [];
    const url = view.webContents.getURL();
    const title = view.webContents.getTitle();

    lines.push(`Tab ID: ${tabId}`);
    lines.push(`URL: ${url}`);
    lines.push(`Title: ${title}`);
    lines.push('');

    const nodeMap = new Map<string, any>();
    for (const node of nodes) {
      if (node.nodeId) {
        nodeMap.set(node.nodeId, node);
      }
    }

    const rootNode = nodes.find((n) => !n.parentId) || nodes[0];
    if (rootNode) {
      this.formatNode(rootNode, nodeMap, lines, 0, true);
    }

    const filteredLines = lines.filter((line) => line.trim() !== '');
    lines.length = 0;
    lines.push(...filteredLines.slice(2));

    return lines.join('\n');
  }

  private formatNode(
    node: any,
    nodeMap: Map<string, any>,
    lines: string[],
    depth: number,
    isRoot = false
  ): void {
    const role = node.role?.value || '';
    const name = String(node.name?.value || '');
    const value = String(node.value?.value || '');

    const NOISE_ROLES = new Set([
      'none',
      'generic',
      'InlineTextBox',
      'StaticText',
      'LineBreak',
      'LayoutTableCell',
      'LayoutTableRow',
      'LayoutTable',
    ]);

    const NOISE_PROPVALUE_SET = new Set([null, undefined, '', false]);
    const NOISE_PROPNAME_SET = new Set([
      'focusable',
      'readonly',
      'level',
      'orientation',
      'multiline',
      'settable',
      'pressed',
    ]);

    const shouldInclude = name && name.length > 0 && !NOISE_ROLES.has(role);

    if (shouldInclude && !isRoot) {
      const indent = '  '.repeat(depth);
      let nodeStr = `${indent}[${role}]`;

      const trimmedName = name.trim();
      if (trimmedName.length > 0) {
        trimmedName.length > 120
          ? (nodeStr += ` "${trimmedName.substring(0, 120)}..."`)
          : (nodeStr += ` "${trimmedName}"`);
      }

      const trimmedValue = value.trim();
      if (trimmedValue.length > 0 && trimmedValue !== trimmedName) {
        trimmedValue.length > 120
          ? (nodeStr += ` value="${trimmedValue.substring(0, 120)}..."`)
          : (nodeStr += ` value="${trimmedValue}"`);
      }

      if (node.properties) {
        const importantProps: string[] = [];
        importantProps.push(`nodeId=${node.backendDOMNodeId}`);

        for (const prop of node.properties) {
          const propName = prop.name;
          const propValue = prop.value?.value;

          if (
            !NOISE_PROPVALUE_SET.has(propValue) &&
            !NOISE_PROPNAME_SET.has(propName)
          ) {
            const propStr =
              typeof propValue === 'string' && propValue.length > 120
                ? `${propName}=${propValue.substring(0, 120)}...`
                : `${propName}=${propValue}`;
            importantProps.push(propStr);
          }
        }

        if (importantProps.length > 0) {
          nodeStr += ` ${importantProps.join(', ')}`;
        }
      }

      lines.push(nodeStr);
    }

    if (node.childIds && node.childIds.length > 0) {
      for (const childId of node.childIds) {
        const childNode = nodeMap.get(childId);
        if (childNode) {
          const nextDepth = shouldInclude && !isRoot ? depth + 1 : depth;
          this.formatNode(childNode, nodeMap, lines, nextDepth, false);
        }
      }
    }
  }
}
