/**
 * LLM Provider Types
 * 
 * Unified type definitions for multi-provider LLM integration.
 * Supports Anthropic Claude, OpenAI GPT, and Google Gemini.
 */

import { MCPTool } from '../tools/types';

/**
 * Supported LLM providers
 */
export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

/**
 * Model capabilities for orchestration
 */
export interface ModelCapabilities {
  provider: LLMProvider;
  model: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  costPer1MTokens: {
    input: number;
    output: number;
  };
  strengths: string[]; // e.g., ['coding', 'reasoning', 'vision']
  contextWindow: number;
}

/**
 * Message role types
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Unified message format
 */
export interface LLMMessage {
  role: MessageRole;
  content: string | MessageContent[];
  name?: string; // For tool responses
  toolCalls?: ToolCall[]; // For assistant messages with tool calls
  toolCallId?: string; // For tool response messages
}

/**
 * Message content (for multimodal support)
 */
export type MessageContent = TextContent | ImageContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'url' | 'base64';
    url?: string;
    media_type?: 'image/png' | 'image/jpeg';
    data?: string;
  };
}

/**
 * Tool call structure (unified across providers)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * LLM request configuration
 */
export interface LLMRequest {
  messages: LLMMessage[];
  tools?: MCPTool[];
  model?: string; // Override default model
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  systemPrompt?: string; // Will be added as system message
  stopSequences?: string[];
  metadata?: Record<string, any>;
}

/**
 * LLM response structure
 */
export interface LLMResponse {
  id: string;
  model: string;
  provider: LLMProvider;
  message: LLMMessage;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  metadata?: Record<string, any>;
}

/**
 * Streaming chunk types
 */
export type StreamChunkType = 
  | 'text_delta'
  | 'tool_call_delta'
  | 'tool_call_complete'
  | 'message_start'
  | 'message_complete'
  | 'error';

/**
 * Streaming response chunk
 */
export interface StreamChunk {
  type: StreamChunkType;
  delta?: string; // Text delta or tool arguments delta
  toolCall?: Partial<ToolCall>; // Partial tool call being built
  error?: Error;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Stream callback function
 */
export type StreamCallback = (chunk: StreamChunk) => void | Promise<void>;

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  organization?: string; // For OpenAI
  projectId?: string; // For Google Cloud
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Orchestration strategy
 */
export type OrchestrationStrategy = 
  | 'cost-optimized'      // Use cheapest capable model
  | 'performance-optimized' // Use best model for task
  | 'balanced'            // Balance cost and performance
  | 'failover';           // Try primary, fallback on failure

/**
 * Task type for model selection
 */
export type TaskType = 
  | 'reasoning'      // Complex multi-step reasoning
  | 'coding'         // Code generation/analysis
  | 'vision'         // Visual understanding
  | 'planning'       // High-level planning
  | 'execution'      // Simple tool execution
  | 'verification'   // Quick checks
  | 'general';       // General purpose

/**
 * Orchestration request
 */
export interface OrchestrationRequest extends LLMRequest {
  taskType: TaskType;
  strategy?: OrchestrationStrategy;
  preferredProvider?: LLMProvider;
  maxCost?: number; // Max cost in dollars
}

/**
 * Provider selection result
 */
export interface ProviderSelection {
  provider: LLMProvider;
  model: string;
  reason: string;
  estimatedCost: number;
  capabilities: ModelCapabilities;
}

/**
 * Error types
 */
export enum LLMErrorCode {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INVALID_REQUEST_ERROR = 'INVALID_REQUEST_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  STREAM_ERROR = 'STREAM_ERROR',
  TOOL_CALLING_ERROR = 'TOOL_CALLING_ERROR'
}

/**
 * LLM Error
 */
export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    message: string,
    public provider?: LLMProvider,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Provider statistics
 */
export interface ProviderStats {
  provider: LLMProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensUsed: number;
  totalCost: number;
  averageLatency: number;
  errorsByType: Record<string, number>;
}

