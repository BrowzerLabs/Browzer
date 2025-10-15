/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DOMPruner - Intelligent DOM downsampling and pruning
 * 
 * Extracts only significant, interactive elements from the DOM to create
 * a token-efficient representation for LLM context.
 * 
 * Key Features:
 * - Identifies interactive elements (buttons, links, inputs, etc.)
 * - Filters out non-visible and non-interactive elements
 * - Extracts semantic attributes (aria-labels, roles, data-testid, etc.)
 * - Generates reliable selectors for each element
 * - Truncates long text content
 * - Provides interactivity scoring
 */

import { PrunedElement, PruningStrategy } from './types';

export class DOMPruner {
  private readonly DEFAULT_STRATEGY: PruningStrategy = {
    alwaysIncludeTags: [
      'button', 'a', 'input', 'select', 'textarea', 
      'form', 'label', 'summary', 'details'
    ],
    alwaysIncludeRoles: [
      'button', 'link', 'textbox', 'searchbox', 'combobox',
      'checkbox', 'radio', 'menuitem', 'tab', 'switch',
      'dialog', 'alertdialog', 'navigation', 'main'
    ],
    excludeTags: [
      'script', 'style', 'noscript', 'meta', 'link', 
      'head', 'title', 'base', 'template'
    ],
    excludeHidden: true,
    maxTextLength: 100,
    maxChildrenDepth: 5,
    minInteractivityScore: 30
  };

  constructor(private strategy: PruningStrategy = {} as PruningStrategy) {
    // Merge with defaults
    this.strategy = { ...this.DEFAULT_STRATEGY, ...strategy };
  }

  /**
   * Extract pruned DOM elements from a page using CDP
   * This runs in the browser context
   */
  public generateExtractionScript(maxElements = 100): string {
    const strategy = this.strategy;
    
    return `
      (function() {
        const strategy = ${JSON.stringify(strategy)};
        const maxElements = ${maxElements};
        const prunedElements = [];
        
        /**
         * Calculate interactivity score for an element
         */
        function getInteractivityScore(element) {
          let score = 0;
          
          // Tag-based scoring
          const tag = element.tagName.toLowerCase();
          if (strategy.alwaysIncludeTags.includes(tag)) score += 40;
          
          // Role-based scoring
          const role = element.getAttribute('role');
          if (role && strategy.alwaysIncludeRoles.includes(role)) score += 40;
          
          // Interactive attributes
          if (element.onclick || element.hasAttribute('onclick')) score += 20;
          if (element.hasAttribute('href')) score += 30;
          if (element.type === 'submit' || element.type === 'button') score += 20;
          if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') score += 15;
          
          // ARIA attributes
          if (element.hasAttribute('aria-label')) score += 10;
          if (element.hasAttribute('aria-describedby')) score += 5;
          
          // Test attributes (highly reliable)
          if (element.hasAttribute('data-testid')) score += 15;
          if (element.hasAttribute('data-cy')) score += 15;
          
          // CSS cursor
          const style = window.getComputedStyle(element);
          if (style.cursor === 'pointer') score += 15;
          
          // Form elements
          if (['input', 'select', 'textarea', 'button'].includes(tag)) score += 25;
          
          return Math.min(100, score);
        }
        
        /**
         * Check if element is visible
         */
        function isVisible(element) {
          if (!strategy.excludeHidden) return true;
          
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
          );
        }
        
        /**
         * Generate best selector for element
         */
        function generateSelector(element) {
          // ID is best
          if (element.id) {
            return '#' + CSS.escape(element.id);
          }
          
          // data-testid is great
          if (element.hasAttribute('data-testid')) {
            return '[data-testid="' + element.getAttribute('data-testid') + '"]';
          }
          
          // data-cy
          if (element.hasAttribute('data-cy')) {
            return '[data-cy="' + element.getAttribute('data-cy') + '"]';
          }
          
          // aria-label
          if (element.hasAttribute('aria-label')) {
            const tag = element.tagName.toLowerCase();
            return tag + '[aria-label="' + element.getAttribute('aria-label') + '"]';
          }
          
          // name attribute
          if (element.hasAttribute('name')) {
            const tag = element.tagName.toLowerCase();
            return tag + '[name="' + element.getAttribute('name') + '"]';
          }
          
          // CSS path (fallback)
          return generateCSSPath(element);
        }
        
        /**
         * Generate CSS path for element
         */
        function generateCSSPath(element) {
          const path = [];
          let current = element;
          let depth = 0;
          
          while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
            let selector = current.tagName.toLowerCase();
            
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_|css-)/))
                .slice(0, 2)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) selector += '.' + classes;
            }
            
            // Add nth-child if needed for uniqueness
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => 
                c.tagName === current.tagName
              );
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += ':nth-of-type(' + index + ')';
              }
            }
            
            path.unshift(selector);
            current = current.parentElement;
            depth++;
          }
          
          return path.join(' > ');
        }
        
        /**
         * Extract attributes from element
         */
        function extractAttributes(element) {
          const attrs = {};
          
          if (element.id) attrs.id = element.id;
          if (element.className && typeof element.className === 'string') {
            attrs.className = element.className.trim();
          }
          if (element.name) attrs.name = element.name;
          if (element.type) attrs.type = element.type;
          if (element.placeholder) attrs.placeholder = element.placeholder;
          if (element.value) attrs.value = element.value;
          if (element.href) attrs.href = element.href;
          
          // Accessibility
          if (element.hasAttribute('role')) attrs.role = element.getAttribute('role');
          if (element.hasAttribute('aria-label')) attrs.ariaLabel = element.getAttribute('aria-label');
          if (element.hasAttribute('aria-describedby')) attrs.ariaDescribedBy = element.getAttribute('aria-describedby');
          
          // Test attributes
          if (element.hasAttribute('data-testid')) attrs.dataTestId = element.getAttribute('data-testid');
          if (element.hasAttribute('data-cy')) attrs.dataCy = element.getAttribute('data-cy');
          
          return attrs;
        }
        
        /**
         * Get text content (truncated)
         */
        function getTextContent(element) {
          let text = element.innerText || element.textContent || '';
          text = text.trim();
          
          if (text.length > strategy.maxTextLength) {
            text = text.substring(0, strategy.maxTextLength) + '...';
          }
          
          return text || undefined;
        }
        
        /**
         * Traverse DOM and collect interactive elements
         */
        function traverseDOM(node, depth = 0) {
          if (depth > strategy.maxChildrenDepth) return;
          if (prunedElements.length >= maxElements) return;
          
          // Skip excluded tags
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (strategy.excludeTags.includes(tag)) return;
            
            const score = getInteractivityScore(node);
            const visible = isVisible(node);
            
            // Include if interactive enough and visible (or we don't care about visibility)
            if (score >= strategy.minInteractivityScore && visible) {
              const rect = node.getBoundingClientRect();
              
              prunedElements.push({
                tagName: node.tagName,
                selector: generateSelector(node),
                attributes: extractAttributes(node),
                text: getTextContent(node),
                isVisible: visible,
                isInteractive: score >= 50,
                boundingBox: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                },
                childrenCount: node.children.length
              });
            }
            
            // Traverse children
            for (const child of node.children) {
              traverseDOM(child, depth + 1);
            }
          }
        }
        
        // Start traversal from body
        traverseDOM(document.body);
        
        return {
          elements: prunedElements,
          totalScanned: document.querySelectorAll('*').length,
          totalPruned: prunedElements.length
        };
      })();
    `;
  }

  /**
   * Execute pruning and return results
   */
  public async extractPrunedDOM(
    cdpDebugger: Electron.Debugger,
    maxElements = 100
  ): Promise<{ elements: PrunedElement[]; stats: { total: number; pruned: number } }> {
    try {
      // Ensure debugger is attached
      if (!cdpDebugger.isAttached()) {
        console.warn('⚠️ Debugger not attached for DOM pruning, attaching now...');
        try {
          cdpDebugger.attach('1.3');
          await cdpDebugger.sendCommand('Runtime.enable');
          await cdpDebugger.sendCommand('DOM.enable');
        } catch (attachError) {
          console.error('Failed to attach debugger for DOM pruning:', attachError);
          return { elements: [], stats: { total: 0, pruned: 0 } };
        }
      }

      const script = this.generateExtractionScript(maxElements);
      
      const result = await cdpDebugger.sendCommand('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
        awaitPromise: false
      });

      if (result.result?.value) {
        const { elements, totalScanned, totalPruned } = result.result.value;
        
        return {
          elements: elements || [],
          stats: {
            total: totalScanned || 0,
            pruned: totalPruned || 0
          }
        };
      }

      return { elements: [], stats: { total: 0, pruned: 0 } };
    } catch (error) {
      console.error('❌ DOM pruning failed:', error);
      return { elements: [], stats: { total: 0, pruned: 0 } };
    }
  }

  /**
   * Update pruning strategy
   */
  public updateStrategy(newStrategy: Partial<PruningStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
  }

  /**
   * Get current strategy
   */
  public getStrategy(): PruningStrategy {
    return { ...this.strategy };
  }
}

