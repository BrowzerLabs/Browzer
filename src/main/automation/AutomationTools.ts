/**
 * Automation Tool Definitions for Claude
 * 
 * These tools follow Anthropic's best practices for tool use:
 * - Extremely detailed descriptions
 * - Clear parameter specifications
 * - Usage guidelines and limitations
 */

import { AutomationTool } from '@/shared/types/automation';

export class AutomationTools {
  /**
   * Get all automation tools for Claude
   */
  public static getAllTools(): AutomationTool[] {
    return [
      this.getNavigateTool(),
      this.getClickTool(),
      this.getTypeTool(),
      this.getSelectTool(),
      this.getCheckboxTool(),
      this.getRadioTool(),
      this.getPressKeyTool(),
      this.getScrollTool(),
      this.getWaitTool(),
      this.getWaitForElementTool(),
    ];
  }

  private static getNavigateTool(): AutomationTool {
    return {
      name: 'navigate',
      description: `Navigate the browser to a specific URL. This tool loads a new page and waits for it to complete loading before proceeding.

**When to use:**
- To visit a specific website or page
- To change the current URL
- As the first step when starting automation on a new site

**Important notes:**
- Always use full URLs with protocol (https://example.com)
- The tool waits for page load automatically
- Navigation clears the current page state
- Use this instead of clicking links when you know the exact URL

**Examples:**
- Navigate to "https://github.com/new" to create a repository
- Navigate to "https://www.amazon.com" to start shopping
- Navigate to "https://mail.google.com" to access Gmail`,
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full URL to navigate to, including protocol (e.g., https://www.example.com)'
          }
        },
        required: ['url']
      }
    };
  }

  private static getClickTool(): AutomationTool {
    return {
      name: 'click',
      description: `Click on an element in the page. This tool uses intelligent element location with multiple fallback strategies including ID, aria-label, text content, and CSS selectors.

**When to use:**
- To click buttons, links, or any clickable element
- To trigger actions like form submission, navigation, or UI changes
- To interact with menus, dropdowns, or modals

**Selector strategies (in order of reliability):**
1. ID selector: #element-id
2. Data attributes: [data-testid="value"]
3. ARIA labels: [aria-label="Button Text"]
4. Text content: button containing "Submit"
5. CSS selectors: button.primary

**Important notes:**
- The tool automatically scrolls the element into view
- Waits for element to be visible and clickable
- Supports multiple selector strategies for robustness
- Use text-based selectors for better reliability across similar pages

**Examples:**
- Click button with text: Use selector like "button" and the tool will find by text
- Click by ID: "#submit-button"
- Click by aria-label: "[aria-label='Close dialog']"`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector, ID, aria-label, or other identifier for the element to click. Can be a simple selector like "#id", ".class", or "button"'
          }
        },
        required: ['selector']
      }
    };
  }

  private static getTypeTool(): AutomationTool {
    return {
      name: 'type',
      description: `Type text into an input field, textarea, or any editable element. This tool simulates realistic human typing with proper event dispatching.

**When to use:**
- To fill out form fields
- To enter search queries
- To input any text data

**Important notes:**
- Automatically clicks the element first to focus it
- Clears existing content before typing (optional)
- Dispatches proper input and change events
- Simulates character-by-character typing for compatibility
- Works with input, textarea, and contenteditable elements

**Best practices:**
- Always specify the complete text to type
- Use clear, specific selectors for the input field
- For passwords, the text will be typed but not logged

**Examples:**
- Type into search box: selector="#search", text="laptop computers"
- Fill form field: selector="input[name='email']", text="user@example.com"
- Enter multiline text: selector="textarea#description", text="Long description..."`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the input element (input, textarea, or contenteditable)'
          },
          text: {
            type: 'string',
            description: 'The exact text to type into the field'
          },
          clear: {
            type: 'boolean',
            description: 'Whether to clear existing content before typing (default: false)'
          }
        },
        required: ['selector', 'text']
      }
    };
  }

  private static getSelectTool(): AutomationTool {
    return {
      name: 'select',
      description: `Select an option from a dropdown menu (select element). This tool can select by option value or visible text.

**When to use:**
- To choose an option from a <select> dropdown
- To change the selected value in a dropdown menu

**Important notes:**
- Can match by option value OR visible text
- Automatically triggers change and input events
- Works with both single and multiple select elements
- The tool will try to find the option by value first, then by text

**Examples:**
- Select by value: selector="select#country", value="US"
- Select by text: selector="select[name='size']", value="Large"
- Select from dropdown: selector="#payment-method", value="Credit Card"`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the select element'
          },
          value: {
            type: 'string',
            description: 'The option value or visible text to select'
          }
        },
        required: ['selector', 'value']
      }
    };
  }

  private static getCheckboxTool(): AutomationTool {
    return {
      name: 'checkbox',
      description: `Check or uncheck a checkbox element. This tool sets the checkbox to a specific state (checked or unchecked).

**When to use:**
- To toggle checkboxes in forms
- To enable or disable options
- To accept terms and conditions

**Important notes:**
- Explicitly sets the checkbox state (doesn't toggle)
- Dispatches proper change and input events
- Only changes state if different from current state
- Works with input[type="checkbox"] elements

**Examples:**
- Check a checkbox: selector="#terms-agree", checked=true
- Uncheck a checkbox: selector="input[name='newsletter']", checked=false
- Accept terms: selector="#accept-terms", checked=true`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the checkbox input element'
          },
          checked: {
            type: 'boolean',
            description: 'True to check the checkbox, false to uncheck it'
          }
        },
        required: ['selector', 'checked']
      }
    };
  }

  private static getRadioTool(): AutomationTool {
    return {
      name: 'radio',
      description: `Select a radio button from a radio group. This tool checks a specific radio button option.

**When to use:**
- To select one option from a group of radio buttons
- To choose between mutually exclusive options

**Important notes:**
- Automatically unchecks other radio buttons in the same group
- Dispatches proper change and input events
- Works with input[type="radio"] elements
- Only one radio button in a group can be selected at a time

**Examples:**
- Select payment method: selector="input[name='payment'][value='card']"
- Choose shipping: selector="#shipping-express"
- Select option: selector="input[type='radio'][value='option2']"`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the specific radio button to select'
          }
        },
        required: ['selector']
      }
    };
  }

  private static getPressKeyTool(): AutomationTool {
    return {
      name: 'pressKey',
      description: `Press a keyboard key. This tool simulates pressing special keys like Enter, Escape, Tab, etc.

**When to use:**
- To submit forms by pressing Enter
- To close modals with Escape
- To navigate with Tab
- To trigger keyboard shortcuts

**Supported keys:**
- Enter: Submit forms, confirm actions
- Escape: Close modals, cancel actions
- Tab: Navigate between fields
- Backspace: Delete characters
- Delete: Remove content
- Arrow keys: ArrowUp, ArrowDown, ArrowLeft, ArrowRight

**Important notes:**
- Dispatches proper keyboard events (keydown, keypress, keyup)
- Works on the currently focused element
- Some keys may trigger browser default behavior

**Examples:**
- Submit form: key="Enter"
- Close modal: key="Escape"
- Navigate fields: key="Tab"`,
      input_schema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'The key to press (Enter, Escape, Tab, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight)',
            enum: ['Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
          }
        },
        required: ['key']
      }
    };
  }

  private static getScrollTool(): AutomationTool {
    return {
      name: 'scroll',
      description: `Scroll the page or scroll to a specific element. This tool can scroll to make elements visible or scroll to specific coordinates.

**When to use:**
- To bring elements into view before interacting
- To load more content on infinite scroll pages
- To navigate to different parts of a long page

**Two modes:**
1. Scroll to element: Provide selector to scroll element into view
2. Scroll to position: Provide x and y coordinates

**Important notes:**
- Scrolling to element centers it in the viewport
- Uses smooth scrolling for better UX
- Waits after scrolling for content to stabilize
- Essential for elements outside the initial viewport

**Examples:**
- Scroll to element: selector="#footer"
- Scroll to top: x=0, y=0
- Scroll down: y=1000
- Scroll to section: selector=".pricing-section"`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for element to scroll to (alternative to x/y coordinates)'
          },
          x: {
            type: 'number',
            description: 'Horizontal scroll position in pixels (alternative to selector)'
          },
          y: {
            type: 'number',
            description: 'Vertical scroll position in pixels (alternative to selector)'
          }
        },
        required: []
      }
    };
  }

  private static getWaitTool(): AutomationTool {
    return {
      name: 'wait',
      description: `Wait for a specified number of milliseconds. This tool pauses execution to allow time for page updates, animations, or async operations.

**When to use:**
- After navigation to let the page fully load
- After clicking buttons that trigger async operations
- To wait for animations to complete
- When elements take time to appear after an action

**Important notes:**
- Use sparingly - prefer waitForElement when possible
- Typical wait times: 500-2000ms for most operations
- Longer waits (3000-5000ms) for slow network operations
- Don't wait unnecessarily - it slows down automation

**Best practices:**
- Use waitForElement instead when waiting for specific elements
- Use shorter waits (500ms) for UI updates
- Use longer waits (2000ms+) after navigation or form submission

**Examples:**
- Wait for animation: duration=500
- Wait after click: duration=1000
- Wait for slow load: duration=3000`,
      input_schema: {
        type: 'object',
        properties: {
          duration: {
            type: 'number',
            description: 'Number of milliseconds to wait (recommended: 500-5000ms)'
          }
        },
        required: ['duration']
      }
    };
  }

  private static getWaitForElementTool(): AutomationTool {
    return {
      name: 'waitForElement',
      description: `Wait for a specific element to appear in the page. This tool is more reliable than fixed waits because it proceeds as soon as the element is found.

**When to use:**
- After navigation to wait for key elements to load
- After clicking buttons that load new content
- Before interacting with dynamically loaded elements
- To ensure elements exist before clicking or typing

**Important notes:**
- More efficient than fixed waits
- Has a maximum timeout (default 10 seconds)
- Throws error if element doesn't appear within timeout
- Checks for element visibility, not just DOM presence

**Best practices:**
- Always use before interacting with dynamic content
- Use after navigation to ensure page is ready
- Prefer this over fixed waits when possible
- Set appropriate timeout based on expected load time

**Examples:**
- Wait for search results: selector=".search-results", timeout=5000
- Wait for modal: selector="#confirmation-modal", timeout=3000
- Wait for button: selector="button[type='submit']", timeout=10000`,
      input_schema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to wait for'
          },
          timeout: {
            type: 'number',
            description: 'Maximum time to wait in milliseconds (default: 10000ms)'
          }
        },
        required: ['selector']
      }
    };
  }
}
