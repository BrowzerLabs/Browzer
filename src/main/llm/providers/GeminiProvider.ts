/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GeminiProvider - Google Gemini integration with streaming support
 * 
 * Integrates Google's Gemini 2.5 models using the official @google/genai SDK.
 * 
 * Features:
 * - Streaming responses via the latest SDK
 * - Tool calling (function calling)
 * - Multimodal support (vision)
 * - Exceptionally large context windows (up to 2M tokens)
 * - Thinking mode for complex reasoning
 * 
 * Install: npm install @google/genai
 * Docs: https://ai.google.dev/gemini-api/docs/text-generation
 */

import { GoogleGenAI, Part, FunctionDeclaration } from '@google/genai';
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

export class GeminiProvider extends BaseLLMProvider {
  private client: GoogleGenAI;
  private readonly defaultModel = 'gemini-2.5-flash';

  // Model capabilities registry
  private readonly modelCapabilities: Record<string, ModelCapabilities> = {
    'gemini-2.5-pro': {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      maxTokens: 8192,
      supportsVision: true,
      supportsToolCalling: true,
      supportsStreaming: true,
      costPer1MTokens: { input: 1.25, output: 5.00 },
      strengths: ['large-context', 'reasoning', 'multimodal', 'complex-tasks'],
      contextWindow: 2000000 // 2M tokens!
    },
    'gemini-2.5-flash': {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      maxTokens: 8192,
      supportsVision: true,
      supportsToolCalling: true,
      supportsStreaming: true,
      costPer1MTokens: { input: 0.075, output: 0.30 },
      strengths: ['speed', 'cost-effective', 'large-context', 'multimodal'],
      contextWindow: 1000000 // 1M tokens
    }
  };

  constructor(config: ProviderConfig) {
    super('gemini', config);
    
    // Initialize GoogleGenAI client with API key
    this.client = new GoogleGenAI({
      apiKey: config.apiKey
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
      // Build generation config
      const generationConfig: any = {
        maxOutputTokens: request.maxTokens || this.getCapabilities(model).maxTokens,
        temperature: request.temperature,
        topP: request.topP,
        stopSequences: request.stopSequences
      };

      // Add thinking config for 2.5 models if not explicitly disabled
      if (model.includes('2.5') && request.temperature !== undefined) {
        // Keep thinking enabled by default, can be disabled via request options
        generationConfig.thinkingConfig = {
          thinkingBudget: 0 // Disable thinking for faster responses by default
        };
      }

      // Build request payload
      const payload: any = {
        model,
        contents: this.convertMessagesToGeminiFormat(request),
        config: generationConfig
      };

      // Add system instruction if present
      if (request.systemPrompt) {
        payload.systemInstruction = request.systemPrompt;
      }

      // Add tools if present
      if (request.tools && request.tools.length > 0) {
        payload.tools = this.convertToolsToGeminiFormat(request.tools);
      }

      // Generate content using the new SDK
      const result = await this.executeWithRetry(() =>
        this.client.models.generateContent(payload)
      );

      // Convert to unified format
      const llmResponse = this.convertFromGeminiFormat(result, model);
      const latency = Date.now() - startTime;

      // Update statistics
      if (result.usageMetadata) {
        const usage = result.usageMetadata;
        const cost = this.calculateCost(
          usage.promptTokenCount || 0,
          usage.candidatesTokenCount || 0,
          model
        );

        this.updateStats(
          true,
          (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
          cost,
          latency
        );
      }

      this.logResponse(llmResponse);
      return llmResponse;

    } catch (error) {
      const llmError = this.handleError(error, 'Gemini completion failed');
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
      // Build generation config
      const generationConfig: any = {
        maxOutputTokens: request.maxTokens || this.getCapabilities(model).maxTokens,
        temperature: request.temperature,
        topP: request.topP,
        stopSequences: request.stopSequences
      };

      // Add thinking config for 2.5 models
      if (model.includes('2.5')) {
        generationConfig.thinkingConfig = {
          thinkingBudget: 0 // Disable thinking for faster streaming
        };
      }

      // Build request payload
      const payload: any = {
        model,
        contents: this.convertMessagesToGeminiFormat(request),
        config: generationConfig
      };

      // Add system instruction if present
      if (request.systemPrompt) {
        payload.systemInstruction = request.systemPrompt;
      }

      // Add tools if present
      if (request.tools && request.tools.length > 0) {
        payload.tools = this.convertToolsToGeminiFormat(request.tools);
        // CRITICAL: Force tool calling mode for automation tasks
        payload.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY' // Force model to call at least one function
          }
        };
      }

      // Generate streaming content using the new SDK
      const stream = await this.executeWithRetry(() =>
        this.client.models.generateContentStream(payload)
      );

      // Accumulate response
      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';

      // Send start chunk
      await onChunk({ type: 'message_start' });

      // Process stream chunks
      for await (const chunk of stream) {
        // Check if chunk has text
        if (chunk.text) {
          fullText += chunk.text;
          await onChunk({
            type: 'text_delta',
            delta: chunk.text
          });
        }

        // Process candidates for tool calls and metadata
        if (chunk.candidates && chunk.candidates.length > 0) {
          const candidate = chunk.candidates[0];

          // Check for function calls (tool calls)
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                const toolCall: ToolCall = {
                  id: crypto.randomUUID(),
                  type: 'function',
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {})
                  }
                };

                toolCalls.push(toolCall);

                await onChunk({
                  type: 'tool_call_complete',
                  toolCall
                });
              }
            }
          }

          // Capture finish reason
          if (candidate.finishReason) {
            finishReason = this.mapFinishReason(candidate.finishReason);
          }
        }

        // Update token counts from usage metadata
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        }
      }

      // Build final response
      const llmResponse: LLMResponse = {
        id: crypto.randomUUID(),
        model,
        provider: 'gemini',
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
        finishReason: toolCalls.length > 0 ? 'tool_calls' : finishReason
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
      const llmError = this.handleError(error, 'Gemini streaming failed');
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
   * Convert messages to Gemini format
   * 
   * Gemini uses a "contents" array with "role" and "parts" structure.
   * Supported roles: 'user', 'model', 'function'
   */
  private convertMessagesToGeminiFormat(request: LLMRequest): any[] {
    const contents: any[] = [];

    for (const msg of request.messages) {
      // Skip system messages (handled separately via systemInstruction)
      if (msg.role === 'system') {
        continue;
      }

      // Handle tool responses
      if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: msg.name || 'tool_result',
              response: {
                result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
              }
            }
          }]
        });
        continue;
      }

      // Convert role: 'assistant' -> 'model'
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: Part[] = [];

      // Handle message content
      if (typeof msg.content === 'string') {
        // Simple text message
        if (msg.content) {
          parts.push({ text: msg.content });
        }
      } else {
        // Multimodal content
        for (const content of msg.content) {
          if (content.type === 'text') {
            parts.push({ text: content.text });
          } else if (content.type === 'image') {
            // Handle image content
            if (content.source.type === 'base64') {
              parts.push({
                inlineData: {
                  mimeType: content.source.media_type || 'image/png',
                  data: content.source.data || ''
                }
              });
            } else if (content.source.url) {
              // For URLs, we'd need to upload via Files API first
              // For now, just add a text description
              parts.push({ 
                text: `[Image URL: ${content.source.url}]` 
              });
            }
          }
        }
      }

      // Handle tool calls from assistant
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const toolCall of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments)
            }
          });
        }
      }

      // Only add if there are parts
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    console.log("contents: ", contents);
    return contents;
  }

  /**
   * Convert Gemini response to unified format
   */
  private convertFromGeminiFormat(response: any, model: string): LLMResponse {
    if (!response.candidates || response.candidates.length === 0) {
      throw new LLMError(
        LLMErrorCode.API_ERROR,
        'No candidates in Gemini response',
        'gemini'
      );
    }

    const candidate = response.candidates[0];
    
    // Extract text and tool calls
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
        }

        if (part.functionCall) {
          toolCalls.push({
            id: crypto.randomUUID(),
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          });
        }
      }
    }

    const usage = response.usageMetadata;

    return {
      id: crypto.randomUUID(),
      model,
      provider: 'gemini',
      message: {
        role: 'assistant',
        content: textContent,
        ...(toolCalls.length > 0 ? { toolCalls } : {})
      },
      usage: usage ? {
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        totalTokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)
      } : undefined,
      finishReason: this.mapFinishReason(candidate.finishReason)
    };
  }

  /**
   * Map Gemini finish reasons to our unified format
   */
  private mapFinishReason(geminiReason?: string): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    switch (geminiReason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Convert tools to Gemini format
   * 
   * Gemini uses "functionDeclarations" format for tools.
   */
  private convertToolsToGeminiFormat(tools: any[]): any[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema // Already in JSON Schema format
    }));

    return [{
      functionDeclarations
    }];
  }

  /**
   * Override error handling for Gemini-specific errors
   */
  protected handleError(error: any, context: string): LLMError {
    const errorMessage = error.message || String(error);

    // Gemini-specific error handling
    if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
      return new LLMError(
        LLMErrorCode.AUTHENTICATION_ERROR,
        `Authentication failed: ${errorMessage}`,
        'gemini',
        401,
        false
      );
    }

    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      return new LLMError(
        LLMErrorCode.RATE_LIMIT_ERROR,
        `Rate limit exceeded: ${errorMessage}`,
        'gemini',
        429,
        true
      );
    }

    if (errorMessage.includes('invalid') || errorMessage.includes('Invalid')) {
      return new LLMError(
        LLMErrorCode.INVALID_REQUEST_ERROR,
        `Invalid request: ${errorMessage}`,
        'gemini',
        400,
        false
      );
    }

    if (errorMessage.includes('timeout')) {
      return new LLMError(
        LLMErrorCode.TIMEOUT_ERROR,
        `Request timeout: ${errorMessage}`,
        'gemini',
        408,
        true
      );
    }

    // Fall back to base error handling
    return super.handleError(error, context);
  }
}
