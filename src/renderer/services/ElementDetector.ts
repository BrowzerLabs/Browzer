export interface DetectedElement {
  tag: string;
  id?: string;
  class?: string;
  text?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  type?: string;
  selector: string;
  rect?: DOMRect;
  visible: boolean;
  interactable: boolean;
}

export class ElementDetector {
  private static readonly INTERACTIVE_TAGS = [
    'a', 'button', 'input', 'select', 'textarea', 'form', 'label'
  ];

  private static readonly CLICKABLE_ROLES = [
    'button', 'link', 'menuitem', 'tab', 'option'
  ];

  analyze(): {
    elements: DetectedElement[];
    forms: any[];
    links: any[];
    text: string;
    html: string;
  } {
    const elements = this.detectInteractiveElements();
    const forms = this.detectForms();
    const links = this.detectLinks();
    const text = this.extractVisibleText();
    const html = this.getCleanHTML();

    return { elements, forms, links, text, html };
  }

  private detectInteractiveElements(): DetectedElement[] {
    const elements: DetectedElement[] = [];
    
    const allElements = document.querySelectorAll('*');
    
    for (const element of Array.from(allElements)) {
      if (this.isInteractiveElement(element)) {
        const detected = this.analyzeElement(element);
        if (detected && detected.visible) {
          elements.push(detected);
        }
      }
    }

    return elements.slice(0, 100);
  }

  private isInteractiveElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const onclick = element.getAttribute('onclick');
    const cursor = window.getComputedStyle(element).cursor;

    return (
      ElementDetector.INTERACTIVE_TAGS.includes(tagName) ||
      (role && ElementDetector.CLICKABLE_ROLES.includes(role)) ||
      onclick !== null ||
      cursor === 'pointer' ||
      element.hasAttribute('data-testid') ||
      element.classList.contains('btn') ||
      element.classList.contains('button') ||
      element.classList.contains('link')
    );
  }

  private analyzeElement(element: Element): DetectedElement | null {
    try {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      const visible = this.isElementVisible(element, rect, style);
      const interactable = this.isElementInteractable(element, rect, style);
      
      const detected: DetectedElement = {
        tag: element.tagName.toLowerCase(),
        id: element.id || undefined,
        class: element.className || undefined,
        text: this.getElementText(element),
        value: (element as HTMLInputElement).value || undefined,
        placeholder: (element as HTMLInputElement).placeholder || undefined,
        href: (element as HTMLAnchorElement).href || undefined,
        type: (element as HTMLInputElement).type || undefined,
        selector: this.generateSelector(element),
        rect: rect,
        visible,
        interactable
      };

      return detected;
    } catch (error) {
      console.warn('Error analyzing element:', error);
      return null;
    }
  }

  private isElementVisible(element: Element, rect: DOMRect, style: CSSStyleDeclaration): boolean {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0' &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  private isElementInteractable(element: Element, rect: DOMRect, style: CSSStyleDeclaration): boolean {
    return (
      this.isElementVisible(element, rect, style) &&
      !element.hasAttribute('disabled') &&
      style.pointerEvents !== 'none' &&
      rect.width >= 1 &&
      rect.height >= 1
    );
  }

  private getElementText(element: Element): string {
    const textContent = element.textContent?.trim() || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    
    return textContent || ariaLabel || title || '';
  }

  private generateSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }

    const tagName = element.tagName.toLowerCase();
    const className = element.className;
    
    if (className && typeof className === 'string') {
      const classes = className.split(' ').filter(c => c.length > 0);
      if (classes.length > 0) {
        return `${tagName}.${classes[0]}`;
      }
    }

    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      return `${this.generateSelector(parent)} > ${tagName}:nth-child(${index + 1})`;
    }

    return tagName;
  }

  private detectForms(): any[] {
    const forms = Array.from(document.querySelectorAll('form'));
    return forms.map(form => ({
      action: form.action,
      method: form.method,
      fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
        name: (field as HTMLInputElement).name,
        type: (field as HTMLInputElement).type,
        required: field.hasAttribute('required'),
        placeholder: (field as HTMLInputElement).placeholder
      }))
    }));
  }

  private detectLinks(): any[] {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.slice(0, 50).map(link => ({
      href: (link as HTMLAnchorElement).href,
      text: link.textContent?.trim() || '',
      title: link.getAttribute('title') || ''
    }));
  }

  private extractVisibleText(): string {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: string[] = [];
    let node;
    
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text && text.length > 0) {
        textNodes.push(text);
      }
    }

    return textNodes.join(' ').substring(0, 2000);
  }

  private getCleanHTML(): string {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    
    const scriptsAndStyles = clone.querySelectorAll('script, style, noscript');
    scriptsAndStyles.forEach(el => el.remove());
    
    const comments = clone.querySelectorAll('*');
    comments.forEach(el => {
      for (let i = el.childNodes.length - 1; i >= 0; i--) {
        const child = el.childNodes[i];
        if (child.nodeType === Node.COMMENT_NODE) {
          el.removeChild(child);
        }
      }
    });

    return clone.outerHTML.substring(0, 10000);
  }
}
