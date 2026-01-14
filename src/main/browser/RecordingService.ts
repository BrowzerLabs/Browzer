import { Debugger } from 'electron';
import { EventEmitter } from 'events';
import type { AXNode, RecordingEvent, Tab } from './types';

const CLICK_MARKER = '__browzer_click__';
const KEY_MARKER = '__browzer_key__';

export class RecordingService extends EventEmitter {
  public async enableClickTracking(tab: Tab): Promise<void> {
    try {
      const cdp = tab.view.webContents.debugger;
      const script = this.getRecordingScript();

      await cdp.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: script,
      });
      await cdp.sendCommand('Runtime.evaluate', {
        expression: script,
        includeCommandLineAPI: false,
      });

      const consoleHandler = this.createConsoleHandler(tab, cdp);
      tab.clickTrackingHandler = consoleHandler;
      cdp.on('message', consoleHandler);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to enable click tracking for tab ${tab.id}:`, err);
      this.emit('error', tab.id, err);
      throw err;
    }
  }

  public async disableClickTracking(tab: Tab): Promise<void> {
    try {
      const cdp = tab.view.webContents.debugger;
      cdp.removeListener('message', tab.clickTrackingHandler);
      tab.clickTrackingHandler = undefined;
      console.info(`Click tracking disabled for tab ${tab.id}`);
      this.emit('tracking-disabled', tab.id);
    } catch (error) {
      console.error(error)
    }
  }

  private getRecordingScript(): string {
    return `
      if (!window.__browzer) {
        window.__browzer = true;
        window.__browzerRecordingEvent = null;
        window._click_data = null;
        window._key_data = null;
        
        function getElementText(el) {
          if (!el) return '';

          const title = el.getAttribute('title') || el.getAttribute('name') || el.getAttribute('aria-label');
          if (title) return title.trim().substring(0, 250);

          const id = el.getAttribute('id');
          if (id) {
            const label = document.querySelector(\`label[for="\${id}"]\`);
            if (label) {
              const labelText = label.textContent?.trim() || label.innerText?.trim();
              if (labelText) return labelText.replace(/\\\\s+/g, ' ').substring(0, 250);
            }
          }

          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const ids = ariaLabelledBy.split(' ').filter(id => id.trim());
            const texts = ids.map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
            if (texts.length > 0) return texts.join(' ').replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          const ariaDescribedBy = el.getAttribute('aria-describedby');
          if (ariaDescribedBy) {
            const ids = ariaDescribedBy.split(' ').filter(id => id.trim());
            const texts = ids.map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
            if (texts.length > 0) return texts.join(' ').replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          const parentLabel = el.closest('label');
          if (parentLabel) {
            const labelText = parentLabel.textContent?.trim() || parentLabel.innerText?.trim();
            if (labelText) return labelText.replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          const tag = el.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            let parent = el.parentElement;
            let depth = 0;
            while (parent && depth < 3) {
              const labelInParent = parent.querySelector('label');
              if (labelInParent) {
                const labelText = labelInParent.textContent?.trim();
                if (labelText) return labelText.replace(/\\\\s+/g, ' ').substring(0, 250);
              }
              
              const prevSibling = parent.previousElementSibling;
              if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.querySelector('label'))) {
                const labelText = prevSibling.textContent?.trim();
                if (labelText) return labelText.replace(/\\\\s+/g, ' ').substring(0, 250);
              }
              
              parent = parent.parentElement;
              depth++;
            }
            
            if (tag === 'INPUT') {
              const placeholder = el.placeholder;
              if (placeholder) return placeholder.substring(0, 250);
            }
            
            return '';
          }
          
          const img = el.querySelector('img');
          if (img?.alt) return img.alt.trim().substring(0, 250);
          
          if (tag === 'BUTTON' || tag === 'A') {
            let text = '';
            for (const node of el.childNodes) {
              if (node.nodeType === 3) text += node.textContent;
              else if (node.nodeType === 1 && node.tagName !== 'SVG') {
                text += node.innerText || '';
              }
            }
            if (text.trim()) return text.trim().replace(/\\\\s+/g, ' ').substring(0, 250);
          } else {
            const text = el.innerText?.trim() || el.textContent?.trim() || '';
            if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          const className = el.className?.baseVal || el.className || '';
          const iconMatch = className.match(/fa-([a-z0-9-]+)|bi-([a-z0-9-]+)|icon-([a-z0-9-]+)/i);
          if (iconMatch) {
            const iconName = (iconMatch[1] || iconMatch[2] || iconMatch[3]).replace(/-/g, ' ');
            return iconName.charAt(0).toUpperCase() + iconName.slice(1);
          }
          
          return '';
        }
        
        function getElementValue(el) {
          if (!el) return '';
          const tag = el.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') {
            return (el.value || '').substring(0, 250);
          } else if (tag === 'SELECT') {
            return (el.options[el.selectedIndex]?.text || '').substring(0, 250);
          }
          return '';
        }
        
        function getElementRole(el) {
          if (!el) return 'generic';
          const role = el.getAttribute('role');
          if (role) return role;
          
          const tag = el.tagName.toLowerCase();
          const type = el.getAttribute('type')?.toLowerCase();
          
          const roleMap = {
            'button': 'button',
            'a': 'link',
            'textarea': 'textbox',
            'select': 'combobox',
            'img': 'image',
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
            'table': 'table',
            'tr': 'row',
            'td': 'cell',
            'th': 'columnheader',
            'option': 'option'
          };
          
          if (tag === 'input') {
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            if (type === 'search') return 'searchbox';
            if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
            return 'textbox';
          }
          
          return roleMap[tag] || tag;
        }
        
        function findBestElement(el) {
          if (!el) return null;
          const tag = el.tagName;
          const svgTags = ['PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'G', 'SVG'];
          
          if (svgTags.includes(tag)) {
            const interactive = el.closest('button, a, [role="button"], [role="link"]');
            if (interactive) return interactive;
            const svg = tag === 'SVG' ? el : el.closest('svg');
            if (svg?.parentElement) return svg.parentElement;
          }
          
          const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
          const interactiveRoles = [
            'button', 'link', 'menuitem', 'menuitemradio', 'menuitemcheckbox',
            'tab', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
            'option', 'treeitem', 'gridcell', 'row', 'columnheader', 'rowheader',
            'searchbox', 'combobox', 'listbox'
          ];
          const role = el.getAttribute('role');
          
          if (interactiveTags.includes(tag) || interactiveRoles.includes(role)) {
            return el;
          }
          
          let current = el.parentElement;
          let depth = 0;
          while (current && current !== document.body && depth < 7) {
            const currentTag = current.tagName;
            const currentRole = current.getAttribute('role');
            if (interactiveTags.includes(currentTag) || interactiveRoles.includes(currentRole)) {
              return current;
            }
            current = current.parentElement;
            depth++;
          }
          
          return el;
        }
        
        document.addEventListener('click', (e) => {
          window.__browzerRecordingEvent = e.target;
          
          const element = findBestElement(e.target);
          if (element) {
            const role = getElementRole(element);
            const text = getElementText(element);
            const value = getElementValue(element);
            const url = element.href || element.getAttribute('href') || '';
            
            window._click_data = {
              role: role,
              text: text,
              value: value,
              url: url
            };
          }
          console.log('${CLICK_MARKER}');
        }, true);

        document.addEventListener('keydown', (e) => {
          const importantKeys = [
            'Enter', 'Escape', 'Tab',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Home', 'End', 'PageUp', 'PageDown', 'Delete'
          ];
          const isShortcut = (e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1;
          const isImportantKey = importantKeys.includes(e.key);
          
          if (isShortcut || isImportantKey) {
            const focusedElement = document.activeElement;
            
            const modifiers = [];
            if (e.metaKey) modifiers.push('Cmd');
            if (e.ctrlKey) modifiers.push('Ctrl');
            if (e.altKey) modifiers.push('Alt');
            if (e.shiftKey) modifiers.push('Shift');
            
            modifiers.push(e.key);
            window._key_data = modifiers;
            console.log('${KEY_MARKER}');
          }
        }, true);
      }
    `;
  }

  private createConsoleHandler(tab: Tab, cdp: Debugger) {
    return async (_event: any, method: string, params: any): Promise<void> => {
      switch(method){
        case 'Runtime.consoleAPICalled':
          if (params.args?.[0]?.value === CLICK_MARKER){
            const clickEvent = await this.processClickEvent(tab, cdp);
            console.info(clickEvent);
          } else if (params.args?.[0]?.value === KEY_MARKER){
            const keyEvent = await this.processKeyEvent(tab, cdp);
            console.info(keyEvent);
          }
          break;
        case 'Page.frameNavigated':
           if (params.frame.parentId === undefined) {
            const newUrl = params.frame.url;
            if (this.isSignificantNavigation(newUrl)) {
              console.info('navigation to ' + newUrl, tab.id);
            }
          }
          break;
        default:
      }
    };
  }

   private async processKeyEvent(tab: Tab, cdp: Debugger): Promise<RecordingEvent> {
    const dataResult = await cdp.sendCommand('Runtime.evaluate', {
      expression: 'window._key_data',
      returnByValue: true,
    });
    const data = dataResult.result.value || []
    return {
      tabId: tab.id,
      url: tab.view.webContents.getURL(),
      type: 'key',
      keys: data
    };
  }

  private async processClickEvent(tab: Tab, cdp: Debugger): Promise<RecordingEvent> {
    const dataResult = await cdp.sendCommand('Runtime.evaluate', {
      expression: 'window._click_data',
      returnByValue: true,
    });
    const data = dataResult.result.value || {};

    const { result } = await cdp.sendCommand('Runtime.evaluate', {
      expression: 'window.__browzerRecordingEvent',
      returnByValue: false,
    });
    
    const { nodes } = await cdp.sendCommand('Accessibility.getPartialAXTree', {
      objectId: result.objectId,
      fetchRelatives: true,
    });

    const axData = this.extractAccessibilityData(nodes);
    console.log(this.formatAccessibilityTree(nodes));

    return {
      tabId: tab.id,
      type: 'click',
      role: data.role || axData.role || '',
      text: data.text || axData.name || '',
      value: data.value || axData.value || '',
      url: data.url || '',
    };
  }
  
  private extractAccessibilityData(nodes: any[]): AXNode {
    const rootNode = nodes.find((n: any) => !n.parentId) || nodes[0];
    if (!rootNode) {
      return { role: '', name: '', value: '' };
    }
    return {
      role: rootNode.role?.value || '',
      name: rootNode.name?.value || '',
      value: rootNode.value?.value || '',
    };
  }

  private formatAccessibilityTree(nodes: any[]): string {
    const lines: string[] = [];
    const nodeMap = new Map<string, any>();
    for (const node of nodes) {
      if (node.nodeId) {
        nodeMap.set(node.nodeId, node);
      }
    }

    const rootNode = nodes.find((n) => !n.parentId) || nodes[0];
    if (rootNode) {
      this.formatNode(rootNode, nodeMap, lines, 0, true);
    }

    return lines.filter((line) => line.trim() !== '').join('\n');
  }

  private formatNode(
    node: any,
    nodeMap: Map<string, any>,
    lines: string[],
    depth: number,
    isRoot: boolean = false
  ): void {
    const role = node.role?.value || '';
    const name = node.name?.value || '';
    const value = node.value?.value || '';

    const NOISE_ROLES = new Set([
      'none',
      'InlineTextBox',
      'LineBreak',
      'LayoutTableCell',
      'LayoutTableRow',
      'LayoutTable',
      'StaticText',
    ]);
    const NOISE_PROPVALUE_SET = new Set([null, undefined, '', false]);
    const NOISE_PROPNAME_SET = new Set([
      'focusable',
      'readonly',
      'level',
      'orientation',
      'multiline',
      'settable',
      'pressed',
    ]);

    const shouldInclude =
      !NOISE_ROLES.has(role) && (name.length > 0 || value.length > 0);

    if (shouldInclude && !isRoot) {
      const indent = '  '.repeat(depth);
      let nodeStr = `${indent}[${role}]`;

      if (name && name.trim().length > 0) {
        name.length > 120
          ? (nodeStr += ` "${name.trim().substring(0, 120)}..."`)
          : (nodeStr += ` "${name.trim()}"`);
      }

      if (value && value !== name && value.trim().length > 0) {
        value.length > 120
          ? (nodeStr += ` value="${value.trim().substring(0, 120)}..."`)
          : (nodeStr += ` value="${value.trim()}"`);
      }

      if (node.properties) {
        const importantProps: string[] = [];
        importantProps.push(`nodeId=${node.nodeId}`);

        for (const prop of node.properties) {
          const propName = prop.name;
          const propValue = prop.value?.value;

          if (
            !NOISE_PROPVALUE_SET.has(propValue) &&
            !NOISE_PROPNAME_SET.has(propName)
          ) {
            const propStr =
              typeof propValue === 'string' && propValue.length > 120
                ? `${propName}=${propValue.substring(0, 120)}...`
                : `${propName}=${propValue}`;
            importantProps.push(propStr);
          }
        }

        if (importantProps.length > 0) {
          nodeStr += ` ${importantProps.join(', ')}`;
        }
      }

      lines.push(nodeStr);
    }

    if (node.childIds && node.childIds.length > 0) {
      for (const childId of node.childIds) {
        const childNode = nodeMap.get(childId);
        if (childNode) {
          const nextDepth = shouldInclude && !isRoot ? depth + 1 : depth;
          this.formatNode(childNode, nodeMap, lines, nextDepth, false);
        }
      }
    }
  }

  private isSignificantNavigation(url: string): boolean {
    const ignorePatterns = [
      'data:',
      'about:',
      'chrome:',
      'chrome-extension:',
      '/log',
      '/analytics',
      '/tracking',
    ];

    return !ignorePatterns.some((pattern) => url.startsWith(pattern) || url.includes(pattern));
  }
}
