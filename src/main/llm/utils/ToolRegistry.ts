import Anthropic from '@anthropic-ai/sdk';

/**
 * UPDATED Tool Registry with Enhanced Click & Type Guidance
 * 
 * Key improvements:
 * 1. Clear selector priority and strategies
 * 2. Explicit warnings about invalid syntax
 * 3. Better parameter descriptions with examples
 * 4. Guidance on when to use each tool
 */

export const BROWSER_AUTOMATION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'declare_plan_metadata',
    description: `REQUIRED: Declare metadata about the automation plan you're creating.

**YOU MUST ALWAYS CALL THIS TOOL** alongside your automation tools to explicitly declare:
1. Whether this is an INTERMEDIATE or FINAL plan
2. Your reasoning for the plan type

**PLAN TYPES:**

**INTERMEDIATE PLAN:**
- Use when you need to analyze results before continuing
- Use when plan ends with extract_context or take_snapshot
- Use when you need to make decisions based on current state
- System will execute the plan, return results, and ask for next plan

**FINAL PLAN:**
- Use when this plan completes the entire user goal
- Use when no further analysis or steps are needed
- System will execute and mark automation as complete

**EXAMPLES:**
- User: "Test extract_context tool" → INTERMEDIATE (testing, need to see results)
- User: "Login to GitHub" → FINAL (complete task in one plan)
- User: "Navigate and analyze the page" → INTERMEDIATE (need analysis results)
- User: "Fill form and submit" → FINAL (completes the goal)
`,
    input_schema: {
      type: 'object',
      properties: {
        planType: {
          type: 'string',
          enum: ['intermediate', 'final'],
          description: 'Type of plan: "intermediate" if you need to analyze results before continuing, "final" if this completes the entire goal'
        },
      },
      required: ['planType']
    }
  },
  {
    name: 'navigate',
    description: 'Navigate to a specific URL. Waits for page to finish loading. Always use complete URLs with https://.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Complete URL including protocol. Examples: "https://github.com/new", "https://example.com/login"'
        },
        waitUntil: {
          type: 'string',
          description: 'When to consider navigation complete. Default: "load"',
          enum: ['load', 'domcontentloaded', 'networkidle'],
          default: 'load'
        },
        timeout: {
          type: 'number',
          description: 'Max wait time in milliseconds. Default: 30000',
          default: 30000
        }
      },
      required: ['url']
    }
  },
  {
    name: 'click',
    description: `Click on an element. CRITICAL SELECTOR RULES:

✅ VALID CSS SELECTORS (Use these):
- ID: #submit-button, #repository-name-input
- Attribute: button[type="submit"], input[name="username"], a[href="/login"]
- Data attrs: [data-testid="submit"], [data-component="button"]
- ARIA: [aria-label="Submit"], button[aria-label="Close"]
- Class: button.btn-primary, .submit-btn (use with tag for specificity)
- Type + Class: button.btn.btn-primary, input.form-control

❌ INVALID SELECTORS (NEVER use these):
- :has-text() - NOT CSS, use text parameter instead
- :visible - NOT CSS, element visibility is handled automatically  
- :enabled - NOT CSS, handled automatically
- :contains() - jQuery syntax, not supported
- :has() - Limited browser support, avoid

🎯 SELECTOR STRATEGY:
1. BEST: Stable IDs or data-testid → [data-testid="submit-btn"]
2. GOOD: Attribute selectors → button[type="submit"]
3. OK: ARIA labels → [aria-label="Submit form"]
4. LAST RESORT: Class selectors → button.btn-primary

⚠️ COMMON MISTAKES TO AVOID:
- Don't use React-generated IDs with colons (#:r9:, #:ra:)
- Don't combine Playwright or jQuery syntax with CSS at all. We are using CDP & executeJavaScript. Soo, NO Playwright or jQuery syntax.
- Don't rely on text in selector, use text parameter instead

📍 ELEMENT VISIBILITY:
- Elements are AUTOMATICALLY scrolled into view
- Elements below viewport will be found and clicked
- Overlays/modals are detected and reported
- No need to scroll manually before clicking

🔄 BACKUP SELECTORS:
- ALWAYS provide as many VALID backup selectors as possible
- Use different strategies for each backup
- Example: [#submit, button[type="submit"], [aria-label="Submit"]]
- **USE BACKUP SELECTORS FROM RECORDING**: The recorded session includes pre-generated backup selectors - use them!`,
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: `Primary CSS selector. MUST be valid CSS. Examples:
- #submit-button (ID)
- button[type="submit"] (Attribute)
- [data-testid="login-btn"] (Data attribute)
- button[aria-label="Submit"] (ARIA)
- button.btn-primary.btn (Classes with tag)

DO NOT use: :has-text(), :visible, :contains(), or any Playwright/jQuery syntax`
        },
        backupSelectors: {
          type: 'array',
          description: `REQUIRED: Provide as many VALID backup selectors as possible using different strategies. Examples:
["button[type='submit']", "[aria-label='Submit']", "form button.primary"]
["#login-btn", "button[name='login']", "[data-testid='login-button']"]`,
          items: { type: 'string' }
        },
        text: {
          type: 'string',
          description: 'Expected button/link text for verification. Used to find element by text if selectors fail. Example: "Send invitation", "Create repository"'
        },
        waitForElement: {
          type: 'number',
          description: 'Wait time before clicking (milliseconds). Use 1500-2000 for dynamic content that loads after page. Default: 1000',
          default: 1000
        },
        verifyVisible: {
          type: 'boolean',
          description: 'Verify element is visible. Keep true (default) for normal clicks. Only set false for special cases.',
          default: true
        }
      },
      required: ['selector', 'backupSelectors']
    }
  },
  {
    name: 'type',
    description: `Type text into input fields with NATIVE-LIKE INPUT SIMULATION. Uses Chrome DevTools Protocol for authentic typing that triggers ALL validation and state updates in modern web apps (React, Vue, Angular, etc.).

✅ VALID INPUT SELECTORS:
- ID: #username, #email-input, #repository-name-input
- Name: input[name="username"], input[name="email"]
- Type: input[type="text"], input[type="email"], input[type="password"]
- Placeholder: input[placeholder="Enter username"]
- Data attrs: input[data-testid="username"], [data-component="text-input"]
- ARIA: input[aria-label="Username"], [aria-describedby*="username"]

❌ COMMON MISTAKES:
- Don't assume "name" attribute exists (many modern sites don't use it)
- Don't use React IDs with colons (#:r9:)
- Always check browser context for actual attributes

🎯 INPUT FINDING STRATEGY:
1. Check browser context for actual attributes
2. Use ID if available (#repository-name-input)
3. Use data-testid or data-component
4. Use placeholder text as selector
5. Use type + aria-label combination

⚙️ ADVANCED TYPING IMPLEMENTATION:
- Uses CDP Input.insertText for native browser input handling
- Triggers proper keyboard events (keydown, keyup) with correct key codes
- Dispatches InputEvent with proper inputType ('insertText')
- Updates React's _valueTracker for proper state synchronization
- Automatically scrolls input into view
- Simulates mouse click for realistic focus
- Clears existing content with proper event triggering (clearFirst: true)
- Types character-by-character with realistic timing (15ms delay)
- Can press Enter after typing (pressEnter: true)

📝 BEST PRACTICES:
- For search boxes: set pressEnter: true
- For form fields: set pressEnter: false, use submit or click submit button
- For single-field forms: pressEnter: true
- Always provide VALID backup selectors
- Use waitForElement: 2000-2500 for dynamically loaded forms`,
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: `Primary CSS selector for input. Check browser context for actual attributes. Examples:
- #username (ID - best if available)
- input[name="email"] (Name attribute - check if exists)
- input[placeholder="Enter username"] (Placeholder)
- [data-testid="username-input"] (Data attribute)
- input[aria-label="Username"] (ARIA label)

IMPORTANT: Don't assume name attribute exists. Modern sites often use id, data-*, or aria-* instead.`
        },
        backupSelectors: {
          type: 'array',
          description: `REQUIRED: at least as many VALID backup selectors as possible. Use different attribute types. Examples:
["input[placeholder='Username']", "input[type='text']", "[aria-label='Username']"]
["#email", "input[name='email']", "input[type='email']"]`,
          items: { type: 'string' }
        },
        text: {
          type: 'string',
          description: 'Text to type into the input. Will be typed character-by-character to trigger proper input events.'
        },
        clearFirst: {
          type: 'boolean',
          description: 'Clear existing content before typing. Default: true. Set false to append text.',
          default: true
        },
        pressEnter: {
          type: 'boolean',
          description: `Press Enter key after typing. Use cases:
- true: Search boxes, single-field forms, chat inputs, command inputs
- false: Multi-field forms (use submit button instead), text areas
Default: false`,
          default: false
        },
        waitForElement: {
          type: 'number',
          description: 'Wait time before typing (ms). Use 1500-2000 for dynamically loaded forms. Default: 1000',
          default: 1000
        }
      },
      required: ['selector', 'backupSelectors', 'text']
    }
  },
  {
    name: 'select',
    description: 'Select an option from a <select> dropdown. BEST PRACTICE: Use label (visible text) as it is most reliable.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for <select> element. Examples: select[name="country"], #country-dropdown, select[aria-label="Choose country"]'
        },
        backupSelectors: {
          type: 'array',
          description: 'Backup selectors for the select element. Use different attribute types.',
          items: { type: 'string' }
        },
        value: {
          type: 'string',
          description: 'Option value attribute (e.g., "us" for <option value="us">). Use when you know the exact value.'
        },
        label: {
          type: 'string',
          description: 'RECOMMENDED: Visible text of option (e.g., "United States", "Blue"). This is what users see in the dropdown.'
        },
        index: {
          type: 'number',
          description: 'Zero-based index (0=first, 1=second). Use only when value/label are unknown.'
        },
        waitForElement: {
          type: 'number',
          description: 'Wait time before selecting (ms). Default: 1000',
          default: 1000
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'checkbox',
    description: 'Check or uncheck a checkbox/radio button. Modern sites often use custom attributes instead of name.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: `CSS selector for checkbox. Check browser context for actual attributes. Examples:
- input[type="checkbox"][data-component="checkbox"] (Data attribute)
- input[type="checkbox"][aria-label="Accept terms"] (ARIA)
- #agree-checkbox (ID if available)
- input[name="agree"] (Name - check if exists)

Don't assume name attribute exists.`
        },
        backupSelectors: {
          type: 'array',
          description: 'Backup selectors. Example: ["input[type=checkbox]", "[aria-describedby*=checkbox]"]',
          items: { type: 'string' }
        },
        checked: {
          type: 'boolean',
          description: 'true to check, false to uncheck. Use true for: agree to terms, enable feature, select option.'
        },
        waitForElement: {
          type: 'number',
          description: 'Wait time before toggling (ms). Default: 1000',
          default: 1000
        }
      },
      required: ['selector', 'checked']
    }
  },
  {
    name: 'wait',
    description: `Simple wait/sleep. Use when you need to wait for:
- Page to settle after action
- Animations to complete
- Dynamic content to load (when no reliable selector exists)
- Network requests to complete

This tool NEVER fails - it just waits. Prefer this over waitForElement when selectors are unreliable or you just need time for page to stabilize.`,
    input_schema: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          description: 'Duration in milliseconds. Common values: 1000 (1 sec), 2000 (2 sec), 3000 (3 sec). Use 1000-2000ms for most cases.',
          default: 1000
        }
      },
      required: ['duration']
    }
  },
  {
    name: 'waitForElement',
    description: 'Wait for an element to appear/disappear. Use before interacting with dynamically loaded content.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of element to wait for. Must be valid CSS.'
        },
        state: {
          type: 'string',
          description: 'Target state. visible: wait for element to appear, hidden: wait to disappear, attached: wait for element in DOM',
          enum: ['visible', 'hidden', 'attached'],
          default: 'visible'
        },
        timeout: {
          type: 'number',
          description: 'Max wait time (ms). Default: 10000 (10 seconds)',
          default: 10000
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'keyPress',
    description: 'Press keyboard keys. Use for: keyboard shortcuts (Ctrl+S), navigation (Tab, Enter, Escape), dropdown navigation (Arrow keys).',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: `Key to press. Special keys: Enter, Escape, Tab, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, Space
Letters: a, b, c (lowercase) or with Shift modifier for uppercase`
        },
        modifiers: {
          type: 'array',
          description: 'Modifier keys. Examples: ["Control", "S"] for Ctrl+S, ["Meta", "C"] for Cmd+C, ["Shift"] for Shift+Tab',
          items: {
            type: 'string',
            enum: ['Control', 'Shift', 'Alt', 'Meta']
          }
        },
        selector: {
          type: 'string',
          description: 'Optional: Focus this element before pressing key. Example: input[name="search"] then press Enter'
        }
      },
      required: ['key']
    }
  },
  {
    name: 'scroll',
    description: 'Scroll the page. NOTE: Elements are automatically scrolled into view before clicking/typing, so manual scrolling is rarely needed.',
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          description: 'Scroll direction. Use with amount parameter.',
          enum: ['up', 'down', 'left', 'right']
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll. Default: 500. Use 300-500 for gentle scroll, 1000+ for large jumps.',
          default: 500
        },
        toElement: {
          type: 'string',
          description: 'CSS selector of element to scroll to. Element will be centered in viewport. Use instead of direction/amount when you need specific element visible.'
        }
      },
      required: []
    }
  },
  {
    name: 'submit',
    description: 'Submit a form. BEST PRACTICE: Use click tool on submit button instead for better compatibility. This tool is for edge cases.',
    input_schema: {
      type: 'object',
      properties: {
        formSelector: {
          type: 'string',
          description: 'CSS selector for form element. Example: form[name="login"], #checkout-form. Defaults to first form if omitted.'
        },
        submitButtonSelector: {
          type: 'string',
          description: 'RECOMMENDED: CSS selector for submit button. This clicks the button instead of direct submit, triggering validation. Example: button[type="submit"], #submit-btn'
        }
      },
      required: []
    }
  },
  {
    name: 'extract_context',
    description: `Extract browser and DOM context for analysis and decision-making.

**CRITICAL: This is NOT an automation tool - it's an ANALYSIS tool.**

**⚠️ USAGE LIMITS (IMPORTANT):**
- Use ONLY ONE analysis tool per intermediate plan (extract_context OR take_snapshot)
- Maximum 2 analysis tools only in critical cases where both DOM + visual are essential
- ALWAYS place as the LAST step in your plan
- Each call adds significant tokens to context - use sparingly

**🎯 TWO EXTRACTION MODES:**

1. **VIEWPORT MODE (default, full=false)** - Token efficient, extracts only visible elements
   - Extracts elements in current viewport only
   - 50-90% token reduction on long pages
   - Can scroll before extraction to target specific sections
   - Best for most use cases

2. **FULL MODE (full=true)** - Complete page extraction
   - Extracts ALL interactive elements from entire page
   - Use only when you need complete page context
   - Ignores other parameters

**📜 SCROLL OPTIONS (viewport mode only):**
1. \`scrollTo: "current"\` - Extract current viewport (DEFAULT)
2. \`scrollTo: "top"\` - Scroll to top, then extract
3. \`scrollTo: "bottom"\` - Scroll to bottom, then extract
4. \`scrollTo: 500\` - Scroll to Y position, then extract
5. \`scrollTo: { element: "#section", backupSelectors: [...] }\` - Scroll to element, then extract

**🔥 COMMON USE CASES:**
- Extract login form: \`{ scrollTo: "top" }\`
- Extract footer: \`{ scrollTo: "bottom" }\`
- Extract specific section: \`{ scrollTo: { element: "#pricing", backupSelectors: [".pricing"] } }\`
- Extract current view: \`{}\` or \`{ scrollTo: "current" }\`
- Extract full page: \`{ full: true }\`

**📝 BEST PRACTICES:**
- Default to viewport mode (full=false) for token efficiency
- Use full=true only when you need complete page context
- Always provide 2-4 backupSelectors when scrolling to element
- For multi-section pages, call multiple times with different scrollTo values

**🔄 MULTI-PHASE AUTOMATION:**
You can create INTERMEDIATE plans that end with this tool:
- Execute some automation steps
- Use extract_context/take_snapshot to analyze current state
- System will return results and ask for next plan
- Generate next plan based on extracted context


**DO NOT include this in regular automation steps.** Use it to:
- Understand page state after errors (error recovery)
- Analyze available elements mid-execution (intermediate plans)
- Verify expected elements appeared
- Decide next actions based on current state`,
    input_schema: {
      type: 'object',
      properties: {
        full: {
          type: 'boolean',
          description: 'If true, extract FULL page context (all elements). If false (default), extract VIEWPORT only (visible elements). Prefer false for token efficiency. ONLY if you need complete page context.',
          default: false
        },
        scrollTo: {
          description: `Where to scroll before extracting (ignored if full=true). Options:
- "current" (default): Extract current viewport, no scrolling
- "top": Scroll to page top
- "bottom": Scroll to page bottom  
- number: Scroll to Y position in pixels (e.g., 500)
- object: Scroll element into view, requires:
  - element: Primary CSS selector
  - backupSelectors: Array of 2-4 backup selectors (REQUIRED)
  
Examples:
- { "element": "#footer", "backupSelectors": ["footer", "[role='contentinfo']"] }
- { "element": "#pricing", "backupSelectors": [".pricing-section", "[data-section='pricing']"] }`,
          oneOf: [
            { type: 'string', enum: ['current', 'top', 'bottom'] },
            { type: 'number' },
            {
              type: 'object',
              properties: {
                element: {
                  type: 'string',
                  description: 'Primary CSS selector for element to scroll to'
                },
                backupSelectors: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'REQUIRED: 2-4 backup selectors for robustness',
                  minItems: 2
                }
              },
              required: ['element', 'backupSelectors']
            }
          ]
        },
        maxElements: {
          type: 'number',
          description: 'Maximum number of interactive elements to extract. Default: 200. Use 50-100 for faster extraction.',
          default: 200
        }
      },
      required: []
    }
  },
  {
    name: 'take_snapshot',
    description: `Capture a VISUAL SCREENSHOT of the viewport for visual analysis.

**⚠️ USAGE LIMITS (IMPORTANT):**
- Use ONLY ONE analysis tool per intermediate plan (extract_context OR take_snapshot)
- Each snapshot is ~2,600 tokens - use sparingly to avoid context limits

**🎯 WHEN TO USE THIS TOOL:**
- When you need to SEE what the page looks like visually
- To understand layout, design, colors, images, and visual elements
- To verify visual state after actions (e.g., "did the modal open?")
- To analyze complex visual content that DOM context can't describe
- To see rendered content, charts, images, or visual feedback
- When DOM context is insufficient for understanding the page state

**🔄 MULTI-PHASE AUTOMATION:**
You can create INTERMEDIATE plans that end with this tool:
- Execute some automation steps
- Use take_snapshot to capture current viewport
- System will return results and ask for next plan
- Generate next plan based on captured snapshot

**⚡ KEY BENEFITS:**
- **Visual Understanding**: See exactly what the user sees
- **Layout Analysis**: Understand spatial relationships and design
- **Visual Verification**: Confirm visual changes after actions
- **Image Analysis**: Analyze images, charts, diagrams on the page
- **Optimized for Claude**: Auto-resized to 1568px max, ~1600 tokens
- **Smart Scrolling**: Can scroll before capture to target specific areas

**📸 SCROLL OPTIONS:**
1. \`scrollTo: "current"\` - Capture current viewport (DEFAULT)
2. \`scrollTo: "top"\` - Scroll to page top, then capture
3. \`scrollTo: "bottom"\` - Scroll to page bottom, then capture
4. \`scrollTo: 500\` - Scroll to specific Y position (pixels), then capture
5. \`scrollTo: { element: "#section", backupSelectors: ["[data-section]", ".section"] }\` - Scroll element into view, then capture

**🔥 COMMON USE CASES:**
- "What does this page look like?" → \`scrollTo: "current"\`
- "Show me the header" → \`scrollTo: "top"\`
- "Capture the footer" → \`scrollTo: "bottom"\`
- "Screenshot the pricing section" → \`scrollTo: { element: "#pricing", backupSelectors: [".pricing-section"] }\`
- "Did the modal open?" → \`scrollTo: "current"\` (after click action)
- "What color is the button?" → Use this tool to see visually

**📝 BEST PRACTICES:**
- Use AFTER actions to verify visual changes
- Combine with extract_viewport_context for complete understanding
- Use specific scrollTo when targeting sections
- Always provide 2-3 backupSelectors when scrolling to element
- Use "current" when you just need to see what's visible now

**💡 VISION + CONTEXT STRATEGY:**
1. First: Use extract_viewport_context to get DOM structure
2. Then: Use take_snapshot to see visual appearance
3. Result: Complete understanding (structure + visual)

**⚠️ IMPORTANT NOTES:**
- Images are automatically optimized (max 1568px, JPEG quality 85)
- Estimated ~1600 tokens per snapshot (~$0.0048 per snapshot)
- Waits 2 seconds after scroll for content to settle
- Returns base64-encoded JPEG ready for Claude vision analysis

**CRITICAL: This is an ANALYSIS tool, not an automation action.**
Use it to understand page state, not to perform actions.`,
    input_schema: {
      type: 'object',
      properties: {
        scrollTo: {
          description: `Where to scroll before capturing. Options:
- "current" (default): Capture current viewport, no scrolling
- "top": Scroll to page top
- "bottom": Scroll to page bottom  
- number: Scroll to specific Y position in pixels (e.g., 500)
- object: Scroll element into view, requires:
  - element: Primary CSS selector (e.g., "#pricing-section")
  - backupSelectors: Array of 2-3 backup selectors (REQUIRED)
  
Examples:
- { "element": "#footer", "backupSelectors": ["footer", "[role='contentinfo']"] }
- { "element": "[data-section='pricing']", "backupSelectors": ["#pricing", ".pricing-section"] }`,
          oneOf: [
            { type: 'string', enum: ['current', 'top', 'bottom'] },
            { type: 'number' },
            {
              type: 'object',
              properties: {
                element: {
                  type: 'string',
                  description: 'Primary CSS selector for element to scroll to'
                },
                backupSelectors: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'REQUIRED: 2-3 backup selectors for robustness',
                  minItems: 2
                }
              },
              required: ['element', 'backupSelectors']
            }
          ]
        }
      },
      required: []
    }
  }
];

/**
 * Get a specific tool definition by name
 */
export function getToolDefinition(toolName: string): Anthropic.Tool | undefined {
  return BROWSER_AUTOMATION_TOOLS.find(tool => tool.name === toolName);
}

/**
 * Validate tool parameters against schema
 */
export function validateToolParams(toolName: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
  const tool = getToolDefinition(toolName);
  if (!tool) {
    return { valid: false, errors: [`Unknown tool: ${toolName}`] };
  }

  const errors: string[] = [];
  const schema = tool.input_schema as { required?: string[]; properties: Record<string, any> };

  // Check required parameters
  for (const required of schema.required || []) {
    if (!(required in params)) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  // Validate selector syntax for click/type tools
  if ((toolName === 'click' || toolName === 'type') && params.selector) {
    const selector = params.selector as string;
    const invalidPatterns = [':has-text(', ':visible', ':enabled', ':contains(', ':has(', ':text('];
    const hasInvalid = invalidPatterns.some(pattern => selector.includes(pattern));
    
    if (hasInvalid) {
      errors.push(`Invalid selector syntax: "${selector}". Do not use Playwright/jQuery syntax like :has-text(), :visible, :contains(). Use pure CSS selectors and the 'text' parameter for text matching.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * ToolRegistry class
 */
export class ToolRegistry {
  public getToolDefinitions(): Anthropic.Tool[] {
    return BROWSER_AUTOMATION_TOOLS;
  }

  public getToolNames(): string[] {
    return BROWSER_AUTOMATION_TOOLS.map(tool => tool.name);
  }

  public getTool(name: string): Anthropic.Tool | undefined {
    return BROWSER_AUTOMATION_TOOLS.find(tool => tool.name === name);
  }

  public validateToolParams(toolName: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    return validateToolParams(toolName, params);
  }
}