import { EnhancedDOMTreeNode, NodeType } from './types';
import {
  INTERACTIVE_TAGS,
  INTERACTIVE_ROLES,
  INTERACTIVE_ATTRIBUTES,
  INTERACTIVE_AX_PROPERTIES,
  SEARCH_INDICATORS,
} from './constants';

export class ClickableDetector {
  static isInteractive(node: EnhancedDOMTreeNode): boolean {
    if (node.nodeType !== NodeType.ELEMENT_NODE) {
      return false;
    }

    const tagName = node.nodeName.toLowerCase();

    if (tagName === 'html' || tagName === 'body') {
      return false;
    }

    if (tagName === 'iframe' || tagName === 'frame') {
      if (node.snapshotNode?.bounds) {
        const { width, height } = node.snapshotNode.bounds;
        if (width > 100 && height > 100) {
          return true;
        }
      }
    }

    if (node.attributes) {
      const classList = (node.attributes['class'] || '')
        .toLowerCase()
        .split(/\s+/);
      const elementId = (node.attributes['id'] || '').toLowerCase();

      for (const indicator of SEARCH_INDICATORS) {
        if (classList.some((cls) => cls.includes(indicator))) {
          return true;
        }
        if (elementId.includes(indicator)) {
          return true;
        }
      }
    }

    if (node.axNode?.properties) {
      for (const prop of node.axNode.properties) {
        if (prop.name === 'disabled' && prop.value) {
          return false;
        }
        if (prop.name === 'hidden' && prop.value) {
          return false;
        }
        if (
          ['focusable', 'editable', 'settable'].includes(prop.name) &&
          prop.value
        ) {
          return true;
        }
        if (
          ['checked', 'expanded', 'pressed', 'selected'].includes(prop.name)
        ) {
          return true;
        }
        if (['required', 'autocomplete'].includes(prop.name) && prop.value) {
          return true;
        }
      }
    }

    if (INTERACTIVE_TAGS.has(tagName)) {
      return true;
    }

    if (node.attributes) {
      for (const attr of Object.keys(node.attributes)) {
        if (INTERACTIVE_ATTRIBUTES.has(attr)) {
          return true;
        }
      }

      const role = node.attributes['role'];
      if (role && INTERACTIVE_ROLES.has(role)) {
        return true;
      }

      if (node.attributes['contenteditable'] === 'true') {
        return true;
      }
    }

    if (node.axNode?.role && INTERACTIVE_ROLES.has(node.axNode.role)) {
      return true;
    }

    if (node.snapshotNode?.bounds) {
      const { width, height } = node.snapshotNode.bounds;
      if (width >= 10 && width <= 50 && height >= 10 && height <= 50) {
        if (node.attributes) {
          const iconAttrs = [
            'class',
            'role',
            'onclick',
            'data-action',
            'aria-label',
          ];
          if (iconAttrs.some((attr) => attr in node.attributes)) {
            return true;
          }
        }
      }
    }

    if (node.snapshotNode?.cursorStyle === 'pointer') {
      return true;
    }

    if (node.snapshotNode?.isClickable) {
      return true;
    }

    return false;
  }

  static hasInteractiveDescendants(
    node: EnhancedDOMTreeNode,
    cache?: Map<number, boolean>
  ): boolean {
    const children = node.childrenNodes || [];

    for (const child of children) {
      if (cache?.has(child.nodeId)) {
        if (cache.get(child.nodeId)) {
          return true;
        }
        continue;
      }

      if (this.isInteractive(child)) {
        cache?.set(child.nodeId, true);
        return true;
      }

      if (this.hasInteractiveDescendants(child, cache)) {
        return true;
      }
    }

    const shadowRoots = node.shadowRoots || [];
    for (const shadow of shadowRoots) {
      if (this.hasInteractiveDescendants(shadow, cache)) {
        return true;
      }
    }

    return false;
  }

  static getInteractiveType(node: EnhancedDOMTreeNode): string | null {
    if (!this.isInteractive(node)) {
      return null;
    }

    const tagName = node.nodeName.toLowerCase();

    if (tagName === 'input') {
      const inputType = node.attributes['type'] || 'text';
      return `input:${inputType}`;
    }

    if (['textarea', 'select'].includes(tagName)) {
      return tagName;
    }

    if (tagName === 'a') {
      return 'link';
    }

    if (tagName === 'button' || node.attributes['role'] === 'button') {
      return 'button';
    }

    const role = node.attributes['role'] || node.axNode?.role;
    if (role) {
      return `role:${role}`;
    }

    return 'interactive';
  }
}
