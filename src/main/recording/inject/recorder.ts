/**
 * Browser Recorder Script
 *
 * This script is injected into web pages to capture user interactions.
 * It runs in the page context and sends captured events to the main process.
 */

interface RecorderConfig {
  captureClicks: boolean;
  captureInputs: boolean;
  captureNavigation: boolean;
  captureKeypress: boolean;
  captureScroll: boolean;
  debounceMs: number;
}

interface RecordedElement {
  innerText: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  altText?: string;
  value?: string;
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  type?: string;
  xpath: string;
  cssSelector: string;
  index: number;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parentText?: string;
  containerHint?: string;
}

interface RecordedAction {
  id: string;
  timestamp: string;
  type: string;
  pageUrl: string;
  pageTitle: string;
  element?: RecordedElement;
  value?: string;
  key?: string;
  scrollX?: number;
  scrollY?: number;
  selectedText?: string;
}

class BrowserRecorder {
  private config: RecorderConfig;
  private isRecording = false;
  private actionCounter = 0;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  constructor(config: Partial<RecorderConfig> = {}) {
    this.config = {
      captureClicks: true,
      captureInputs: true,
      captureNavigation: true,
      captureKeypress: true,
      captureScroll: true,
      debounceMs: 100,
      ...config,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // START/STOP RECORDING
  // ═══════════════════════════════════════════════════════════════════════

  start(): void {
    if (this.isRecording) return;
    this.isRecording = true;
    this.attachEventListeners();
    this.sendToMain({ type: 'RECORDING_STARTED' });
    console.log('[Browzer Recorder] Recording started');
  }

  stop(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.detachEventListeners();
    this.sendToMain({ type: 'RECORDING_STOPPED' });
    console.log('[Browzer Recorder] Recording stopped');
  }

  isActive(): boolean {
    return this.isRecording;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════

  private attachEventListeners(): void {
    if (this.config.captureClicks) {
      document.addEventListener('click', this.handleClick, true);
    }

    if (this.config.captureInputs) {
      document.addEventListener('input', this.handleInput, true);
      document.addEventListener('change', this.handleChange, true);
    }

    if (this.config.captureKeypress) {
      document.addEventListener('keydown', this.handleKeydown, true);
    }

    if (this.config.captureScroll) {
      document.addEventListener('scroll', this.handleScroll, true);
    }

    if (this.config.captureNavigation) {
      window.addEventListener('popstate', this.handleNavigation);
      window.addEventListener('hashchange', this.handleNavigation);
    }

    document.addEventListener('submit', this.handleSubmit, true);
  }

  private detachEventListeners(): void {
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('change', this.handleChange, true);
    document.removeEventListener('keydown', this.handleKeydown, true);
    document.removeEventListener('scroll', this.handleScroll, true);
    window.removeEventListener('popstate', this.handleNavigation);
    window.removeEventListener('hashchange', this.handleNavigation);
    document.removeEventListener('submit', this.handleSubmit, true);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  private handleClick = (event: MouseEvent): void => {
    const element = event.target as HTMLElement;
    if (!element || this.shouldIgnoreElement(element)) return;

    const action = this.createAction('click', element);
    this.sendAction(action);
  };

  private handleInput = (event: Event): void => {
    const element = event.target as HTMLInputElement;
    if (!element) return;

    // Debounce input events to avoid recording every keystroke
    this.debounce(
      () => {
        const action = this.createAction('input', element, {
          value: element.value,
        });
        this.sendAction(action);
      },
      `input_${this.getElementIdentifier(element)}`
    );
  };

  private handleChange = (event: Event): void => {
    const element = event.target as HTMLSelectElement;
    if (!element || element.tagName !== 'SELECT') return;

    const selectedOption = element.options[element.selectedIndex];
    const action = this.createAction('select_change', element, {
      value: element.value,
      selectedText: selectedOption?.text,
    });
    this.sendAction(action);
  };

  private handleKeydown = (event: KeyboardEvent): void => {
    // Only capture special keys
    const specialKeys = [
      'Enter',
      'Tab',
      'Escape',
      'Backspace',
      'Delete',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ];

    if (!specialKeys.includes(event.key)) return;

    const element = event.target as HTMLElement;
    const action = this.createAction('keypress', element, {
      key: event.key,
    });
    this.sendAction(action);
  };

  private handleScroll = (): void => {
    // Heavily debounce scroll events
    this.debounce(
      () => {
        const action = this.createAction('scroll', document.body, {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        });
        this.sendAction(action);
      },
      'scroll',
      500
    );
  };

  private handleNavigation = (): void => {
    const action = this.createAction('navigation', document.body, {
      value: window.location.href,
    });
    this.sendAction(action);
  };

  private handleSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement;
    const action = this.createAction('submit', form);
    this.sendAction(action);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ELEMENT DATA EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════

  private extractElementData(element: HTMLElement): RecordedElement {
    return {
      // Semantic identifiers (most important for self-healing)
      innerText: this.getVisibleText(element),
      placeholder: (element as HTMLInputElement).placeholder || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      title: element.getAttribute('title') || undefined,
      altText: (element as HTMLImageElement).alt || undefined,
      value: (element as HTMLInputElement).value || undefined,

      // Technical identifiers
      tagName: element.tagName.toLowerCase(),
      id: element.id || undefined,
      className: element.className || undefined,
      name: element.getAttribute('name') || undefined,
      type: element.getAttribute('type') || undefined,

      // Generated selectors
      xpath: this.generateXPath(element),
      cssSelector: this.generateCssSelector(element),

      // Position
      index: this.getElementIndex(element),
      boundingRect: this.getBoundingRect(element),

      // Context
      parentText: this.getParentContext(element),
      containerHint: this.getContainerHint(element),
    };
  }

  private getVisibleText(element: HTMLElement): string {
    let text = '';

    // For input elements, use placeholder or aria-label
    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement;
      text =
        input.placeholder ||
        element.getAttribute('aria-label') ||
        this.getLabelText(element) ||
        '';
    }
    // For buttons and links, get innerText
    else if (
      [
        'BUTTON',
        'A',
        'SPAN',
        'DIV',
        'P',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
      ].includes(element.tagName)
    ) {
      text = element.innerText?.trim() || '';
    }
    // For other elements
    else {
      text = element.textContent?.trim() || '';
    }

    // Clean up text
    text = text.replace(/\s+/g, ' ').trim();

    // Truncate if too long
    if (text.length > 100) {
      text = text.substring(0, 100) + '...';
    }

    return text;
  }

  private getLabelText(element: HTMLElement): string | null {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent?.trim() || null;
    }

    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent?.trim() || null;
    }

    return null;
  }

  private getParentContext(element: HTMLElement): string | undefined {
    const parent = element.parentElement;
    if (!parent) return undefined;

    const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, label');
    if (heading) {
      return heading.textContent?.trim();
    }

    return undefined;
  }

  private getContainerHint(element: HTMLElement): string | undefined {
    const containers = [
      'form',
      'section',
      'article',
      'aside',
      'nav',
      'header',
      'footer',
      'main',
    ];

    for (const selector of containers) {
      const container = element.closest(selector);
      if (container) {
        const label =
          container.getAttribute('aria-label') ||
          container.getAttribute('id') ||
          container.querySelector('h1, h2, h3')?.textContent?.trim();
        if (label) return label;
      }
    }

    return undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // XPATH GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  private generateXPath(element: HTMLElement): string {
    // Strategy 1: Try semantic XPath first
    const semanticXPath = this.generateSemanticXPath(element);
    if (semanticXPath) return semanticXPath;

    // Strategy 2: ID-based XPath
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    // Strategy 3: Full path XPath (fallback)
    return this.generateAbsoluteXPath(element);
  }

  private generateSemanticXPath(element: HTMLElement): string | null {
    const tag = element.tagName.toLowerCase();
    const text = this.getVisibleText(element);

    // For elements with text content
    if (
      text &&
      ['button', 'a', 'span', 'div', 'p', 'label'].includes(tag) &&
      text.length < 50
    ) {
      const escapedText = this.escapeXPathString(text);
      return `//${tag}[normalize-space(text())=${escapedText}]`;
    }

    // For inputs with placeholder
    const placeholder = (element as HTMLInputElement).placeholder;
    if (placeholder) {
      return `//input[@placeholder='${this.escapeXPathString(placeholder).slice(1, -1)}']`;
    }

    // For elements with aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `//*[@aria-label='${this.escapeXPathString(ariaLabel).slice(1, -1)}']`;
    }

    return null;
  }

  private generateAbsoluteXPath(element: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling: Element | null = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return '/' + parts.join('/');
  }

  private escapeXPathString(str: string): string {
    if (!str.includes("'")) {
      return `'${str}'`;
    }
    if (!str.includes('"')) {
      return `"${str}"`;
    }
    // Contains both single and double quotes
    const parts = str.split("'");
    return `concat('${parts.join("', \"'\", '")}')`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS SELECTOR GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  private generateCssSelector(element: HTMLElement): string {
    // Strategy 1: ID selector
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    // Strategy 2: Unique class combination
    const classSelector = this.generateClassSelector(element);
    if (classSelector) return classSelector;

    // Strategy 3: Attribute selector
    const attrSelector = this.generateAttributeSelector(element);
    if (attrSelector) return attrSelector;

    // Strategy 4: Path selector (fallback)
    return this.generatePathSelector(element);
  }

  private generateClassSelector(element: HTMLElement): string | null {
    if (!element.className || typeof element.className !== 'string')
      return null;

    const classes = element.className.split(' ').filter((c) => c.trim());
    if (classes.length === 0) return null;

    // Try each class
    for (const cls of classes) {
      const selector = `.${CSS.escape(cls)}`;
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch {
        continue;
      }
    }

    // Try with tag name
    const tag = element.tagName.toLowerCase();
    for (const cls of classes) {
      const selector = `${tag}.${CSS.escape(cls)}`;
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private generateAttributeSelector(element: HTMLElement): string | null {
    const tag = element.tagName.toLowerCase();
    const attributes = [
      'name',
      'type',
      'placeholder',
      'aria-label',
      'data-testid',
    ];

    for (const attr of attributes) {
      const value = element.getAttribute(attr);
      if (value) {
        const selector = `${tag}[${attr}="${CSS.escape(value)}"]`;
        try {
          if (document.querySelectorAll(selector).length === 1) {
            return selector;
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private generatePathSelector(element: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  private getElementIndex(element: HTMLElement): number {
    const allElements = document.querySelectorAll('*');
    return Array.from(allElements).indexOf(element);
  }

  private getElementIdentifier(element: HTMLElement): string {
    return element.id || element.className || element.tagName;
  }

  private getBoundingRect(
    element: HTMLElement
  ): RecordedElement['boundingRect'] {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  private shouldIgnoreElement(element: HTMLElement): boolean {
    const ignoredTags = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT'];
    if (ignoredTags.includes(element.tagName)) return true;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return true;

    const rect = element.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return true;

    return false;
  }

  private createAction(
    type: string,
    element: HTMLElement,
    extra: Partial<RecordedAction> = {}
  ): RecordedAction {
    return {
      id: `action_${++this.actionCounter}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type,
      pageUrl: window.location.href,
      pageTitle: document.title,
      element: this.extractElementData(element),
      ...extra,
    };
  }

  private sendAction(action: RecordedAction): void {
    this.sendToMain({
      type: 'ACTION_RECORDED',
      payload: action,
    });
    console.log(
      '[Browzer Recorder] Action recorded:',
      action.type,
      action.element?.innerText
    );
  }

  private sendToMain(message: {
    type: string;
    payload?: RecordedAction;
  }): void {
    // Send message to main process via exposed API
    if ((window as any).__browzerRecorder) {
      (window as any).__browzerRecorder.send(message);
    }
  }

  private debounce(fn: () => void, key: string, delay?: number): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      fn();
      this.debounceTimers.delete(key);
    }, delay ?? this.config.debounceMs);

    this.debounceTimers.set(key, timer);
  }
}

// Initialize recorder and expose to window
const recorder = new BrowserRecorder();
(window as any).__browzerRecorderInstance = recorder;

// Export for bundling
export { BrowserRecorder };
