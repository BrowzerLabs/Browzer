/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AccessibilityTreeExtractor - Extract semantic accessibility tree
 * 
 * The accessibility tree is a lighter-weight alternative to the full DOM.
 * It represents the page structure in terms of semantic roles and accessible names,
 * which is often more useful for LLMs than raw HTML.
 * 
 * Benefits:
 * - Much smaller token size than full DOM
 * - Semantic representation (roles, labels)
 * - Only includes accessible/meaningful elements
 * - Maps well to user intent
 */

import { A11yNode } from './types';

export class AccessibilityTreeExtractor {
  /**
   * Generate script to extract accessibility tree
   */
  public generateExtractionScript(maxDepth = 10, maxNodes = 200): string {
    return `
      (function() {
        const maxDepth = ${maxDepth};
        const maxNodes = ${maxNodes};
        let nodeCount = 0;
        
        /**
         * Extract accessibility information from element
         */
        function extractA11yInfo(element) {
          if (nodeCount >= maxNodes) return null;
          
          // Get computed accessibility properties
          const role = element.getAttribute('role') || getImplicitRole(element);
          if (!role) return null; // Skip elements without semantic meaning
          
          // Get accessible name (aria-label, aria-labelledby, or text content)
          const name = getAccessibleName(element);
          
          // Get description
          const description = element.getAttribute('aria-describedby') 
            ? getTextFromId(element.getAttribute('aria-describedby'))
            : element.getAttribute('aria-description') || undefined;
          
          // Get value (for inputs, sliders, etc.)
          const value = getAccessibleValue(element);
          
          // Get state
          const focused = document.activeElement === element;
          const disabled = element.disabled || element.getAttribute('aria-disabled') === 'true';
          
          nodeCount++;
          
          return {
            role,
            name,
            description,
            value,
            focused,
            disabled
          };
        }
        
        /**
         * Get implicit ARIA role for HTML element
         */
        function getImplicitRole(element) {
          const tag = element.tagName.toLowerCase();
          const type = element.type?.toLowerCase();
          
          const roleMap = {
            'a': element.href ? 'link' : null,
            'button': 'button',
            'input': type === 'button' || type === 'submit' ? 'button' :
                     type === 'checkbox' ? 'checkbox' :
                     type === 'radio' ? 'radio' :
                     type === 'search' ? 'searchbox' : 'textbox',
            'textarea': 'textbox',
            'select': 'combobox',
            'img': 'img',
            'nav': 'navigation',
            'main': 'main',
            'header': 'banner',
            'footer': 'contentinfo',
            'aside': 'complementary',
            'section': 'region',
            'article': 'article',
            'form': 'form',
            'h1': 'heading',
            'h2': 'heading',
            'h3': 'heading',
            'h4': 'heading',
            'h5': 'heading',
            'h6': 'heading',
            'ul': 'list',
            'ol': 'list',
            'li': 'listitem',
            'dialog': 'dialog',
            'table': 'table',
            'tr': 'row',
            'td': 'cell',
            'th': 'columnheader'
          };
          
          return roleMap[tag] || null;
        }
        
        /**
         * Get accessible name for element
         */
        function getAccessibleName(element) {
          // aria-label takes precedence
          if (element.hasAttribute('aria-label')) {
            return element.getAttribute('aria-label');
          }
          
          // aria-labelledby
          if (element.hasAttribute('aria-labelledby')) {
            return getTextFromId(element.getAttribute('aria-labelledby'));
          }
          
          // For inputs, check associated label
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            const label = element.labels?.[0];
            if (label) return label.innerText?.trim();
            
            // Check for placeholder
            if (element.placeholder) return element.placeholder;
          }
          
          // For images, use alt text
          if (element.tagName === 'IMG') {
            return element.alt || element.title;
          }
          
          // For links and buttons, use text content
          if (['A', 'BUTTON'].includes(element.tagName)) {
            const text = element.innerText || element.textContent;
            return text?.trim().substring(0, 100);
          }
          
          // Title attribute
          if (element.title) {
            return element.title;
          }
          
          // Fallback to text content (truncated)
          const text = element.innerText || element.textContent;
          return text?.trim().substring(0, 50) || undefined;
        }
        
        /**
         * Get accessible value for form elements
         */
        function getAccessibleValue(element) {
          if (element.value !== undefined && element.value !== '') {
            return element.value;
          }
          
          if (element.hasAttribute('aria-valuenow')) {
            return element.getAttribute('aria-valuenow');
          }
          
          if (element.hasAttribute('aria-valuetext')) {
            return element.getAttribute('aria-valuetext');
          }
          
          // For checkboxes and radios
          if (element.type === 'checkbox' || element.type === 'radio') {
            return element.checked ? 'checked' : 'unchecked';
          }
          
          return undefined;
        }
        
        /**
         * Get text content from element with given ID
         */
        function getTextFromId(id) {
          if (!id) return undefined;
          const element = document.getElementById(id);
          return element?.innerText?.trim() || element?.textContent?.trim();
        }
        
        /**
         * Check if element should be included in tree
         */
        function shouldInclude(element) {
          // Must have a semantic role
          const role = element.getAttribute('role') || getImplicitRole(element);
          if (!role) return false;
          
          // Skip hidden elements
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
          }
          
          // Skip aria-hidden
          if (element.getAttribute('aria-hidden') === 'true') {
            return false;
          }
          
          return true;
        }
        
        /**
         * Build accessibility tree recursively
         */
        function buildA11yTree(element, depth = 0) {
          if (depth > maxDepth || nodeCount >= maxNodes) return null;
          if (!shouldInclude(element)) return null;
          
          const node = extractA11yInfo(element);
          if (!node) return null;
          
          // Recursively process children
          const children = [];
          for (const child of element.children) {
            const childNode = buildA11yTree(child, depth + 1);
            if (childNode) {
              children.push(childNode);
            }
          }
          
          if (children.length > 0) {
            node.children = children;
          }
          
          return node;
        }
        
        // Start from body
        const tree = buildA11yTree(document.body);
        
        return {
          tree,
          nodeCount,
          truncated: nodeCount >= maxNodes
        };
      })();
    `;
  }

  /**
   * Extract accessibility tree from page
   */
  public async extractTree(
    cdpDebugger: Electron.Debugger,
    maxDepth = 10,
    maxNodes = 200
  ): Promise<{ tree: A11yNode | null; nodeCount: number; truncated: boolean }> {
    try {
      const script = this.generateExtractionScript(maxDepth, maxNodes);
      
      const result = await cdpDebugger.sendCommand('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
        awaitPromise: false
      });

      if (result.result?.value) {
        const { tree, nodeCount, truncated } = result.result.value;
        
        console.log(`📋 Accessibility tree extracted: ${nodeCount} nodes${truncated ? ' (truncated)' : ''}`);
        
        return {
          tree: tree || null,
          nodeCount: nodeCount || 0,
          truncated: truncated || false
        };
      }

      return { tree: null, nodeCount: 0, truncated: false };
    } catch (error) {
      console.error('❌ Accessibility tree extraction failed:', error);
      return { tree: null, nodeCount: 0, truncated: false };
    }
  }

  /**
   * Convert accessibility tree to markdown format (human-readable)
   */
  public treeToMarkdown(tree: A11yNode | null, indent = 0): string {
    if (!tree) return '';
    
    const lines: string[] = [];
    const prefix = '  '.repeat(indent);
    
    // Format node
    let line = `${prefix}- [${tree.role}]`;
    if (tree.name) line += ` "${tree.name}"`;
    if (tree.value) line += ` (value: ${tree.value})`;
    if (tree.focused) line += ` *focused*`;
    if (tree.disabled) line += ` *disabled*`;
    if (tree.description) line += ` - ${tree.description}`;
    
    lines.push(line);
    
    // Recurse for children
    if (tree.children) {
      for (const child of tree.children) {
        lines.push(this.treeToMarkdown(child, indent + 1));
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Get flattened list of interactive elements from tree
   */
  public getInteractiveElements(tree: A11yNode | null): Array<{ role: string; name?: string; value?: string }> {
    if (!tree) return [];
    
    const elements: Array<{ role: string; name?: string; value?: string }> = [];
    
    const interactiveRoles = [
      'button', 'link', 'textbox', 'searchbox', 'combobox',
      'checkbox', 'radio', 'menuitem', 'tab', 'switch'
    ];
    
    const traverse = (node: A11yNode) => {
      if (interactiveRoles.includes(node.role)) {
        elements.push({
          role: node.role,
          name: node.name,
          value: node.value
        });
      }
      
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };
    
    traverse(tree);
    return elements;
  }
}

