import {
  NodeType,
  EnhancedDOMTreeNode,
  SimplifiedNode,
  CDPDOMResult,
} from './types';
import { DOMTreeBuilder } from './DOMTreeBuilder';
import { PaintOrderFilter } from './PaintOrderFilter';
import { ClickableDetector } from './ClickableDetector';
import {
  DISABLED_ELEMENTS,
  SVG_ELEMENTS,
  DEFAULT_INCLUDE_ATTRIBUTES,
  INPUT_FORMAT_HINTS,
} from './constants';

export class DOMSerializer {
  private builder: DOMTreeBuilder;
  private selectorMap: Map<number, EnhancedDOMTreeNode> = new Map();
  private clickableCache: Map<number, boolean> = new Map();
  private paintOrderFiltering: boolean;
  private includeAttributes: readonly string[];

  constructor(
    devicePixelRatio = 1.0,
    paintOrderFiltering = true,
    includeAttributes?: string[]
  ) {
    this.builder = new DOMTreeBuilder(devicePixelRatio);
    this.paintOrderFiltering = paintOrderFiltering;
    this.includeAttributes = includeAttributes || DEFAULT_INCLUDE_ATTRIBUTES;
  }

  serialize(
    root: EnhancedDOMTreeNode,
    url: string,
    title: string
  ): CDPDOMResult {
    this.selectorMap.clear();
    this.clickableCache.clear();

    const simplified = this.createSimplifiedTree(root);

    if (!simplified) {
      return {
        serializedTree: '',
        selectorMap: new Map(),
        url,
        title,
      };
    }

    if (this.paintOrderFiltering) {
      new PaintOrderFilter(simplified).calculate();
    }

    const optimized = this.optimizeTree(simplified);

    if (!optimized) {
      return {
        serializedTree: '',
        selectorMap: new Map(),
        url,
        title,
      };
    }

    this.assignInteractiveIndices(optimized);

    const serialized = this.serializeTree(optimized);

    return {
      serializedTree: serialized,
      selectorMap: this.selectorMap,
      url,
      title,
    };
  }

  private isInteractiveCached(node: EnhancedDOMTreeNode): boolean {
    if (!this.clickableCache.has(node.nodeId)) {
      this.clickableCache.set(
        node.nodeId,
        ClickableDetector.isInteractive(node)
      );
    }
    return this.clickableCache.get(node.nodeId)!;
  }

  private createSimplifiedTree(
    node: EnhancedDOMTreeNode,
    depth = 0
  ): SimplifiedNode | null {
    if (node.nodeType === NodeType.DOCUMENT_NODE) {
      const children = this.builder.getChildrenAndShadowRoots(node);
      for (const child of children) {
        const result = this.createSimplifiedTree(child, depth + 1);
        if (result) {
          return result;
        }
      }
      return null;
    }

    if (node.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
      const simplified: SimplifiedNode = {
        originalNode: node,
        children: [],
        shouldDisplay: true,
        isInteractive: false,
        isNew: false,
        ignoredByPaintOrder: false,
        excludedByParent: false,
        isShadowHost: false,
        isCompoundComponent: false,
      };

      const children = this.builder.getChildrenAndShadowRoots(node);
      for (const child of children) {
        const childSimplified = this.createSimplifiedTree(child, depth + 1);
        if (childSimplified) {
          simplified.children.push(childSimplified);
        }
      }

      return simplified.children.length > 0
        ? simplified
        : {
            originalNode: node,
            children: [],
            shouldDisplay: true,
            isInteractive: false,
            isNew: false,
            ignoredByPaintOrder: false,
            excludedByParent: false,
            isShadowHost: false,
            isCompoundComponent: false,
          };
    }

    if (node.nodeType === NodeType.ELEMENT_NODE) {
      const tagName = node.nodeName.toLowerCase();

      if (DISABLED_ELEMENTS.has(tagName)) {
        return null;
      }

      if (SVG_ELEMENTS.has(tagName)) {
        return null;
      }

      if (
        (tagName === 'iframe' || tagName === 'frame') &&
        node.contentDocument
      ) {
        const simplified: SimplifiedNode = {
          originalNode: node,
          children: [],
          shouldDisplay: true,
          isInteractive: false,
          isNew: false,
          ignoredByPaintOrder: false,
          excludedByParent: false,
          isShadowHost: false,
          isCompoundComponent: false,
        };

        const contentChildren = node.contentDocument.childrenNodes || [];
        for (const child of contentChildren) {
          const childSimplified = this.createSimplifiedTree(child, depth + 1);
          if (childSimplified) {
            simplified.children.push(childSimplified);
          }
        }

        return simplified;
      }

      const isVisible = node.isVisible;
      const isScrollable = this.builder.isActuallyScrollable(node);
      const children = this.builder.getChildrenAndShadowRoots(node);
      const hasShadow = children.length > 0;
      const isShadowHost = children.some(
        (c) => c.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE
      );

      const isFileInput =
        tagName === 'input' && node.attributes['type'] === 'file';

      if (
        isVisible ||
        isScrollable ||
        hasShadow ||
        isShadowHost ||
        isFileInput
      ) {
        const simplified: SimplifiedNode = {
          originalNode: node,
          children: [],
          shouldDisplay: true,
          isInteractive: false,
          isNew: false,
          ignoredByPaintOrder: false,
          excludedByParent: false,
          isShadowHost,
          isCompoundComponent: false,
        };

        for (const child of children) {
          const childSimplified = this.createSimplifiedTree(child, depth + 1);
          if (childSimplified) {
            simplified.children.push(childSimplified);
          }
        }

        if (
          isVisible ||
          isScrollable ||
          simplified.children.length > 0 ||
          isFileInput
        ) {
          return simplified;
        }
      }
    }

    if (node.nodeType === NodeType.TEXT_NODE) {
      const isVisible = node.snapshotNode && node.isVisible;
      const text = (node.nodeValue || '').trim();

      if (isVisible && text && text.length > 1) {
        return {
          originalNode: node,
          children: [],
          shouldDisplay: true,
          isInteractive: false,
          isNew: false,
          ignoredByPaintOrder: false,
          excludedByParent: false,
          isShadowHost: false,
          isCompoundComponent: false,
        };
      }
    }

    return null;
  }

  private optimizeTree(node: SimplifiedNode | null): SimplifiedNode | null {
    if (!node) {
      return null;
    }

    const optimizedChildren: SimplifiedNode[] = [];
    for (const child of node.children) {
      const optimized = this.optimizeTree(child);
      if (optimized) {
        optimizedChildren.push(optimized);
      }
    }
    node.children = optimizedChildren;

    const isVisible =
      node.originalNode.snapshotNode && node.originalNode.isVisible;
    const isFileInput =
      node.originalNode.nodeName.toLowerCase() === 'input' &&
      node.originalNode.attributes['type'] === 'file';

    if (
      isVisible ||
      this.builder.isActuallyScrollable(node.originalNode) ||
      node.originalNode.nodeType === NodeType.TEXT_NODE ||
      node.children.length > 0 ||
      isFileInput
    ) {
      return node;
    }

    return null;
  }

  private hasInteractiveDescendants(node: SimplifiedNode): boolean {
    for (const child of node.children) {
      if (this.isInteractiveCached(child.originalNode)) {
        return true;
      }
      if (this.hasInteractiveDescendants(child)) {
        return true;
      }
    }
    return false;
  }

  private assignInteractiveIndices(node: SimplifiedNode): void {
    if (!node.excludedByParent && !node.ignoredByPaintOrder) {
      const isInteractive = this.isInteractiveCached(node.originalNode);
      const isVisible =
        node.originalNode.snapshotNode && node.originalNode.isVisible;
      const isScrollable = this.builder.isActuallyScrollable(node.originalNode);
      const isFileInput =
        node.originalNode.nodeName.toLowerCase() === 'input' &&
        node.originalNode.attributes['type'] === 'file';

      let shouldMakeInteractive = false;

      if (isScrollable) {
        if (!this.hasInteractiveDescendants(node)) {
          shouldMakeInteractive = true;
        }
      } else if (isInteractive && (isVisible || isFileInput)) {
        shouldMakeInteractive = true;
      }

      if (shouldMakeInteractive) {
        node.isInteractive = true;
        this.selectorMap.set(
          node.originalNode.backendNodeId,
          node.originalNode
        );
      }
    }

    for (const child of node.children) {
      this.assignInteractiveIndices(child);
    }
  }

  private serializeTree(node: SimplifiedNode, depth = 0): string {
    if (node.excludedByParent) {
      const parts: string[] = [];
      for (const child of node.children) {
        const childText = this.serializeTree(child, depth);
        if (childText) {
          parts.push(childText);
        }
      }
      return parts.join('\n');
    }

    const formatted: string[] = [];
    const depthStr = '\t'.repeat(depth);
    let nextDepth = depth;

    if (node.originalNode.nodeType === NodeType.ELEMENT_NODE) {
      if (!node.shouldDisplay) {
        for (const child of node.children) {
          const childText = this.serializeTree(child, depth);
          if (childText) {
            formatted.push(childText);
          }
        }
        return formatted.join('\n');
      }

      const tagName = node.originalNode.nodeName.toLowerCase();

      if (tagName === 'svg') {
        let line = depthStr;
        if (node.isInteractive) {
          line += `[${node.originalNode.backendNodeId}]`;
        }
        line += '<svg';
        const attrs = this.buildAttributesString(node.originalNode);
        if (attrs) {
          line += ` ${attrs}`;
        }
        line += ' />';
        formatted.push(line);
        return formatted.join('\n');
      }

      const isScrollable = this.builder.isActuallyScrollable(node.originalNode);
      const shouldShowScroll = this.shouldShowScrollInfo(node.originalNode);

      if (
        node.isInteractive ||
        isScrollable ||
        tagName === 'iframe' ||
        tagName === 'frame'
      ) {
        nextDepth += 1;

        const attrs = this.buildAttributesString(node.originalNode);

        let shadowPrefix = '';
        if (node.isShadowHost) {
          const hasClosed = node.children.some(
            (c) =>
              c.originalNode.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE &&
              c.originalNode.shadowRootType?.toLowerCase() === 'closed'
          );
          shadowPrefix = hasClosed ? '|SHADOW(closed)|' : '|SHADOW(open)|';
        }

        let line: string;
        if (shouldShowScroll && !node.isInteractive) {
          line = `${depthStr}${shadowPrefix}|SCROLL|<${tagName}`;
        } else if (node.isInteractive) {
          const scrollPrefix = shouldShowScroll ? '|SCROLL[' : '[';
          line = `${depthStr}${shadowPrefix}${scrollPrefix}${node.originalNode.backendNodeId}]<${tagName}`;
        } else if (tagName === 'iframe') {
          line = `${depthStr}${shadowPrefix}|IFRAME|<${tagName}`;
        } else if (tagName === 'frame') {
          line = `${depthStr}${shadowPrefix}|FRAME|<${tagName}`;
        } else {
          line = `${depthStr}${shadowPrefix}<${tagName}`;
        }

        if (attrs) {
          line += ` ${attrs}`;
        }
        line += ' />';

        if (shouldShowScroll) {
          const scrollText = this.getScrollInfoText(node.originalNode);
          if (scrollText) {
            line += ` (${scrollText})`;
          }
        }

        formatted.push(line);
      }
    } else if (node.originalNode.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
      const shadowType = node.originalNode.shadowRootType?.toLowerCase();
      if (shadowType === 'closed') {
        formatted.push(`${depthStr}Closed Shadow`);
      } else {
        formatted.push(`${depthStr}Open Shadow`);
      }

      nextDepth += 1;

      for (const child of node.children) {
        const childText = this.serializeTree(child, nextDepth);
        if (childText) {
          formatted.push(childText);
        }
      }

      if (node.children.length > 0) {
        formatted.push(`${depthStr}Shadow End`);
      }

      return formatted.join('\n');
    } else if (node.originalNode.nodeType === NodeType.TEXT_NODE) {
      const isVisible =
        node.originalNode.snapshotNode && node.originalNode.isVisible;
      const text = (node.originalNode.nodeValue || '').trim();

      if (isVisible && text && text.length > 1) {
        const displayText =
          text.length > 100 ? text.substring(0, 100) + '...' : text;
        formatted.push(`${depthStr}${displayText}`);
      }
    }

    if (node.originalNode.nodeType !== NodeType.DOCUMENT_NODE) {
      for (const child of node.children) {
        const childText = this.serializeTree(child, nextDepth);
        if (childText) {
          formatted.push(childText);
        }
      }
    }

    return formatted.join('\n');
  }

  private shouldShowScrollInfo(node: EnhancedDOMTreeNode): boolean {
    const tagName = node.nodeName.toLowerCase();

    if (tagName === 'iframe') {
      return true;
    }

    const isScrollable = this.builder.isActuallyScrollable(node);
    if (!isScrollable) {
      return false;
    }

    if (tagName === 'body' || tagName === 'html') {
      return true;
    }

    if (node.parentNode && this.builder.isActuallyScrollable(node.parentNode)) {
      return false;
    }

    return true;
  }

  private getScrollInfoText(node: EnhancedDOMTreeNode): string {
    if (node.nodeName.toLowerCase() === 'iframe') {
      return 'scroll';
    }

    const info = this.builder.getScrollInfo(node);
    if (!info) {
      return '';
    }

    return `${info.pagesAbove.toFixed(1)} pages above, ${info.pagesBelow.toFixed(1)} pages below`;
  }

  private buildAttributesString(node: EnhancedDOMTreeNode): string {
    const attrsToInclude: Record<string, string> = {};

    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (this.includeAttributes.includes(key) && value?.trim()) {
          attrsToInclude[key] = value.trim();
        }
      }
    }

    const tagName = node.nodeName.toLowerCase();
    if (tagName === 'input' && node.attributes) {
      const inputType = (node.attributes['type'] || '').toLowerCase();
      const formatHint = INPUT_FORMAT_HINTS[inputType];
      if (formatHint) {
        attrsToInclude['format'] = formatHint;
        if (!attrsToInclude['placeholder']) {
          attrsToInclude['placeholder'] = formatHint;
        }
      }
    }

    if (node.axNode?.properties) {
      for (const prop of node.axNode.properties) {
        if (this.includeAttributes.includes(prop.name) && prop.value !== null) {
          if (typeof prop.value === 'boolean') {
            attrsToInclude[prop.name] = prop.value.toString();
          } else {
            const val = String(prop.value).trim();
            if (val) {
              attrsToInclude[prop.name] = val;
            }
          }
        }
      }
    }

    if (
      ['input', 'textarea', 'select'].includes(tagName) &&
      node.axNode?.properties
    ) {
      for (const prop of node.axNode.properties) {
        if (['valuetext', 'value'].includes(prop.name) && prop.value) {
          const val = String(prop.value).trim();
          if (val) {
            attrsToInclude['value'] = val;
            break;
          }
        }
      }
    }

    if (node.axNode?.name) {
      const axName = node.axNode.name.trim();
      if (axName && !Object.values(attrsToInclude).includes(axName)) {
        attrsToInclude['ax_name'] = axName;
      }
    }

    if (Object.keys(attrsToInclude).length === 0) {
      return '';
    }

    const orderedKeys = this.includeAttributes.filter(
      (k) => k in attrsToInclude
    );

    const capText = (text: string, maxLen = 100): string => {
      return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
    };

    const formatted: string[] = [];
    for (const key of orderedKeys) {
      const value = capText(attrsToInclude[key]);
      if (!value) {
        formatted.push(`${key}=''`);
      } else {
        const escaped = value.replace(/"/g, '\\"');
        formatted.push(`${key}="${escaped}"`);
      }
    }

    return formatted.join(' ');
  }

  getBuilder(): DOMTreeBuilder {
    return this.builder;
  }
}
