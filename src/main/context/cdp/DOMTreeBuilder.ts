import {
  NodeType,
  DOMRect,
  EnhancedDOMTreeNode,
  EnhancedSnapshotNode,
  EnhancedAXNode,
  EnhancedAXProperty,
  CDPDOMNode,
  CDPSnapshot,
  CDPAXTree,
  CDPAXNode,
} from './types';
import { REQUIRED_COMPUTED_STYLES, SCROLLABLE_TAGS } from './constants';

export class DOMTreeBuilder {
  private devicePixelRatio: number;
  private snapshotLookup: Map<number, EnhancedSnapshotNode> = new Map();
  private axTreeLookup: Map<number, CDPAXNode> = new Map();
  private enhancedNodeLookup: Map<number, EnhancedDOMTreeNode> = new Map();

  constructor(devicePixelRatio = 1.0) {
    this.devicePixelRatio = devicePixelRatio;
  }

  buildSnapshotLookup(
    snapshot: CDPSnapshot
  ): Map<number, EnhancedSnapshotNode> {
    if (!snapshot.documents || snapshot.documents.length === 0) {
      return this.snapshotLookup;
    }

    const strings = snapshot.strings;

    for (const document of snapshot.documents) {
      const nodes = document.nodes;
      const layout = document.layout;

      const backendToIndex: Map<number, number> = new Map();
      if (nodes.backendNodeId) {
        for (let i = 0; i < nodes.backendNodeId.length; i++) {
          backendToIndex.set(nodes.backendNodeId[i], i);
        }
      }

      const layoutIndexMap: Map<number, number> = new Map();
      if (layout && layout.nodeIndex) {
        for (
          let layoutIdx = 0;
          layoutIdx < layout.nodeIndex.length;
          layoutIdx++
        ) {
          const nodeIndex = layout.nodeIndex[layoutIdx];
          if (!layoutIndexMap.has(nodeIndex)) {
            layoutIndexMap.set(nodeIndex, layoutIdx);
          }
        }
      }

      for (const [backendId, snapshotIndex] of backendToIndex.entries()) {
        let isClickable: boolean | null = null;
        if (nodes.isClickable) {
          isClickable =
            nodes.isClickable.index?.includes(snapshotIndex) ?? false;
        }

        let cursorStyle: string | null = null;
        let bounds: DOMRect | null = null;
        let computedStyles: Record<string, string> | null = null;
        let paintOrder: number | null = null;
        let clientRects: DOMRect | null = null;
        let scrollRects: DOMRect | null = null;

        if (layoutIndexMap.has(snapshotIndex)) {
          const layoutIdx = layoutIndexMap.get(snapshotIndex)!;

          if (layout.bounds && layoutIdx < layout.bounds.length) {
            const b = layout.bounds[layoutIdx];
            if (b && b.length >= 4) {
              bounds = {
                x: b[0] / this.devicePixelRatio,
                y: b[1] / this.devicePixelRatio,
                width: b[2] / this.devicePixelRatio,
                height: b[3] / this.devicePixelRatio,
              };
            }
          }

          if (layout.styles && layoutIdx < layout.styles.length) {
            const styleIndices = layout.styles[layoutIdx];
            computedStyles = {};
            for (let i = 0; i < styleIndices.length; i++) {
              const styleIdx = styleIndices[i];
              if (
                i < REQUIRED_COMPUTED_STYLES.length &&
                styleIdx >= 0 &&
                styleIdx < strings.length
              ) {
                computedStyles[REQUIRED_COMPUTED_STYLES[i]] = strings[styleIdx];
              }
            }
            cursorStyle = computedStyles['cursor'] || null;
          }

          if (layout.paintOrders && layoutIdx < layout.paintOrders.length) {
            paintOrder = layout.paintOrders[layoutIdx];
          }

          if (layout.clientRects && layoutIdx < layout.clientRects.length) {
            const cr = layout.clientRects[layoutIdx];
            if (cr && cr.length >= 4) {
              clientRects = { x: cr[0], y: cr[1], width: cr[2], height: cr[3] };
            }
          }

          if (layout.scrollRects && layoutIdx < layout.scrollRects.length) {
            const sr = layout.scrollRects[layoutIdx];
            if (sr && sr.length >= 4) {
              scrollRects = { x: sr[0], y: sr[1], width: sr[2], height: sr[3] };
            }
          }
        }

        this.snapshotLookup.set(backendId, {
          isClickable,
          cursorStyle,
          bounds,
          clientRects,
          scrollRects,
          computedStyles:
            computedStyles && Object.keys(computedStyles).length > 0
              ? computedStyles
              : null,
          paintOrder,
        });
      }
    }

    return this.snapshotLookup;
  }

  buildAXLookup(axTree: CDPAXTree): Map<number, CDPAXNode> {
    this.axTreeLookup.clear();
    for (const node of axTree.nodes || []) {
      if (node.backendDOMNodeId !== undefined) {
        this.axTreeLookup.set(node.backendDOMNodeId, node);
      }
    }
    return this.axTreeLookup;
  }

  private buildAXNode(axNode: CDPAXNode): EnhancedAXNode {
    let properties: EnhancedAXProperty[] | null = null;

    if (axNode.properties && axNode.properties.length > 0) {
      properties = [];
      for (const prop of axNode.properties) {
        properties.push({
          name: prop.name,
          value: prop.value?.value
            ? String(prop.value.value)
            : (null as string | boolean),
        });
      }
    }

    return {
      axNodeId: axNode.nodeId,
      ignored: axNode.ignored ?? false,
      role: axNode.role?.value ?? null,
      name: axNode.name?.value ?? null,
      description: axNode.description?.value ?? null,
      properties,
      childIds: axNode.childIds ?? null,
    };
  }

  isVisible(
    node: EnhancedDOMTreeNode,
    htmlFrames: EnhancedDOMTreeNode[]
  ): boolean {
    if (!node.snapshotNode) {
      return false;
    }

    const styles = node.snapshotNode.computedStyles || {};

    const display = (styles['display'] || '').toLowerCase();
    const visibility = (styles['visibility'] || '').toLowerCase();
    const opacity = styles['opacity'] || '1';

    if (display === 'none' || visibility === 'hidden') {
      return false;
    }

    if (parseFloat(opacity) <= 0) return false;

    const bounds = node.snapshotNode.bounds;
    if (!bounds) {
      return false;
    }

    const currentBounds = { ...bounds };

    for (let i = htmlFrames.length - 1; i >= 0; i--) {
      const frame = htmlFrames[i];

      if (
        frame.nodeType === NodeType.ELEMENT_NODE &&
        (frame.nodeName.toUpperCase() === 'IFRAME' ||
          frame.nodeName.toUpperCase() === 'FRAME') &&
        frame.snapshotNode?.bounds
      ) {
        currentBounds.x += frame.snapshotNode.bounds.x;
        currentBounds.y += frame.snapshotNode.bounds.y;
      }

      if (
        frame.nodeType === NodeType.ELEMENT_NODE &&
        frame.nodeName === 'HTML' &&
        frame.snapshotNode?.scrollRects &&
        frame.snapshotNode?.clientRects
      ) {
        const viewportRight = frame.snapshotNode.clientRects.width;
        const viewportBottom = frame.snapshotNode.clientRects.height;

        const adjustedX = currentBounds.x - frame.snapshotNode.scrollRects.x;
        const adjustedY = currentBounds.y - frame.snapshotNode.scrollRects.y;

        const buffer = 100;
        const frameIntersects =
          adjustedX < viewportRight + buffer &&
          adjustedX + currentBounds.width > -buffer &&
          adjustedY < viewportBottom + buffer &&
          adjustedY + currentBounds.height > -buffer;

        if (!frameIntersects) {
          return false;
        }

        currentBounds.x -= frame.snapshotNode.scrollRects.x;
        currentBounds.y -= frame.snapshotNode.scrollRects.y;
      }
    }

    return true;
  }

  isActuallyScrollable(node: EnhancedDOMTreeNode): boolean {
    if (node.isScrollable) {
      return true;
    }

    if (!node.snapshotNode) {
      return false;
    }

    const scrollRects = node.snapshotNode.scrollRects;
    const clientRects = node.snapshotNode.clientRects;

    if (scrollRects && clientRects) {
      const hasVerticalScroll = scrollRects.height > clientRects.height + 1;
      const hasHorizontalScroll = scrollRects.width > clientRects.width + 1;

      if (hasVerticalScroll || hasHorizontalScroll) {
        if (node.snapshotNode.computedStyles) {
          const styles = node.snapshotNode.computedStyles;
          const overflow = (styles['overflow'] || 'visible').toLowerCase();
          const overflowX = (styles['overflow-x'] || overflow).toLowerCase();
          const overflowY = (styles['overflow-y'] || overflow).toLowerCase();

          const allowsScroll =
            ['auto', 'scroll', 'overlay'].includes(overflow) ||
            ['auto', 'scroll', 'overlay'].includes(overflowX) ||
            ['auto', 'scroll', 'overlay'].includes(overflowY);

          return allowsScroll;
        } else {
          return SCROLLABLE_TAGS.has(node.nodeName.toLowerCase());
        }
      }
    }

    return false;
  }

  getScrollInfo(node: EnhancedDOMTreeNode): {
    pagesAbove: number;
    pagesBelow: number;
    verticalScrollPercentage: number;
  } | null {
    if (!this.isActuallyScrollable(node) || !node.snapshotNode) {
      return null;
    }

    const scrollRects = node.snapshotNode.scrollRects;
    const clientRects = node.snapshotNode.clientRects;

    if (!scrollRects || !clientRects) {
      return null;
    }

    const scrollTop = scrollRects.y;
    const scrollableHeight = scrollRects.height;
    const visibleHeight = clientRects.height;

    const contentAbove = Math.max(0, scrollTop);
    const contentBelow = Math.max(
      0,
      scrollableHeight - visibleHeight - scrollTop
    );

    const pagesAbove = visibleHeight > 0 ? contentAbove / visibleHeight : 0;
    const pagesBelow = visibleHeight > 0 ? contentBelow / visibleHeight : 0;

    let verticalPct = 0;
    if (scrollableHeight > visibleHeight) {
      const maxScroll = scrollableHeight - visibleHeight;
      verticalPct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
    }

    return {
      pagesAbove: Math.round(pagesAbove * 10) / 10,
      pagesBelow: Math.round(pagesBelow * 10) / 10,
      verticalScrollPercentage: Math.round(verticalPct * 10) / 10,
    };
  }

  buildTree(domRoot: CDPDOMNode): EnhancedDOMTreeNode {
    const constructNode = (
      node: CDPDOMNode,
      htmlFrames: EnhancedDOMTreeNode[],
      totalOffset: DOMRect
    ): EnhancedDOMTreeNode => {
      if (this.enhancedNodeLookup.has(node.nodeId)) {
        return this.enhancedNodeLookup.get(node.nodeId)!;
      }

      const offset: DOMRect = { ...totalOffset };

      let axNode: EnhancedAXNode | null = null;
      const rawAX = this.axTreeLookup.get(node.backendNodeId);
      if (rawAX) {
        axNode = this.buildAXNode(rawAX);
      }

      const attributes: Record<string, string> = {};
      if (node.attributes && node.attributes.length > 0) {
        for (let i = 0; i < node.attributes.length; i += 2) {
          attributes[node.attributes[i]] = node.attributes[i + 1];
        }
      }

      const snapshotData = this.snapshotLookup.get(node.backendNodeId) || null;

      let absolutePosition: DOMRect | null = null;
      if (snapshotData?.bounds) {
        absolutePosition = {
          x: snapshotData.bounds.x + offset.x,
          y: snapshotData.bounds.y + offset.y,
          width: snapshotData.bounds.width,
          height: snapshotData.bounds.height,
        };
      }

      const domNode: EnhancedDOMTreeNode = {
        nodeId: node.nodeId,
        backendNodeId: node.backendNodeId,
        nodeType: node.nodeType as NodeType,
        nodeName: node.nodeName,
        nodeValue: node.nodeValue ?? null,
        attributes,
        isScrollable: node.isScrollable ?? null,
        isVisible: null,
        absolutePosition,
        frameId: node.frameId ?? null,
        contentDocument: null,
        shadowRootType: node.shadowRootType ?? null,
        shadowRoots: null,
        parentNode: null,
        childrenNodes: null,
        axNode,
        snapshotNode: snapshotData,
      };

      this.enhancedNodeLookup.set(node.nodeId, domNode);

      if (
        node.parentId !== undefined &&
        this.enhancedNodeLookup.has(node.parentId)
      ) {
        domNode.parentNode = this.enhancedNodeLookup.get(node.parentId)!;
      }

      const updatedFrames = [...htmlFrames];
      if (
        node.nodeType === NodeType.ELEMENT_NODE &&
        node.nodeName === 'HTML' &&
        node.frameId
      ) {
        updatedFrames.push(domNode);
        if (snapshotData?.scrollRects) {
          offset.x -= snapshotData.scrollRects.x;
          offset.y -= snapshotData.scrollRects.y;
        }
      }

      if (
        (node.nodeName.toUpperCase() === 'IFRAME' ||
          node.nodeName.toUpperCase() === 'FRAME') &&
        snapshotData?.bounds
      ) {
        updatedFrames.push(domNode);
        offset.x += snapshotData.bounds.x;
        offset.y += snapshotData.bounds.y;
      }

      if (node.contentDocument) {
        domNode.contentDocument = constructNode(
          node.contentDocument,
          updatedFrames,
          offset
        );
        domNode.contentDocument.parentNode = domNode;
      }

      if (node.shadowRoots && node.shadowRoots.length > 0) {
        domNode.shadowRoots = [];
        for (const shadow of node.shadowRoots) {
          const shadowNode = constructNode(shadow, updatedFrames, offset);
          shadowNode.parentNode = domNode;
          domNode.shadowRoots.push(shadowNode);
        }
      }

      if (node.children && node.children.length > 0) {
        domNode.childrenNodes = [];
        const shadowIds = new Set(node.shadowRoots?.map((s) => s.nodeId) || []);

        for (const child of node.children) {
          if (shadowIds.has(child.nodeId)) {
            continue;
          }
          const childNode = constructNode(child, updatedFrames, offset);
          childNode.parentNode = domNode;
          domNode.childrenNodes.push(childNode);
        }
      }

      domNode.isVisible = this.isVisible(domNode, updatedFrames);

      return domNode;
    };

    return constructNode(domRoot, [], { x: 0, y: 0, width: 0, height: 0 });
  }

  getChildrenAndShadowRoots(node: EnhancedDOMTreeNode): EnhancedDOMTreeNode[] {
    const children = node.childrenNodes ? [...node.childrenNodes] : [];
    if (node.shadowRoots) {
      children.push(...node.shadowRoots);
    }
    return children;
  }

  getXPath(node: EnhancedDOMTreeNode): string {
    const segments: string[] = [];
    let current: EnhancedDOMTreeNode | null = node;

    while (
      current &&
      (current.nodeType === NodeType.ELEMENT_NODE ||
        current.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE)
    ) {
      if (current.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
        current = current.parentNode;
        continue;
      }

      if (current.parentNode?.nodeName.toLowerCase() === 'iframe') {
        break;
      }

      const position = this.getElementPosition(current);
      const tagName = current.nodeName.toLowerCase();
      const xpathIndex = position > 0 ? `[${position}]` : '';
      segments.unshift(`${tagName}${xpathIndex}`);

      current = current.parentNode;
    }

    return segments.join('/');
  }

  private getElementPosition(element: EnhancedDOMTreeNode): number {
    if (!element.parentNode?.childrenNodes) {
      return 0;
    }

    const sameTagSiblings = element.parentNode.childrenNodes.filter(
      (c) =>
        c.nodeType === NodeType.ELEMENT_NODE &&
        c.nodeName.toLowerCase() === element.nodeName.toLowerCase()
    );

    if (sameTagSiblings.length <= 1) {
      return 0;
    }

    const index = sameTagSiblings.indexOf(element);
    return index >= 0 ? index + 1 : 0;
  }

  clear(): void {
    this.snapshotLookup.clear();
    this.axTreeLookup.clear();
    this.enhancedNodeLookup.clear();
  }
}
