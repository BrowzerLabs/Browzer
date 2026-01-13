/**
 * Recording Manager
 *
 * Controls recording sessions using CDP (Chrome DevTools Protocol)
 * to capture user interactions and generate workflow files.
 */

import { WebContentsView } from 'electron';
import { EventEmitter } from 'events';

import { v4 as uuidv4 } from 'uuid';

import {
  RecordedAction,
  RecordedElement,
  RecordingSession,
  RecordingStatus,
  RecorderMessage,
  RecordingStateUpdate,
} from './types';
import { WorkflowGenerator } from './workflow/WorkflowGenerator';
import { StorageService } from './storage/StorageService';

export interface RecordingManagerEvents {
  'recording:started': (session: RecordingSession) => void;
  'recording:stopped': (session: RecordingSession) => void;
  'recording:action': (action: RecordedAction) => void;
  'recording:state-changed': (state: RecordingStateUpdate) => void;
}

export class RecordingManager extends EventEmitter {
  private currentSession: RecordingSession | null = null;
  private workflowGenerator: WorkflowGenerator;
  private storageService: StorageService;
  private browserView: WebContentsView;
  private activeTabView: WebContentsView | null = null;
  private activeTabId: string | null = null;
  private cdpMessageHandler:
    | ((event: any, method: string, params: any) => void)
    | null = null;
  private actionCounter = 0;

  constructor(browserView: WebContentsView) {
    super();
    this.browserView = browserView;
    this.workflowGenerator = new WorkflowGenerator();
    this.storageService = new StorageService();
  }

  public on<K extends keyof RecordingManagerEvents>(
    event: K,
    listener: RecordingManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof RecordingManagerEvents>(
    event: K,
    ...args: Parameters<RecordingManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RECORDING CONTROL
  // ═══════════════════════════════════════════════════════════════════════

  async startRecording(
    tabView: WebContentsView,
    tabId: string
  ): Promise<{ sessionId: string }> {
    if (this.currentSession?.status === 'recording') {
      throw new Error('Recording already in progress');
    }

    const sessionId = uuidv4();
    this.actionCounter = 0;
    this.activeTabView = tabView;
    this.activeTabId = tabId;

    // Create new session
    this.currentSession = {
      id: sessionId,
      startedAt: new Date().toISOString(),
      actions: [],
      status: 'recording',
      tabId,
      initialUrl: tabView.webContents.getURL(),
    };

    // Setup CDP event listeners
    await this.setupCDPRecording(tabView);

    // Inject the DOM event capture script
    await this.injectEventCaptureScript(tabView);

    // Record initial navigation
    this.addAction({
      id: `action_${++this.actionCounter}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'navigation',
      pageUrl: tabView.webContents.getURL(),
      pageTitle: tabView.webContents.getTitle(),
      value: tabView.webContents.getURL(),
    });

    // Notify listeners
    this.emit('recording:started', this.currentSession);
    this.notifyStateChange();

    // Notify renderer via IPC
    try {
      this.browserView.webContents.send('recording:started', {
        sessionId: sessionId,
      });
    } catch (error) {
      console.error('[RecordingManager] Failed to notify renderer:', error);
    }

    console.log('[RecordingManager] Recording started, session:', sessionId);

    return { sessionId };
  }

  async stopRecording(): Promise<RecordingSession | null> {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return null;
    }

    // Update session status
    this.currentSession.status = 'stopped';
    this.currentSession.stoppedAt = new Date().toISOString();

    // Cleanup CDP listeners
    this.cleanupCDPRecording();

    // Notify listeners
    this.emit('recording:stopped', this.currentSession);
    this.notifyStateChange();

    // Notify renderer
    try {
      this.browserView.webContents.send('recording:stopped', {
        session: {
          id: this.currentSession.id,
          actions: this.currentSession.actions,
          status: this.currentSession.status,
        },
      });
    } catch (error) {
      console.error('[RecordingManager] Failed to notify renderer:', error);
    }

    console.log(
      '[RecordingManager] Recording stopped, actions:',
      this.currentSession.actions.length
    );

    return this.currentSession;
  }

  async discardRecording(): Promise<void> {
    if (this.currentSession) {
      this.cleanupCDPRecording();
      this.currentSession.status = 'idle';
      this.currentSession = null;
      this.activeTabView = null;
      this.activeTabId = null;
      this.notifyStateChange();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CDP EVENT RECORDING
  // ═══════════════════════════════════════════════════════════════════════

  private async setupCDPRecording(tabView: WebContentsView): Promise<void> {
    const debugger_ = tabView.webContents.debugger;

    if (!debugger_.isAttached()) {
      console.warn(
        '[RecordingManager] Debugger not attached, cannot record via CDP'
      );
      return;
    }

    // Setup CDP message handler
    this.cdpMessageHandler = (_event: any, method: string, params: any) => {
      this.handleCDPEvent(method, params);
    };

    debugger_.on('message', this.cdpMessageHandler);

    console.log('[RecordingManager] CDP recording setup complete');
  }

  private cleanupCDPRecording(): void {
    if (this.activeTabView && this.cdpMessageHandler) {
      try {
        const debugger_ = this.activeTabView.webContents.debugger;
        debugger_.removeListener('message', this.cdpMessageHandler);
      } catch (error) {
        console.error('[RecordingManager] Error cleaning up CDP:', error);
      }
    }
    this.cdpMessageHandler = null;
    this.activeTabView = null;
    this.activeTabId = null;
  }

  private handleCDPEvent(method: string, params: any): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return;
    }

    switch (method) {
      case 'Page.frameNavigated':
        if (params.frame?.url && !params.frame.parentId) {
          // Main frame navigation - re-inject script and record navigation
          this.recordNavigationAction(params.frame.url);
          // Re-inject script after navigation (with delay for page to load)
          setTimeout(() => {
            if (
              this.activeTabView &&
              this.currentSession?.status === 'recording'
            ) {
              this.injectEventCaptureScript(this.activeTabView);
            }
          }, 500);
        }
        break;

      case 'Runtime.consoleAPICalled':
        // Handle custom recorder events sent via console.log
        this.handleConsoleEvent(params);
        break;
    }
  }

  private handleConsoleEvent(params: any): void {
    // console.log type is 'log'
    if (params.type !== 'log') return;

    const args = params.args || [];
    if (args.length < 2) return;

    const prefix = args[0]?.value;
    if (prefix !== '__BROWZER_RECORDER__') return;

    try {
      const eventData = JSON.parse(args[1]?.value || '{}');
      this.handleRecorderEvent(this.activeTabId || '', eventData);
    } catch (error) {
      // Ignore parse errors
    }
  }

  private recordNavigationAction(url: string): void {
    // Avoid duplicate navigation events
    const lastAction =
      this.currentSession?.actions[this.currentSession.actions.length - 1];
    if (lastAction?.type === 'navigation' && lastAction.value === url) {
      return;
    }

    this.addAction({
      id: `action_${++this.actionCounter}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'navigation',
      pageUrl: url,
      pageTitle: this.activeTabView?.webContents.getTitle() || '',
      value: url,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCRIPT INJECTION FOR DOM EVENTS
  // ═══════════════════════════════════════════════════════════════════════

  private async injectEventCaptureScript(
    tabView: WebContentsView
  ): Promise<void> {
    const script = this.getEventCaptureScript();

    try {
      await tabView.webContents.executeJavaScript(script + '\ntrue;');
      console.log('[RecordingManager] Event capture script injected');
    } catch (error) {
      console.error(
        '[RecordingManager] Failed to inject event capture script:',
        error
      );
    }
  }

  private getEventCaptureScript(): string {
    // This script captures DOM events and sends them via console.log
    // which is captured by CDP Runtime.consoleAPICalled
    return `
(function() {
  if (window.__browzerRecorderActive) return;
  window.__browzerRecorderActive = true;

  const actionCounter = { value: 0 };
  const debounceTimers = new Map();

  function sendEvent(eventData) {
    console.log('__BROWZER_RECORDER__', JSON.stringify(eventData));
  }

  function debounce(fn, key, delay = 300) {
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      fn();
      debounceTimers.delete(key);
    }, delay);
    debounceTimers.set(key, timer);
  }

  function extractElementData(element) {
    if (!element || !element.tagName) return null;

    const rect = element.getBoundingClientRect();

    return {
      innerText: getVisibleText(element),
      placeholder: element.placeholder || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      title: element.getAttribute('title') || undefined,
      altText: element.alt || undefined,
      value: element.value || undefined,
      tagName: element.tagName.toLowerCase(),
      id: element.id || undefined,
      className: typeof element.className === 'string' ? element.className : undefined,
      name: element.getAttribute('name') || undefined,
      type: element.getAttribute('type') || undefined,
      xpath: generateXPath(element),
      cssSelector: generateCssSelector(element),
      index: 0,
      boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      parentText: getParentContext(element),
      containerHint: getContainerHint(element)
    };
  }

  function getVisibleText(element) {
    let text = '';

    // Priority 1: Check aria-labelledby (references another element's text)
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      // Handle multiple IDs separated by spaces
      const ids = labelledBy.split(' ').filter(id => id.trim());
      const labelTexts = [];
      for (const id of ids) {
        const labelElement = document.getElementById(id);
        if (labelElement) {
          const labelText = labelElement.textContent?.trim();
          if (labelText) labelTexts.push(labelText);
        }
      }
      if (labelTexts.length > 0) {
        text = labelTexts.join(' ').replace(/\\s+/g, ' ').trim();
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
      }
    }

    // Priority 2: Check aria-label directly
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel.trim();
    }

    // Priority 3: Check title attribute
    const title = element.getAttribute('title');
    if (title) {
      return title.trim();
    }

    // Priority 4: Check for img alt text inside the element
    const img = element.querySelector('img');
    if (img && img.alt) {
      return img.alt.trim();
    }

    // Priority 5: Check for SVG title element
    const svgTitle = element.querySelector('svg title');
    if (svgTitle && svgTitle.textContent) {
      return svgTitle.textContent.trim();
    }

    // Priority 6: Get text content based on element type
    if (element.tagName === 'INPUT') {
      text = element.placeholder || getLabelText(element) || '';
    } else if (element.tagName === 'BUTTON') {
      // For buttons, get direct text children only (exclude SVG text)
      text = getDirectTextContent(element);
    } else if (['A', 'SPAN', 'DIV', 'P', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
      text = element.innerText?.trim() || '';
    } else {
      text = element.textContent?.trim() || '';
    }

    if (text) {
      text = text.replace(/\\s+/g, ' ').trim();
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    }

    // Priority 7: Try to extract meaning from icon class names
    const iconText = extractIconNameFromClass(element);
    if (iconText) {
      return iconText;
    }

    // Priority 8: Check data attributes commonly used for tooltips
    const dataAttrs = ['data-tooltip', 'data-tip', 'data-title', 'data-original-title', 'data-content', 'data-label'];
    for (const attr of dataAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        return value.trim();
      }
    }

    // Priority 9: Try to infer from element id or class
    const inferredText = inferTextFromAttributes(element);
    if (inferredText) {
      return inferredText;
    }

    // Priority 10: Generate fallback description based on context
    return generateFallbackDescription(element);
  }

  // Extract readable text from icon class names (Font Awesome, Material Icons, etc.)
  function extractIconNameFromClass(element) {
    // Check the element itself and any SVG/icon children
    const elementsToCheck = [element, element.querySelector('svg'), element.querySelector('i'), element.querySelector('[class*="icon"]')].filter(Boolean);

    for (const el of elementsToCheck) {
      const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
      if (!className) continue;

      // Font Awesome patterns: fa-search, fa-times, fa-chevron-right
      const faMatch = className.match(/fa-([a-z0-9-]+)/i);
      if (faMatch) {
        return humanizeIdentifier(faMatch[1]);
      }

      // Material Icons patterns: material-icons followed by text content, or md-icon-name
      if (className.includes('material-icons') || className.includes('material-symbols')) {
        const iconText = el.textContent?.trim();
        if (iconText) {
          return humanizeIdentifier(iconText);
        }
      }
      const mdMatch = className.match(/md-([a-z0-9_-]+)/i);
      if (mdMatch) {
        return humanizeIdentifier(mdMatch[1]);
      }

      // Bootstrap Icons patterns: bi-search, bi-x-lg
      const biMatch = className.match(/bi-([a-z0-9-]+)/i);
      if (biMatch) {
        return humanizeIdentifier(biMatch[1]);
      }

      // Heroicons, Feather, Lucide patterns: icon-name or *-icon
      const iconMatch = className.match(/(?:^|\\s)(?:icon-|lucide-|feather-|heroicon-)([a-z0-9-]+)/i);
      if (iconMatch) {
        return humanizeIdentifier(iconMatch[1]);
      }

      // Generic icon class patterns: close-icon, search-btn, btn-delete
      const genericMatch = className.match(/(?:^|\\s)([a-z]+)[-_](?:icon|btn|button)(?:\\s|$)/i) ||
                          className.match(/(?:^|\\s)(?:icon|btn|button)[-_]([a-z]+)(?:\\s|$)/i);
      if (genericMatch) {
        return humanizeIdentifier(genericMatch[1]);
      }
    }

    return null;
  }

  // Try to infer meaningful text from element attributes
  function inferTextFromAttributes(element) {
    // Check id attribute
    const id = element.id;
    if (id) {
      // Skip generic IDs
      const genericIds = ['btn', 'button', 'icon', 'wrapper', 'container', 'root'];
      if (!genericIds.includes(id.toLowerCase())) {
        const inferredFromId = humanizeIdentifier(id);
        if (inferredFromId && inferredFromId.length > 2) {
          return inferredFromId;
        }
      }
    }

    // Check class names for action-related words
    const className = typeof element.className === 'string' ? element.className : '';
    if (className) {
      // Look for action words in class names
      const actionWords = ['close', 'delete', 'remove', 'clear', 'cancel', 'submit', 'save', 'edit', 'add', 'create', 'search', 'filter', 'sort', 'refresh', 'reload', 'expand', 'collapse', 'toggle', 'open', 'menu', 'settings', 'profile', 'logout', 'login', 'next', 'prev', 'previous', 'back', 'forward', 'download', 'upload', 'copy', 'paste', 'undo', 'redo', 'help', 'info'];

      const classLower = className.toLowerCase();
      for (const word of actionWords) {
        if (classLower.includes(word)) {
          // Capitalize first letter
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
      }
    }

    // Check name attribute
    const name = element.getAttribute('name');
    if (name) {
      return humanizeIdentifier(name);
    }

    return null;
  }

  // Convert identifiers like "close-button" or "searchIcon" to "Close button" or "Search icon"
  function humanizeIdentifier(identifier) {
    if (!identifier) return null;

    // Replace common separators with spaces
    let text = identifier
      .replace(/[-_]/g, ' ')           // kebab-case and snake_case
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // XMLParser -> XML Parser

    // Clean up and capitalize
    text = text.toLowerCase().trim();

    // Remove common suffixes that don't add meaning
    text = text.replace(/\\s*(btn|button|icon|svg|img)$/i, '').trim();

    if (!text) return null;

    // Capitalize first letter of each word
    return text.replace(/\\b\\w/g, c => c.toUpperCase());
  }

  // Generate a fallback description when nothing else works
  function generateFallbackDescription(element) {
    const tag = element.tagName?.toLowerCase() || 'element';

    // Check if it's in a group of similar elements (e.g., "Button 3 of 5")
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(child => {
        return child.tagName === element.tagName &&
               (child.tagName === 'BUTTON' || child.getAttribute('role') === 'button');
      });

      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        return 'Button ' + index + ' of ' + siblings.length;
      }
    }

    // Check the parent element's accessible name for context
    if (parent) {
      const parentLabel = parent.getAttribute('aria-label') || parent.getAttribute('title');
      if (parentLabel) {
        return tag.charAt(0).toUpperCase() + tag.slice(1) + ' in ' + parentLabel;
      }
    }

    // Last resort: describe by tag and position
    const role = element.getAttribute('role');
    if (role) {
      return role.charAt(0).toUpperCase() + role.slice(1);
    }

    return tag === 'button' ? 'Button' : (tag === 'a' ? 'Link' : 'Interactive element');
  }

  // Get text content excluding SVG elements
  function getDirectTextContent(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName?.toUpperCase();
        // Skip SVG and its children
        if (tagName !== 'SVG' && tagName !== 'PATH') {
          text += getDirectTextContent(node);
        }
      }
    }
    return text.trim();
  }

  function getLabelText(element) {
    const id = element.id;
    if (id) {
      const label = document.querySelector('label[for="' + id + '"]');
      if (label) return label.textContent?.trim() || null;
    }
    const parentLabel = element.closest('label');
    return parentLabel ? parentLabel.textContent?.trim() || null : null;
  }

  function getParentContext(element) {
    const parent = element.parentElement;
    if (!parent) return undefined;
    const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, label');
    return heading ? heading.textContent?.trim()?.substring(0, 50) : undefined;
  }

  function getContainerHint(element) {
    const containers = ['form', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'main'];
    for (const selector of containers) {
      const container = element.closest(selector);
      if (container) {
        const label = container.getAttribute('aria-label') ||
                      container.getAttribute('id') ||
                      container.querySelector('h1, h2, h3')?.textContent?.trim();
        if (label) return label.substring(0, 50);
      }
    }
    return undefined;
  }

  function generateXPath(element) {
    if (element.id) return '//*[@id="' + element.id + '"]';

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return "//*[@aria-label='" + ariaLabel.replace(/'/g, "\\\\'") + "']";

    const placeholder = element.placeholder;
    if (placeholder) return "//input[@placeholder='" + placeholder.replace(/'/g, "\\\\'") + "']";

    // Generate path-based XPath
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(current.tagName.toLowerCase() + '[' + index + ']');
      current = current.parentElement;
    }
    return '//' + parts.join('/');
  }

  function generateCssSelector(element) {
    if (element.id) return '#' + CSS.escape(element.id);

    // Try unique class
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c.trim());
      for (const cls of classes) {
        try {
          const selector = element.tagName.toLowerCase() + '.' + CSS.escape(cls);
          if (document.querySelectorAll(selector).length === 1) return selector;
        } catch (e) {}
      }
    }

    // Try attributes
    const attrs = ['name', 'type', 'placeholder', 'aria-label', 'data-testid'];
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      if (value) {
        try {
          const selector = element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
          if (document.querySelectorAll(selector).length === 1) return selector;
        } catch (e) {}
      }
    }

    // Generate path selector
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift('#' + CSS.escape(current.id));
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function shouldIgnoreElement(element) {
    if (!element || !element.tagName) return true;
    const ignoredTags = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT'];
    if (ignoredTags.includes(element.tagName)) return true;
    try {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    } catch (e) {}
    return false;
  }

  // Check if an element has useful semantic information for automation
  function hasSemanticInfo(el) {
    if (!el) return false;

    // Priority: Check semantic attributes first (most reliable)
    if (el.getAttribute('aria-labelledby')) return true;
    if (el.getAttribute('aria-label')) return true;
    if (el.getAttribute('title')) return true;
    if (el.getAttribute('alt')) return true;
    if (el.getAttribute('placeholder')) return true;
    if (el.getAttribute('data-tooltip')) return true;

    // For buttons/links, check direct text content (not nested text from other elements)
    const tag = el.tagName?.toUpperCase();
    if (['BUTTON', 'A'].includes(tag)) {
      const directText = getDirectTextContent(el);
      if (directText && directText.length > 0 && directText.length < 200) return true;
    } else {
      // For other elements, check innerText but be cautious
      const text = el.innerText?.trim() || '';
      if (text && text.length > 0 && text.length < 100) return true;
    }

    return false;
  }

  // Check if element is an interactive/clickable element
  function isInteractiveElement(el) {
    if (!el || !el.tagName) return false;

    const tag = el.tagName.toUpperCase();

    // Native interactive elements
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return true;

    // ARIA roles that indicate interactivity
    const role = el.getAttribute('role');
    if (['button', 'link', 'menuitem', 'tab', 'option', 'checkbox', 'radio'].includes(role)) return true;

    // Elements with click handlers or tabindex
    if (el.getAttribute('onclick') || el.getAttribute('tabindex')) return true;

    return false;
  }

  // Find the best element for recording - either the clicked element or a better parent
  function findBestElementForRecording(element) {
    if (!element) return null;

    const tagName = (element.tagName || '').toUpperCase();

    // SVG internal elements - always look for parent container
    const svgInternalTags = ['PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'POLYLINE', 'ELLIPSE', 'G', 'USE', 'DEFS', 'SYMBOL', 'TEXT', 'TSPAN'];

    // For SVG elements, find the closest interactive parent (button, a, etc.)
    if (svgInternalTags.includes(tagName) || tagName === 'SVG') {
      // First try to find a button or link ancestor
      const interactiveParent = element.closest('button, a, [role="button"], [role="link"]');
      if (interactiveParent) {
        return interactiveParent;
      }
      // Fallback: jump to SVG's parent
      const svgElement = tagName === 'SVG' ? element : element.closest('svg');
      if (svgElement && svgElement.parentElement) {
        element = svgElement.parentElement;
      }
    }

    // If current element has semantic info and is interactive, use it
    if (hasSemanticInfo(element) && isInteractiveElement(element)) {
      return element;
    }

    // If current element is interactive (button, link), return it even if hasSemanticInfo is false
    // (getVisibleText will try to find the label via aria-labelledby, etc.)
    if (isInteractiveElement(element)) {
      return element;
    }

    // If current element has semantic info (even if not "interactive"), it might be good enough
    if (hasSemanticInfo(element)) {
      // But still check if there's a better interactive parent nearby (max 3 levels up)
      let parent = element.parentElement;
      let depth = 0;
      while (parent && parent !== document.body && depth < 3) {
        if (isInteractiveElement(parent) && hasSemanticInfo(parent)) {
          return parent;
        }
        parent = parent.parentElement;
        depth++;
      }
      return element;
    }

    // Current element has no semantic info - search up for a better element
    let current = element.parentElement;
    let searchDepth = 0;
    const maxSearchDepth = 5; // Don't go too far up

    while (current && current !== document.body && searchDepth < maxSearchDepth) {
      const currentTag = (current.tagName || '').toUpperCase();

      // Skip SVG elements
      if (currentTag === 'SVG' || svgInternalTags.includes(currentTag)) {
        current = current.parentElement;
        searchDepth++;
        continue;
      }

      // Found an interactive element with semantic info - perfect match
      if (isInteractiveElement(current) && hasSemanticInfo(current)) {
        return current;
      }

      // Found an element with semantic info (aria-label, title, etc.)
      if (hasSemanticInfo(current)) {
        return current;
      }

      current = current.parentElement;
      searchDepth++;
    }

    // No better element found, return the original (possibly adjusted for SVG)
    return element;
  }

  function createAction(type, element, extra = {}) {
    const elementData = extractElementData(element);
    return {
      type: 'ACTION_RECORDED',
      payload: {
        id: 'action_' + (++actionCounter.value) + '_' + Date.now(),
        timestamp: new Date().toISOString(),
        type,
        pageUrl: window.location.href,
        pageTitle: document.title,
        element: elementData,
        ...extra
      }
    };
  }

  // Click handler
  document.addEventListener('click', function(event) {
    let element = event.target;

    // Find the best element for recording - may be a parent with better semantic info
    element = findBestElementForRecording(element);

    if (shouldIgnoreElement(element)) return;
    sendEvent(createAction('click', element));
  }, true);

  // Input handler with debounce
  document.addEventListener('input', function(event) {
    const element = event.target;
    if (!element) return;

    // Get value - handle both form inputs and contenteditable
    const value = element.value !== undefined ? element.value :
                  (element.isContentEditable ? element.textContent : null);
    if (value === null) return;

    const key = 'input_' + (element.id || element.name || element.tagName + '_' + Math.random().toString(36).substr(2, 5));
    debounce(() => {
      sendEvent(createAction('input', element, { value: value }));
    }, key, 500);
  }, true);

  // Track typing in contenteditable elements (for apps like Google Docs)
  let typingBuffer = '';
  let typingElement = null;
  let typingTimeout = null;

  function flushTypingBuffer() {
    if (typingBuffer && typingElement) {
      sendEvent(createAction('input', typingElement, { value: typingBuffer }));
      typingBuffer = '';
      typingElement = null;
    }
  }

  // Keyboard input handler for tracking typed text
  document.addEventListener('keydown', function(event) {
    const element = event.target;

    // Special keys handling
    const specialKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete'];
    if (specialKeys.includes(event.key)) {
      // Flush any pending typing first
      flushTypingBuffer();
      sendEvent(createAction('keypress', element, { key: event.key }));
      return;
    }

    // Track regular character input for contenteditable or editable elements
    const isEditable = element.isContentEditable ||
                       element.tagName === 'INPUT' ||
                       element.tagName === 'TEXTAREA' ||
                       element.getAttribute('role') === 'textbox';

    if (isEditable && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Single character key press - accumulate in buffer
      if (typingElement !== element) {
        flushTypingBuffer();
        typingElement = element;
      }
      typingBuffer += event.key;

      // Reset debounce timer
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(flushTypingBuffer, 1000);
    }
  }, true);

  // Flush typing on blur
  document.addEventListener('blur', function(event) {
    flushTypingBuffer();
  }, true);

  // Change handler for selects
  document.addEventListener('change', function(event) {
    const element = event.target;
    if (!element || element.tagName !== 'SELECT') return;
    const selectedOption = element.options[element.selectedIndex];
    sendEvent(createAction('select_change', element, {
      value: element.value,
      selectedText: selectedOption?.text
    }));
  }, true);

  // Form submit handler
  document.addEventListener('submit', function(event) {
    const form = event.target;
    sendEvent(createAction('submit', form));
  }, true);

  console.log('[BrowzerRecorder] Event capture initialized');
})();
`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT HANDLING
  // ═══════════════════════════════════════════════════════════════════════

  handleRecorderEvent(tabId: string, message: RecorderMessage): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return;
    }

    switch (message.type) {
      case 'ACTION_RECORDED':
        if (message.payload) {
          this.addAction(message.payload);
        }
        break;
      case 'RECORDING_STARTED':
        console.log(`[RecordingManager] Recording confirmed in tab ${tabId}`);
        break;
      case 'RECORDING_STOPPED':
        console.log(`[RecordingManager] Recording stopped in tab ${tabId}`);
        break;
    }
  }

  private addAction(action: RecordedAction): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return;
    }

    this.currentSession.actions.push(action);

    // Notify listeners
    this.emit('recording:action', action);

    // Notify renderer
    try {
      this.browserView.webContents.send('recording:action', action);
    } catch (error) {
      console.error(
        '[RecordingManager] Failed to send action to renderer:',
        error
      );
    }

    console.log(
      `[RecordingManager] Action #${this.currentSession.actions.length}: ${action.type}`,
      action.element?.innerText || action.value || ''
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WORKFLOW GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  async generateWorkflow(
    name: string,
    description: string
  ): Promise<{ workflowId: string; filePath: string } | null> {
    if (!this.currentSession || this.currentSession.actions.length === 0) {
      return null;
    }

    // Generate workflow from recorded actions
    const workflow = this.workflowGenerator.generate(
      this.currentSession.actions,
      name,
      description
    );

    // Save to storage
    const result = await this.storageService.saveWorkflow(workflow);

    // Clear session after successful save
    this.currentSession = null;
    this.notifyStateChange();

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  getStatus(): RecordingStatus {
    return this.currentSession?.status ?? 'idle';
  }

  getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  getStorageService(): StorageService {
    return this.storageService;
  }

  private notifyStateChange(): void {
    const state: RecordingStateUpdate = {
      status: this.getStatus(),
      sessionId: this.currentSession?.id,
      actionCount: this.currentSession?.actions.length,
    };
    this.emit('recording:state-changed', state);
    try {
      this.browserView.webContents.send('recording:state-changed', state);
    } catch (error) {
      console.error('[RecordingManager] Failed to notify state change:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════

  destroy(): void {
    this.cleanupCDPRecording();
    this.currentSession = null;
  }
}
