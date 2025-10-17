# LLM-Controlled Browser Automation System

## Overview

This document describes the implementation of the LLM-controlled browser automation system for Browzer. The system allows users to record browser workflows and then use Claude (Anthropic's LLM) to automate similar tasks with natural language prompts.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Renderer (UI)                          │
│  - User selects recorded session                            │
│  - User provides automation prompt                          │
│  - Displays progress and results                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC
┌──────────────────────▼──────────────────────────────────────┐
│                   IPCHandlers (Main)                        │
│  - automation:initialize                                    │
│  - automation:execute                                       │
│  - automation:generate-plan                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│               AutomationService                             │
│  - Orchestrates LLM + Execution                             │
│  - Manages automation lifecycle                             │
└──────┬────────────────────────────────────┬─────────────────┘
       │                                    │
┌──────▼─────────┐                  ┌──────▼──────────────────┐
│  LLMService    │                  │  AutomationExecutor     │
│  - Claude API  │                  │  - Step execution       │
│  - Tool use    │                  │  - Retry logic          │
│  - Caching     │                  │  - Error handling       │
└────────────────┘                  └──────┬──────────────────┘
                                           │
                                    ┌──────▼──────────────────┐
                                    │  BrowserAutomation      │
                                    │  - CDP actions          │
                                    │  - Element location     │
                                    │  - Event dispatch       │
                                    └─────────────────────────┘
```

## Key Features

### 1. **Proper Tool Use (Not System Prompt Tools)**
- Uses Anthropic's official tool use API
- Each automation action is a separate tool
- Claude decides which tools to use based on context
- No JSON parsing from system prompts

### 2. **Prompt Caching**
- Recorded context is cached using `cache_control: { type: 'ephemeral' }`
- Saves ~90% of input tokens on subsequent requests
- Significantly reduces cost and latency

### 3. **CDP-Based Automation**
- All automation uses Chrome DevTools Protocol
- No renderer-side JavaScript execution
- Robust element location with multiple fallback strategies
- Proper event dispatching

### 4. **Comprehensive Action Set**
- `navigate` - Navigate to URLs
- `click` - Click elements with smart location
- `type` - Type text with proper events
- `select` - Select dropdown options
- `checkbox` - Toggle checkboxes
- `radio` - Select radio buttons
- `pressKey` - Press keyboard keys
- `scroll` - Scroll to elements or positions
- `wait` - Fixed duration waits
- `waitForElement` - Wait for elements to appear

### 5. **Error Handling & Retry**
- Automatic retry with exponential backoff
- Configurable retry attempts per step
- Critical vs non-critical step classification
- Detailed error reporting

## Implementation Details

### File Structure

```
src/
├── main/
│   └── automation/
│       ├── AutomationService.ts      # Main orchestrator
│       ├── LLMService.ts             # Claude API integration
│       ├── AutomationExecutor.ts     # Step-by-step execution
│       ├── AutomationTools.ts        # Tool definitions for Claude
│       ├── BrowserAutomation.ts      # Enhanced CDP automation
│       └── index.ts                  # Exports
├── shared/
│   └── types/
│       └── automation.ts             # TypeScript types
└── main/ipc/
    └── IPCHandlers.ts                # IPC communication
```

### Usage Flow

#### 1. **User Records a Workflow**
```typescript
// User performs actions in browser
// ActionRecorder captures:
- Click events with element context
- Input events with values
- Navigation events
- Form submissions
- etc.

// Saved as RecordingSession with:
- Actions array
- Metadata (duration, URL, tabs)
- Video recording
- DOM snapshots
```

#### 2. **User Initiates Automation**
```typescript
// From renderer:
const result = await window.electronAPI.invoke('automation:execute', {
  userPrompt: "Create a repository called 'my-awesome-project'",
  recordingSession: selectedRecording,
  apiKey: anthropicApiKey
});
```

#### 3. **LLM Generates Plan**
```typescript
// LLMService calls Claude with:
- System prompt (with cached recorded context)
- User prompt
- Tool definitions (10 automation tools)

// Claude responds with tool_use blocks:
[
  { name: 'navigate', input: { url: 'https://github.com/new' } },
  { name: 'waitForElement', input: { selector: '#repository-name' } },
  { name: 'type', input: { selector: '#repository-name', text: 'my-awesome-project' } },
  { name: 'click', input: { selector: 'button[type="submit"]' } }
]
```

#### 4. **Executor Runs Steps**
```typescript
// AutomationExecutor:
for (const step of plan.steps) {
  await executeStepWithRetry(step);
  // Sends progress updates to renderer
  onProgress(step, index, total);
}
```

#### 5. **BrowserAutomation Performs Actions**
```typescript
// Each step maps to CDP commands:
await automation.navigate(url);
await automation.waitForElementVisible(selector);
await automation.type(selector, text);
await automation.click(selector);
```

### Tool Definitions

Each tool has:
- **Detailed description** (3-4 sentences minimum)
- **When to use** guidelines
- **Important notes** and limitations
- **Examples** of usage
- **JSON Schema** for parameters

Example:
```typescript
{
  name: 'click',
  description: `Click on an element in the page. This tool uses intelligent 
    element location with multiple fallback strategies including ID, aria-label, 
    text content, and CSS selectors.
    
    When to use:
    - To click buttons, links, or any clickable element
    - To trigger actions like form submission, navigation, or UI changes
    ...`,
  input_schema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector, ID, aria-label, or other identifier...'
      }
    },
    required: ['selector']
  }
}
```

### System Prompt Strategy

The system prompt includes:
1. **Role definition** - Expert browser automation assistant
2. **Recorded workflow context** - Formatted actions from recording
3. **Guidelines** - Tool usage, selector strategy, optimization, reliability
4. **Examples** - How to adapt recorded workflows
5. **Response format** - Use tools, not explanations

Key sections:
- **Optimization** - Skip unnecessary steps when direct path is known
- **Reliability** - Always wait for elements, use proper selectors
- **Adaptation** - Template not script, adapt to user's request

### Prompt Caching Implementation

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  system: [
    {
      type: 'text',
      text: systemPrompt,  // Contains recorded context
      cache_control: { type: 'ephemeral' }  // Cache this!
    }
  ],
  tools: tools,
  messages: [{ role: 'user', content: userPrompt }]
});
```

Benefits:
- First request: ~5000 input tokens
- Cached requests: ~500 input tokens (90% savings)
- Cache valid for 5 minutes
- Significant cost reduction for iterative testing

## Comparison with Older Implementation

### What Was Wrong

| Aspect | Old Implementation | New Implementation |
|--------|-------------------|-------------------|
| **Execution** | Renderer-side (webview.executeJavaScript) | Main-side (CDP) |
| **Tools** | Embedded in system prompt | Proper Anthropic tool use |
| **Element Location** | Basic querySelector | Multi-strategy with fallbacks |
| **Error Handling** | Blind execution, no retry | Retry logic, error recovery |
| **Caching** | None | Prompt caching for context |
| **Architecture** | Monolithic | Modular (Service/Executor/Automation) |
| **Security** | Renderer access | Sandboxed WebContentsView |

### What Was Good (and Kept)

- ✅ Prompt engineering approach
- ✅ Action parsing and validation
- ✅ Step-by-step execution concept
- ✅ Progress tracking
- ✅ Recording as context

## API Reference

### IPC Handlers

#### `automation:initialize`
Initialize the automation service with API key.

```typescript
await window.electronAPI.invoke('automation:initialize', apiKey);
// Returns: { success: boolean, error?: string }
```

#### `automation:execute`
Execute automation with user prompt and recorded session.

```typescript
const result = await window.electronAPI.invoke('automation:execute', {
  userPrompt: string,
  recordingSession: RecordingSession,
  apiKey: string
});
// Returns: AutomationResult
```

#### `automation:generate-plan`
Generate automation plan without executing.

```typescript
const response = await window.electronAPI.invoke('automation:generate-plan', 
  userPrompt, 
  recordingSession
);
// Returns: LLMAutomationResponse
```

#### `automation:get-status`
Get current automation status.

```typescript
const status = await window.electronAPI.invoke('automation:get-status');
// Returns: { isExecuting: boolean, currentPlan: AutomationPlan | null }
```

#### `automation:cancel`
Cancel running automation.

```typescript
await window.electronAPI.invoke('automation:cancel');
```

### Events

#### `automation:progress`
Sent during execution with step progress.

```typescript
window.electronAPI.on('automation:progress', (data) => {
  const { step, index, total } = data;
  // Update UI with progress
});
```

## Configuration

### Environment Variables

```bash
# Anthropic API Key (required)
ANTHROPIC_API_KEY=sk-ant-...
```

### Constants

```typescript
// AutomationExecutor.ts
MAX_RETRIES = 2;              // Retry attempts per step
RETRY_DELAY_BASE = 1000;      // Base delay for exponential backoff
STEP_DELAY = 500;             // Delay between steps

// BrowserAutomation.ts
DEFAULT_TIMEOUT = 10000;      // Default element wait timeout
```

## Best Practices

### For Users

1. **Record clear workflows** - Perform actions deliberately
2. **Use stable selectors** - Prefer IDs and data attributes
3. **Provide context** - Describe what you're doing in the recording
4. **Test iteratively** - Start with simple automations
5. **Use specific prompts** - "Create repo called X" not "do the thing"

### For Developers

1. **Add waits liberally** - Better slow than broken
2. **Use multiple selector strategies** - Fallbacks are essential
3. **Log everything** - Debugging automation is hard
4. **Handle errors gracefully** - Show useful messages
5. **Test with real sites** - Synthetic tests miss edge cases

## Troubleshooting

### Common Issues

**"Element not found"**
- Check if page is fully loaded
- Add `waitForElement` before interaction
- Verify selector is correct
- Check if element is in iframe

**"Automation fails randomly"**
- Increase wait times
- Check network speed
- Verify element visibility
- Look for dynamic content

**"LLM generates wrong steps"**
- Improve recording quality
- Provide more context in prompt
- Check if recorded selectors are stable
- Review system prompt guidelines

**"High token usage"**
- Ensure prompt caching is enabled
- Limit recorded actions to 50
- Remove unnecessary metadata
- Check cache hit rate in logs

## Future Enhancements

### Planned Features

1. **Agentic Loop** - LLM observes results and adapts
2. **Vision Integration** - Screenshot analysis for verification
3. **Error Recovery** - LLM suggests fixes for failures
4. **Multi-step Planning** - Break complex tasks into phases
5. **Learning** - Improve from successful/failed executions

### Potential Improvements

- [ ] Parallel step execution for independent actions
- [ ] Custom tool definitions per recording
- [ ] Recording similarity matching
- [ ] Automated selector optimization
- [ ] Performance metrics and analytics
- [ ] A/B testing different prompts
- [ ] Recording versioning and diffing

## License

Same as Browzer project.

## Credits

- **Anthropic Claude** - LLM powering automation
- **Chrome DevTools Protocol** - Browser automation foundation
- **Electron** - Desktop application framework
