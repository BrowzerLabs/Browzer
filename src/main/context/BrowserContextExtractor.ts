import { WebContentsView } from 'electron';

import {
  BrowserContext,
  ContextExtractionOptions,
  ContextExtractionResult,
  DOMContext,
} from '@/shared/types/context';

export class BrowserContextExtractor {
  private view: WebContentsView 
  constructor(view: WebContentsView) {
    this.view = view;
  }

  public setView(view: WebContentsView): void {
    this.view = view;
  }

  /**
   * Extract browser context
   */
  public async extractContext(
    options: ContextExtractionOptions
  ): Promise<ContextExtractionResult> {
    const startTime = Date.now();

    if (!this.view) {
      return {
        success: false,
        error: 'No WebContentsView set',
        duration: Date.now() - startTime,
      };
    }

    try {
      console.log('[ContextExtractor] 📊 Starting context extraction');

      const result = await this.executeExtractionScript(options);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Context extraction failed',
          duration: Date.now() - startTime,
        };
      }

      const url = this.view.webContents.getURL();
      const title = this.view.webContents.getTitle();

      const context: BrowserContext = {
        extractedAt: Date.now(),
        tabId: options.tabId,
        url,
        title,
        dom: result.dom!,
      };

      const duration = Date.now() - startTime;
      console.log(
        `[ContextExtractor] ✅ Context extracted in ${duration}ms - ${result.dom!.stats.interactiveElements} elements`
      );

      return {
        success: true,
        context,
        duration,
      };
    } catch (error) {
      console.error('[ContextExtractor] ❌ Extraction failed:', error);
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * UNIFIED SCRIPT: Scroll + Extract in ONE browser execution
   */
  private async executeExtractionScript(
    options: ContextExtractionOptions
  ): Promise<{
    success: boolean;
    error?: string;
    dom?: DOMContext;
  }> {
    try {
      const script = `
        (async function() {
          // ============================================================================
          // CONFIGURATION
          // ============================================================================
          const full = ${JSON.stringify(options.full || false)};
          const scrollTo = ${JSON.stringify(options.scrollTo || 'current')};
          const elementTags = ${JSON.stringify(options.elementTags || null)};
          const maxElements = ${JSON.stringify(options.maxElements || 200)};
          
          console.log('[ContextExtract] 🔍 Config:', { full, scrollTo, elementTags, maxElements });
          
          // ============================================================================
          // STEP 1: HANDLE SCROLLING
          // ============================================================================
          if (!full) {
            if (scrollTo === 'top') {
              window.scrollTo({ top: 0, behavior: 'auto' });
              console.log('[ContextExtract] ⬆️ Scrolled to top');
              await new Promise(resolve => setTimeout(resolve, 500));
            } else if (scrollTo === 'bottom') {
              window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
              console.log('[ContextExtract] ⬇️ Scrolled to bottom');
              await new Promise(resolve => setTimeout(resolve, 500));
            } else if (typeof scrollTo === 'number') {
              window.scrollTo({ top: scrollTo, behavior: 'auto' });
              console.log('[ContextExtract] 📍 Scrolled to position:', scrollTo);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            // 'current' = do nothing, stay at current scroll position
          }
          
          // ============================================================================
          // STEP 2: FIND INTERACTIVE ELEMENTS
          // ============================================================================
          const interactiveSelectors = [
            'button',
            'a[href]',
            'input',
            'textarea',
            'select',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
            '[role="searchbox"]',
            '[role="combobox"]',
            '[role="checkbox"]',
            '[role="radio"]',
            '[role="tab"]',
            '[role="menuitem"]',
            '[contenteditable="true"]',
            '[onclick]',
            '[tabindex]'
          ];
          
          let candidates = Array.from(document.querySelectorAll(interactiveSelectors.join(', ')));
          console.log('[ContextExtract] Found', candidates.length, 'interactive elements');
          
          // Filter by element tags if specified
          if (elementTags && elementTags.length > 0) {
            const upperTags = elementTags.map(t => t.toUpperCase());
            candidates = candidates.filter(el => upperTags.includes(el.tagName));
            console.log('[ContextExtract] After tag filter:', candidates.length, 'elements');
          }
          
          // ============================================================================
          // STEP 3: FILTER BASED ON EXTRACTION MODE
          // ============================================================================
          let visibleElements = [];
          
          if (full) {
            // Full page: extract ALL elements (visible or not)
            visibleElements = candidates;
            console.log('[ContextExtract] 📄 Full page mode: extracting all', visibleElements.length, 'elements');
          } else {
            // Viewport mode: only extract visible elements
            visibleElements = candidates.filter(el => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              
              // Check if element is visible
              const isVisible = rect.width > 0 && 
                               rect.height > 0 && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden' &&
                               style.opacity !== '0';
              
              if (!isVisible) return false;
              
              // Check if element is in viewport
              const isInViewport = rect.top >= -100 && // Allow 100px above viewport
                                  rect.left >= -100 && // Allow 100px left of viewport
                                  rect.bottom <= window.innerHeight + 100 && // Allow 100px below viewport
                                  rect.right <= window.innerWidth + 100; // Allow 100px right of viewport
              
              return isInViewport;
            });
            console.log('[ContextExtract] 👁️ Viewport mode: found', visibleElements.length, 'visible elements');
          }
          
          // Limit to maxElements
          if (visibleElements.length > maxElements) {
            visibleElements = visibleElements.slice(0, maxElements);
            console.log('[ContextExtract] ⚠️ Limited to', maxElements, 'elements');
          }
          
          // ============================================================================
          // STEP 4: EXTRACT ELEMENT DETAILS
          // ============================================================================
          const interactiveElements = visibleElements.map((el, index) => {
            const rect = el.getBoundingClientRect();
            
            // Generate selector
            let selector = el.tagName.toLowerCase();
            if (el.id && !el.id.match(/^(:r[0-9a-z]+:|mui-|mat-)/)) {
              selector = '#' + el.id;
            } else if (el.getAttribute('data-testid')) {
              selector = '[data-testid="' + el.getAttribute('data-testid') + '"]';
            } else if (el.getAttribute('name')) {
              selector = el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
            } else if (el.className && typeof el.className === 'string') {
              const classes = el.className.trim().split(/\\s+/)
                .filter(c => c && !c.match(/^(ng-|_|css-|active|focus|hover)/))
                .slice(0, 2);
              if (classes.length > 0) {
                selector = el.tagName.toLowerCase() + '.' + classes.join('.');
              }
            }
            
            // Collect all attributes
            const attributes = {};
            for (const attr of el.attributes) {
              attributes[attr.name] = attr.value;
            }
            
            // Extract text content
            let text = '';
            if (el.innerText) {
              text = el.innerText.trim().substring(0, 200);
            } else if (el.textContent) {
              text = el.textContent.trim().substring(0, 200);
            }
            
            return {
              selector,
              tagName: el.tagName,
              role: el.getAttribute('role') || undefined,
              ariaLabel: el.getAttribute('aria-label') || undefined,
              ariaDescription: el.getAttribute('aria-description') || undefined,
              title: el.getAttribute('title') || undefined,
              placeholder: el.getAttribute('placeholder') || undefined,
              text: text || undefined,
              value: el.value || undefined,
              boundingBox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },
              isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true' || false,
              attributes
            };
          });
          
          // ============================================================================
          // STEP 5: EXTRACT FORMS (only if elementTags is empty OR contains 'FORM')
          // ============================================================================
          let forms = [];
          
          // Only extract forms if:
          // 1. elementTags is not provided (null/undefined) - extract everything
          // 2. elementTags is empty array - extract everything  
          // 3. elementTags contains 'FORM' - specifically requested
          const shouldExtractForms = !elementTags || elementTags.length === 0 || 
                                     elementTags.map(t => t.toUpperCase()).includes('FORM');
          
          if (shouldExtractForms) {
            forms = Array.from(document.querySelectorAll('form')).map(form => {
              const fields = Array.from(form.querySelectorAll('input, textarea, select')).map(field => {
                // Find associated label
                let label = '';
                if (field.id) {
                  const labelEl = document.querySelector('label[for="' + field.id + '"]');
                  if (labelEl) label = labelEl.textContent?.trim() || '';
                }
                if (!label && field.parentElement?.tagName === 'LABEL') {
                  label = field.parentElement.textContent?.trim() || '';
                }
                
                return {
                  name: field.getAttribute('name') || '',
                  type: field.getAttribute('type') || field.tagName.toLowerCase(),
                  label: label || undefined,
                  required: field.hasAttribute('required') || field.getAttribute('aria-required') === 'true',
                  selector: field.id ? '#' + field.id : (field.getAttribute('name') ? '[name="' + field.getAttribute('name') + '"]' : '')
                };
              });
              
              return {
                action: form.getAttribute('action') || undefined,
                method: form.getAttribute('method') || undefined,
                selector: form.id ? '#' + form.id : 'form',
                fields
              };
            });
            console.log('[ContextExtract] 📝 Extracted', forms.length, 'forms');
          } else {
            console.log('[ContextExtract] ⏭️ Skipping form extraction (FORM not in elementTags)');
          }
          
          // ============================================================================
          // STEP 6: RETURN STRUCTURED CONTEXT
          // ============================================================================
          const dom = {
            forms,
            allInteractiveElements: interactiveElements,
            stats: {
              totalElements: document.querySelectorAll('*').length,
              interactiveElements: interactiveElements.length,
              forms: forms.length
            }
          };
          
          console.log('[ContextExtract] ✅ Extraction complete:', dom.stats);
          return { success: true, dom };
          
        })();
      `;

      const result = await this.view!.webContents.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[ContextExtractor] ❌ Script execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
