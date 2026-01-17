import { WebContentsView } from 'electron';

export interface AccessibilityTreeResult {
  tree?: string;
  error?: string;
}

export class AccessibilityTreeExtractor {
  constructor(private view: WebContentsView) {}

  public async extractContext(): Promise<AccessibilityTreeResult> {
    try {
      const cdp = this.view.webContents.debugger;

      await cdp.sendCommand('Accessibility.enable');

      // Get viewport dimensions for filtering
      const viewport = await this.getViewportInfo(cdp);

      const { nodes } = await cdp.sendCommand('Accessibility.getFullAXTree', {
        depth: -1,
      });

      await cdp.sendCommand('Accessibility.disable');

      if (!nodes || nodes.length === 0) {
        return { error: 'No accessibility nodes found' };
      }

      // Filter nodes to those in/near viewport
      const visibleNodes = await this.filterVisibleNodes(nodes, viewport, cdp);

      const treeString = this.formatAccessibilityTree(visibleNodes);
      return { tree: treeString };
    } catch (error) {
      console.error('[AccessibilityTreeExtractor] Error:', error);
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get viewport dimensions
   */
  private async getViewportInfo(cdp: Electron.Debugger): Promise<{
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  }> {
    try {
      const result = await cdp.sendCommand('Runtime.evaluate', {
        expression: `JSON.stringify({
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        })`,
        returnByValue: true,
      });
      return JSON.parse(result.result.value);
    } catch {
      return { width: 1920, height: 1080, scrollX: 0, scrollY: 0 };
    }
  }

  /**
   * Filter nodes to those visible in or near the viewport
   */
  private async filterVisibleNodes(
    nodes: any[],
    viewport: {
      width: number;
      height: number;
      scrollX: number;
      scrollY: number;
    },
    cdp: Electron.Debugger
  ): Promise<any[]> {
    // Build node map for parent-child relationships
    const nodeMap = new Map<string, any>();
    const parentMap = new Map<string, string>();

    for (const node of nodes) {
      if (node.nodeId) {
        nodeMap.set(node.nodeId, node);
        if (node.childIds) {
          for (const childId of node.childIds) {
            parentMap.set(childId, node.nodeId);
          }
        }
      }
    }

    // Nodes to include (visible + their ancestors)
    const includedNodeIds = new Set<string>();

    // Buffer around viewport (include elements slightly outside)
    const BUFFER = 200;
    const viewTop = viewport.scrollY - BUFFER;
    const viewBottom = viewport.scrollY + viewport.height + BUFFER;
    const viewLeft = viewport.scrollX - BUFFER;
    const viewRight = viewport.scrollX + viewport.width + BUFFER;

    // Check each node with a backendDOMNodeId for visibility
    for (const node of nodes) {
      if (!node.backendDOMNodeId) continue;

      try {
        // Get element's bounding box
        const { model } = await cdp.sendCommand('DOM.getBoxModel', {
          backendNodeId: node.backendDOMNodeId,
        });

        if (model && model.content && model.content.length >= 4) {
          const [x1, y1, x2, y2] = model.content;
          const elemTop = Math.min(y1, y2);
          const elemBottom = Math.max(y1, y2);
          const elemLeft = Math.min(x1, x2);
          const elemRight = Math.max(x1, x2);

          // Check if element overlaps with viewport
          const isVisible =
            elemBottom >= viewTop &&
            elemTop <= viewBottom &&
            elemRight >= viewLeft &&
            elemLeft <= viewRight;

          if (isVisible) {
            // Include this node and all ancestors
            includedNodeIds.add(node.nodeId);
            let parentId = parentMap.get(node.nodeId);
            while (parentId) {
              includedNodeIds.add(parentId);
              parentId = parentMap.get(parentId);
            }
          }
        }
      } catch {
        // If we can't get box model, include the node anyway if it has important role
        const role = node.role?.value || '';
        if (
          ['button', 'link', 'textbox', 'searchbox', 'combobox'].includes(role)
        ) {
          includedNodeIds.add(node.nodeId);
        }
      }
    }

    // Return filtered nodes, preserving structure
    return nodes.filter((node) => includedNodeIds.has(node.nodeId));
  }

  private formatAccessibilityTree(nodes: any[]): string {
    const lines: string[] = [];
    const url = this.view.webContents.getURL();
    const title = this.view.webContents.getTitle();

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
    lines.push(`URL: ${url}`);
    lines.push(`Title: ${title}`);
    lines.push(...filteredLines.slice(3));

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
    const name = node.name?.value || '';
    const value = node.value?.value || '';

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

      if (name && name.trim().length > 0) {
        name.length > 120
          ? (nodeStr += ` "${name.trim().substring(0, 120)}..."`)
          : (nodeStr += ` "${name.trim()}"`);
      }

      if (value && value !== name && value.trim().length > 0) {
        value.length > 120
          ? (nodeStr += ` value="${value.trim().substring(0, 120)}..."`)
          : (nodeStr += ` value="${value.trim()}"`);
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
