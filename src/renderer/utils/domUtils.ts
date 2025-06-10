export class DOMUtils {
  static getElementById<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  static querySelector<T extends Element>(selector: string): T | null {
    return document.querySelector(selector) as T | null;
  }

  static querySelectorAll<T extends Element>(selector: string): NodeListOf<T> {
    return document.querySelectorAll(selector) as NodeListOf<T>;
  }

  static createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: {
      className?: string;
      id?: string;
      textContent?: string;
      innerHTML?: string;
      attributes?: Record<string, string>;
      styles?: Partial<CSSStyleDeclaration>;
    }
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);
    
    if (options) {
      if (options.className) element.className = options.className;
      if (options.id) element.id = options.id;
      if (options.textContent) element.textContent = options.textContent;
      if (options.innerHTML) element.innerHTML = options.innerHTML;
      
      if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
          element.setAttribute(key, value);
        });
      }
      
      if (options.styles) {
        Object.assign(element.style, options.styles);
      }
    }
    
    return element;
  }

  static addEventListenerSafe<K extends keyof HTMLElementEventMap>(
    element: HTMLElement | null,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (element) {
      element.addEventListener(type, listener, options);
    }
  }

  static removeEventListenerSafe<K extends keyof HTMLElementEventMap>(
    element: HTMLElement | null,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void {
    if (element) {
      element.removeEventListener(type, listener, options);
    }
  }

  static toggleClass(element: HTMLElement | null, className: string, force?: boolean): boolean {
    if (element) {
      return element.classList.toggle(className, force);
    }
    return false;
  }

  static addClass(element: HTMLElement | null, ...classNames: string[]): void {
    if (element) {
      element.classList.add(...classNames);
    }
  }

  static removeClass(element: HTMLElement | null, ...classNames: string[]): void {
    if (element) {
      element.classList.remove(...classNames);
    }
  }

  static hasClass(element: HTMLElement | null, className: string): boolean {
    return element ? element.classList.contains(className) : false;
  }

  static setStyles(element: HTMLElement | null, styles: Partial<CSSStyleDeclaration>): void {
    if (element) {
      Object.assign(element.style, styles);
    }
  }

  static show(element: HTMLElement | null): void {
    this.setStyles(element, { display: 'block' });
  }

  static hide(element: HTMLElement | null): void {
    this.setStyles(element, { display: 'none' });
  }

  static fadeIn(element: HTMLElement | null, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }

      element.style.opacity = '0';
      element.style.display = 'block';
      
      const start = performance.now();
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        element.style.opacity = progress.toString();
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  }

  static fadeOut(element: HTMLElement | null, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }

      const start = performance.now();
      const initialOpacity = parseFloat(element.style.opacity) || 1;
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        element.style.opacity = (initialOpacity * (1 - progress)).toString();
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          element.style.display = 'none';
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  }

  static slideDown(element: HTMLElement | null, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }

      element.style.height = '0';
      element.style.overflow = 'hidden';
      element.style.display = 'block';
      
      const targetHeight = element.scrollHeight;
      const start = performance.now();
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        element.style.height = `${targetHeight * progress}px`;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          element.style.height = '';
          element.style.overflow = '';
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  }

  static slideUp(element: HTMLElement | null, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }

      const initialHeight = element.offsetHeight;
      element.style.height = `${initialHeight}px`;
      element.style.overflow = 'hidden';
      
      const start = performance.now();
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        element.style.height = `${initialHeight * (1 - progress)}px`;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          element.style.display = 'none';
          element.style.height = '';
          element.style.overflow = '';
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  }

  static getElementPosition(element: HTMLElement): { top: number; left: number; width: number; height: number } {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    };
  }

  static isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && 
           rect.left >= 0 && 
           rect.bottom <= window.innerHeight && 
           rect.right <= window.innerWidth;
  }

  static scrollToElement(element: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    element.scrollIntoView({ behavior });
  }

  static createModal(content: string | HTMLElement, options?: {
    className?: string;
    showCloseButton?: boolean;
    onClose?: () => void;
  }): HTMLElement {
    const modal = this.createElement('div', {
      className: `modal ${options?.className || ''}`,
      styles: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '1000'
      }
    });

    const modalContent = this.createElement('div', {
      className: 'modal-content',
      styles: {
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        maxWidth: '80%',
        maxHeight: '80%',
        overflow: 'auto',
        position: 'relative'
      }
    });

    if (options?.showCloseButton !== false) {
      const closeButton = this.createElement('button', {
        textContent: '×',
        className: 'modal-close',
        styles: {
          position: 'absolute',
          top: '10px',
          right: '15px',
          border: 'none',
          background: 'none',
          fontSize: '24px',
          cursor: 'pointer'
        }
      });

      closeButton.addEventListener('click', () => {
        this.removeModal(modal);
        options?.onClose?.();
      });

      modalContent.appendChild(closeButton);
    }

    if (typeof content === 'string') {
      const contentDiv = this.createElement('div', { innerHTML: content });
      modalContent.appendChild(contentDiv);
    } else {
      modalContent.appendChild(content);
    }

    modal.appendChild(modalContent);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.removeModal(modal);
        options?.onClose?.();
      }
    });

    // Close on Escape key
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.removeModal(modal);
        options?.onClose?.();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    document.body.appendChild(modal);
    return modal;
  }

  static removeModal(modal: HTMLElement): void {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }

  static createToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 3000): void {
    const toast = this.createElement('div', {
      textContent: message,
      className: `toast toast-${type}`,
      styles: {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '4px',
        color: 'white',
        fontSize: '14px',
        fontWeight: '500',
        zIndex: '2000',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'all 0.3s ease'
      }
    });

    // Set background color based on type
    const colors = {
      info: '#2196F3',
      success: '#4CAF50',
      warning: '#FF9800',
      error: '#F44336'
    };
    toast.style.backgroundColor = colors[type];

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    // Auto remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  static debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let timeoutId: ReturnType<typeof setTimeout>;
    return ((...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    }) as T;
  }

  static throttle<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let lastCall = 0;
    return ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(this, args);
      }
    }) as T;
  }

  static copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    } else {
      // Fallback for older browsers
      const textArea = this.createElement('textarea', {
        textContent: text,
        styles: {
          position: 'fixed',
          left: '-9999px',
          top: '-9999px'
        }
      });
      
      document.body.appendChild(textArea);
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return Promise.resolve(successful);
      } catch (err) {
        document.body.removeChild(textArea);
        return Promise.resolve(false);
      }
    }
  }
} 