export interface ElementInfo {
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  visible: boolean;
  clickable: boolean;
  selector: string;
}

export interface PageInfo {
  url: string;
  title: string;
  ready: boolean;
  elements: ElementInfo[];
}

export class BrowserAutomation {
  private webview: any;

  constructor(webview: any) {
    this.webview = webview;
  }

  /**
   * Wait for an element to appear on the page
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<boolean> {
    const script = `
      (function() {
        return new Promise((resolve) => {
          const checkElement = () => {
            const element = document.querySelector('${selector}');
            if (element) {
              resolve(true);
            } else {
              setTimeout(checkElement, 100);
            }
          };
          checkElement();
          
          // Timeout after specified time
          setTimeout(() => resolve(false), ${timeout});
        });
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error waiting for element:', error);
      return false;
    }
  }

  /**
   * Wait for the page to be ready
   */
  async waitForPageReady(timeout: number = 10000): Promise<boolean> {
    const script = `
      (function() {
        return new Promise((resolve) => {
          const checkReady = () => {
            if (document.readyState === 'complete') {
              resolve(true);
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
          
          // Timeout after specified time
          setTimeout(() => resolve(false), ${timeout});
        });
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error waiting for page ready:', error);
      return false;
    }
  }

  /**
   * Get information about the current page
   */
  async getPageInfo(): Promise<PageInfo> {
    const script = `
      (function() {
        const elements = Array.from(document.querySelectorAll('*')).slice(0, 100).map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: el.className || undefined,
            text: el.textContent?.trim().substring(0, 50) || undefined,
            visible: rect.width > 0 && rect.height > 0,
            clickable: ['a', 'button', 'input', 'select', 'textarea'].includes(el.tagName.toLowerCase()),
            selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase())
          };
        });

        return {
          url: window.location.href,
          title: document.title,
          ready: document.readyState === 'complete',
          elements: elements
        };
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error getting page info:', error);
      return {
        url: '',
        title: '',
        ready: false,
        elements: []
      };
    }
  }

  /**
   * Find elements by text content
   */
  async findElementsByText(text: string): Promise<ElementInfo[]> {
    const script = `
      (function() {
        const elements = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.textContent && el.textContent.toLowerCase().includes('${text.toLowerCase()}');
        }).map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: el.className || undefined,
            text: el.textContent?.trim().substring(0, 50) || undefined,
            visible: rect.width > 0 && rect.height > 0,
            clickable: ['a', 'button', 'input', 'select', 'textarea'].includes(el.tagName.toLowerCase()),
            selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase())
          };
        });

        return elements;
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error finding elements by text:', error);
      return [];
    }
  }

  /**
   * Scroll to an element
   */
  async scrollToElement(selector: string): Promise<boolean> {
    const script = `
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        return false;
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error scrolling to element:', error);
      return false;
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(): Promise<string | null> {
    try {
      const image = await this.webview.capturePage();
      return image.toDataURL();
    } catch (error) {
      console.error('[BrowserAutomation] Error taking screenshot:', error);
      return null;
    }
  }

  /**
   * Check if an element is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    const script = `
      (function() {
        const element = document.querySelector('${selector}');
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && 
               rect.top >= 0 && rect.left >= 0 &&
               rect.bottom <= window.innerHeight && 
               rect.right <= window.innerWidth;
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error checking element visibility:', error);
      return false;
    }
  }

  /**
   * Get the value of an input element
   */
  async getElementValue(selector: string): Promise<string | null> {
    const script = `
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          return element.value || element.textContent || element.innerText;
        }
        return null;
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error getting element value:', error);
      return null;
    }
  }

  /**
   * Clear an input field
   */
  async clearInput(selector: string): Promise<boolean> {
    const script = `
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error clearing input:', error);
      return false;
    }
  }

  /**
   * Simulate keyboard key press
   */
  async pressKey(key: string): Promise<boolean> {
    const script = `
      (function() {
        const event = new KeyboardEvent('keydown', {
          key: '${key}',
          code: '${key}',
          bubbles: true
        });
        document.dispatchEvent(event);
        return true;
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error pressing key:', error);
      return false;
    }
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(timeout: number = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      
      const onNavigate = () => {
        if (!resolved) {
          resolved = true;
          this.webview.removeEventListener('did-finish-load', onNavigate);
          resolve(true);
        }
      };

      this.webview.addEventListener('did-finish-load', onNavigate);
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.webview.removeEventListener('did-finish-load', onNavigate);
          resolve(false);
        }
      }, timeout);
    });
  }

  /**
   * Execute custom JavaScript on the page
   */
  async executeScript(script: string): Promise<any> {
    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error executing script:', error);
      return null;
    }
  }

  /**
   * Get all links on the page
   */
  async getAllLinks(): Promise<Array<{text: string, href: string}>> {
    const script = `
      (function() {
        return Array.from(document.querySelectorAll('a[href]')).map(link => ({
          text: link.textContent?.trim() || '',
          href: link.href
        })).filter(link => link.text);
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error getting links:', error);
      return [];
    }
  }

  /**
   * Get all form elements on the page
   */
  async getAllFormElements(): Promise<Array<{tag: string, type?: string, name?: string, id?: string, selector: string}>> {
    const script = `
      (function() {
        return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || undefined,
          name: el.name || undefined,
          id: el.id || undefined,
          selector: el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : el.tagName.toLowerCase())
        }));
      })();
    `;

    try {
      return await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[BrowserAutomation] Error getting form elements:', error);
      return [];
    }
  }
}

/**
 * Helper function to create a BrowserAutomation instance
 */
export function createBrowserAutomation(webview: any): BrowserAutomation {
  return new BrowserAutomation(webview);
}

/**
 * Common selectors for different websites
 */
export const CommonSelectors = {
  google: {
    searchBox: 'input[name="q"]',
    searchButton: 'input[name="btnK"], input[type="submit"]',
    results: '.g',
    firstResult: '.g:first-child a'
  },
  amazon: {
    searchBox: '#twotabsearchtextbox',
    searchButton: '#nav-search-submit-button',
    results: '[data-component-type="s-search-result"]',
    sortDropdown: '#s-result-sort-select',
    priceFilter: '[data-cy="price-filter"]',
    addToCart: '#add-to-cart-button'
  },
  youtube: {
    searchBox: 'input#search',
    searchButton: '#search-icon-legacy',
    results: '#contents ytd-video-renderer',
    firstVideo: '#contents ytd-video-renderer:first-child a'
  },
  generic: {
    searchInputs: 'input[type="search"], input[name*="search"], input[placeholder*="search"]',
    textInputs: 'input[type="text"], input[type="email"], input[type="password"]',
    buttons: 'button, input[type="button"], input[type="submit"]',
    links: 'a[href]',
    forms: 'form'
  }
};

/**
 * Utility function to get the best selector for a site
 */
export function getBestSelector(site: string, element: string): string {
  const hostname = new URL(site).hostname.toLowerCase();
  
  if (hostname.includes('google.com')) {
    return CommonSelectors.google[element as keyof typeof CommonSelectors.google] || '';
  } else if (hostname.includes('amazon.com')) {
    return CommonSelectors.amazon[element as keyof typeof CommonSelectors.amazon] || '';
  } else if (hostname.includes('youtube.com')) {
    return CommonSelectors.youtube[element as keyof typeof CommonSelectors.youtube] || '';
  } else {
    return CommonSelectors.generic[element as keyof typeof CommonSelectors.generic] || '';
  }
} 