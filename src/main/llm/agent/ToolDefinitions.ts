/**
 * DO Agent Tool Definitions
 *
 * Anthropic-compatible tool schemas for Claude to use during autonomous browsing.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Tool name constants for type-safe tool handling
 */
export const TOOL_NAMES = {
  EXTRACT_CONTEXT: 'extract_context',
  CLICK: 'click',
  TYPE: 'type',
  SCROLL: 'scroll',
  NAVIGATE: 'navigate',
  KEY_PRESS: 'keyPress',
  WAIT: 'wait',
  DONE: 'done',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/**
 * Autopilot tool definitions for Claude
 */
export const AUTOPILOT_TOOLS: Anthropic.Tool[] = [
  {
    name: TOOL_NAMES.EXTRACT_CONTEXT,
    description: `Extract the accessibility tree of the current viewport. Returns a structured representation of interactive elements with their backend_node_ids.

Example output:
[123]<button ax_name="Sign In" />
[456]<input type="email" placeholder="Enter email" />

Use the [N] backend_node_id values for click and type actions.`,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: TOOL_NAMES.CLICK,
    description: `Click on an element using its backend_node_id from extract_context.

Use clickCount for special click types:
- 1: Single click (default)
- 2: Double click (e.g., to select a word)
- 3: Triple click (e.g., to select a line)`,
    input_schema: {
      type: 'object' as const,
      properties: {
        backend_node_id: {
          type: 'number',
          description:
            'The backend_node_id of the element to click (from extract_context)',
        },
        clickCount: {
          type: 'number',
          description:
            'Number of clicks: 1 (single, default), 2 (double), 3 (triple)',
          enum: [1, 2, 3],
        },
      },
      required: ['backend_node_id'],
    },
  },
  {
    name: TOOL_NAMES.TYPE,
    description: `Type text into an input field or editable element.

The element is identified by its backend_node_id from extract_context.

IMPORTANT: By default, existing content is automatically cleared before typing (using triple-click selection).
DO NOT use Ctrl+A before typing - just call type() directly and it will replace existing text.
Only set clearFirst: false if you specifically want to APPEND to existing text.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        backend_node_id: {
          type: 'number',
          description:
            'The backend_node_id of the input element (from extract_context)',
        },
        text: {
          type: 'string',
          description: 'The text to type into the element',
        },
        clearFirst: {
          type: 'boolean',
          description:
            'Clear existing content before typing (default: true). DO NOT set this to false unless you want to append text. DO NOT use Ctrl+A - the type tool handles clearing automatically.',
        },
        pressEnter: {
          type: 'boolean',
          description:
            'Press Enter key after typing (default: false). Useful for form submission.',
        },
      },
      required: ['backend_node_id', 'text'],
    },
  },
  {
    name: TOOL_NAMES.SCROLL,
    description: `Scroll the page to reveal elements outside the current viewport.

Use this when:
- The element you need is not in the extract_context output
- You need to see more content on the page
- A dropdown or menu extends beyond visible area`,
    input_schema: {
      type: 'object' as const,
      properties: {
        direction: {
          type: 'string',
          description: 'Direction to scroll',
          enum: ['up', 'down', 'left', 'right'],
        },
        amount: {
          type: 'number',
          description:
            'Amount to scroll in pixels (default: 300). Use larger values (500-800) for faster navigation.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: TOOL_NAMES.NAVIGATE,
    description: `Navigate to a specific URL. Use this for:
- Going to a known URL directly
- Following links when you know the destination
- Returning to a previous page

After navigation, wait briefly then extract_context to see the new page.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description:
            'The full URL to navigate to (must include https:// or http://)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: TOOL_NAMES.KEY_PRESS,
    description: `Press a keyboard key, optionally with modifier keys.

Common uses:
- Enter: Submit forms
- Escape: Close modals/dropdowns
- Tab: Move focus
- Arrow keys: Navigate within components
- Shortcuts: Ctrl+A (select all), Ctrl+C (copy), etc.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description:
            'Key to press (e.g., "Enter", "Escape", "Tab", "ArrowDown", "a", "1")',
        },
        modifiers: {
          type: 'array',
          description: 'Modifier keys to hold while pressing the key',
          items: {
            type: 'string',
            enum: ['Control', 'Shift', 'Alt', 'Meta'],
          },
        },
      },
      required: ['key'],
    },
  },
  {
    name: TOOL_NAMES.WAIT,
    description: `Wait for page to be ready or for a specific duration.

Two modes:
1. **Network idle (recommended)**: Set waitForNetwork: true to wait until network activity stops.
   This is faster and more reliable - use after navigate, click, or any action that loads content.

2. **Fixed duration**: Set duration in milliseconds for animations or timed waits.
   Only use this when you specifically need a delay (e.g., waiting for animation).

PREFER network idle mode - it's faster because it stops waiting as soon as the page is ready.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        waitForNetwork: {
          type: 'boolean',
          description:
            'Wait for network to become idle (no requests for 500ms). Recommended after navigation or clicks that load content.',
        },
        duration: {
          type: 'number',
          description:
            'Fixed duration to wait in milliseconds (max: 5000). Only use for animations, not for page loads.',
          maximum: 5000,
        },
        timeout: {
          type: 'number',
          description:
            'Maximum time to wait for network idle in milliseconds (default: 10000, max: 30000)',
          maximum: 30000,
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.DONE,
    description: `Signal that the task is complete (success or failure).

ALWAYS call this tool when:
- The user's goal has been achieved (success: true)
- The goal cannot be completed due to errors/blockers (success: false)
- You've determined the task is impossible on this page (success: false)

Include a clear message explaining the outcome.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the user goal was successfully accomplished',
        },
        message: {
          type: 'string',
          description:
            'Explanation of what was accomplished or why the task failed',
        },
      },
      required: ['success', 'message'],
    },
  },
];
