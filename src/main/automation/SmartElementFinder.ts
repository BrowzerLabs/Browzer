/**
 * SmartElementFinder - Advanced element finding with fuzzy matching and fallbacks
 * 
 * This utility provides production-grade element finding capabilities:
 * - Supports CSS selectors, :contains() pseudo-class, and text-based search
 * - Fuzzy matching for partial text matches
 * - Multiple fallback strategies
 * - Visibility checking
 * - Similarity scoring for best match selection
 */

export interface FindElementOptions {
  selector: string;
  text?: string;
  fuzzyMatch?: boolean;
  timeout?: number;
  requireVisible?: boolean;
}

export interface ElementResult {
  found: boolean;
  selector?: string;
  element?: any;
  confidence?: number;
  strategy?: string;
  error?: string;
}

export class SmartElementFinder {
  /**
   * Generate JavaScript code for smart element finding
   * This code runs in the browser context
   */
  public static generateFinderScript(options: FindElementOptions): string {
    const { selector, text, fuzzyMatch = true, requireVisible = true } = options;
    
    return `
      (function() {
        const selector = ${JSON.stringify(selector)};
        const searchText = ${JSON.stringify(text || '')};
        const fuzzyMatch = ${fuzzyMatch};
        const requireVisible = ${requireVisible};
        
        // ============================================
        // HELPER FUNCTIONS
        // ============================================
        
        /**
         * Check if element is visible
         */
        function isVisible(element) {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && 
                 rect.height > 0 && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        }
        
        /**
         * Calculate text similarity (Levenshtein distance based)
         */
        function textSimilarity(str1, str2) {
          const s1 = str1.toLowerCase().trim();
          const s2 = str2.toLowerCase().trim();
          
          if (s1 === s2) return 1.0;
          if (s1.includes(s2) || s2.includes(s1)) return 0.8;
          
          // Simple fuzzy matching
          const words1 = s1.split(/\\s+/);
          const words2 = s2.split(/\\s+/);
          let matches = 0;
          
          for (const w1 of words1) {
            for (const w2 of words2) {
              if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
                matches++;
                break;
              }
            }
          }
          
          return matches / Math.max(words1.length, words2.length);
        }
        
        /**
         * Get element's visible text
         */
        function getElementText(element) {
          // For inputs, get value or placeholder
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            return element.value || element.placeholder || '';
          }
          // For buttons, prefer aria-label or textContent
          if (element.tagName === 'BUTTON') {
            return element.getAttribute('aria-label') || element.textContent || '';
          }
          return element.textContent || '';
        }
        
        /**
         * Score an element based on multiple factors
         */
        function scoreElement(element, targetText) {
          let score = 0;
          
          // Visibility check
          if (isVisible(element)) score += 0.3;
          
          // Text match
          if (targetText) {
            const elementText = getElementText(element);
            const similarity = textSimilarity(elementText, targetText);
            score += similarity * 0.5;
          } else {
            score += 0.5; // No text requirement
          }
          
          // Element type preference
          const tag = element.tagName.toLowerCase();
          if (tag === 'button' || tag === 'a') score += 0.1;
          if (element.getAttribute('role') === 'button') score += 0.1;
          
          return score;
        }
        
        // ============================================
        // STRATEGY 1: Direct CSS Selector
        // ============================================
        
        try {
          // Handle :contains() pseudo-class
          const containsMatch = selector.match(/^(.+):contains\\(['"](.+)['"]\\)$/);
          
          if (containsMatch) {
            const baseSelector = containsMatch[1];
            const searchText = containsMatch[2];
            
            const elements = document.querySelectorAll(baseSelector);
            let bestMatch = null;
            let bestScore = 0;
            
            for (const el of elements) {
              const text = getElementText(el);
              if (text.includes(searchText)) {
                const score = scoreElement(el, searchText);
                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = el;
                }
              }
            }
            
            if (bestMatch && (!requireVisible || isVisible(bestMatch))) {
              return {
                found: true,
                selector: baseSelector,
                confidence: bestScore,
                strategy: 'contains_match'
              };
            }
          } else {
            // Standard CSS selector
            const element = document.querySelector(selector);
            if (element && (!requireVisible || isVisible(element))) {
              return {
                found: true,
                selector: selector,
                confidence: 1.0,
                strategy: 'direct_selector'
              };
            }
          }
        } catch (e) {
          console.warn('[SmartFinder] Direct selector failed:', e);
        }
        
        // ============================================
        // STRATEGY 2: Attribute-based fallbacks
        // ============================================
        
        // Extract attributes from selector
        const idMatch = selector.match(/#([^.\\[\\s]+)/);
        const classMatch = selector.match(/\\.([^#\\[\\s]+)/);
        const typeMatch = selector.match(/\\[type=['"?]([^'"]]+)['"?]\\]/);
        
        const fallbackSelectors = [];
        
        if (idMatch) {
          fallbackSelectors.push('#' + idMatch[1]);
          fallbackSelectors.push('[id="' + idMatch[1] + '"]');
        }
        
        if (typeMatch) {
          fallbackSelectors.push('[type="' + typeMatch[1] + '"]');
          fallbackSelectors.push('input[type="' + typeMatch[1] + '"]');
          fallbackSelectors.push('button[type="' + typeMatch[1] + '"]');
        }
        
        if (classMatch) {
          fallbackSelectors.push('.' + classMatch[1]);
        }
        
        for (const fallback of fallbackSelectors) {
          try {
            const element = document.querySelector(fallback);
            if (element && (!requireVisible || isVisible(element))) {
              return {
                found: true,
                selector: fallback,
                confidence: 0.7,
                strategy: 'attribute_fallback'
              };
            }
          } catch (e) {}
        }
        
        // ============================================
        // STRATEGY 3: Type-based search with text matching
        // ============================================
        
        const typePatterns = {
          button: ['button', 'input[type="submit"]', 'input[type="button"]', '[role="button"]', 'a'],
          input: ['input', 'textarea', '[contenteditable="true"]'],
          link: ['a', '[role="link"]'],
          submit: ['button[type="submit"]', 'input[type="submit"]', 'button'],
        };
        
        // Determine element type from selector
        let elementType = 'button'; // default
        if (selector.includes('input')) elementType = 'input';
        if (selector.includes('textarea')) elementType = 'input';
        if (selector.includes('a') || selector.includes('link')) elementType = 'link';
        if (selector.includes('submit')) elementType = 'submit';
        
        const patterns = typePatterns[elementType] || typePatterns.button;
        
        for (const pattern of patterns) {
          try {
            const elements = document.querySelectorAll(pattern);
            let bestMatch = null;
            let bestScore = 0;
            
            for (const el of elements) {
              const score = scoreElement(el, searchText);
              if (score > bestScore && score > 0.3) {
                bestScore = score;
                bestMatch = el;
              }
            }
            
            if (bestMatch && (!requireVisible || isVisible(bestMatch))) {
              return {
                found: true,
                selector: pattern,
                confidence: bestScore,
                strategy: 'type_based_search'
              };
            }
          } catch (e) {}
        }
        
        // ============================================
        // STRATEGY 4: Full DOM search (last resort)
        // ============================================
        
        if (searchText || fuzzyMatch) {
          try {
            const allElements = document.querySelectorAll('button, a, input, textarea, [role="button"], [onclick]');
            let bestMatch = null;
            let bestScore = 0;
            
            for (const el of allElements) {
              const score = scoreElement(el, searchText);
              if (score > bestScore && score > 0.5) {
                bestScore = score;
                bestMatch = el;
              }
            }
            
            if (bestMatch && (!requireVisible || isVisible(bestMatch))) {
              const tag = bestMatch.tagName.toLowerCase();
              const id = bestMatch.id ? '#' + bestMatch.id : '';
              const cls = bestMatch.className ? '.' + bestMatch.className.split(' ')[0] : '';
              
              return {
                found: true,
                selector: tag + id + cls,
                confidence: bestScore,
                strategy: 'full_dom_search'
              };
            }
          } catch (e) {
            console.warn('[SmartFinder] Full DOM search failed:', e);
          }
        }
        
        // ============================================
        // NOT FOUND
        // ============================================
        
        return {
          found: false,
          error: 'Element not found with any strategy',
          confidence: 0
        };
      })();
    `;
  }
  
  /**
   * Parse selector to extract text hints
   */
  public static parseSelector(selector: string): { baseSelector: string; text?: string } {
    const containsMatch = selector.match(/^(.+):contains\(['"](.+)['"]\)$/);
    
    if (containsMatch) {
      return {
        baseSelector: containsMatch[1],
        text: containsMatch[2]
      };
    }
    
    return { baseSelector: selector };
  }
}
