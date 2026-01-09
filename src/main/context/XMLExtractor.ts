import { WebContentsView } from 'electron';
import { XMLContextOptions, XMLContextResult } from '@/shared/types/context';
import { escapeXml } from '@/shared/utils';

export class XMLExtractor {
  constructor(private view: WebContentsView) {}

  public async extractXMLContext(
    options: XMLContextOptions
  ): Promise<XMLContextResult> {
    return await this.executeScript(options);
  }

  private async executeScript(
    options: XMLContextOptions
  ): Promise<XMLContextResult> {
    try {
      const cdp = this.view.webContents.debugger;
      const { root } = await cdp.sendCommand('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });

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
        '[tabindex]',
        'form',
        'svg',
        'path',
      ];

      let selector: string;
      if (options.tags && options.tags.length > 0) {
        selector = options.tags.join(', ');
      } else {
        selector = interactiveSelectors.join(', ');
      }

      const { nodeIds } = await cdp.sendCommand('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector,
      });

      const maxElements = options.maxElements ?? 200;
      const xmlElements: Array<{ tag: string; attrs: string }> = [];

      for (const nodeId of nodeIds) {
        if (xmlElements.length >= maxElements) break;

        try {
          const elementData = await this.buildElementWithCDP(
            cdp,
            nodeId,
            options
          );

          if (elementData) {
            xmlElements.push(elementData);
          }
        } catch (error) {
          console.warn(
            `[XMLExtractor] Failed to process node ${nodeId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      const url = this.view.webContents.getURL();
      const title = this.view.webContents.getTitle();

      const parts = [
        '<page>',
        `  <url>${escapeXml(url)}</url>`,
        `  <title>${escapeXml(title)}</title>`,
        '  <elements>',
      ];

      for (const { tag, attrs } of xmlElements) {
        parts.push(`    <${tag} ${attrs}/>`);
      }

      parts.push('  </elements>', '</page>');

      return { xml: parts.join('\n') };
    } catch (error) {
      console.error('[XMLExtractor] Error:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async buildElementWithCDP(
    cdp: Electron.Debugger,
    nodeId: number,
    options: XMLContextOptions
  ): Promise<{ tag: string; attrs: string } | null> {
    try {
      const { model } = await cdp.sendCommand('DOM.getBoxModel', {
        nodeId,
      });

      if (!model || !model.content || model.content.length < 8) {
        return null;
      }

      const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content;
      const x = Math.min(x1, x2, x3, x4);
      const y = Math.min(y1, y2, y3, y4);
      const width = Math.max(x1, x2, x3, x4) - x;
      const height = Math.max(y1, y2, y3, y4) - y;

      if (width <= 0 || height <= 0) {
        return null;
      }

      const { node } = await cdp.sendCommand('DOM.describeNode', {
        nodeId,
      });
      if (!node) return null;

      const IGNORE_ATTRS = new Set([
        'style',
        'class',
        'data-reactid',
        'data-react-checksum',
        'data-reactroot',
        'data-focus-visible-added',
        'data-state',
        'data-radix-collection-item',
        'tabindex',
        'aria-expanded',
        'aria-selected',
        'aria-checked',
        'aria-pressed',
        'aria-current',
        'data-loading',
        'data-hover',
        'data-focus',
        'data-active',
        'data-highlighted',
        'data-orientation',
        'data-size',
        'data-value',
        'data-analytics-event',
        'aria-labelledby',
        'sandboxuid',
        'spellcheck',
        'autocomplete',
      ]);
      const IGNORE_VALUES = new Set([
        '',
        'null',
        'undefined',
        'none',
        'auto',
        'inherit',
        'initial',
        'unset',
      ]);

      const attrs: string[] = [];

      attrs.push(`nodeId="${nodeId}"`);
      // attrs.push(`cdp_backend_node_id="${node.backendNodeId}"`);
      attrs.push(`x="${Math.round(x)}"`);
      attrs.push(`y="${Math.round(y)}"`);
      attrs.push(`width="${Math.round(width)}"`);
      attrs.push(`height="${Math.round(height)}"`);

      const PRIORITY_ATTRS = [
        'id',
        'name',
        'type',
        'href',
        'aria-label',
        'aria-describedby',
        'data-testid',
        'data-test-id',
        'placeholder',
        'value',
        'role',
        'title',
        'alt',
      ];

      const nodeAttrs: Record<string, string> = {};
      if (node.attributes) {
        for (let i = 0; i < node.attributes.length; i += 2) {
          const key = node.attributes[i];
          const value = node.attributes[i + 1];
          if (key && value !== undefined) {
            nodeAttrs[key] = value;
          }
        }
      }

      const isDisabled = nodeAttrs['disabled'] || nodeAttrs['aria-disabled'];
      if (isDisabled) return null;

      for (const attrName of PRIORITY_ATTRS) {
        if (attrs.length >= 20) break;
        const value = nodeAttrs[attrName];
        if (
          !value ||
          IGNORE_ATTRS.has(attrName) ||
          IGNORE_VALUES.has(value?.toLowerCase())
        )
          continue;

        let finalValue = value;
        if (attrName === 'href' && value.length > 100)
          finalValue = value.substring(0, 100);
        else if (value.length > 50) finalValue = value.substring(0, 50);

        const escapedValue = finalValue
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        attrs.push(`${attrName}="${escapedValue}"`);
      }

      const { object } = await cdp.sendCommand('DOM.resolveNode', {
        nodeId,
      });

      let text: string | undefined;
      if (object && object.objectId) {
        try {
          const textResult = await cdp.sendCommand('Runtime.callFunctionOn', {
            objectId: object.objectId,
            functionDeclaration: `
              function() {
                let text = (this.innerText || '').trim().replace(/\\s+/g, ' ');
                if (!text) text = (this.textContent || '').trim().replace(/\\s+/g, ' ');
                if (!text) text = this.getAttribute('aria-label') || '';
                if (!text) text = this.title || '';
                if (!text) text = this.getAttribute('placeholder') || '';
                if (!text && this.value) text = this.value;
                return text.substring(0, 60);
              }
            `,
            returnByValue: true,
          });

          if (textResult.result && textResult.result.value) {
            text = String(textResult.result.value).trim();
            if (text.length > 0) {
              attrs.push(`text="${escapeXml(text)}"`);
            }
          }
        } catch (e) {
          console.error('[XMLExtractor] Text extraction error:', e);
        } finally {
          await cdp.sendCommand('Runtime.releaseObject', {
            objectId: object.objectId,
          });
        }
      }

      if (attrs.length < 20) {
        for (const [name, value] of Object.entries(nodeAttrs)) {
          if (attrs.length >= 20) break;
          if (
            PRIORITY_ATTRS.includes(name) ||
            IGNORE_ATTRS.has(name) ||
            IGNORE_VALUES.has(value) ||
            !value ||
            value.length > 100 ||
            value.trim() === ''
          )
            continue;
          if (name.startsWith('data-') || name.startsWith('js')) continue;
          attrs.push(`${name}="${escapeXml(value)}"`);
        }
      }

      if (options.attributes) {
        const matchesFilter = Object.entries(options.attributes).every(
          ([key, value]) => nodeAttrs[key] === value
        );
        if (!matchesFilter) return null;
      }

      const tag = node.nodeName.toLowerCase();
      return { tag, attrs: attrs.join(' ') };
    } catch (error) {
      return null;
    }
  }
}
