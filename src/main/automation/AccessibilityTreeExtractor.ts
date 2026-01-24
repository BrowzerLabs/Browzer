import { WebContentsView } from 'electron';

export interface AccessibilityTreeResult {
  tree?: string;
  error?: string;
}

interface VisibilityContext {
  hasActiveModal: boolean;
  modalNodeIds: Set<number>;
  ariaHiddenNodeIds: Set<number>;
  cssHiddenNodeIds: Set<number>;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
}

export class AccessibilityTreeExtractor {
  constructor(private view: WebContentsView) {}

  public async extractContext(): Promise<AccessibilityTreeResult> {
    try {
      const cdp = this.view.webContents.debugger;

      await cdp.sendCommand('Accessibility.enable');

      const viewport = await this.getViewportInfo(cdp);

      const { nodes } = await cdp.sendCommand('Accessibility.getFullAXTree', {
        depth: -1,
      });

      await cdp.sendCommand('Accessibility.disable');

      if (!nodes || nodes.length === 0) {
        return { error: 'No accessibility nodes found' };
      }

      const visibilityContext = await this.analyzeVisibilityContext(
        nodes,
        viewport,
        cdp
      );

      const visibleNodes = await this.filterVisibleNodes(
        nodes,
        visibilityContext,
        cdp
      );

      const treeString = this.formatAccessibilityTree(visibleNodes);
      return { tree: treeString };
    } catch (error) {
      console.error('[AccessibilityTreeExtractor] Error:', error);
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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

  private async analyzeVisibilityContext(
    nodes: any[],
    viewport: {
      width: number;
      height: number;
      scrollX: number;
      scrollY: number;
    },
    cdp: Electron.Debugger
  ): Promise<VisibilityContext> {
    const context: VisibilityContext = {
      hasActiveModal: false,
      modalNodeIds: new Set(),
      ariaHiddenNodeIds: new Set(),
      cssHiddenNodeIds: new Set(),
      viewport,
    };

    const activeModal = await this.detectActiveModal(nodes, cdp);
    if (activeModal) {
      context.hasActiveModal = true;
      this.collectModalNodeIds(activeModal, nodes, context.modalNodeIds);
      console.log(
        `[AccessibilityTreeExtractor] Active modal detected with ${context.modalNodeIds.size} nodes`
      );
    }

    for (const node of nodes) {
      if (node.properties) {
        const hiddenProp = node.properties.find(
          (p: any) => p.name === 'hidden' && p.value?.value === true
        );
        if (hiddenProp) {
          context.ariaHiddenNodeIds.add(node.backendDOMNodeId);
        }
      }
    }

    return context;
  }

  private async detectActiveModal(
    nodes: any[],
    cdp: Electron.Debugger
  ): Promise<any | null> {
    const modalRoles = ['dialog', 'alertdialog', 'menu', 'listbox'];
    const visibleModals: { node: any; zIndex: number; domOrder: number }[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const role = node.role?.value;

      if (modalRoles.includes(role) && node.backendDOMNodeId) {
        const { model } = await cdp.sendCommand('DOM.getBoxModel', {
          backendNodeId: node.backendDOMNodeId,
        });

        if (model && model.content && model.content.length >= 4) {
          const [x1, y1, x2, y2] = model.content;
          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);

          if (width > 50 && height > 50) {
            const zIndex = await this.getEffectiveZIndex(
              node.backendDOMNodeId,
              cdp
            );
            visibleModals.push({
              node,
              zIndex,
              domOrder: i,
            });
          }
        }
      }
    }

    if (visibleModals.length === 0) {
      return null;
    }

    const topmost = this.findTopmostElement(visibleModals);
    console.log(
      `[AccessibilityTreeExtractor] Found ${visibleModals.length} modals, selecting topmost with z-index ${topmost.zIndex}`
    );
    return topmost.node;
  }

  private findTopmostElement(
    elements: { node: any; zIndex: number; domOrder: number }[]
  ): { node: any; zIndex: number; domOrder: number } {
    return elements.reduce((top, current) => {
      if (current.zIndex > top.zIndex) {
        return current;
      }
      if (current.zIndex === top.zIndex && current.domOrder > top.domOrder) {
        return current;
      }
      return top;
    });
  }

  private async getEffectiveZIndex(
    backendNodeId: number,
    cdp: Electron.Debugger
  ): Promise<number> {
    try {
      const result = await cdp.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const el = document.querySelector('[data-backend-node-id="${backendNodeId}"]') ||
                       Array.from(document.querySelectorAll('*')).find(e => e.__backendNodeId === ${backendNodeId});
            if (!el) {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
              let node;
              let count = 0;
              while ((node = walker.nextNode()) && count < 10000) {
                count++;
              }
            }
            let maxZ = 0;
            let current = el;
            while (current && current !== document.body) {
              const style = window.getComputedStyle(current);
              const z = parseInt(style.zIndex, 10);
              if (!isNaN(z) && z > maxZ) {
                maxZ = z;
              }
              current = current.parentElement;
            }
            return maxZ;
          })()
        `,
        returnByValue: true,
      });
      return result.result.value || 0;
    } catch {
      return 0;
    }
  }

  private collectModalNodeIds(
    modalNode: any,
    allNodes: any[],
    nodeIds: Set<number>
  ): void {
    const nodeMap = new Map<string, any>();
    for (const node of allNodes) {
      if (node.nodeId) {
        nodeMap.set(node.nodeId, node);
      }
    }

    const collectRecursive = (node: any) => {
      if (node.backendDOMNodeId) {
        nodeIds.add(node.backendDOMNodeId);
      }
      if (node.childIds) {
        for (const childId of node.childIds) {
          const childNode = nodeMap.get(childId);
          if (childNode) {
            collectRecursive(childNode);
          }
        }
      }
    };

    collectRecursive(modalNode);
  }

  private async filterVisibleNodes(
    nodes: any[],
    context: VisibilityContext,
    cdp: Electron.Debugger
  ): Promise<any[]> {
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

    if (context.hasActiveModal) {
      console.log(
        '[AccessibilityTreeExtractor] Filtering to modal content only'
      );
      return nodes.filter(
        (node) =>
          node.backendDOMNodeId &&
          context.modalNodeIds.has(node.backendDOMNodeId)
      );
    }

    const includedNodeIds = new Set<string>();
    const BUFFER = 200;
    const viewTop = context.viewport.scrollY - BUFFER;
    const viewBottom =
      context.viewport.scrollY + context.viewport.height + BUFFER;
    const viewLeft = context.viewport.scrollX - BUFFER;
    const viewRight =
      context.viewport.scrollX + context.viewport.width + BUFFER;

    for (const node of nodes) {
      if (!node.backendDOMNodeId) continue;

      if (context.ariaHiddenNodeIds.has(node.backendDOMNodeId)) {
        continue;
      }

      try {
        const { model } = await cdp.sendCommand('DOM.getBoxModel', {
          backendNodeId: node.backendDOMNodeId,
        });

        if (model && model.content && model.content.length >= 4) {
          const [x1, y1, x2, y2] = model.content;
          const elemTop = Math.min(y1, y2);
          const elemBottom = Math.max(y1, y2);
          const elemLeft = Math.min(x1, x2);
          const elemRight = Math.max(x1, x2);

          const isVisible =
            elemBottom >= viewTop &&
            elemTop <= viewBottom &&
            elemRight >= viewLeft &&
            elemLeft <= viewRight;

          if (isVisible) {
            includedNodeIds.add(node.nodeId);
            let parentId = parentMap.get(node.nodeId);
            while (parentId) {
              includedNodeIds.add(parentId);
              parentId = parentMap.get(parentId);
            }
          }
        }
      } catch {
        const role = node.role?.value || '';
        if (
          ['button', 'link', 'textbox', 'searchbox', 'combobox'].includes(role)
        ) {
          includedNodeIds.add(node.nodeId);
        }
      }
    }

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
    const rawName = node.name?.value;
    const rawValue = node.value?.value;
    const name = rawName != null ? String(rawName) : '';
    const value = rawValue != null ? String(rawValue) : '';

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

    const INTERACTIVE_ROLES = new Set([
      'button',
      'link',
      'textbox',
      'searchbox',
      'combobox',
      'checkbox',
      'radio',
      'slider',
      'spinbutton',
      'switch',
      'tab',
      'menuitem',
      'option',
    ]);

    const isEditableGeneric =
      role === 'generic' &&
      node.properties?.some(
        (p: any) =>
          (p.name === 'editable' && p.value?.value === 'plaintext') ||
          (p.name === 'focusable' && p.value?.value === true)
      );

    const shouldInclude =
      !NOISE_ROLES.has(role) &&
      (name.length > 0 || INTERACTIVE_ROLES.has(role) || isEditableGeneric);

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
