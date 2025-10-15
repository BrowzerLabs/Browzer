

# LLM Provider Integration

Multi-provider Large Language Model integration with streaming support for the agentic browser.

## Overview

This module provides a **unified, provider-agnostic interface** for interacting with multiple LLM providers:
- **Anthropic Claude** (3.5 Sonnet, Haiku, Opus)
- **Google Gemini** (2.5 Pro, Flash, experimental models)
- **OpenAI GPT** (Coming soon)

All providers support:
- ✅ **Streaming responses** via Server-Sent Events (SSE)
- ✅ **Tool calling** (function calling) with unified format
- ✅ **Multimodal support** (text + images)
- ✅ **Error handling** with automatic retries
- ✅ **Usage tracking** (tokens, cost, latency)
- ✅ **MCP-compatible** tool formats

## Installation

```bash
# Install provider SDKs
npm install @anthropic-ai/sdk @google/generative-ai

# OpenAI (coming soon)
# npm install openai
```

## Quick Start

### Anthropic Claude

```typescript
import { AnthropicProvider } from './llm';

const claude = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  defaultModel: 'claude-3-5-sonnet-20241022'
});

// Non-streaming
const response = await claude.generateCompletion({
  messages: [{
    role: 'user',
    content: 'Explain quantum computing in simple terms'
  }],
  temperature: 0.7
});

console.log(response.message.content);
```

### Google Gemini

```typescript
import { GeminiProvider } from './llm';

const gemini = new GeminiProvider({
  apiKey: process.env.GOOGLE_API_KEY!,
  defaultModel: 'gemini-2.5-flash'
});

// Streaming
await gemini.streamCompletion({
  messages: [{
    role: 'user',
    content: 'Write a Python function to sort a list'
  }]
}, async (chunk) => {
  if (chunk.type === 'text_delta') {
    process.stdout.write(chunk.delta);
  }
});
```

## Features

### 1. Unified Message Format

All providers use the same message structure:

```typescript
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContent[]; // Text or multimodal
  toolCalls?: ToolCall[]; // For assistant responses
  toolCallId?: string; // For tool responses
}
```

### 2. Streaming Support

Real-time token streaming with multiple chunk types:

```typescript
await provider.streamCompletion(request, async (chunk) => {
  switch (chunk.type) {
    case 'message_start':
      console.log('Stream started');
      break;

    case 'text_delta':
      process.stdout.write(chunk.delta); // Display text in real-time
      break;

    case 'tool_call_delta':
      // Tool arguments being built
      break;

    case 'tool_call_complete':
      // Execute tool immediately
      const result = await executeTool(chunk.toolCall);
      break;

    case 'message_complete':
      console.log('\nTokens used:', chunk.usage);
      break;

    case 'error':
      console.error('Error:', chunk.error);
      break;
  }
});
```

### 3. Tool Calling

Unified tool calling across all providers:

```typescript
const response = await provider.generateCompletion({
  messages: [{
    role: 'user',
    content: 'Navigate to google.com'
  }],
  tools: [{
    name: 'navigate_to_url',
    description: 'Navigate browser to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' }
      },
      required: ['url']
    }
  }]
});

// Check for tool calls
if (response.message.toolCalls) {
  for (const toolCall of response.message.toolCalls) {
    const args = JSON.parse(toolCall.function.arguments);
    console.log('Tool:', toolCall.function.name);
    console.log('Args:', args);
    
    // Execute tool...
    const result = await executeToolFunction(toolCall.function.name, args);
    
    // Send result back to LLM
    const nextResponse = await provider.generateCompletion({
      messages: [
        ...previousMessages,
        response.message,
        {
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
          name: toolCall.function.name
        }
      ],
      tools
    });
  }
}
```

### 4. Multimodal Support

Send images with text (Claude 3+, Gemini):

```typescript
const response = await provider.generateCompletion({
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What do you see in this image?' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64ImageData
        }
      }
    ]
  }]
});
```

### 5. Error Handling

Automatic retries with exponential backoff:

```typescript
try {
  const response = await provider.generateCompletion(request);
} catch (error) {
  if (error instanceof LLMError) {
    console.log('Error code:', error.code);
    console.log('Provider:', error.provider);
    console.log('Retryable:', error.retryable);
    console.log('Status:', error.statusCode);
  }
}
```

Error codes:
- `AUTHENTICATION_ERROR` - Invalid API key
- `RATE_LIMIT_ERROR` - Too many requests (retryable)
- `INVALID_REQUEST_ERROR` - Bad request format
- `TIMEOUT_ERROR` - Request timeout (retryable)
- `API_ERROR` - General API error (often retryable)
- `NETWORK_ERROR` - Network issue (retryable)

### 6. Usage Tracking

Monitor token usage and costs:

```typescript
const response = await provider.generateCompletion(request);

console.log('Tokens:', response.usage);
// {
//   inputTokens: 150,
//   outputTokens: 420,
//   totalTokens: 570
// }

// Get provider statistics
const stats = provider.getStats();
console.log('Total requests:', stats.totalRequests);
console.log('Success rate:', stats.successfulRequests / stats.totalRequests);
console.log('Total cost: $', stats.totalCost);
console.log('Avg latency:', stats.averageLatency, 'ms');
console.log('Errors:', stats.errorsByType);
```

## Provider Comparison

### Anthropic Claude

**Models:**
- `claude-3-5-sonnet-20241022` - Best for reasoning, coding, planning
- `claude-3-5-haiku-20241022` - Fast and cost-effective
- `claude-3-opus-20240229` - Most capable, highest accuracy

**Strengths:**
- 🏆 Best reasoning and coding capabilities
- 🏆 Excellent tool use
- ✅ 200K token context window
- ✅ Vision support (Sonnet, Opus)

**Pricing:**
- Sonnet: $3/$15 per 1M tokens
- Haiku: $0.80/$4 per 1M tokens
- Opus: $15/$75 per 1M tokens

**Best for:** Complex reasoning, code generation, multi-step planning

### Google Gemini

**Models:**
- `gemini-2.5-pro` - Most capable, 2M token context
- `gemini-2.5-flash` - Fast and affordable, 1M token context
- `gemini-2.0-flash-exp` - Experimental, free during preview
- `gemini-1.5-pro` - Stable, 2M token context

**Strengths:**
- 🏆 Largest context windows (up to 2M tokens!)
- 🏆 Excellent multimodal capabilities
- 🏆 Most cost-effective for large contexts
- ✅ Native vision support

**Pricing:**
- 2.5 Pro: $1.25/$5 per 1M tokens
- 2.5 Flash: $0.075/$0.30 per 1M tokens
- 2.0 Flash Exp: Free (preview)

**Best for:** Large documents, multimodal tasks, cost-sensitive applications

### Model Selection Guide

| Task Type | Recommended Model | Reason |
|-----------|------------------|--------|
| Complex reasoning | Claude 3.5 Sonnet | Best reasoning abilities |
| Code generation | Claude 3.5 Sonnet | Excellent at coding |
| Large documents | Gemini 2.5 Pro | 2M token context |
| Vision tasks | Gemini 2.5 Flash | Great vision + fast |
| Simple tasks | Claude Haiku or Gemini Flash | Fast and cheap |
| Cost optimization | Gemini 2.5 Flash | $0.075/$0.30 per 1M |
| High accuracy | Claude 3 Opus | Most capable |

## Advanced Usage

### System Prompts

```typescript
const response = await provider.generateCompletion({
  systemPrompt: 'You are a helpful browser automation assistant.',
  messages: [{
    role: 'user',
    content: 'Help me fill out a form'
  }]
});
```

### Temperature & Sampling

```typescript
const response = await provider.generateCompletion({
  messages: [...],
  temperature: 0.7,  // 0.0 = deterministic, 1.0 = creative
  topP: 0.9,         // Nucleus sampling
  maxTokens: 2000,   // Max output tokens
  stopSequences: ['\n\n'] // Stop generation at sequences
});
```

### Model Override

```typescript
// Use specific model instead of default
const response = await provider.generateCompletion({
  model: 'claude-3-opus-20240229', // Override default
  messages: [...]
});
```

### Configuration

```typescript
const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  defaultModel: 'claude-3-5-sonnet-20241022',
  maxRetries: 3,  // Retry failed requests
  timeout: 60000  // 60 second timeout
});

// Update config later
provider.updateConfig({
  maxRetries: 5,
  timeout: 120000
});
```

## Integration with Tools

The LLM providers work seamlessly with the Tool Registry:

```typescript
import { ToolRegistry } from '../tools';
import { AnthropicProvider } from '../llm';

const toolRegistry = new ToolRegistry(view);
const claude = new AnthropicProvider({ apiKey: '...' });

// Get tools in MCP format
const tools = toolRegistry.getToolsAsMCP();

// Request with tools
const response = await claude.generateCompletion({
  messages: [{
    role: 'user',
    content: 'Click the login button'
  }],
  tools // Pass all available tools
});

// Execute tool calls
if (response.message.toolCalls) {
  for (const toolCall of response.message.toolCalls) {
    const args = JSON.parse(toolCall.function.arguments);
    
    // Execute via Tool Registry
    const result = await toolRegistry.executeTool(
      toolCall.function.name,
      args
    );
    
    console.log('Tool result:', result);
  }
}
```

## Best Practices

### 1. Use Streaming for Long Responses

```typescript
// Better UX - user sees response immediately
await provider.streamCompletion(request, (chunk) => {
  if (chunk.type === 'text_delta') {
    displayToUser(chunk.delta);
  }
});
```

### 2. Handle Errors Gracefully

```typescript
async function callLLMWithFallback() {
  try {
    return await claude.generateCompletion(request);
  } catch (error) {
    if (error.retryable) {
      // Already retried automatically, but could try different provider
      return await gemini.generateCompletion(request);
    }
    throw error;
  }
}
```

### 3. Monitor Costs

```typescript
const stats = provider.getStats();
if (stats.totalCost > 10.0) {
  console.warn('High API costs detected!');
  // Switch to cheaper model
}
```

### 4. Choose Right Model for Task

```typescript
// Simple task -> use cheap model
if (taskType === 'simple') {
  provider.updateConfig({ defaultModel: 'claude-3-5-haiku' });
}

// Complex reasoning -> use best model
if (taskType === 'reasoning') {
  provider.updateConfig({ defaultModel: 'claude-3-5-sonnet' });
}

// Large context -> use Gemini
if (contextSize > 100000) {
  // Switch to Gemini 2.5 Pro with 2M context window
}
```

### 5. Reset Stats Periodically

```typescript
// Reset stats at start of each session
provider.resetStats();

// Or track per-session
const sessionStart = provider.getStats();
// ... do work ...
const sessionEnd = provider.getStats();
const sessionCost = sessionEnd.totalCost - sessionStart.totalCost;
```

## Architecture

```
BaseLLMProvider (abstract)
├── Error handling
├── Retry logic
├── Statistics tracking
├── Cost calculation
└── Request validation

AnthropicProvider extends BaseLLMProvider
├── Anthropic SDK integration
├── Streaming via Anthropic SSE
├── Tool calling format conversion
└── Vision support

GeminiProvider extends BaseLLMProvider
├── Google Generative AI SDK
├── Streaming via Gemini API
├── Tool calling (function declarations)
└── Large context window support

OpenAIProvider extends BaseLLMProvider (TODO)
├── OpenAI SDK integration
├── Streaming via OpenAI SSE
├── Function calling format conversion
└── GPT-4o vision support
```

## Next: LLM Orchestrator

The next component to build is the **LLM Orchestrator**, which will:
- Automatically select the best model for each task
- Implement cost optimization strategies
- Provide failover between providers
- Balance performance vs cost

```typescript
// Future usage:
const orchestrator = new LLMOrchestrator({
  anthropic: claudeProvider,
  gemini: geminiProvider,
  openai: gptProvider
});

const response = await orchestrator.execute({
  taskType: 'reasoning',      // Task classification
  strategy: 'cost-optimized', // Selection strategy
  messages: [...]
});
// Automatically selects best model (e.g., Claude Sonnet for reasoning)
```

## Troubleshooting

### Authentication Errors

```bash
# Set API keys as environment variables
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="AIza..."
export OPENAI_API_KEY="sk-..."
```

### Rate Limits

Providers automatically retry with exponential backoff. Increase retry count if needed:

```typescript
provider.updateConfig({ maxRetries: 5 });
```

### Timeout Errors

Increase timeout for long-running requests:

```typescript
provider.updateConfig({ timeout: 120000 }); // 2 minutes
```

### Tool Calling Issues

Ensure tools are properly formatted in MCP schema:

```typescript
{
  name: 'tool_name',
  description: 'Clear description of what the tool does',
  inputSchema: {
    type: 'object',
    properties: { ... },
    required: ['param1', 'param2']
  }
}
```

## Future Enhancements

- [ ] OpenAI GPT provider implementation
- [ ] LLM Orchestrator with automatic model selection
- [ ] Response caching for repeated queries
- [ ] Batch request support
- [ ] Fine-tuned model support
- [ ] Local model support (Ollama, etc.)
- [ ] Advanced cost tracking and budgeting
- [ ] A/B testing between providers

## Summary

This LLM integration module provides:
- ✅ **2 providers implemented** (Claude, Gemini)
- ✅ **Streaming support** for real-time responses
- ✅ **Tool calling** with unified interface
- ✅ **Error handling** with auto-retry
- ✅ **Usage tracking** for optimization
- ✅ **MCP-compatible** for easy integration

Ready to be integrated with the Agent Runtime Engine!

