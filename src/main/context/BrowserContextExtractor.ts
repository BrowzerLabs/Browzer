/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from 'electron';
import {
  BrowserContext,
  ContextExtractionOptions,
  ContextExtractionResult,
  DOMContext,
} from '@/shared/types/context';

export class BrowserContextExtractor {
  private view: WebContentsView | null = null;
  private debugger: Electron.Debugger | null = null;

  constructor(view?: WebContentsView) {
    if (view) {
      this.setView(view);
    }
  }

  public setView(view: WebContentsView): void {
    this.view = view;
    this.debugger = view.webContents.debugger;
  }

  /**
   * Extract complete browser context
   */
  public async extractContext(
    tabId: string,
    options: ContextExtractionOptions = {}
  ): Promise<ContextExtractionResult> {
    const startTime = Date.now();

    // Default options - optimized for minimal context
    const opts: Required<ContextExtractionOptions> = {
      includeDOM: options.includeDOM ?? true,
      maxInteractiveElements: options.maxInteractiveElements ?? 200,
      timeout: options.timeout ?? 10000
    };

    if (!this.view) {
      return {
        success: false,
        error: 'No WebContentsView set',
        duration: Date.now() - startTime
      };
    }

    try {

      // Extract only DOM context (optimized)
      const dom = opts.includeDOM ? await this.extractDOMContext(opts) : null;

      // Get basic page info
      const url = this.view.webContents.getURL();
      const title = this.view.webContents.getTitle();

      const context: BrowserContext = {
        extractedAt: Date.now(),
        tabId,
        url,
        title,
        dom: dom as DOMContext,
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Browser context extracted in ${duration}ms`);

      return {
        success: true,
        context,
        duration
      };

    } catch (error) {
      console.error('Failed to extract browser context:', error);

      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Extract DOM context with semantic annotations
   */
  private async extractDOMContext(options: Required<ContextExtractionOptions>): Promise<DOMContext> {
    if (!this.debugger) throw new Error('Debugger not initialized');

    // Get document to ensure DOM is ready
    await this.debugger.sendCommand('DOM.getDocument', { depth: -1 });

    // Execute script to extract DOM information
    const script = this.generateDOMExtractionScript(options);
    const result = await this.debugger.sendCommand('Runtime.evaluate', {
      expression: script,
      returnByValue: true,
      awaitPromise: true
    });

    if (result.exceptionDetails) {
      throw new Error(`DOM extraction failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value as DOMContext;
  }

  public async extractSmartContext(
    tabId: string,
    full = false,
    scrollTo?: 'current' | 'top' | 'bottom' | number | { element: string; backupSelectors?: string[] },
    maxElements = 200
  ): Promise<ContextExtractionResult> {
    const startTime = Date.now();

    try {

      let dom: DOMContext;

      if (full) {
        // Extract full page context (all elements)
        console.log('[Context] Extracting FULL page context...');
        dom = await this.extractDOMContext({ 
          includeDOM: true, 
          maxInteractiveElements: maxElements, 
          timeout: 10000 
        });
      } else {
        // Extract viewport context only
        console.log('[Context] Extracting VIEWPORT context...');
        
        // Perform scroll if requested
        if (scrollTo && scrollTo !== 'current') {
          await this.performScroll(scrollTo);
          
          // Wait for scroll animations and lazy-loaded content
          await this.sleep(2000);
        }

        // Extract viewport-specific DOM context
        dom = await this.extractViewportDOMContext(maxElements);
      }

      // Get basic page info
      const url = this.view.webContents.getURL();
      const title = this.view.webContents.getTitle();

      const context: BrowserContext = {
        extractedAt: Date.now(),
        tabId,
        url,
        title,
        dom: dom as DOMContext,
      };

      const duration = Date.now() - startTime;
      const contextType = full ? 'FULL' : 'VIEWPORT';
      console.log(`✅ ${contextType} context extracted in ${duration}ms (${dom.stats.interactiveElements} elements)`);

      return {
        success: true,
        context,
        duration
      };

    } catch (error) {
      console.error('Failed to extract context:', error);

      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Perform smooth scroll to specified position
   */
  private async performScroll(
    scrollTo: 'top' | 'bottom' | number | { element: string; backupSelectors?: string[] }
  ): Promise<void> {
    if (!this.view) throw new Error('No view available');

    if (scrollTo === 'top') {
      // Scroll to top
      await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: 0, behavior: 'smooth' });
      `);
    } else if (scrollTo === 'bottom') {
      // Scroll to bottom
      await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      `);
    } else if (typeof scrollTo === 'number') {
      // Scroll to specific Y position
      await this.view.webContents.executeJavaScript(`
        window.scrollTo({ top: ${scrollTo}, behavior: 'smooth' });
      `);
    } else if (typeof scrollTo === 'object' && scrollTo.element) {
      // Scroll element into view
      const selectors = [scrollTo.element, ...(scrollTo.backupSelectors || [])];
      const script = `
        (function() {
          const selectors = ${JSON.stringify(selectors)};
          
          for (const selector of selectors) {
            try {
              const element = document.querySelector(selector);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return { success: true, usedSelector: selector };
              }
            } catch (e) {
              continue;
            }
          }
          
          return { success: false, error: 'Element not found with any selector' };
        })();
      `;
      
      const result = await this.view.webContents.executeJavaScript(script);
      if (!result.success) {
        throw new Error(result.error || 'Failed to scroll to element');
      }
      
      console.log(`✅ Scrolled to element: ${result.usedSelector}`);
    }
  }

  /**
   * Extract DOM context for viewport only (extended viewport - includes partially visible)
   */
  private async extractViewportDOMContext(maxElements: number): Promise<DOMContext> {
    if (!this.debugger) throw new Error('Debugger not initialized');

    // Get document to ensure DOM is ready
    await this.debugger.sendCommand('DOM.getDocument', { depth: -1 });

    // Execute script to extract viewport-specific DOM information
    const script = this.generateViewportDOMExtractionScript(maxElements);
    const result = await this.debugger.sendCommand('Runtime.evaluate', {
      expression: script,
      returnByValue: true,
      awaitPromise: true
    });

    if (result.exceptionDetails) {
      throw new Error(`Viewport DOM extraction failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value as DOMContext;
  }

  /**
   * Generate script for viewport-based DOM extraction
   * Extended viewport mode: includes elements within 100px of viewport edges
   */
  private generateViewportDOMExtractionScript(maxElements: number): string {
    return `
      (async function() {
        const maxElements = ${maxElements};
        
        // Get viewport bounds with extended range (100px buffer)
        const viewportBounds = {
          top: window.scrollY,
          bottom: window.scrollY + window.innerHeight,
          left: window.scrollX,
          right: window.scrollX + window.innerWidth
        };
        
        // Helper: Check if element is visible
        function isVisible(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 rect.width > 0 && 
                 rect.height > 0;
        }
        
        // Helper: Check if element is in extended viewport
        function isInViewport(el) {
          const rect = el.getBoundingClientRect();
          const absoluteTop = rect.top + window.scrollY;
          const absoluteBottom = rect.bottom + window.scrollY;
          const absoluteLeft = rect.left + window.scrollX;
          const absoluteRight = rect.right + window.scrollX;
          
          // Check if element intersects with extended viewport bounds
          return !(absoluteBottom < viewportBounds.top || 
                   absoluteTop > viewportBounds.bottom ||
                   absoluteRight < viewportBounds.left ||
                   absoluteLeft > viewportBounds.right);
        }
        
        // Helper: Generate selector
        function getSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          if (el.hasAttribute('data-testid')) {
            return '[data-testid="' + el.getAttribute('data-testid') + '"]';
          }
          
          let path = [];
          let current = el;
          while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
            let selector = current.nodeName.toLowerCase();
            if (current.id) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_)/))
                .slice(0, 2)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) selector += '.' + classes;
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }
        
        // Helper: Extract interactive element info
        function extractInteractiveElement(el) {
          const rect = el.getBoundingClientRect();
          
          // Collect all attributes
          const attributes = {};
          for (const attr of el.attributes) {
            attributes[attr.name] = attr.value;
          }
          
          return {
            selector: getSelector(el),
            tagName: el.tagName,
            text: (el.innerText || el.textContent || '').substring(0, 200).trim() || undefined,
            boundingBox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            parentSelector: el.parentElement ? getSelector(el.parentElement) : undefined,
            isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
            attributes
          };
        }
        
        // Extract forms in viewport
        const forms = Array.from(document.querySelectorAll('form'))
          .filter(el => isVisible(el) && isInViewport(el))
          .slice(0, 50)
          .map(form => ({
            action: form.action || undefined,
            method: form.method || undefined,
            selector: getSelector(form),
            fields: Array.from(form.elements)
              .filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
              .filter(el => isVisible(el) && isInViewport(el))
              .slice(0, 50)
              .map(extractInteractiveElement)
          }));
        
        // Extract ALL interactive elements in viewport
        const seenSelectors = new Set();
        const allInteractive = [];
        
        const interactiveSelectors = [
          'button',
          'a[href]',
          'input',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="tab"]',
          '[role="menuitem"]',
          '[onclick]',
          '[tabindex]'
        ];
        
        for (const selector of interactiveSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (!isVisible(el) || !isInViewport(el)) continue;
            
            const elSelector = getSelector(el);
            if (seenSelectors.has(elSelector)) continue;
            
            seenSelectors.add(elSelector);
            allInteractive.push(extractInteractiveElement(el));
            
            if (allInteractive.length >= maxElements) break;
          }
          if (allInteractive.length >= maxElements) break;
        }
        
        // Statistics
        const stats = {
          totalElements: document.querySelectorAll('*').length,
          interactiveElements: allInteractive.length,
          forms: forms.length
        };
        
        // Add viewport info to help LLM understand context
        const viewportInfo = {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollY: window.scrollY,
          scrollX: window.scrollX,
          maxScrollY: document.documentElement.scrollHeight - window.innerHeight,
          maxScrollX: document.documentElement.scrollWidth - window.innerWidth
        };
        
        return {
          forms,
          allInteractiveElements: allInteractive,
          stats,
          viewport: viewportInfo
        };
      })();
    `;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate script for DOM extraction (optimized for minimal context)
   */
  private generateDOMExtractionScript(options: Required<ContextExtractionOptions>): string {
    return `
      (async function() {
        const maxElements = ${options.maxInteractiveElements};
        
        // Helper: Check if element is visible (ALWAYS check, never include hidden)
        function isVisible(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 rect.width > 0 && 
                 rect.height > 0;
        }
        
        // Helper: Generate selector
        function getSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          if (el.hasAttribute('data-testid')) {
            return '[data-testid="' + el.getAttribute('data-testid') + '"]';
          }
          
          let path = [];
          let current = el;
          while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
            let selector = current.nodeName.toLowerCase();
            if (current.id) {
              selector += '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            if (current.className && typeof current.className === 'string') {
              const classes = current.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_)/))
                .slice(0, 2)
                .map(c => CSS.escape(c))
                .join('.');
              if (classes) selector += '.' + classes;
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }
        
        // Helper: Get nearby text for context
        function getNearbyText(el) {
          const parent = el.parentElement;
          if (!parent) return '';
          const text = parent.innerText || '';
          return text.substring(0, 100).trim();
        }
        
        // Helper: Extract interactive element info (OPTIMIZED - only essential fields)
        function extractInteractiveElement(el) {
          const rect = el.getBoundingClientRect();
          
          // Collect all attributes
          const attributes = {};
          for (const attr of el.attributes) {
            attributes[attr.name] = attr.value;
          }
          
          // Only include essential fields
          return {
            selector: getSelector(el),
            tagName: el.tagName,
            text: (el.innerText || el.textContent || '').substring(0, 200).trim() || undefined,
            boundingBox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            parentSelector: el.parentElement ? getSelector(el.parentElement) : undefined,
            isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
            attributes
          };
        }
        
        // Extract forms (critical for automation)
        const forms = Array.from(document.querySelectorAll('form'))
          .filter(isVisible)
          .slice(0, 50)
          .map(form => ({
            action: form.action || undefined,
            method: form.method || undefined,
            selector: getSelector(form),
            fields: Array.from(form.elements)
              .filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
              .filter(isVisible)
              .slice(0, 50)
              .map(extractInteractiveElement)
          }));
        
        // Extract ALL interactive elements (NO DUPLICATES - single source of truth)
        // This includes buttons, inputs, links, selects, and any clickable elements
        const seenSelectors = new Set();
        const allInteractive = [];
        
        // Query all potentially interactive elements
        const interactiveSelectors = [
          'button',
          'a[href]',
          'input',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="tab"]',
          '[role="menuitem"]',
          '[onclick]',
          '[tabindex]'
        ];
        
        for (const selector of interactiveSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (!isVisible(el)) continue;
            
            const elSelector = getSelector(el);
            if (seenSelectors.has(elSelector)) continue;
            
            seenSelectors.add(elSelector);
            allInteractive.push(extractInteractiveElement(el));
            
            if (allInteractive.length >= maxElements) break;
          }
          if (allInteractive.length >= maxElements) break;
        }
        
        // Statistics
        const stats = {
          totalElements: document.querySelectorAll('*').length,
          interactiveElements: allInteractive.length,
          forms: forms.length
        };
        
        return {
          forms,
          allInteractiveElements: allInteractive,
          stats
        };
      })();
    `;
  }


}
