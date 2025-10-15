# Browser Context Provider

This module provides real-time browser context extraction for LLM agents in the agentic browser application.

## Overview

The Browser Context Provider intelligently extracts only the most relevant information from the browser to provide LLMs with situational awareness while minimizing token usage.

## Components

### 1. **BrowserContextProvider** (Main Entry Point)
The orchestrator that coordinates all context extraction.

**Features:**
- Page metadata extraction
- Console log monitoring
- Network activity tracking
- Screenshot capture
- Coordinated context snapshots

### 2. **DOMPruner**
Intelligent DOM downsampling that extracts only interactive/significant elements.

**Strategy:**
- Scores elements by interactivity (0-100)
- Filters out hidden/irrelevant elements
- Extracts semantic attributes (aria-labels, data-testid, etc.)
- Generates reliable selectors
- Truncates long text content

**Typical output:** 50-150 elements instead of 5000+ DOM nodes

### 3. **AccessibilityTreeExtractor**
Extracts the semantic accessibility tree as a lightweight alternative to the full DOM.

**Benefits:**
- Much smaller token footprint
- Semantic representation (roles, labels)
- Better alignment with user intent
- Includes only accessible/meaningful elements

## Usage

### Basic Usage

```typescript
import { BrowserContextProvider } from './context';

// Initialize
const contextProvider = new BrowserContextProvider(
  view, // WebContentsView
  snapshotManager // optional SnapshotManager
);

// Start monitoring (console logs, network activity)
await contextProvider.startMonitoring();

// Get context snapshot
const context = await contextProvider.getContext({
  includePrunedDOM: true,
  includeAccessibilityTree: true,
  includeConsoleLogs: true,
  maxElements: 100
});

// Use context for LLM
console.log(context.metadata.url);
console.log(context.interactiveElements.length);
console.log(context.recentConsoleLogs);
```

### Integration with BrowserManager

```typescript
// In BrowserManager.ts or similar

import { BrowserContextProvider } from './context';

class BrowserManager {
  private contextProviders: Map<string, BrowserContextProvider> = new Map();

  public createTab(url?: string): TabInfo {
    // ... existing tab creation ...
    
    // Create context provider for this tab
    const contextProvider = new BrowserContextProvider(
      view,
      this.snapshotManager
    );
    
    this.contextProviders.set(tabId, contextProvider);
    
    return tabInfo;
  }

  public async getActiveTabContext(options?) {
    if (!this.activeTabId) return null;
    
    const provider = this.contextProviders.get(this.activeTabId);
    if (!provider) return null;
    
    return await provider.getContext(options);
  }
}
```

### Lightweight vs Rich Context

```typescript
// Lightweight context (minimal tokens)
// Good for: Frequent updates, simple checks
const lightContext = await contextProvider.getLightweightContext();
// ~1000-2000 tokens

// Rich context (maximum information)
// Good for: Initial analysis, debugging, error recovery
const richContext = await contextProvider.getRichContext();
// ~3000-5000 tokens
```

### Custom Context Options

```typescript
const context = await contextProvider.getContext({
  // What to include
  includePrunedDOM: true,
  includeAccessibilityTree: false,
  includeConsoleLogs: true,
  includeNetworkActivity: true,
  includeScreenshot: false,
  
  // Limits
  maxElements: 75,
  maxConsoleEntries: 15,
  maxNetworkEntries: 10,
  
  // Only get activity since last check
  activitySince: lastCheckTimestamp
});
```

### Converting to LLM-Friendly Text

```typescript
const context = await contextProvider.getContext();

// Convert to structured text (for LLM prompt)
const textContext = contextProvider.contextToText(context);

// Use in LLM prompt
const prompt = `
Current Browser State:
${textContext}

User Goal: ${userGoal}

What action should I take next?
`;
```

## Context Structure

```typescript
interface BrowserContext {
  // Page basics
  metadata: {
    url: string;
    title: string;
    readyState: string;
    scrollPosition: { x, y };
    viewport: { width, height };
  };
  
  // Interactive elements (pruned DOM)
  interactiveElements: Array<{
    tagName: string;
    selector: string;
    attributes: { id, className, role, ariaLabel, ... };
    text?: string;
    isVisible: boolean;
    isInteractive: boolean;
    boundingBox?: { x, y, width, height };
  }>;
  
  // Element statistics
  elementCount: {
    total: number;      // Total DOM nodes
    interactive: number; // Interactive elements found
    visible: number;     // Visible elements
  };
  
  // Accessibility tree (optional)
  accessibilityTree?: {
    role: string;
    name?: string;
    children?: [...];
  };
  
  // Recent activity
  recentConsoleLogs?: Array<{
    level: 'log' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
  }>;
  
  recentNetworkActivity?: Array<{
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
    failed?: boolean;
  }>;
  
  // Visual context
  visual?: {
    screenshotBase64?: string;
    description?: string;
    timestamp: number;
  };
  
  capturedAt: number;
}
```

## Advanced Features

### 1. Activity Monitoring

```typescript
// Start monitoring (buffers console logs and network requests)
await contextProvider.startMonitoring();

// Get only recent activity (since last check)
const recentContext = await contextProvider.getContext({
  includeConsoleLogs: true,
  includeNetworkActivity: true,
  activitySince: lastCheckTime // Only get logs/requests after this
});

// Clear buffers if needed
contextProvider.clearActivityBuffers();

// Stop monitoring
contextProvider.stopMonitoring();
```

### 2. Custom DOM Pruning Strategy

```typescript
const pruner = new DOMPruner({
  alwaysIncludeTags: ['button', 'a', 'input', 'select'],
  alwaysIncludeRoles: ['button', 'link', 'textbox'],
  excludeHidden: true,
  minInteractivityScore: 40, // Higher = more selective
  maxTextLength: 50
});

const contextProvider = new BrowserContextProvider(view);
// Use custom pruner...
```

### 3. Accessibility Tree Only

```typescript
// For very token-efficient context
const context = await contextProvider.getContext({
  includePrunedDOM: false,
  includeAccessibilityTree: true, // Much lighter than DOM
  includeConsoleLogs: false,
  includeNetworkActivity: false
});

// Get interactive elements from a11y tree
const interactiveElements = a11yExtractor.getInteractiveElements(
  context.accessibilityTree
);
```

## Token Usage Estimates

| Context Type | Typical Tokens | Use Case |
|--------------|---------------|----------|
| Lightweight | 1,000-2,000 | Frequent updates, simple checks |
| Standard DOM | 2,500-4,000 | Normal automation steps |
| Rich Context | 4,000-6,000 | Initial analysis, error recovery |
| A11y Tree Only | 500-1,500 | Very frequent updates |
| With Screenshot | +2,000-5,000 | Visual verification (base64) |

## Best Practices

### 1. **Choose the Right Context Level**
- Use lightweight context for frequent checks
- Use rich context only when needed (errors, complex decisions)
- Prefer accessibility tree over DOM when possible

### 2. **Monitor Activity Selectively**
- Start monitoring only during active automation
- Use `activitySince` to get incremental updates
- Clear buffers between automation sessions

### 3. **Limit Element Count**
- Set `maxElements` based on page complexity
- Simple pages: 30-50 elements
- Complex pages: 75-150 elements
- Don't go over 200 elements

### 4. **Include Screenshots Sparingly**
- Screenshots add significant token cost
- Use only for visual verification or debugging
- Consider vision-to-text description instead (future feature)

### 5. **Filter Console Logs**
- Set `consoleLogLevel` to 'warn' or 'error' for production
- Use 'log' level only during development/debugging

## Future Enhancements

- [ ] Vision-to-text summarization (LLM-generated screenshot descriptions)
- [ ] Semantic chunking of large pages
- [ ] Element change detection (diff between contexts)
- [ ] Intelligent context caching
- [ ] Context compression algorithms
- [ ] Multi-frame context extraction
- [ ] Shadow DOM support

## Integration with MCP

This module is designed to work seamlessly with the MCP (Model Context Protocol) implementation:

```typescript
// Future MCP Resource
{
  uri: "browser://current-context",
  name: "Current Browser State",
  mimeType: "application/json",
  description: "Real-time browser context with interactive elements"
}

// Future MCP Tool
{
  name: "browser_get_context",
  description: "Get current browser state",
  inputSchema: {
    type: "object",
    properties: {
      contextType: { enum: ["lightweight", "standard", "rich"] }
    }
  }
}
```

## Performance Notes

- DOM pruning: ~50-100ms for typical pages
- A11y tree extraction: ~30-70ms
- Screenshot capture: ~100-200ms
- Total context capture: ~200-400ms (without screenshot)

All extraction runs in the browser context (no main process blocking).

