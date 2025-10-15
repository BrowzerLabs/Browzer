/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BaseLLMProvider - Abstract base class for all LLM providers
 * 
 * Provides common functionality for:
 * - Request/response handling
 * - Streaming management
 * - Error handling and retries
 * - Usage tracking
 * - Rate limiting
 * 
 * Each provider (Anthropic, OpenAI, Gemini) extends this base class
 * and implements provider-specific logic.
 */

import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamCallback,
  ProviderConfig,
  ProviderStats,
  LLMError,
  LLMErrorCode,
  ModelCapabilities
} from './types';

export abstract class BaseLLMProvider {
  protected config: ProviderConfig;
  protected stats: ProviderStats;
  protected readonly providerName: LLMProvider;

  constructor(providerName: LLMProvider, config: ProviderConfig) {
    this.providerName = providerName;
    this.config = config;
    this.stats = this.initializeStats();
  }

  /**
   * Initialize provider statistics
   */
  private initializeStats(): ProviderStats {
    return {
      provider: this.providerName,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      averageLatency: 0,
      errorsByType: {}
    };
  }

  /**
   * Generate completion (non-streaming)
   * Must be implemented by each provider
   */
  public abstract generateCompletion(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Generate streaming completion
   * Must be implemented by each provider
   */
  public abstract streamCompletion(
    request: LLMRequest,
    onChunk: StreamCallback
  ): Promise<LLMResponse>;

  /**
   * Get model capabilities
   * Must be implemented by each provider
   */
  public abstract getCapabilities(model?: string): ModelCapabilities;

  /**
   * List available models
   * Must be implemented by each provider
   */
  public abstract listModels(): Promise<ModelCapabilities[]>;

  /**
   * Execute request with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryableError(error as LLMError)) {
          throw error;
        }

        // Last attempt, throw error
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await this.sleep(delay);
        delay *= 2; // Exponential backoff
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  protected isRetryableError(error: LLMError): boolean {
    const retryableCodes = [
      LLMErrorCode.RATE_LIMIT_ERROR,
      LLMErrorCode.NETWORK_ERROR,
      LLMErrorCode.TIMEOUT_ERROR,
      LLMErrorCode.API_ERROR
    ];

    return error.retryable || retryableCodes.includes(error.code);
  }

  /**
   * Handle API errors and convert to LLMError
   */
  protected handleError(error: any, context: string): LLMError {
    // Rate limit errors
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
      return new LLMError(
        LLMErrorCode.RATE_LIMIT_ERROR,
        `Rate limit exceeded: ${error.message || context}`,
        this.providerName,
        429,
        true
      );
    }

    // Authentication errors
    if (error.status === 401 || error.status === 403) {
      return new LLMError(
        LLMErrorCode.AUTHENTICATION_ERROR,
        `Authentication failed: ${error.message || 'Invalid API key'}`,
        this.providerName,
        error.status,
        false
      );
    }

    // Invalid request errors
    if (error.status === 400) {
      return new LLMError(
        LLMErrorCode.INVALID_REQUEST_ERROR,
        `Invalid request: ${error.message || context}`,
        this.providerName,
        400,
        false
      );
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new LLMError(
        LLMErrorCode.NETWORK_ERROR,
        `Network error: ${error.message}`,
        this.providerName,
        undefined,
        true
      );
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return new LLMError(
        LLMErrorCode.TIMEOUT_ERROR,
        `Request timeout: ${error.message}`,
        this.providerName,
        undefined,
        true
      );
    }

    // Generic API error
    return new LLMError(
      LLMErrorCode.API_ERROR,
      `API error: ${error.message || context}`,
      this.providerName,
      error.status,
      true
    );
  }

  /**
   * Update statistics
   */
  protected updateStats(
    success: boolean,
    tokensUsed: number,
    cost: number,
    latency: number,
    error?: LLMError
  ): void {
    this.stats.totalRequests++;

    if (success) {
      this.stats.successfulRequests++;
      this.stats.totalTokensUsed += tokensUsed;
      this.stats.totalCost += cost;

      // Update average latency
      const totalLatency = this.stats.averageLatency * (this.stats.successfulRequests - 1);
      this.stats.averageLatency = (totalLatency + latency) / this.stats.successfulRequests;
    } else {
      this.stats.failedRequests++;

      if (error) {
        const errorType = error.code;
        this.stats.errorsByType[errorType] = (this.stats.errorsByType[errorType] || 0) + 1;
      }
    }
  }

  /**
   * Calculate cost based on token usage
   */
  protected calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    const capabilities = this.getCapabilities(model);
    const inputCost = (inputTokens / 1000000) * capabilities.costPer1MTokens.input;
    const outputCost = (outputTokens / 1000000) * capabilities.costPer1MTokens.output;
    return inputCost + outputCost;
  }

  /**
   * Get provider statistics
   */
  public getStats(): ProviderStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * Get provider name
   */
  public getProviderName(): LLMProvider {
    return this.providerName;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate request
   */
  protected validateRequest(request: LLMRequest): void {
    if (!request.messages || request.messages.length === 0) {
      throw new LLMError(
        LLMErrorCode.INVALID_REQUEST_ERROR,
        'Request must contain at least one message',
        this.providerName
      );
    }

    // Validate tools if provided
    if (request.tools && request.tools.length > 0) {
      const capabilities = this.getCapabilities(request.model);
      if (!capabilities.supportsToolCalling) {
        throw new LLMError(
          LLMErrorCode.TOOL_CALLING_ERROR,
          `Model ${request.model || 'default'} does not support tool calling`,
          this.providerName
        );
      }
    }
  }

  /**
   * Log request for debugging
   */
  protected logRequest(request: LLMRequest): void {
    console.log(`[${this.providerName}] Request:`, {
      model: request.model || 'default',
      messageCount: request.messages.length,
      toolCount: request.tools?.length || 0,
      stream: request.stream || false,
      maxTokens: request.maxTokens
    });
  }

  /**
   * Log response for debugging
   */
  protected logResponse(response: LLMResponse): void {
    console.log(`[${this.providerName}] Response:`, {
      model: response.model,
      finishReason: response.finishReason,
      tokensUsed: response.usage?.totalTokens,
      hasToolCalls: !!response.message.toolCalls
    });
  }
}

