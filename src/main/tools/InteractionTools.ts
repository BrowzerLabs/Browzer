/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * InteractionTools - Browser interaction operations
 * 
 * Provides reliable interaction tools for LLM agents:
 * - click_element: Click on an element
 * - type_text: Type text into an input field
 * - press_key: Press a keyboard key
 * - select_option: Select from a dropdown
 * - check_checkbox: Check/uncheck a checkbox
 * - submit_form: Submit a form
 * 
 * Features:
 * - Multi-strategy element location
 * - Element visibility and clickability verification
 * - Retry logic with intelligent fallbacks
 * - Post-action verification
 */

import { ToolExecutor } from './ToolExecutor';
import { 
  ToolResult, 
  ToolDefinition, 
  ElementSelector, 
  InteractionOptions,
  TypeOptions,
  ToolErrorCode 
} from './types';

export class InteractionTools extends ToolExecutor {
  /**
   * Click on an element
   */
  public async clickElement(
    selector: ElementSelector,
    options: InteractionOptions = {}
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const {
      timeout = this.defaultTimeout,
      verify = true,
      waitForElement = true,
      offset = { x: 0, y: 0 },
      retries = 2
    } = options;

    this.log('info', `Clicking element: ${selector.strategy}="${selector.value}"`);

    try {
      await this.ensureDebuggerAttached();

      const operation = async () => {
        // Find element
        const element = await this.findElement(selector, waitForElement ? timeout : 1000);

        if (!element) {
          throw new Error(`Element not found: ${selector.strategy}="${selector.value}"`);
        }

        // Verify element is clickable
        if (verify) {
          const isClickable = await this.verifyElementClickable(element.nodeId);
          if (!isClickable) {
            throw new Error('Element is not clickable (hidden, disabled, or obscured)');
          }
        }

        // Perform click
        await this.performClick(element, offset);

        // Wait for potential effects
        await this.sleep(300);

        return element;
      };

      // Execute with retry
      const element = await this.executeWithRetry(operation, retries);

      const executionTime = Date.now() - startTime;
      this.log('info', `✅ Click successful in ${executionTime}ms`);

      return this.createSuccessResult(
        `Successfully clicked element`,
        {
          selector: selector.value,
          strategy: selector.strategy,
          boundingBox: element.box
        },
        executionTime
      );

    } catch (error) {
      const errorMessage = (error as Error).message;
      this.log('error', `Click failed: ${errorMessage}`);

      return this.createErrorResult(
        errorMessage.includes('not found') 
          ? ToolErrorCode.ELEMENT_NOT_FOUND 
          : ToolErrorCode.CLICK_FAILED,
        `Failed to click element: ${errorMessage}`,
        { selector: selector.value, strategy: selector.strategy },
        [
          'Verify the element selector is correct',
          'Check if the element is visible on the page',
          'Try waiting longer for the element to appear',
          'Try a different selector strategy'
        ]
      );
    }
  }

  /**
   * Type text into an element
   */
  public async typeText(
    selector: ElementSelector,
    text: string,
    options: TypeOptions = {}
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const {
      delay = 50,
      clear = false,
      submit = false,
      verify = true
    } = options;

    this.log('info', `Typing text into ${selector.strategy}="${selector.value}": "${text}"`);

    try {
      await this.ensureDebuggerAttached();

      // Click element first to focus it
      const clickResult = await this.clickElement(selector, { verify });
      if (!clickResult.success) {
        return clickResult;
      }

      await this.sleep(200); // Wait for focus

      // Clear existing text if requested
      if (clear) {
        await this.clearInput();
      }

      // Type each character
      for (const char of text) {
        await this.executeCDP('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char
        });

        await this.executeCDP('Input.dispatchKeyEvent', {
          type: 'keyUp',
          text: char
        });

        if (delay > 0) {
          await this.sleep(delay);
        }
      }

      // Submit if requested
      if (submit) {
        await this.pressKey('Enter');
      }

      const executionTime = Date.now() - startTime;
      this.log('info', `✅ Text typed successfully in ${executionTime}ms`);

      return this.createSuccessResult(
        `Successfully typed "${text}" into element`,
        {
          selector: selector.value,
          text,
          submitted: submit
        },
        executionTime
      );

    } catch (error) {
      this.log('error', `Type text failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.TYPE_FAILED,
        `Failed to type text: ${(error as Error).message}`,
        { selector: selector.value, text }
      );
    }
  }

  /**
   * Press a keyboard key
   */
  public async pressKey(key: string): Promise<ToolResult> {
    this.log('info', `Pressing key: ${key}`);

    try {
      await this.ensureDebuggerAttached();

      const keyMap: Record<string, number> = {
        'Enter': 13,
        'Escape': 27,
        'Tab': 9,
        'Backspace': 8,
        'Delete': 46,
        'ArrowUp': 38,
        'ArrowDown': 40,
        'ArrowLeft': 37,
        'ArrowRight': 39
      };

      const keyCode = keyMap[key];

      await this.executeCDP('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode
      });

      await this.sleep(50);

      await this.executeCDP('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode
      });

      await this.sleep(200);

      return this.createSuccessResult(`Successfully pressed ${key} key`);

    } catch (error) {
      this.log('error', `Press key failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.TYPE_FAILED,
        `Failed to press key: ${(error as Error).message}`,
        { key }
      );
    }
  }

  /**
   * Select an option from a dropdown
   */
  public async selectOption(
    selector: ElementSelector,
    optionValue: string
  ): Promise<ToolResult> {
    this.log('info', `Selecting option "${optionValue}" from ${selector.strategy}="${selector.value}"`);

    try {
      await this.ensureDebuggerAttached();

      // Find the select element
      const element = await this.findElement(selector, this.defaultTimeout);
      if (!element) {
        throw new Error('Select element not found');
      }

      // Select option using JavaScript
      const script = `
        (function() {
          const select = document.querySelector('${selector.value}');
          if (!select) return { success: false, error: 'Element not found' };
          
          const option = Array.from(select.options).find(opt => 
            opt.value === '${optionValue}' || opt.text === '${optionValue}'
          );
          
          if (!option) return { success: false, error: 'Option not found' };
          
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          
          return { success: true, value: option.value, text: option.text };
        })();
      `;

      const result = await this.evaluateInPage(script);

      if (!result.success) {
        throw new Error(result.error || 'Selection failed');
      }

      this.log('info', '✅ Option selected successfully');

      return this.createSuccessResult(
        `Successfully selected option "${result.text}" (value: ${result.value})`,
        {
          selector: selector.value,
          selectedValue: result.value,
          selectedText: result.text
        }
      );

    } catch (error) {
      this.log('error', `Select option failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.ELEMENT_NOT_FOUND,
        `Failed to select option: ${(error as Error).message}`,
        { selector: selector.value, optionValue },
        [
          'Verify the select element exists',
          'Check if the option value or text is correct',
          'Ensure the dropdown is not disabled'
        ]
      );
    }
  }

  /**
   * Check or uncheck a checkbox
   */
  public async checkCheckbox(
    selector: ElementSelector,
    checked: boolean
  ): Promise<ToolResult> {
    this.log('info', `${checked ? 'Checking' : 'Unchecking'} checkbox: ${selector.value}`);

    try {
      await this.ensureDebuggerAttached();

      const script = `
        (function() {
          const checkbox = document.querySelector('${selector.value}');
          if (!checkbox) return { success: false, error: 'Checkbox not found' };
          if (checkbox.type !== 'checkbox') return { success: false, error: 'Element is not a checkbox' };
          
          if (checkbox.checked !== ${checked}) {
            checkbox.checked = ${checked};
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          return { success: true, checked: checkbox.checked };
        })();
      `;

      const result = await this.evaluateInPage(script);

      if (!result.success) {
        throw new Error(result.error || 'Checkbox operation failed');
      }

      this.log('info', '✅ Checkbox updated successfully');

      return this.createSuccessResult(
        `Successfully ${checked ? 'checked' : 'unchecked'} checkbox`,
        {
          selector: selector.value,
          checked: result.checked
        }
      );

    } catch (error) {
      this.log('error', `Checkbox operation failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.ELEMENT_NOT_FOUND,
        `Failed to update checkbox: ${(error as Error).message}`,
        { selector: selector.value, checked }
      );
    }
  }

  /**
   * Submit a form
   */
  public async submitForm(selector: ElementSelector): Promise<ToolResult> {
    this.log('info', `Submitting form: ${selector.value}`);

    try {
      await this.ensureDebuggerAttached();

      const script = `
        (function() {
          const form = document.querySelector('${selector.value}');
          if (!form) return { success: false, error: 'Form not found' };
          if (form.tagName !== 'FORM') return { success: false, error: 'Element is not a form' };
          
          form.submit();
          return { success: true };
        })();
      `;

      const result = await this.evaluateInPage(script);

      if (!result.success) {
        throw new Error(result.error || 'Form submission failed');
      }

      // Wait for potential navigation
      await this.sleep(1000);

      this.log('info', '✅ Form submitted successfully');

      return this.createSuccessResult(
        'Successfully submitted form',
        {
          selector: selector.value,
          newUrl: this.getCurrentURL()
        }
      );

    } catch (error) {
      this.log('error', `Form submission failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.SUBMIT_FAILED,
        `Failed to submit form: ${(error as Error).message}`,
        { selector: selector.value }
      );
    }
  }

  /**
   * Find element using selector
   */
  private async findElement(
    selector: ElementSelector,
    timeout: number
  ): Promise<any> {
    const startTime = Date.now();
    const selectorValue = this.convertSelectorToCSSSelector(selector);

    while (Date.now() - startTime < timeout) {
      try {
        const { root } = await this.executeCDP('DOM.getDocument');
        const { nodeId } = await this.executeCDP('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: selectorValue
        });

        if (nodeId) {
          const { model } = await this.executeCDP('DOM.getBoxModel', { nodeId });
          
          if (model) {
            return {
              nodeId,
              box: {
                x: model.content[0],
                y: model.content[1],
                width: model.content[4] - model.content[0],
                height: model.content[5] - model.content[1]
              }
            };
          }
        }
      } catch (error) {
        // Continue waiting
      }

      await this.sleep(100);
    }

    // Try fallback selectors if provided
    if (selector.fallback && selector.fallback.length > 0) {
      for (const fallbackSelector of selector.fallback) {
        const element = await this.findElement(fallbackSelector, timeout / selector.fallback.length);
        if (element) {
          this.log('info', `Found element using fallback: ${fallbackSelector.strategy}="${fallbackSelector.value}"`);
          return element;
        }
      }
    }

    return null;
  }

  /**
   * Convert selector to CSS selector string
   */
  private convertSelectorToCSSSelector(selector: ElementSelector): string {
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
   * Verify element is clickable
   */
  private async verifyElementClickable(nodeId: number): Promise<boolean> {
    try {
      const script = `
        (function() {
          const element = document.evaluate('//*[@data-node-temp-id="${nodeId}"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (!element) return false;
          
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.disabled
          );
        })();
      `;

      return await this.evaluateInPage(script);
    } catch {
      return true; // Assume clickable if verification fails
    }
  }

  /**
   * Perform mouse click
   */
  private async performClick(element: any, offset: { x: number; y: number }): Promise<void> {
    const x = element.box.x + element.box.width / 2 + offset.x;
    const y = element.box.y + element.box.height / 2 + offset.y;

    // Move mouse to element
    await this.executeCDP('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y
    });

    await this.sleep(50);

    // Mouse down
    await this.executeCDP('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });

    await this.sleep(50);

    // Mouse up
    await this.executeCDP('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
  }

  /**
   * Clear input field
   */
  private async clearInput(): Promise<void> {
    // Select all
    await this.executeCDP('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 2 // Ctrl/Cmd
    });

    await this.executeCDP('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA'
    });

    await this.sleep(50);

    // Delete
    await this.pressKey('Backspace');
  }

  /**
   * Get tool definitions for MCP
   */
  public static getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'click_element',
        description: 'Click on an element in the page. Automatically waits for element, verifies it is clickable, and handles retries.',
        category: 'interaction',
        parameters: {
          selector_strategy: {
            type: 'string',
            enum: ['id', 'css', 'data-testid', 'aria-label', 'role', 'text'],
            description: 'The strategy to use for finding the element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          },
          verify: {
            type: 'boolean',
            description: 'Whether to verify element is clickable before clicking (default: true)',
            default: true
          },
          timeout: {
            type: 'number',
            description: 'Maximum time to wait for element in milliseconds (default: 10000)',
            default: 10000
          }
        },
        returns: {
          type: 'object',
          description: 'Click result with element details'
        },
        examples: [
          {
            description: 'Click a button by ID',
            parameters: { selector_strategy: 'id', selector_value: 'submit-button' },
            expectedResult: 'Successfully clicked element'
          },
          {
            description: 'Click a link by aria-label',
            parameters: { selector_strategy: 'aria-label', selector_value: 'Sign in' },
            expectedResult: 'Successfully clicked element'
          }
        ]
      },
      {
        name: 'type_text',
        description: 'Type text into an input field. Automatically clicks the field first to focus it.',
        category: 'interaction',
        parameters: {
          selector_strategy: {
            type: 'string',
            enum: ['id', 'css', 'data-testid', 'aria-label'],
            description: 'The strategy to use for finding the input element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          },
          text: {
            type: 'string',
            description: 'The text to type',
            required: true
          },
          clear: {
            type: 'boolean',
            description: 'Whether to clear existing text first (default: false)',
            default: false
          },
          submit: {
            type: 'boolean',
            description: 'Whether to press Enter after typing (default: false)',
            default: false
          },
          delay: {
            type: 'number',
            description: 'Delay between keystrokes in milliseconds (default: 50)',
            default: 50
          }
        },
        returns: {
          type: 'object',
          description: 'Type result with text and submission status'
        }
      },
      {
        name: 'press_key',
        description: 'Press a keyboard key (Enter, Escape, Tab, etc.)',
        category: 'interaction',
        parameters: {
          key: {
            type: 'string',
            enum: ['Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
            description: 'The key to press',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Key press result'
        }
      },
      {
        name: 'select_option',
        description: 'Select an option from a dropdown/select element',
        category: 'interaction',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the select element',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          },
          option_value: {
            type: 'string',
            description: 'The value or text of the option to select',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Selection result with selected value and text'
        }
      },
      {
        name: 'check_checkbox',
        description: 'Check or uncheck a checkbox',
        category: 'interaction',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the checkbox',
            required: true
          },
          selector_value: {
            type: 'string',
            description: 'The value for the selector',
            required: true
          },
          checked: {
            type: 'boolean',
            description: 'Whether to check (true) or uncheck (false) the checkbox',
            required: true
          }
        },
        returns: {
          type: 'object',
          description: 'Checkbox result with final checked state'
        }
      },
      {
        name: 'submit_form',
        description: 'Submit a form',
        category: 'interaction',
        parameters: {
          selector_strategy: {
            type: 'string',
            description: 'The strategy to use for finding the form',
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
          description: 'Form submission result with new URL'
        }
      }
    ];
  }
}

