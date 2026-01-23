/* eslint-disable no-useless-escape */
import { BaseWindow, Debugger, WebContentsView, dialog } from 'electron';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

import { RecordingStore } from '../recording';
import { Tab } from '../browser';

import { AXNode, RecordingAction, RecordingSession } from '@/shared/types';

const CLICK_MARKER = '__browzer_click__';
const INPUT_MARKER = '__browzer_input__';
const KEY_MARKER = '__browzer_key__';

export class RecordingService extends EventEmitter {
  private recordingStore: RecordingStore;
  private currentSession: RecordingSession | null = null;
  private recordingStartTime = 0;
  private recordingStartUrl = '';

  constructor(
    private baseWindow: BaseWindow,
    private browserView: WebContentsView
  ) {
    super();
    this.recordingStore = new RecordingStore();
  }

  public getRecordingStore(): RecordingStore {
    return this.recordingStore;
  }

  public startRecordingSession(startUrl: string): void {
    this.recordingStartTime = Date.now();
    this.recordingStartUrl = startUrl;
    this.currentSession = {
      id: randomUUID(),
      name: `Recording ${new Date().toLocaleString()}`,
      actions: [],
      createdAt: this.recordingStartTime,
      duration: 0,
      startUrl,
    };
    this.browserView.webContents.send('recording:started');
  }

  public stopRecordingSession(): {
    actions: RecordingAction[];
    duration: number;
    startUrl: string;
  } | null {
    if (!this.currentSession) {
      return null;
    }

    this.browserView.webContents.send('recording:stopped');
    const duration = Date.now() - this.recordingStartTime;
    this.currentSession.duration = duration;

    const result = {
      actions: [...this.currentSession.actions],
      duration,
      startUrl: this.recordingStartUrl,
    };
    return result;
  }

  public saveRecording(name: string, description?: string): boolean {
    if (!this.currentSession) {
      console.error('No active recording session to save');
      return false;
    }

    this.currentSession.name = name;
    this.currentSession.description = description;
    this.currentSession.duration = Date.now() - this.recordingStartTime;

    try {
      this.recordingStore.saveRecording(this.currentSession);
      const sessionId = this.currentSession.id;
      console.log('💾 Recording saved:', sessionId);
      this.discardRecording();
      return true;
    } catch (error) {
      console.error('Failed to save recording:', error);
      return false;
    }
  }

  public discardRecording(): void {
    if (this.currentSession) {
      console.log('🗑️ Recording discarded:', this.currentSession.id);
    }
    this.currentSession = null;
    this.recordingStartTime = 0;
    this.recordingStartUrl = '';
  }

  public getCurrentActions(): RecordingAction[] {
    return this.currentSession?.actions || [];
  }

  public isRecording(): boolean {
    return this.currentSession !== null;
  }

  public addAction(action: RecordingAction): void {
    if (!this.currentSession) {
      console.warn('No active recording session, action not recorded');
      return;
    }

    if (action.element) {
      const role = action.element.role;
      const lastAction =
        this.currentSession.actions[this.currentSession.actions.length - 1];
      if (lastAction && lastAction.element) {
        const timeDiff = action.timestamp - lastAction.timestamp;
        const isSameRole = lastAction.element.role === role;
        const isSameName = lastAction.element.name === action.element.name;
        const isSameValue = lastAction.element.value === action.element.value;
        const isSameTab = lastAction.tabId === action.tabId;

        if (
          timeDiff < 300 &&
          isSameRole &&
          isSameName &&
          isSameValue &&
          isSameTab
        ) {
          console.log('Duplicate action skipped', action);
          return;
        }
      }
    }

    this.currentSession.actions.push(action);
    this.browserView.webContents.send('recording:action-recorded', action);
  }

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
      console.error(error);
    }
  }

  private getRecordingScript(): string {
    return `
      if (!window.__browzer) {
        window.__browzer = true;
        window.__browzer_event = null;
        window._click_data = null;
        window._key_data = null;
        
        function getElementName(element) {
          if (!element) return '';
          const role = getElementRole(element);
          
          switch (role) {
            case 'button':
              return getButtonName(element);
            case 'link':
              return getLinkName(element);
            case 'textbox':
            case 'searchbox':
              return getTextboxName(element);
            case 'checkbox':
            case 'radio':
            case 'switch':
              return getCheckableInputName(element);
            case 'combobox':
            case 'listbox':
              return getComboboxName(element);
            case 'option':
              return getOptionName(element);
            case 'image':
            case 'figure':
            case 'svg':
              return getImageName(element);
            case 'heading':
              return getHeadingName(element);
            default:
              return getGenericName(element);
          }
        }
        
        function getButtonName(element) {
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const textContent = getDirectTextContent(element);
          if (textContent) return textContent;
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const describedByText = getTextFromAriaDescribedBy(element);
          if (describedByText) return describedByText;
          
          const img = element.querySelector('img');
          if (img?.alt?.trim()) return img.alt.trim();
          
          const iconName = getIconName(element);
          if (iconName) return iconName;
          
          if (element.tagName.toLowerCase() === 'input') {
            const value = element.value;
            if (value?.trim()) return value.trim();
          }
          
          return '';
        }
        
        function getLinkName(element) {
          const textContent = getDirectTextContent(element);
          if (textContent) return textContent;
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const img = element.querySelector('img');
          if (img?.alt?.trim()) return img.alt.trim();
          
          return '';
        }
        
        function getTextboxName(element) {
          const labelText = getAssociatedLabelText(element);
          if (labelText) return labelText;
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const placeholder = element.getAttribute('placeholder');
          if (placeholder?.trim()) return placeholder.trim();
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const name = element.getAttribute('name');
          if (name?.trim()) return name.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const describedByText = getTextFromAriaDescribedBy(element);
          if (describedByText) return describedByText;
          
          const nearbyLabel = findNearbyLabel(element);
          if (nearbyLabel) return nearbyLabel;
          
          return '';
        }
        
        function getCheckableInputName(element) {
          const text = getDirectTextContent(element);
          if (text) return text;
          
          const labelText = getAssociatedLabelText(element);
          if (labelText) return labelText;
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const parentLabel = element.closest('label');
          if (parentLabel) {
            const text = getDirectTextContent(parentLabel);
            if (text) return text;
          }
          
          const nearbyLabel = findNearbyLabel(element);
          if (nearbyLabel) return nearbyLabel;
          
          const tableContext = getTableCellContext(element);
          if (tableContext) return tableContext;
          
          const value = element.getAttribute('value');
          if (value?.trim()) return value.trim();
          
          return '';
        }
        
        function getComboboxName(element) {
          const labelText = getAssociatedLabelText(element);
          if (labelText) return labelText;
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const name = element.getAttribute('name');
          if (name?.trim()) return name.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const nearbyLabel = findNearbyLabel(element);
          if (nearbyLabel) return nearbyLabel;
          
          if (element.tagName.toLowerCase() === 'select') {
            const selectedOption = element.options[element.selectedIndex];
            if (selectedOption?.text?.trim()) return selectedOption.text.trim();
          }
          
          const textContent = getDirectTextContent(element);
          if (textContent) return textContent;
          
          return '';
        }
        
        function getOptionName(element) {
          const textContent = getDirectTextContent(element);
          if (textContent) return textContent;
          
          const label = element.getAttribute('label');
          if (label?.trim()) return label.trim();
          
          const value = element.getAttribute('value');
          if (value?.trim()) return value.trim();
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          return '';
        }
        
        function getImageName(element) {
          const alt = element.getAttribute('alt');
          if (alt?.trim()) return alt.trim();
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const describedByText = getTextFromAriaDescribedBy(element);
          if (describedByText) return describedByText;
          
          return '';
        }
        
        function getHeadingName(element) {
          const textContent = getDirectTextContent(element);
          if (textContent) return textContent;
          
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          return '';
        }
        
        function getGenericName(element) {
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          
          const textContent = getDirectTextContent(element);
          if (textContent) return textContent;
          
          const title = element.getAttribute('title');
          if (title?.trim()) return title.trim();
          
          const name = element.getAttribute('name');
          if (name?.trim()) return name.trim();
          
          const labelledByText = getTextFromAriaLabelledBy(element);
          if (labelledByText) return labelledByText;
          
          const describedByText = getTextFromAriaDescribedBy(element);
          if (describedByText) return describedByText;
          
          return '';
        }
        
        // ========== HELPER FUNCTIONS ==========
        
        function getDirectTextContent(element) {
          if (!element) return '';
          
          const tag = element.tagName.toLowerCase();
          if (tag === 'button' || tag === 'a') {
            let text = '';
            for (const node of Array.from(element.childNodes)) {
              if (node.nodeType === 3) {
                text += node.textContent || node.innerText || '';
              } else if (node.nodeType === 1 && node.tagName.toLowerCase() !== 'svg') {
                text += node.innerText || node.textContent || '';
              }
            }
            const cleaned = text.trim().replace(/\\\\s+/g, ' ');
            return cleaned.substring(0, 250);
          }
          
          const text = element.innerText?.trim() || element.textContent?.trim() || '';
          const cleaned = text.replace(/\\\\s+/g, ' ');
          return cleaned.substring(0, 250);
        }
        
        function getTextFromAriaLabelledBy(element) {
          const ariaLabelledBy = element.getAttribute('aria-labelledby');
          if (!ariaLabelledBy) return '';
          
          const ids = ariaLabelledBy.split(' ').filter(id => id.trim());
          const texts = ids
            .map(id => {
              const referencedElement = document.getElementById(id);
              return referencedElement?.textContent?.trim() || '';
            })
            .filter(Boolean);
          
          if (texts.length > 0) {
            return texts.join(' ').replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          return '';
        }
        
        function getTextFromAriaDescribedBy(element) {
          const ariaDescribedBy = element.getAttribute('aria-describedby');
          if (!ariaDescribedBy) return '';
          
          const ids = ariaDescribedBy.split(' ').filter(id => id.trim());
          const texts = ids
            .map(id => {
              const referencedElement = document.getElementById(id);
              return referencedElement?.textContent?.trim() || '';
            })
            .filter(Boolean);
          
          if (texts.length > 0) {
            return texts.join(' ').replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          return '';
        }
        
        function getAssociatedLabelText(element) {
          const id = element.getAttribute('id');
          if (id) {
            const label = document.querySelector(\`label[for="\${id}"]\`);
            if (label) {
              const text = label.textContent?.trim() || '';
              if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
            }
          }
          
          const parentLabel = element.closest('label');
          if (parentLabel) {
            const clone = parentLabel.cloneNode(true);
            const inputs = clone.querySelectorAll('input, select, textarea');
            inputs.forEach(input => input.remove());
            const text = clone.textContent?.trim() || '';
            if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
          }
          
          return '';
        }
        
        function findNearbyLabel(element) {
          let parent = element.parentElement;
          let depth = 0;
          
          while (parent && depth < 3) {
            const labelInParent = parent.querySelector('label');
            if (labelInParent) {
              const text = labelInParent.textContent?.trim();
              if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
            }
            
            const prevSibling = parent.previousElementSibling;
            if (prevSibling) {
              if (prevSibling.tagName.toLowerCase() === 'label') {
                const text = prevSibling.textContent?.trim();
                if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
              }
              const labelInSibling = prevSibling.querySelector('label');
              if (labelInSibling) {
                const text = labelInSibling.textContent?.trim();
                if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
              }
            }
            
            const nextSibling = parent.nextElementSibling;
            if (nextSibling) {
              if (nextSibling.tagName.toLowerCase() === 'label') {
                const text = nextSibling.textContent?.trim();
                if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
              }
              const labelInSibling = nextSibling.querySelector('label');
              if (labelInSibling) {
                const text = labelInSibling.textContent?.trim();
                if (text) return text.replace(/\\\\s+/g, ' ').substring(0, 250);
              }
            }
            
            parent = parent.parentElement;
            depth++;
          }
          
          return '';
        }
        
        function getTableCellContext(element) {
          const cell = element.closest('td, th');
          if (!cell) return '';
          
          const row = cell.closest('tr');
          if (!row) return '';
          
          const clone = row.cloneNode(true);
          const checkboxes = clone.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(cb => cb.remove());
          
          const buttons = clone.querySelectorAll('button, [role="button"]');
          buttons.forEach(btn => btn.remove());
          
          let text = clone.textContent?.trim() || '';
          text = text.replace(/\\\\s+/g, ' ').trim();
          
          if (text && text.length > 10) {
            return text.substring(0, 250);
          }
          
          return '';
        }
        
        function getIconName(element) {
          const className = element.className?.baseVal || element.className || '';
          if (typeof className !== 'string') return '';
          
          const iconMatch = className.match(/fa-([a-z0-9-]+)|bi-([a-z0-9-]+)|icon-([a-z0-9-]+)|material-icons/i);
          if (iconMatch) {
            const iconName = (iconMatch[1] || iconMatch[2] || iconMatch[3] || '').replace(/-/g, ' ');
            if (iconName) {
              return iconName.charAt(0).toUpperCase() + iconName.slice(1);
            }
          }
          
          if (className.includes('material-icons')) {
            const text = element.textContent?.trim();
            if (text) return text.replace(/_/g, ' ');
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
            'svg': 'svg',
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
            'option': 'option',
            'div': 'generic',
            'span': 'generic',
            'canvas': 'canvas',
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
          const tag = el.tagName.toLowerCase();
          const svgTags = ['path', 'circle', 'rect', 'line', 'polygon', 'g', 'svg', 'ellipse', 'polyline', 'text', 'tspan'];
          
          if (svgTags.includes(tag)) {
            const svgElement = tag === 'svg' ? el : el.closest('svg');
            if (svgElement?.getAttribute('aria-label')) {
              return svgElement;
            }
            
            const interactive = el.closest('button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="combobox"]');
            if (interactive) return interactive;
            
            if (svgElement?.parentElement) return svgElement.parentElement;
          }
          
          const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION'];
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
          window.__browzer_event = e.target;
          
          const element = findBestElement(e.target);
          if (element) {
            window._click_data = {
              role: getElementRole(element),
              name: getElementName(element),
              value: getElementValue(element),
              attributes: getStableAttributes(element)
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
        
        const inputDebounce = {};
        const lastRecordedValue = {};
        const pathCache = new WeakMap();
        
        function getStableAttributes(el) {
          const attrs = {};
          const stableAttrs = ['id', 'name', 'type', 'aria-label', 'data-testid', 'data-test-id', 'data-cy', 'data-test', 'placeholder', 'title', 'alt', 'for', 'href'];
          stableAttrs.forEach(attr => {
            const val = el.getAttribute(attr);
            if (val) attrs[attr] = val;
          });
          return attrs;
        }
        
        function isTextInput(el) {
          if (!el) return false;
          const tag = el.tagName.toLowerCase();
          const type = el.type?.toLowerCase();
          const role = el.getAttribute('role');
          
          return tag === 'textarea' || role === 'textbox' || role === 'searchbox' ||
                 (tag === 'input' && !['checkbox', 'radio', 'file', 'switch'].includes(type)) ||
                 el.isContentEditable || el.getAttribute('contenteditable') === 'true';
        }
        
        function hasContentEditableParent(el) {
          if (!el.isContentEditable) return false;
          let p = el.parentElement;
          while (p && p !== document.body) {
            if (p.isContentEditable) return true;
            p = p.parentElement;
          }
          return false;
        }
        
        function getPath(el) {
          if (pathCache.has(el)) return pathCache.get(el);
          if (el.id) return pathCache.set(el, '#' + el.id).get(el);
          
          const parts = [];
          let curr = el, depth = 0;
          
          while (curr && curr !== document.body && depth++ < 10) {
            let sel = curr.tagName.toLowerCase();
            const cls = typeof curr.className === 'string' ? 
              curr.className.split(' ').filter(c => c && !/^\d/.test(c)).slice(0, 2) : [];
            if (cls.length) sel += '.' + cls.join('.');
            if (curr.getAttribute('role')) sel += '[role="' + curr.getAttribute('role') + '"]';
            
            const parent = curr.parentElement;
            if (parent) {
              const sibs = Array.from(parent.children).filter(s => s.tagName === curr.tagName);
              if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(curr) + 1) + ')';
            }
            parts.unshift(sel);
            curr = parent;
          }
          
          const path = parts.join(' > ');
          pathCache.set(el, path);
          return path;
        }
        
        function getKey(el) {
          return el.id ? 'id:' + el.id : 
                 el.name ? 'name:' + el.name : 
                 el.isContentEditable ? 'path:' + getPath(el) :
                 getElementName(el) ? 'label:' + getElementName(el) : 'path:' + getPath(el);
        }
        
        function shouldRecord(key, oldVal, newVal, isContentEdit) {
          if (oldVal === undefined) return true;
          if (oldVal === newVal) return false;
          
          if (isContentEdit) {
            const o = (oldVal || '').replace(/\s+/g, ' ').trim();
            const n = (newVal || '').replace(/\s+/g, ' ').trim();
            const diff = Math.abs(o.length - n.length);
            return o !== n && diff > 0 && (diff >= 2 || o.length >= 5);
          }
          return true;
        }
        
        function recordInput(target) {
          if (!isTextInput(target) || (target.isContentEditable && hasContentEditableParent(target))) return;
          
          const key = getKey(target);
          const val = target.isContentEditable ? (target.innerText || target.textContent || '').trim() : (target.value || '');
          
          if (!shouldRecord(key, lastRecordedValue[key], val, target.isContentEditable)) return;
          
          lastRecordedValue[key] = val;
          window.__browzer_event = target;
          window._input_data = {
            role: getElementRole(target),
            name: getElementName(target),
            value: val,
            attributes: getStableAttributes(target)
          };
          console.log('${INPUT_MARKER}');
        }
        
        function handleInput(e) {
          const t = e.target;
          if (!isTextInput(t) || (t.isContentEditable && hasContentEditableParent(t))) return;
          
          const key = getKey(t);
          clearTimeout(inputDebounce[key]);
          inputDebounce[key] = setTimeout(() => recordInput(t), t.isContentEditable ? 1500 : 1000);
        }
        
        function handleBlur(e) {
          const t = e.target;
          if (!isTextInput(t) || (t.isContentEditable && hasContentEditableParent(t))) return;
          
          const key = getKey(t);
          clearTimeout(inputDebounce[key]);
          recordInput(t);
        }
        
        document.addEventListener('input', handleInput, true);
        document.addEventListener('blur', handleBlur, true);
      }
    `;
  }

  private createConsoleHandler(tab: Tab, cdp: Debugger) {
    return async (_event: any, method: string, params: any): Promise<void> => {
      switch (method) {
        case 'Runtime.consoleAPICalled':
          if (params.args?.[0]?.value === CLICK_MARKER) {
            const clickEvent = await this.processClickEvent(tab, cdp);
            this.addAction(clickEvent);
          } else if (params.args?.[0]?.value === INPUT_MARKER) {
            const inputEvent = await this.processInputEvent(tab, cdp);
            if (inputEvent.element.value) {
              this.addAction(inputEvent);
            }
          } else if (params.args?.[0]?.value === KEY_MARKER) {
            const keyEvent = await this.processKeyEvent(tab, cdp);
            this.addAction(keyEvent);
          }
          break;
        case 'Page.frameNavigated':
          if (params.frame.parentId === undefined) {
            const newUrl = params.frame.url;
            if (this.isSignificantNavigation(newUrl)) {
              const navigationAction: RecordingAction = {
                tabId: tab.id,
                type: 'navigate',
                url: newUrl,
                timestamp: Date.now(),
              };
              this.addAction(navigationAction);
            }
          }
          break;
        case 'Page.fileChooserOpened':
          const result = await dialog.showOpenDialog(this.baseWindow, {
            properties:
              params.mode === 'selectMultiple'
                ? ['openFile', 'multiSelections']
                : ['openFile'],
          });
          if (!result.canceled && result.filePaths.length > 0) {
            const fileAction: RecordingAction = {
              type: 'file',
              tabId: tab.id,
              url: tab.view.webContents.getURL(),
              timestamp: Date.now(),
              filePaths: result.filePaths,
            };
            this.addAction(fileAction);
            if (params.backendNodeId) {
              try {
                await tab.view.webContents.debugger.sendCommand(
                  'DOM.setFileInputFiles',
                  {
                    files: result.filePaths,
                    backendNodeId: params.backendNodeId,
                  }
                );
                console.log('Files set successfully');
              } catch (err) {
                console.error('Error setting files:', err);
              }
            }
          }
          break;
        default:
      }
    };
  }

  private async processKeyEvent(
    tab: Tab,
    cdp: Debugger
  ): Promise<RecordingAction> {
    let data: string[] = [];
    try {
      const dataResult = await cdp.sendCommand('Runtime.evaluate', {
        expression: 'window._key_data',
        returnByValue: true,
      });
      data = dataResult.result.value || [];
    } catch (error) {
      console.error('🔴 Error getting key data:', error);
    }
    return {
      tabId: tab.id,
      url: tab.view.webContents.getURL(),
      type: 'key',
      keys: data,
      timestamp: Date.now(),
    };
  }

  private async processClickEvent(
    tab: Tab,
    cdp: Debugger
  ): Promise<RecordingAction> {
    const dataResult = await cdp.sendCommand('Runtime.evaluate', {
      expression: 'window._click_data',
      returnByValue: true,
    });
    const data = dataResult.result.value || {};
    return {
      tabId: tab.id,
      type: 'click',
      url: tab.view.webContents.getURL(),
      element: {
        role: data.role || '',
        name: data.name || '',
        value: data.value,
        attributes: data.attributes,
      },
      timestamp: Date.now(),
    };
  }

  private async processInputEvent(
    tab: Tab,
    cdp: Debugger
  ): Promise<RecordingAction> {
    const dataResult = await cdp.sendCommand('Runtime.evaluate', {
      expression: 'window._input_data',
      returnByValue: true,
    });
    const data = dataResult.result.value || {};
    return {
      tabId: tab.id,
      type: 'type',
      element: {
        role: data.role,
        name: data.name,
        value: data.value,
        attributes: data.attributes,
      },
      url: tab.view.webContents.getURL(),
      timestamp: Date.now(),
    };
  }

  private isSignificantNavigation(url: string): boolean {
    const ignorePrefixes = ['data:', 'about:', 'chrome:', 'chrome-extension:'];
    const ignorePathPatterns = [
      /\/log(?:ging)?(?:\/|$|\?)/i,
      /\/analytics(?:\/|$|\?)/i,
      /\/track(?:ing)?(?:\/|$|\?)/i,
    ];

    if (ignorePrefixes.some((prefix) => url.startsWith(prefix))) {
      return false;
    }
    const path = new URL(url).pathname;
    return !ignorePathPatterns.some((pattern) => pattern.test(path));
  }

  public destroy(): void {
    this.currentSession = null;
  }
}
