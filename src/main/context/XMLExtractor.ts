import { WebContentsView } from 'electron';
import { XMLContextOptions, XMLContextResult } from '@/shared/types/context';

export class XMLExtractor {
  constructor(private view: WebContentsView) {}

  public async extractXMLContext(options: XMLContextOptions): Promise<XMLContextResult> {
    try {
      const result = await this.executeScript(options);
      return result;
    } catch (error) {
      return {
        error: (error as Error).message
      };
    }
  }

  private async executeScript(options: XMLContextOptions): Promise<XMLContextResult> {
    try {
      const script = `
        (function() {
          const viewport = ${JSON.stringify(options.viewport || 'current')};
          const tags = ${JSON.stringify(options.tags || [])};
          const maxElements = ${JSON.stringify(options.maxElements || 200)};
          const filterAttrs = ${JSON.stringify(options.attributes || {})};
          
          const IGNORE_ATTRS = new Set(['style', 'class', 'data-reactid', 'data-react-checksum', 'data-reactroot', 'data-focus-visible-added', 
          'data-state', 'data-radix-collection-item', 'tabindex', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed', 'aria-current', 
          'data-loading', 'data-hover', 'data-focus', 'data-active', 'data-highlighted', 'data-orientation', 'data-size', 'data-value', 'data-analytics-event', 
          'aria-labelledby', 'sandboxuid', 'spellcheck', 'autocomplete']);
          const IGNORE_VALUES = new Set(['', 'null', 'undefined', 'none', 'auto', 'inherit', 'initial', 'unset']);
          
          function buildAttrs(el) {
            const attrs = [];
            const rect = el.getBoundingClientRect();
            
            attrs.push('x="' + Math.round(rect.x) + '"');
            attrs.push('y="' + Math.round(rect.y) + '"');
            attrs.push('width="' + Math.round(rect.width) + '"');
            attrs.push('height="' + Math.round(rect.height) + '"');
            
            const PRIORITY_ATTRS = ['id', 'name', 'type', 'href', 'aria-label', 'data-testid', 'data-test-id', 'placeholder', 'value', 'role', 'title'];
            
            for (const attrName of PRIORITY_ATTRS) {
              if (attrs.length >= 14) break;
              const value = el.getAttribute(attrName);
              if (!value || IGNORE_ATTRS.has(attrName) || (value && IGNORE_VALUES.has(value?.toLowerCase()))) continue;
              
              let finalValue = value;
              if (attrName === 'href' && value.length > 100) finalValue = value.substring(0, 100);
              else if (value.length > 50) finalValue = value.substring(0, 50);
              
              attrs.push(attrName + '="' + finalValue.replace(/"/g, '&quot;') + '"');
            }
            
            if (attrs.length === 4) {
              let text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 40);
              if (text) attrs.push('text="' + text.replace(/"/g, '&quot;') + '"');
            }
            
            if (attrs.length < 14) {
              for (const attr of el.attributes) {
                if (attrs.length >= 14) break;
                const name = attr.name;
                const value = attr.value;
                if (PRIORITY_ATTRS.includes(name) || IGNORE_ATTRS.has(name) || IGNORE_VALUES.has(value) || !value || value.length > 100 || value.trim() === '') continue;
                if (name.startsWith('data-') || name.startsWith('js') || value.startsWith(':')) continue;
                attrs.push(name + '="' + value.replace(/"/g, '&quot;') + '"');
              }
            }
            
            return attrs.length > 0 ? attrs.join(' ') : null;
          }
          
          const interactiveSelectors = ['button', 'a[href]', 'input', 'textarea', 'select', '[role="button"]', '[role="link"]', '[role="textbox"]', 
          '[role="searchbox"]', '[role="combobox"]', '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="menuitem"]', '[contenteditable="true"]', 
          '[onclick]', '[tabindex]', 'form'];
          
          let selector;
          if (tags.length > 0) {
            selector = tags.map(t => t.toLowerCase()).join(', ');
          } else {
            selector = interactiveSelectors.join(', ');
          }
          
          let candidates = Array.from(document.querySelectorAll(selector));
          
          let elements = candidates.filter(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0.1;
            if (!isVisible) return false;
            
            if (viewport === 'current') {
              return rect.top >= -50 && rect.left >= -50 && rect.bottom <= window.innerHeight + 50 && rect.right <= window.innerWidth + 50;
            }
            return true;
          });
          
          if (Object.keys(filterAttrs).length > 0) {
            elements = elements.filter(el => {
              for (const [attr, value] of Object.entries(filterAttrs)) {
                if (el.getAttribute(attr) !== value) return false;
              }
              return true;
            });
          }
          
          const seen = new Set();
          const xmlElements = [];
          
          for (const el of elements) {
            if (xmlElements.length >= maxElements) break;
            if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
            
            const attrs = buildAttrs(el);
            if (!attrs || seen.has(attrs)) continue;
            seen.add(attrs);
            
            const tag = el.tagName.toLowerCase();
            xmlElements.push({ tag, attrs });
          }
          
          const parts = ['<page>', '  <url>' + window.location.href + '</url>', '  <title>' + document.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</title>', '  <elements>'];
          
          for (const { tag, attrs } of xmlElements) {
            parts.push('    <' + tag + ' ' + attrs + '/>');
          }
          
          parts.push('  </elements>', '</page>');
          return { xml: parts.join('\\n') };
          
        })();
      `;

      return await this.view.webContents.executeJavaScript(script);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
