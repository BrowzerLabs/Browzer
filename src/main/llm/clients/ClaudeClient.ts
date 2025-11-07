/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';

/**
 * ClaudeClient - Wrapper for Anthropic Claude API
 * 
 * Configured for Claude Sonnet 4.5 with best practices:
 * - Prompt caching for recorded sessions and conversation history
 * - Tool use for browser automation
 * - Multi-turn conversations for error recovery (Smart ReAct)
 * - Context management for long-running sessions
 */
export class ClaudeClient {
  private client: Anthropic;
  private readonly model = 'claude-sonnet-4-5-20250929';
  private readonly maxTokens = 8192; // Enough for comprehensive plans
  private onThinking?: (message: string) => void;

  constructor(apiKey?: string, onThinking?: (message: string) => void) {
    this.client = new Anthropic({
      apiKey: apiKey!
    });
    this.onThinking = onThinking;
  }

  /**
   * Create a single-shot automation plan
   * 
   * This method uses Claude Sonnet 4.5 to generate a complete automation plan
   * in a single response. The plan includes all tool calls needed to accomplish
   * the user's goal.
   * 
   * @param systemPrompt - System instructions for automation planning
   * @param userPrompt - User's automation request
   * @param tools - Available browser automation tools
   * @param cachedContext - Optional cached context (recorded session)
   * @returns Claude's response with the automation plan
   */
  public async createAutomationPlan(params: {
    systemPrompt: string;
    userPrompt: string;
    tools: Anthropic.Tool[];
    cachedContext?: string; // Recorded session JSON
  }): Promise<Anthropic.Message> {
    const { systemPrompt, userPrompt, tools, cachedContext } = params;
    
    const systemBlocks: Array<Anthropic.Messages.TextBlockParam> = [];
    systemBlocks.push({
      type: 'text',
      text: systemPrompt
    });

    if (cachedContext) {
      systemBlocks.push({
        type: 'text',
        text: `\n\n${cachedContext}`, // Already formatted with XML tags
        cache_control: { type: 'ephemeral' } // Cache the recorded session (5 min default)
      });
    }

    try {
      // Emit thinking event
      if (this.onThinking) {
        this.onThinking('Generating automation plan...');
      }

      return await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemBlocks,
        tools: tools,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

    } catch (error) {
      console.error('❌ [ClaudeClient] Failed to create automation plan:', error);
      throw error;
    }
  }

  /**
   * Continue an existing conversation with error recovery
   * 
   * This method is used for Smart ReAct-based iterative automation.
   * It maintains conversation history with prompt caching for efficiency.
   * 
   * @param params - Conversation continuation parameters
   * @returns Claude's response with updated plan or next steps
   */
  public async continueConversation(params: {
    systemPrompt: string;
    messages: Anthropic.MessageParam[]; // Full conversation history
    tools: Anthropic.Tool[];
    cachedContext?: string; // Recorded session (cached)
  }): Promise<Anthropic.Message> {
    const { systemPrompt, messages, tools, cachedContext } = params;

    const systemBlocks: Array<Anthropic.Messages.TextBlockParam> = [];
    systemBlocks.push({
      type: 'text',
      text: systemPrompt
    });

    if (cachedContext) {
      systemBlocks.push({
        type: 'text',
        text: `\n\n${cachedContext}`,
        cache_control: { type: 'ephemeral' }
      });
    }

    try {
      // Emit thinking event
      if (this.onThinking) {
        this.onThinking('Analyzing and generating next steps...');
      }

      messages.forEach(message => {
        console.log('message-role: ', message.role);
        if (typeof message.content === 'string') {
          console.log('message-content: ', message.content);
        } else {
          message.content.forEach(content => {
            console.log('message-content: ', content);
          })
        }
      })

      return await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemBlocks,
        tools: tools,
        messages: messages
      });

    } catch (error) {
      console.error('❌ [ClaudeClient] Failed to continue conversation:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics from a response
   */
  public getUsageStats(response: Anthropic.Message): {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number; // Approximate cost in USD
  } {
    const usage = response.usage as any; // SDK types may not include all cache fields
    
    // Sonnet 4.5 pricing: $3/MTok input, $15/MTok output
    // Cache write: $3.75/MTok (1.25x), Cache read: $0.30/MTok (0.1x)
    const inputCost = (usage.input_tokens / 1_000_000) * 3;
    const outputCost = (usage.output_tokens / 1_000_000) * 15;
    const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1_000_000) * 3.75;
    const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1_000_000) * 0.30;

    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost
    };
  }
}
