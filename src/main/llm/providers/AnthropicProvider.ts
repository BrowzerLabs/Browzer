/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AnthropicProvider - Claude integration with streaming support
 * 
 * Integrates Anthropic's Claude models using their official SDK.
 * 
 * Features:
 * - Streaming responses via SSE
 * - Tool calling (function calling)
 * - Vision support (Claude 3+)
 * - Large context windows
 * 
 * Install: npm install @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from '../BaseLLMProvider';
import {
  LLMRequest,
  LLMResponse,
  StreamCallback,
  ProviderConfig,
  ModelCapabilities,
  ToolCall,
  LLMError,
  LLMErrorCode
} from '../types';

export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;
  private readonly defaultModel = 'claude-sonnet-4-5-20250929';

  // Model capabilities registry
  private readonly modelCapabilities: Record<string, ModelCapabilities> = {
    'claude-sonnet-4-5-20250929': {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 8192,
      supportsVision: true,
      supportsToolCalling: true,
      supportsStreaming: true,
      costPer1MTokens: { input: 3.00, output: 15.00 },
      strengths: ['reasoning', 'coding', 'planning', 'tool-use', 'agents', 'extended-autonomous-operation'],
      contextWindow: 200000
    }
  };

  constructor(config: ProviderConfig) {
    super('anthropic', config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries || 2,
      timeout: config.timeout || 60000
    });
  }

  /**
   * Generate non-streaming completion
   */
  public async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);
    this.logRequest(request);

    const startTime = Date.now();
    const model = request.model || this.config.defaultModel || this.defaultModel;

    try {
      const anthropicRequest = this.convertToAnthropicFormat(request, model);

      const response = await this.executeWithRetry(
        () => this.client.messages.create(anthropicRequest)
      );

      const llmResponse = this.convertFromAnthropicFormat(response, model);
      const latency = Date.now() - startTime;

      // Update statistics
      const cost = this.calculateCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
        model
      );

      this.updateStats(
        true,
        response.usage.input_tokens + response.usage.output_tokens,
        cost,
        latency
      );

      this.logResponse(llmResponse);
      return llmResponse;

    } catch (error) {
      const llmError = this.handleError(error, 'Claude completion failed');
      this.updateStats(false, 0, 0, Date.now() - startTime, llmError);
      throw llmError;
    }
  }

  /**
   * Generate streaming completion
   */
  public async streamCompletion(
    request: LLMRequest,
    onChunk: StreamCallback
  ): Promise<LLMResponse> {
    this.validateRequest(request);
    this.logRequest(request);

    const startTime = Date.now();
    const model = request.model || this.config.defaultModel || this.defaultModel;

    try {
      const anthropicRequest = this.convertToAnthropicFormat(request, model);

      // Create streaming request
      const stream = await this.executeWithRetry(
        () => this.client.messages.create({
          ...anthropicRequest,
          stream: true
        })
      );

      // Accumulate response
      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let currentToolCall: Partial<ToolCall> | null = null;
      let inputTokens = 0;
      let outputTokens = 0;

      // Send start chunk
      await onChunk({ type: 'message_start' });

      // Process stream
      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        }

        else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolCall = {
              id: event.content_block.id,
              type: 'function',
              function: {
                name: event.content_block.name,
                arguments: ''
              }
            };
          }
        }

        else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Text content
            fullText += event.delta.text;
            await onChunk({
              type: 'text_delta',
              delta: event.delta.text
            });
          }

          else if (event.delta.type === 'input_json_delta' && currentToolCall) {
            // Tool call arguments
            currentToolCall.function!.arguments += event.delta.partial_json;
            await onChunk({
              type: 'tool_call_delta',
              delta: event.delta.partial_json,
              toolCall: currentToolCall
            });
          }
        }

        else if (event.type === 'content_block_stop') {
          if (currentToolCall) {
            toolCalls.push(currentToolCall as ToolCall);
            await onChunk({
              type: 'tool_call_complete',
              toolCall: currentToolCall as ToolCall
            });
            currentToolCall = null;
          }
        }

        else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
        }
      }

      // Build final response
      const llmResponse: LLMResponse = {
        id: crypto.randomUUID(),
        model,
        provider: 'anthropic',
        message: {
          role: 'assistant',
          content: fullText,
          ...(toolCalls.length > 0 ? { toolCalls } : {})
        },
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        },
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
      };

      // Send completion chunk
      await onChunk({
        type: 'message_complete',
        usage: { inputTokens, outputTokens }
      });

      // Update statistics
      const latency = Date.now() - startTime;
      const cost = this.calculateCost(inputTokens, outputTokens, model);
      this.updateStats(true, inputTokens + outputTokens, cost, latency);

      this.logResponse(llmResponse);
      return llmResponse;

    } catch (error) {
      const llmError = this.handleError(error, 'Claude streaming failed');
      await onChunk({ type: 'error', error: llmError });
      this.updateStats(false, 0, 0, Date.now() - startTime, llmError);
      throw llmError;
    }
  }

  /**
   * Get model capabilities
   */
  public getCapabilities(model?: string): ModelCapabilities {
    const modelName = model || this.defaultModel;
    return this.modelCapabilities[modelName] || this.modelCapabilities[this.defaultModel];
  }

  /**
   * List available models
   */
  public async listModels(): Promise<ModelCapabilities[]> {
    return Object.values(this.modelCapabilities);
  }

  /**
   * Convert request to Anthropic format
   */
  private convertToAnthropicFormat(
    request: LLMRequest,
    model: string
  ): Anthropic.MessageCreateParamsNonStreaming {
    const capabilities = this.getCapabilities(model);

    // Extract system message if present
    let system: string | undefined;
    const messages = request.messages.filter(msg => {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
        return false;
      }
      return true;
    });

    // Add systemPrompt if provided
    if (request.systemPrompt) {
      system = request.systemPrompt + (system ? '\n\n' + system : '');
    }

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map(msg => {
      if (msg.role === 'tool') {
        // Tool response
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: msg.content as string
          }]
        };
      }

      // Regular message
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: typeof msg.content === 'string' 
          ? msg.content
          : msg.content.map(c => {
              if (c.type === 'text') {
                return { type: 'text', text: c.text };
              } else {
                return {
                  type: 'image',
                  source: c.source.type === 'base64'
                    ? { type: 'base64', media_type: c.source.media_type!, data: c.source.data! }
                    : { type: 'url', url: c.source.url! }
                };
              }
            })
      };
    });

    const anthropicRequest: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: request.maxTokens || capabilities.maxTokens,
      messages: anthropicMessages,
      ...(system ? { system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.topP !== undefined ? { top_p: request.topP } : {}),
      ...(request.stopSequences ? { stop_sequences: request.stopSequences } : {})
    };

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      anthropicRequest.tools = request.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
      }));
    }

    return anthropicRequest;
  }

  /**
   * Convert Anthropic response to unified format
   */
  private convertFromAnthropicFormat(
    response: Anthropic.Message,
    model: string
  ): LLMResponse {
    // Extract text content and tool calls
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    return {
      id: response.id,
      model,
      provider: 'anthropic',
      message: {
        role: 'assistant',
        content: textContent,
        ...(toolCalls.length > 0 ? { toolCalls } : {})
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason === 'tool_use' ? 'tool_calls' :
                     response.stop_reason === 'max_tokens' ? 'length' :
                     response.stop_reason === 'end_turn' ? 'stop' : 'stop'
    };
  }

  /**
   * Override error handling for Anthropic-specific errors
   */
  protected handleError(error: any, context: string): LLMError {
    // Anthropic-specific error handling
    if (error.type === 'invalid_request_error') {
      return new LLMError(
        LLMErrorCode.INVALID_REQUEST_ERROR,
        `Invalid request: ${error.message}`,
        'anthropic',
        400,
        false
      );
    }

    if (error.type === 'authentication_error') {
      return new LLMError(
        LLMErrorCode.AUTHENTICATION_ERROR,
        `Authentication failed: ${error.message}`,
        'anthropic',
        401,
        false
      );
    }

    if (error.type === 'rate_limit_error') {
      return new LLMError(
        LLMErrorCode.RATE_LIMIT_ERROR,
        `Rate limit exceeded: ${error.message}`,
        'anthropic',
        429,
        true
      );
    }

    // Fall back to base error handling
    return super.handleError(error, context);
  }
}

