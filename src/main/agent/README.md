# Agent Orchestration System - The Brain 🧠

**Complete ReAct-based agentic browser automation system with real-time LLM orchestration**

## Overview

This is the **core intelligence layer** of the agentic browser - a sophisticated orchestration system that combines:
- **Multi-provider LLM support** (Claude, Gemini, OpenAI)
- **ReAct pattern** (Reasoning + Acting) for intelligent execution
- **Browser context awareness** via real-time CDP monitoring
- **Tool execution engine** for browser automation
- **Conversation state management** with memory optimization
- **Streaming execution** with real-time updates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentOrchestrator                        │
│              (The Brain - Main Coordinator)                 │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │              ReAct Execution Loop                   │   │
│  │                                                      │   │
│  │   ┌──────────┐   ┌──────────┐   ┌──────────┐     │   │
│  │   │ OBSERVE  │ → │  THINK   │ → │   ACT    │     │   │
│  │   │ (Context)│   │  (LLM)   │   │ (Tools)  │     │   │
│  │   └──────────┘   └──────────┘   └──────────┘     │   │
│  │        ↓              ↓               ↓            │   │
│  │   ┌─────────────────────────────────────────┐    │   │
│  │   │         REFLECT & ADJUST                 │    │   │
│  │   └─────────────────────────────────────────┘    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Session   │  │   Context    │  │    Memory    │    │
│  │   Manager   │  │   Provider   │  │   Manager    │    │
│  └─────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. **AgentOrchestrator** 
*The main brain that coordinates everything*

**Responsibilities:**
- Initialize and manage LLM providers
- Execute tasks via ReAct engine
- Manage conversation sessions
- Optimize context and memory
- Stream real-time updates to UI
- Handle errors and retries

**Key Methods:**
```typescript
// Execute a user task
await orchestrator.executeTask(
  "Fill out the login form with my credentials",
  tabId,
  {
    mode: 'autonomous', // or 'semi-supervised', 'supervised'
    streamingCallback: async (event) => {
      // Real-time updates
      if (event.type === 'thought') {
        console.log('Agent thinking:', event.data.content);
      }
    }
  }
);
```

### 2. **ReActEngine**
*Implements the Reasoning + Acting pattern*

**The ReAct Loop:**
```typescript
while (not done && iterations < max) {
  // 1. OBSERVE - Get current browser state
  observation = await observe(context);
  
  // 2. THINK - Reason about next action using LLM
  thought = await think(observation, goal, history);
  
  // 3. ACT - Execute tool or provide answer
  action = await act(thought);
  result = await executeTool(action);
  
  // 4. REFLECT - Learn from result
  if (enableReflection) {
    await reflect(action, result);
  }
  
  // Check completion
  if (task_complete) break;
}
```

**Features:**
- Adaptive execution based on real-time feedback
- Automatic retry on failures (up to 3 consecutive failures)
- Error recovery and alternative approaches
- Self-reflection and learning

### 3. **ChatSessionManager**
*Manages conversation state and history*

**Features:**
- Multi-turn conversation tracking
- Message history management
- Tool call and result tracking
- Session persistence (TODO: implement storage)
- Statistics and analytics
- Session import/export

**Usage:**
```typescript
const session = sessionManager.createSession(tabId, userId);

// Add messages
sessionManager.addUserMessage(sessionId, "Click the search button");
sessionManager.addAssistantMessage(sessionId, "I'll click the search button", toolCalls);
sessionManager.addToolResult(sessionId, toolCallId, "click_element", result);

// Get history
const messages = sessionManager.getMessages(sessionId);
const summary = sessionManager.getSummary(sessionId);
```

### 4. **ContextMemoryManager**
*Intelligent context window optimization*

**Problem:** Modern LLMs have large context windows (200K-2M tokens), but:
- Costs increase with tokens
- Latency increases with context size
- Need to fit: system prompt + browser context + conversation + tools

**Solution:** Multiple optimization strategies:
- **Sliding Window**: Keep recent N messages
- **Compression**: Summarize old messages (using LLM)
- **Importance-Based**: Keep important messages, remove less important
- **Hierarchical**: Multi-level summarization

**Usage:**
```typescript
const optimized = memoryManager.optimizeMessages(
  messages,
  systemPrompt,
  browserContext,
  toolDefinitions,
  targetTokens: 100000 // Target: 100K tokens
);

// Saved ~50K tokens by compressing 20 old messages
```

## Quick Start

### 1. Initialize the Orchestrator

```typescript
import { AgentOrchestrator } from './agent';
import { ToolRegistry } from './tools';
import { BrowserContextProvider } from './context';

// Setup components
const toolRegistry = new ToolRegistry(browserView);
const contextProvider = new BrowserContextProvider(browserView);

// Create orchestrator
const agent = new AgentOrchestrator(
  toolRegistry,
  contextProvider,
  {
    model: 'claude-3-5-sonnet', // or 'gemini-2.5-flash'
    mode: 'autonomous',
    maxExecutionSteps: 20,
    enableReflection: true,
    enableMemory: true,
    streamingEnabled: true
  }
);
```

### 2. Execute a Task

```typescript
// Environment variables
process.env.ANTHROPIC_API_KEY = 'sk-ant-...';
process.env.GOOGLE_API_KEY = 'AIza...';

// Execute with streaming
const result = await agent.executeTask(
  "Search for 'AI news' on Google and summarize the top 3 results",
  tabId,
  {
    streamingCallback: async (event) => {
      switch (event.type) {
        case 'thought':
          console.log('💭', event.data.content);
          break;
        case 'action':
          console.log('🎬', event.data.type, event.data.toolCall?.function.name);
          break;
        case 'observation':
          console.log('👀', event.data.summary);
          break;
      }
    }
  }
);

console.log('Final answer:', result.response);
console.log('Cost:', result.metadata.cost);
console.log('Steps:', result.metadata.stepsExecuted);
```

### 3. Streaming Example

```typescript
// Real-time UI updates
await agent.executeTask(userMessage, tabId, {
  streamingCallback: async (event) => {
    if (event.type === 'text_delta') {
      // Stream text to UI in real-time
      appendToUI(event.delta);
    }
    
    if (event.type === 'tool_call_complete') {
      // Show tool execution
      showToolExecution(event.toolCall.function.name);
    }
    
    if (event.type === 'message_complete') {
      // Task completed
      showCompletion(event.usage);
    }
  }
});
```

## Configuration

### Agent Modes

**1. Autonomous Mode** (Default)
```typescript
mode: 'autonomous'
```
- Executes all actions without user approval
- Fast and efficient
- Best for trusted environments

**2. Semi-Supervised Mode**
```typescript
mode: 'semi-supervised'
dangerousActionsRequireApproval: ['delete', 'purchase', 'submit_payment']
```
- Asks for approval on dangerous actions
- Balance between speed and safety

**3. Supervised Mode**
```typescript
mode: 'supervised'
```
- Requires approval for every action
- Maximum safety
- Slower execution

### Model Selection

```typescript
{
  model: 'claude-3-5-sonnet',   // Best reasoning, coding
  // or
  model: 'claude-3-5-haiku',    // Fast and cheap
  // or
  model: 'gemini-2.5-pro',      // 2M context, best for large docs
  // or
  model: 'gemini-2.5-flash',    // Fastest, most cost-effective
  
  fallbackModel: 'gemini-2.5-flash', // Fallback if primary fails
  temperature: 0.7 // Creativity vs determinism
}
```

### Execution Limits

```typescript
{
  maxExecutionSteps: 20,        // Max iterations in ReAct loop
  maxThinkingTime: 300000,      // 5 minutes timeout
  maxRetries: 3,                // Retries on failure
  retryDelay: 1000             // ms between retries
}
```

### Context Optimization

```typescript
{
  maxContextTokens: 100000,              // Target token budget
  contextCompressionEnabled: true,       // Enable compression
  contextOptimizationStrategy: 'sliding_window' // or 'compression', 'importance_based'
}
```

## Advanced Usage

### 1. Multi-Step Planning

```typescript
const result = await agent.executeTask(
  "Research the top 5 AI companies, visit their websites, and create a comparison table",
  tabId,
  {
    enablePlanning: true, // Create upfront plan
    maxExecutionSteps: 50 // Allow more steps for complex tasks
  }
);

// Access the execution plan
console.log('Plan:', result.plan);
console.log('Iterations:', result.iterations);
```

### 2. Session Management

```typescript
// Continue previous conversation
const sessionId = '...'; // From previous execution

await agent.executeTask(
  "Now click on the first result",
  tabId,
  { sessionId } // Reuse session with context
);

// Get session history
const session = agent.getSessionManager().getSession(sessionId);
console.log('Messages:', session.messages.length);
console.log('Cost so far:', session.stats.totalCost);
```

### 3. Custom Memory Management

```typescript
// Add important memories
agent.getMemoryManager().addMemory(sessionId, {
  type: 'preference',
  content: 'User prefers dark mode websites',
  importance: 0.9,
  source: 'user_feedback'
});

// Retrieve relevant memories
const memories = agent.getMemoryManager().getRelevantMemories(
  sessionId,
  'website theme',
  limit: 5
);
```

### 4. Pause/Resume Execution

```typescript
// Pause (for user approval, etc.)
agent.pauseExecution(sessionId);

// Resume later
agent.resumeExecution(sessionId);

// Cancel
agent.cancelExecution(sessionId);
```

### 5. Global Statistics

```typescript
const stats = agent.getGlobalStats();
console.log('Total sessions:', stats.totalSessions);
console.log('Active now:', stats.activeSessions);
console.log('Total tokens used:', stats.totalTokens);
console.log('Total cost: $', stats.totalCost);
```

## Event Types

The streaming callback receives these event types:

```typescript
type AgentEvent = 
  | { type: 'message_start' }
  | { type: 'thought', data: AgentThought }
  | { type: 'action', data: AgentAction }
  | { type: 'observation', data: AgentObservation }
  | { type: 'text_delta', delta: string }
  | { type: 'tool_call_complete', toolCall: ToolCall }
  | { type: 'message_complete', usage: { inputTokens, outputTokens } }
  | { type: 'plan_update', plan: ExecutionPlan }
  | { type: 'error', error: LLMError }
  | { type: 'complete' };
```

## Best Practices

### 1. Choose the Right Model

```typescript
// For simple tasks (navigation, clicks)
model: 'claude-3-5-haiku' or 'gemini-2.5-flash'

// For complex reasoning (planning, problem-solving)
model: 'claude-3-5-sonnet'

// For large context (analyzing multiple pages)
model: 'gemini-2.5-pro' // 2M token context!
```

### 2. Use Streaming for Better UX

```typescript
// ✅ Good - User sees progress in real-time
await agent.executeTask(message, tabId, {
  streamingCallback: updateUI
});

// ❌ Bad - User waits with no feedback
const result = await agent.executeTask(message, tabId);
```

### 3. Monitor Costs

```typescript
const session = agent.getSessionManager().getSession(sessionId);

if (session.stats.totalCost > 0.50) {
  console.warn('High cost detected, consider cheaper model');
  agent.updateConfig({ model: 'gemini-2.5-flash' });
}
```

### 4. Handle Errors Gracefully

```typescript
try {
  await agent.executeTask(message, tabId, {
    streamingCallback: async (event) => {
      if (event.type === 'error') {
        // Show error to user
        showError(event.error.message);
        
        if (event.error.retryable) {
          // Suggest retry
          showRetryButton();
        }
      }
    }
  });
} catch (error) {
  // Handle catastrophic failures
  console.error('Agent execution failed:', error);
}
```

### 5. Clear Sessions Periodically

```typescript
// Clear old sessions to free memory
setInterval(() => {
  const sessions = agent.getSessionManager().getAllSessions();
  const oldSessions = sessions.filter(s => 
    Date.now() - s.lastMessageAt > 3600000 // 1 hour old
  );
  
  oldSessions.forEach(s => {
    agent.getSessionManager().deleteSession(s.id);
  });
}, 600000); // Every 10 minutes
```

## Token Usage & Costs

### Estimated Token Usage Per Request

| Component | Tokens | Notes |
|-----------|--------|-------|
| System Prompt | ~500 | Agent instructions |
| Browser Context | 1,000-5,000 | Depends on page complexity |
| Conversation (10 turns) | 2,000-10,000 | Depends on message length |
| Tools Definitions | ~3,000 | All available tools |
| **Total per request** | **6,500-18,500** | |

### Cost Comparison (per 1M tokens)

| Model | Input | Output | Avg | Best For |
|-------|-------|--------|-----|----------|
| Claude 3.5 Sonnet | $3 | $15 | $9 | Complex reasoning |
| Claude 3.5 Haiku | $0.80 | $4 | $2.40 | Simple tasks |
| Gemini 2.5 Pro | $1.25 | $5 | $3.13 | Large context |
| Gemini 2.5 Flash | $0.075 | $0.30 | $0.19 | Cost optimization |

### Example Cost Calculation

**Task:** "Search for AI news and summarize top 3 results"

```
- Model: Claude 3.5 Sonnet
- Iterations: 8
- Total tokens: ~120K

Cost = 120,000 * $9 / 1,000,000 = $1.08
```

**Same task with Gemini 2.5 Flash:**
```
Cost = 120,000 * $0.19 / 1,000,000 = $0.02
```

💡 **Tip:** Use Gemini 2.5 Flash for cost-sensitive applications!

## Performance Optimization

### 1. Context Compression

```typescript
// Enable aggressive compression for long sessions
agent.updateConfig({
  maxContextTokens: 50000, // Reduce target
  contextCompressionEnabled: true
});
```

### 2. Limit Tool Definitions

```typescript
// Only provide relevant tools to LLM
const relevantTools = toolRegistry.getToolsByCategory('navigation');

// Use in custom execution (advanced)
```

### 3. Batch Operations

```typescript
// Instead of multiple separate tasks
❌ await agent.executeTask("Click button 1", tabId);
❌ await agent.executeTask("Click button 2", tabId);
❌ await agent.executeTask("Click button 3", tabId);

// Combine into one task
✅ await agent.executeTask("Click buttons 1, 2, and 3", tabId);
```

## Troubleshooting

### Issue: High token usage

**Solutions:**
- Enable context compression
- Use cheaper models for simple tasks
- Clear old sessions regularly
- Reduce `maxContextTokens`

### Issue: Slow execution

**Solutions:**
- Use faster models (Haiku, Gemini Flash)
- Reduce `maxExecutionSteps`
- Disable reflection for simple tasks
- Use streaming to improve perceived performance

### Issue: Tasks failing frequently

**Solutions:**
- Increase `maxRetries`
- Use more capable model (Sonnet, Pro)
- Enable reflection for better error recovery
- Check browser context quality

### Issue: Out of memory

**Solutions:**
- Clear sessions periodically
- Reduce `maxContextTokens`
- Disable memory persistence
- Limit concurrent sessions

## Integration Example

```typescript
// Full integration in main Electron process

import { AgentOrchestrator } from './agent';
import { ToolRegistry } from './tools';
import { BrowserContextProvider } from './context';

class BrowserAutomationService {
  private agent: AgentOrchestrator;
  
  constructor(view: WebContentsView) {
    // Setup
    const toolRegistry = new ToolRegistry(view);
    const contextProvider = new BrowserContextProvider(view);
    
    this.agent = new AgentOrchestrator(toolRegistry, contextProvider, {
      model: 'claude-3-5-sonnet',
      mode: 'autonomous'
    });
    
    // Start monitoring
    contextProvider.startMonitoring();
  }
  
  async handleUserMessage(message: string, tabId: string) {
    return await this.agent.executeTask(message, tabId, {
      streamingCallback: async (event) => {
        // Send to renderer process
        this.sendToRenderer('agent:event', event);
      }
    });
  }
  
  private sendToRenderer(channel: string, data: any) {
    // Use IPC to send to renderer
    webContents.send(channel, data);
  }
}
```

## Roadmap

- [ ] **Planning Engine**: Upfront multi-step plan generation
- [ ] **Learning Module**: Learn from past executions
- [ ] **Multi-Agent**: Parallel execution with multiple agents
- [ ] **Custom Tools**: User-defined tool registration
- [ ] **Prompt Templates**: Pre-built prompts for common tasks
- [ ] **Analytics Dashboard**: Real-time execution monitoring
- [ ] **A/B Testing**: Compare different models/strategies
- [ ] **Session Persistence**: Save/load sessions from disk
- [ ] **Cloud Sync**: Sync sessions across devices

## Summary

The Agent Orchestration System provides:

✅ **ReAct Pattern** - Intelligent reasoning + acting loop  
✅ **Multi-LLM Support** - Claude, Gemini, OpenAI  
✅ **Real-time Streaming** - Live updates to UI  
✅ **Context Optimization** - Smart token management  
✅ **Session Management** - Full conversation tracking  
✅ **Memory System** - Learn and remember across sessions  
✅ **Error Recovery** - Automatic retry and adaptation  
✅ **Cost Tracking** - Monitor and optimize spending  
✅ **Flexible Modes** - Autonomous to fully supervised  

**Ready to power intelligent browser automation! 🚀**

