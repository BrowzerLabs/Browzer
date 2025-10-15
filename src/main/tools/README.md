# Tool Execution Engine

The Tool Execution Engine provides a comprehensive, production-ready toolkit for LLM agents to interact with and automate browser operations.

## Overview

This module implements a **robust, MCP-compatible tool system** with:
- **20+ browser automation tools** across 3 categories
- **Intelligent error handling** with retry logic and recovery suggestions
- **Multi-strategy element location** with automatic fallbacks
- **Verification and validation** at every step
- **Execution statistics** and monitoring
- **MCP-ready** for seamless LLM integration

## Architecture

```
ToolRegistry (Central Hub)
├── NavigationTools (4 tools)
│   ├── navigate_to_url
│   ├── go_back
│   ├── go_forward
│   └── reload_page
│
├── InteractionTools (6 tools)
│   ├── click_element
│   ├── type_text
│   ├── press_key
│   ├── select_option
│   ├── check_checkbox
│   └── submit_form
│
└── ObservationTools (9 tools)
    ├── get_page_info
    ├── find_element
    ├── verify_element_exists
    ├── verify_text_present
    ├── get_element_text
    ├── get_element_attribute
    ├── wait_for_element
    └── take_screenshot
```

## Usage

### Basic Setup

```typescript
import { ToolRegistry } from './tools';

// Initialize registry with WebContentsView
const toolRegistry = new ToolRegistry(view);

// Get all available tools
const allTools = toolRegistry.getAllTools();
console.log(`${allTools.length} tools available`);

// Execute a tool
const result = await toolRegistry.executeTool('navigate_to_url', {
  url: 'https://example.com',
  wait_for_load: true
});

if (result.success) {
  console.log('Navigation successful:', result.data);
} else {
  console.error('Navigation failed:', result.error);
}
```

### Navigation Tools

#### navigate_to_url
Navigate to a URL with load detection and verification.

```typescript
const result = await toolRegistry.executeTool('navigate_to_url', {
  url: 'https://google.com',
  wait_for_load: true,           // Wait for page load (default: true)
  wait_for_network_idle: true,   // Wait for network idle (default: true)
  timeout: 10000                 // Timeout in ms (default: 10000)
});
```

**Features:**
- Automatic URL normalization (adds https:// if missing)
- Load completion detection
- Network idle waiting
- Retry logic for failed navigations

#### go_back / go_forward
Navigate browser history.

```typescript
await toolRegistry.executeTool('go_back', {});
await toolRegistry.executeTool('go_forward', {});
```

#### reload_page
Reload current page.

```typescript
await toolRegistry.executeTool('reload_page', {
  ignore_cache: false  // Force refresh ignoring cache
});
```

### Interaction Tools

#### click_element
Click on an element with intelligent element location.

```typescript
const result = await toolRegistry.executeTool('click_element', {
  selector_strategy: 'id',        // 'id' | 'css' | 'data-testid' | 'aria-label' | 'role'
  selector_value: 'login-button',
  verify: true,                   // Verify clickability (default: true)
  timeout: 10000                  // Max wait time (default: 10000)
});
```

**Selector Strategies:**
- `id`: Element ID (`#element-id`)
- `css`: CSS selector
- `data-testid`: Test ID attribute (`[data-testid="..."]`)
- `aria-label`: ARIA label (`[aria-label="..."]`)
- `role`: ARIA role (`[role="button"]`)

#### type_text
Type text into an input field.

```typescript
const result = await toolRegistry.executeTool('type_text', {
  selector_strategy: 'id',
  selector_value: 'email-input',
  text: 'user@example.com',
  clear: true,      // Clear existing text first
  submit: false,    // Press Enter after typing
  delay: 50         // Delay between keystrokes (ms)
});
```

#### press_key
Press special keys.

```typescript
await toolRegistry.executeTool('press_key', {
  key: 'Enter'  // 'Enter' | 'Escape' | 'Tab' | 'Backspace' | 'Delete' | Arrow keys
});
```

#### select_option
Select from dropdown.

```typescript
await toolRegistry.executeTool('select_option', {
  selector_strategy: 'id',
  selector_value: 'country-select',
  option_value: 'USA'  // Can be option value or text
});
```

#### check_checkbox
Check/uncheck checkbox.

```typescript
await toolRegistry.executeTool('check_checkbox', {
  selector_strategy: 'id',
  selector_value: 'terms-checkbox',
  checked: true  // true to check, false to uncheck
});
```

#### submit_form
Submit a form.

```typescript
await toolRegistry.executeTool('submit_form', {
  selector_strategy: 'id',
  selector_value: 'login-form'
});
```

### Observation Tools

#### get_page_info
Get current page information.

```typescript
const result = await toolRegistry.executeTool('get_page_info', {});

// Returns:
// {
//   url: 'https://example.com',
//   title: 'Example Domain',
//   readyState: 'complete',
//   scrollPosition: { x: 0, y: 100 },
//   viewport: { width: 1920, height: 1080 },
//   documentSize: { width: 1920, height: 3000 }
// }
```

#### find_element
Find elements using natural language.

```typescript
const result = await toolRegistry.executeTool('find_element', {
  description: 'login button'  // Natural language description
});

// Returns matching elements with scores
```

**How it works:**
- Searches by text content, aria-label, placeholder, title
- Scores matches by relevance
- Returns top 5 matches with selectors

#### verify_element_exists
Check if element exists.

```typescript
const result = await toolRegistry.executeTool('verify_element_exists', {
  selector_strategy: 'id',
  selector_value: 'submit-button'
});

// result.success === true if exists
```

#### verify_text_present
Check if text is on page.

```typescript
const result = await toolRegistry.executeTool('verify_text_present', {
  text: 'Welcome back',
  selector_strategy: 'id',      // Optional: limit to specific element
  selector_value: 'header'      // Optional
});
```

#### get_element_text
Get element's text content.

```typescript
const result = await toolRegistry.executeTool('get_element_text', {
  selector_strategy: 'id',
  selector_value: 'error-message'
});

// result.data.innerText - visible text
// result.data.textContent - all text
// result.data.value - for inputs
```

#### get_element_attribute
Get element attribute value.

```typescript
const result = await toolRegistry.executeTool('get_element_attribute', {
  selector_strategy: 'id',
  selector_value: 'profile-link',
  attribute: 'href'  // Any attribute: href, value, disabled, etc.
});
```

#### wait_for_element
Wait for element to appear.

```typescript
const result = await toolRegistry.executeTool('wait_for_element', {
  selector_strategy: 'id',
  selector_value: 'loading-spinner',
  timeout: 5000  // Max wait time (default: 10000)
});

// result.data.waitTime - actual time waited
```

#### take_screenshot
Capture screenshot.

```typescript
const result = await toolRegistry.executeTool('take_screenshot', {
  full_page: false  // Full page or viewport only
});

// result.data.screenshot - Base64 data URL
```

## Error Handling

Every tool returns a standardized `ToolResult`:

```typescript
interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
  error?: {
    code: string;              // Error code (ELEMENT_NOT_FOUND, TIMEOUT, etc.)
    message: string;           // Error description
    details?: any;             // Additional error context
    recoverable: boolean;      // Can this be retried?
    suggestions?: string[];    // Recovery suggestions
  };
  metadata?: {
    executionTime: number;     // Execution time in ms
    retries?: number;          // Number of retries performed
  };
}
```

### Error Codes

| Code | Description | Recoverable |
|------|-------------|-------------|
| ELEMENT_NOT_FOUND | Element doesn't exist | Yes |
| ELEMENT_NOT_VISIBLE | Element is hidden | Yes |
| ELEMENT_NOT_CLICKABLE | Element can't be clicked | Yes |
| TIMEOUT | Operation timed out | Yes |
| NAVIGATION_FAILED | Navigation error | Yes |
| PAGE_NOT_READY | Page not fully loaded | Yes |
| INVALID_PARAMETERS | Wrong parameters | No |
| CDP_ERROR | CDP command failed | Maybe |

### Example Error Handling

```typescript
const result = await toolRegistry.executeTool('click_element', {
  selector_strategy: 'id',
  selector_value: 'missing-button'
});

if (!result.success) {
  console.error('Error Code:', result.error?.code);
  console.error('Message:', result.error?.message);
  console.error('Recoverable:', result.error?.recoverable);
  console.error('Suggestions:', result.error?.suggestions);
  
  // Try recovery if suggested
  if (result.error?.recoverable) {
    // Retry with different selector, wait longer, etc.
  }
}
```

## MCP Integration

The Tool Registry is fully MCP-compatible.

### Get Tools in MCP Format

```typescript
const mcpTools = toolRegistry.getToolsAsMCP();

// Returns array of MCPTool objects:
// [
//   {
//     name: 'navigate_to_url',
//     description: '...',
//     inputSchema: {
//       type: 'object',
//       properties: { ... },
//       required: [ ... ]
//     }
//   },
//   ...
// ]
```

### Execute with MCP Result Format

```typescript
const result = await toolRegistry.executeTool('navigate_to_url', {
  url: 'https://example.com'
});

const mcpResult = toolRegistry.convertResultToMCP(result);

// Returns MCPToolResult:
// {
//   content: [{
//     type: 'text',
//     text: '{ "success": true, ... }'
//   }],
//   isError: false
// }
```

## Advanced Features

### Execution Statistics

Track tool performance and reliability:

```typescript
// Get stats for specific tool
const stats = toolRegistry.getToolStats('click_element');
console.log({
  totalExecutions: stats.totalExecutions,
  successRate: stats.successCount / stats.totalExecutions,
  avgExecutionTime: stats.averageExecutionTime,
  errorsByCode: stats.errorsByCode
});

// Get all stats
const allStats = toolRegistry.getAllStats();
```

### Parameter Validation

All parameters are validated before execution:

```typescript
// Invalid parameter type
const result = await toolRegistry.executeTool('navigate_to_url', {
  url: 123  // Should be string
});
// Returns error: "Invalid type for parameter 'url': expected string, got number"

// Missing required parameter
const result = await toolRegistry.executeTool('click_element', {
  selector_strategy: 'id'
  // Missing selector_value
});
// Returns error: "Missing required parameter: selector_value"

// Invalid enum value
const result = await toolRegistry.executeTool('click_element', {
  selector_strategy: 'invalid',
  selector_value: 'button'
});
// Returns error: "Invalid value for parameter 'selector_strategy': must be one of id, css, ..."
```

### Retry Logic

Interaction tools automatically retry on failure:

```typescript
// Automatically retries up to 2 times with exponential backoff
const result = await toolRegistry.executeTool('click_element', {
  selector_strategy: 'id',
  selector_value: 'slow-loading-button'
  // Will retry if element not found, with delays of 500ms, 1000ms
});
```

### Multi-Strategy Element Location

Elements can have fallback selectors:

```typescript
// In direct API usage (not through registry)
const result = await interactionTools.clickElement({
  strategy: 'data-testid',
  value: 'submit-btn',
  fallback: [
    { strategy: 'id', value: 'submit' },
    { strategy: 'aria-label', value: 'Submit' }
  ]
});
// Tries data-testid first, then ID, then aria-label
```

## Best Practices

### 1. Use Appropriate Selector Strategies

**Priority (most reliable to least):**
1. `data-testid` - Designed for testing, rarely changes
2. `id` - Unique, but may change
3. `aria-label` - Semantic, stable
4. `role` - Semantic but may be ambiguous
5. `css` - Fragile, may break with UI changes

### 2. Verify After Interactions

```typescript
// Click login button
await toolRegistry.executeTool('click_element', {
  selector_strategy: 'id',
  selector_value: 'login-btn'
});

// Verify navigation occurred
await toolRegistry.executeTool('verify_text_present', {
  text: 'Welcome back'
});
```

### 3. Wait for Elements

```typescript
// Don't assume elements exist immediately
await toolRegistry.executeTool('wait_for_element', {
  selector_strategy: 'id',
  selector_value: 'dashboard',
  timeout: 5000
});

// Then interact
await toolRegistry.executeTool('click_element', {
  selector_strategy: 'id',
  selector_value: 'dashboard'
});
```

### 4. Use Natural Language Search for Discovery

```typescript
// When selector is unknown, use find_element
const result = await toolRegistry.executeTool('find_element', {
  description: 'sign out button'
});

// Use returned selector for interaction
const bestMatch = result.data.topMatches[0];
await toolRegistry.executeTool('click_element', {
  selector_strategy: 'css',
  selector_value: bestMatch.selector
});
```

### 5. Handle Errors Gracefully

```typescript
const result = await toolRegistry.executeTool('click_element', params);

if (!result.success) {
  if (result.error?.code === 'ELEMENT_NOT_FOUND') {
    // Element might not be loaded yet
    await toolRegistry.executeTool('wait_for_element', params);
    // Retry
    const retryResult = await toolRegistry.executeTool('click_element', params);
  } else if (result.error?.code === 'ELEMENT_NOT_CLICKABLE') {
    // Element might be obscured, scroll to it first
    // Or try different selector
  }
}
```

## Integration with LLM Agent

Example integration in agent execution loop:

```typescript
// In your agent runtime
import { ToolRegistry } from './tools';
import { BrowserContextProvider } from './context';

class AgentRuntime {
  private toolRegistry: ToolRegistry;
  private contextProvider: BrowserContextProvider;

  async executeLLMResponse(llmResponse: {
    thinking?: string;
    toolCalls?: Array<{ name: string; parameters: any }>;
  }) {
    // If LLM wants to call tools
    if (llmResponse.toolCalls) {
      for (const toolCall of llmResponse.toolCalls) {
        // Execute tool
        const result = await this.toolRegistry.executeTool(
          toolCall.name,
          toolCall.parameters
        );

        // Get updated context
        const context = await this.contextProvider.getContext();

        // Send result + context back to LLM
        await this.sendToLLM({
          toolResult: result,
          browserContext: context
        });

        // If tool failed, LLM can adapt and retry
        if (!result.success) {
          // LLM will receive error details and suggestions
          // Can decide to retry, try alternative, or ask for help
        }
      }
    }
  }
}
```

## Performance Notes

| Tool | Typical Time | Notes |
|------|--------------|-------|
| navigate_to_url | 1-5s | Depends on page load time |
| click_element | 50-200ms | Includes element location + verification |
| type_text | 50ms * chars | Default 50ms delay per character |
| get_page_info | 10-30ms | Very fast |
| find_element | 100-300ms | Depends on page complexity |
| verify_* | 20-50ms | Quick checks |
| take_screenshot | 100-300ms | Viewport capture |

## Future Enhancements

- [ ] Drag and drop support
- [ ] File upload handling
- [ ] Iframe navigation
- [ ] Shadow DOM support
- [ ] Cookie/localStorage management
- [ ] Network request interception
- [ ] Advanced waiting conditions (custom predicates)
- [ ] Visual regression testing tools
- [ ] Performance monitoring tools
- [ ] Multi-tab coordination

## Troubleshooting

### "Element not found" errors
- Increase timeout: Element might be loading
- Try different selector strategy
- Use `find_element` to discover correct selector
- Check if element is in iframe

### "Element not clickable" errors
- Element might be obscured by modal/overlay
- Element might be outside viewport (need scroll)
- Element might be disabled
- Use `verify_element_exists` first to debug

### Slow execution
- Reduce `delay` in `type_text`
- Set `wait_for_network_idle: false` if not needed
- Use `verify: false` for non-critical clicks (not recommended)

### CDP errors
- Ensure debugger is attached
- Check if page allows CDP (some sites block it)
- Verify WebContentsView is valid and not destroyed

