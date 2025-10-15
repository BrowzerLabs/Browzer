/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ObservationTools - Browser observation and verification operations
 * 
 * Provides tools for LLM agents to observe and understand browser state:
 * - get_page_info: Get current page URL, title, and basic info
 * - find_element: Search for elements by description or attributes
 * - verify_element_exists: Check if an element exists
 * - verify_text_present: Check if text is present on page
 * - get_element_text: Get text content of an element
 * - get_element_attribute: Get attribute value of an element
 * - wait_for_element: Wait for an element to appear
 * - get_console_logs: Get recent console log messages
 * - take_screenshot: Capture page screenshot
 */

import { ToolExecutor } from './ToolExecutor';
import { 
  ToolResult, 
  ToolDefinition, 
  ElementSelector, 
  ObservationOptions,
  ToolErrorCode 
} from './types';

export class ObservationTools extends ToolExecutor {
  /**
   * Get current page information
   */
  public async getPageInfo(): Promise<ToolResult> {
    this.log('info', 'Getting page information');

    try {
      await this.ensureDebuggerAttached();

      const pageInfo = await this.evaluateInPage(`
        (function() {
          return {
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            scrollPosition: {
              x: window.scrollX || window.pageXOffset,
              y: window.scrollY || window.pageYOffset
            },
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            documentSize: {
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight
            }
          };
        })();
      `);

      return this.createSuccessResult(
        'Successfully retrieved page information',
        pageInfo
      );

    } catch (error) {
      this.log('error', `Get page info failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to get page info: ${(error as Error).message}`
      );
    }
  }

  /**
   * Find elements by description (natural language search)
   */
  public async findElement(
    description: string,
    options: ObservationOptions = {}
  ): Promise<ToolResult> {
    this.log('info', `Finding element: "${description}"`);

    try {
      await this.ensureDebuggerAttached();

      // Try multiple strategies to find element
      const script = `
        (function() {
          const description = '${description.toLowerCase()}';
          const candidates = [];
          
          // Search by text content
          const allElements = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"]');
          
          for (const el of allElements) {
            const text = (el.innerText || el.textContent || '').toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            const title = (el.getAttribute('title') || '').toLowerCase();
            const value = (el.value || '').toLowerCase();
            
            let score = 0;
            
            // Exact match gets highest score
            if (text === description) score += 100;
            else if (text.includes(description)) score += 50;
            
            if (ariaLabel === description) score += 100;
            else if (ariaLabel.includes(description)) score += 50;
            
            if (placeholder.includes(description)) score += 40;
            if (title.includes(description)) score += 40;
            if (value.includes(description)) score += 30;
            
            if (score > 0) {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              const isVisible = (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0
              );
              
              candidates.push({
                score,
                tagName: el.tagName,
                id: el.id || undefined,
                className: el.className || undefined,
                text: (el.innerText || el.textContent || '').substring(0, 100),
                ariaLabel: el.getAttribute('aria-label') || undefined,
                selector: el.id ? '#' + el.id : generateSelector(el),
                isVisible,
                boundingBox: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                }
              });
            }
          }
          
          // Sort by score
          candidates.sort((a, b) => b.score - a.score);
          
          // Generate CSS selector
          function generateSelector(element) {
            if (element.id) return '#' + element.id;
            if (element.hasAttribute('data-testid')) {
              return '[data-testid="' + element.getAttribute('data-testid') + '"]';
            }
            
            const path = [];
            let current = element;
            let depth = 0;
            
            while (current && depth < 3) {
              let selector = current.tagName.toLowerCase();
              if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
                if (classes) selector += '.' + classes;
              }
              path.unshift(selector);
              current = current.parentElement;
              depth++;
            }
            
            return path.join(' > ');
          }
          
          return {
            found: candidates.length > 0,
            count: candidates.length,
            elements: candidates.slice(0, 5) // Return top 5 matches
          };
        })();
      `;

      const result = await this.evaluateInPage(script);

      if (!result.found) {
        return this.createErrorResult(
          ToolErrorCode.ELEMENT_NOT_FOUND,
          `No elements found matching description: "${description}"`,
          { description },
          [
            'Try a different description or be more specific',
            'Check if the element is actually present on the page',
            'Use a direct selector instead (id, css, aria-label)'
          ]
        );
      }

      this.log('info', `✅ Found ${result.count} matching element(s)`);

      return this.createSuccessResult(
        `Found ${result.count} element(s) matching "${description}"`,
        {
          description,
          matchCount: result.count,
          topMatches: result.elements
        }
      );

    } catch (error) {
      this.log('error', `Find element failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to find element: ${(error as Error).message}`,
        { description }
      );
    }
  }

  /**
   * Verify element exists
   */
  public async verifyElementExists(selector: ElementSelector): Promise<ToolResult> {
    this.log('info', `Verifying element exists: ${selector.strategy}="${selector.value}"`);

    try {
      await this.ensureDebuggerAttached();

      const cssSelector = this.convertSelectorToCSS(selector);
      const exists = await this.evaluateInPage(`
        !!document.querySelector('${cssSelector}')
      `);

      if (exists) {
        return this.createSuccessResult(
          `Element exists: ${selector.value}`,
          { selector: selector.value, exists: true }
        );
      } else {
        return this.createErrorResult(
          ToolErrorCode.ELEMENT_NOT_FOUND,
          `Element does not exist: ${selector.value}`,
          { selector: selector.value, exists: false }
        );
      }

    } catch (error) {
      this.log('error', `Verify element failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to verify element: ${(error as Error).message}`
      );
    }
  }

  /**
   * Verify text is present on page
   */
  public async verifyTextPresent(
    text: string,
    selector?: ElementSelector
  ): Promise<ToolResult> {
    this.log('info', `Verifying text present: "${text}"${selector ? ` in ${selector.value}` : ''}`);

    try {
      await this.ensureDebuggerAttached();

      const script = selector
        ? `document.querySelector('${this.convertSelectorToCSS(selector)}')?.textContent?.includes('${text}')`
        : `document.body.textContent?.includes('${text}')`;

      const found = await this.evaluateInPage(script);

      if (found) {
        return this.createSuccessResult(
          `Text found: "${text}"`,
          { text, found: true }
        );
      } else {
        return this.createErrorResult(
          ToolErrorCode.VERIFICATION_FAILED,
          `Text not found: "${text}"`,
          { text, found: false },
          [
            'Check if the text is actually present on the page',
            'Text search is case-sensitive',
            'Try waiting longer for content to load'
          ]
        );
      }

    } catch (error) {
      this.log('error', `Verify text failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to verify text: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get text content of an element
   */
  public async getElementText(selector: ElementSelector): Promise<ToolResult> {
    this.log('info', `Getting text from: ${selector.value}`);

    try {
      await this.ensureDebuggerAttached();

      const cssSelector = this.convertSelectorToCSS(selector);
      const result = await this.evaluateInPage(`
        (function() {
          const el = document.querySelector('${cssSelector}');
          if (!el) return { found: false };
          return {
            found: true,
            innerText: el.innerText || '',
            textContent: el.textContent || '',
            value: el.value || undefined
          };
        })();
      `);

      if (!result.found) {
        return this.createErrorResult(
          ToolErrorCode.ELEMENT_NOT_FOUND,
          `Element not found: ${selector.value}`
        );
      }

      return this.createSuccessResult(
        'Successfully retrieved element text',
        {
          selector: selector.value,
          innerText: result.innerText,
          textContent: result.textContent,
          value: result.value
        }
      );

    } catch (error) {
      this.log('error', `Get element text failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to get element text: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get attribute value of an element
   */
  public async getElementAttribute(
    selector: ElementSelector,
    attribute: string
  ): Promise<ToolResult> {
    this.log('info', `Getting attribute "${attribute}" from: ${selector.value}`);

    try {
      await this.ensureDebuggerAttached();

      const cssSelector = this.convertSelectorToCSS(selector);
      const result = await this.evaluateInPage(`
        (function() {
          const el = document.querySelector('${cssSelector}');
          if (!el) return { found: false };
          return {
            found: true,
            value: el.getAttribute('${attribute}')
          };
        })();
      `);

      if (!result.found) {
        return this.createErrorResult(
          ToolErrorCode.ELEMENT_NOT_FOUND,
          `Element not found: ${selector.value}`
        );
      }

      return this.createSuccessResult(
        `Successfully retrieved attribute "${attribute}"`,
        {
          selector: selector.value,
          attribute,
          value: result.value
        }
      );

    } catch (error) {
      this.log('error', `Get attribute failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to get attribute: ${(error as Error).message}`
      );
    }
  }

  /**
   * Wait for element to appear
   */
  public async waitForElement(
    selector: ElementSelector,
    timeout = this.defaultTimeout
  ): Promise<ToolResult> {
    this.log('info', `Waiting for element: ${selector.value} (timeout: ${timeout}ms)`);

    try {
      await this.ensureDebuggerAttached();

      const startTime = Date.now();
      const cssSelector = this.convertSelectorToCSS(selector);

      while (Date.now() - startTime < timeout) {
        const exists = await this.evaluateInPage(`
          !!document.querySelector('${cssSelector}')
        `);

        if (exists) {
          const waitTime = Date.now() - startTime;
          this.log('info', `✅ Element appeared after ${waitTime}ms`);

          return this.createSuccessResult(
            `Element appeared after ${waitTime}ms`,
            {
              selector: selector.value,
              waitTime
            },
            waitTime
          );
        }

        await this.sleep(100);
      }

      return this.createErrorResult(
        ToolErrorCode.TIMEOUT,
        `Element did not appear within ${timeout}ms: ${selector.value}`,
        { selector: selector.value, timeout },
        [
          'Increase the timeout value',
          'Check if the selector is correct',
          'Verify the element actually appears on this page'
        ]
      );

    } catch (error) {
      this.log('error', `Wait for element failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to wait for element: ${(error as Error).message}`
      );
    }
  }

  /**
   * Take screenshot of current page
   */
  public async takeScreenshot(fullPage = false): Promise<ToolResult> {
    this.log('info', `Taking screenshot${fullPage ? ' (full page)' : ''}`);

    try {
      const screenshot = await this.captureScreenshot();

      if (!screenshot) {
        throw new Error('Screenshot capture failed');
      }

      return this.createSuccessResult(
        'Successfully captured screenshot',
        {
          screenshot, // Base64 data URL
          fullPage,
          url: this.getCurrentURL()
        }
      );

    } catch (error) {
      this.log('error', `Screenshot failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.CDP_ERROR,
        `Failed to take screenshot: ${(error as Error).message}`
      );
    }
  }

  /**
   * Convert selector to CSS selector
   */
  private convertSelectorToCSS(selector: ElementSelector): string {
    switch (selector.strategy) {
      case 'id':
        return `#${selector.value}`;
      case 'css':
        return selector.value;
      case 'data-testid':
        return `[data-testid="${selector.value}"]`;
      case 'aria-label':
        return `[aria-label="${selector.value}"]`;
      case 'role':
        return `[role="${selector.value}"]`;
      default:
        return selector.value;
    }
  }

  /**
   * Get tool definitions for MCP
   */
  public static getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'get_page_info',
        description: 'Get current page information including URL, title, scroll position, and viewport size',
        category: 'observation',
        parameters: {},
        returns: {
          type: 'object',
          description: 'Page information object'
        }
      },
      {
        name: 'find_element',
        description: 'Search for elements using natural language description. Returns matching elements with details.',
        category: 'observation',
        parameters: {
          description: {
            type: 'string',
            description: 'Natural language description of the element to find (e.g., "login button", "email input")',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Search results with matching elements'
        }
      },
      {
        name: 'verify_element_exists',
        description: 'Check if an element exists on the page',
        category: 'observation',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Verification result'
        }
      },
      {
        name: 'verify_text_present',
        description: 'Check if specific text is present on the page or within an element',
        category: 'observation',
        parameters: {
          text: {
            type: 'string',
            description: 'The text to search for',
            required: true
          },
          selector_strategy: {
            type: 'string',
            description: 'Optional: Strategy to limit search to specific element',
          },
          selector_value: {
            type: 'string',
            description: 'Optional: Selector value to limit search scope'
          }
        },
        returns: {
          type: 'object',
          description: 'Text presence verification result'
        }
      },
      {
        name: 'get_element_text',
        description: 'Get the text content of an element',
        category: 'observation',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Element text content'
        }
      },
      {
        name: 'get_element_attribute',
        description: 'Get the value of an element attribute',
        category: 'observation',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          },
          attribute: {
            type: 'string',
            description: 'The attribute name to retrieve (e.g., "href", "value", "disabled")',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Attribute value'
        }
      },
      {
        name: 'wait_for_element',
        description: 'Wait for an element to appear on the page',
        category: 'observation',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          },
          timeout: {
            type: 'number',
            description: 'Maximum time to wait in milliseconds (default: 10000)',
            default: 10000
          }
        },
        returns: {
          type: 'object',
          description: 'Wait result with actual wait time'
        }
      },
      {
        name: 'take_screenshot',
        description: 'Capture a screenshot of the current page',
        category: 'observation',
        parameters: {
          full_page: {
            type: 'boolean',
            description: 'Whether to capture the full page (default: false)',
            default: false
          }
        },
        returns: {
          type: 'object',
          description: 'Screenshot result with base64 data'
        }
      }
    ];
  }
}

