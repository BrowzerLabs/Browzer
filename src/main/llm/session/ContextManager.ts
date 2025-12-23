/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';

import { ContextConfig, ContextStats, CacheBreakpoint } from './types';

/**
 * ContextManager - Intelligent context management for automation sessions
 *
 * Implements Anthropic best practices for:
 * - Prompt caching with optimal breakpoints
 * - Context editing when approaching token limits
 * - Long context optimization
 * - Token counting and budget tracking
 *
 * Based on Anthropic documentation:
 * - PROMPT_CACHING.md: Cache static content, use ephemeral cache control
 * - CONTEXT_EDITING.md: Clear old tool uses when approaching limits
 * - LONG_CONTEXT_TIPS.md: Put long docs at top, structure with XML
 * - SONNET_4_5.md: Context awareness, memory tool integration
 */
export class ContextManager {
  private config: ContextConfig;

  // Claude Sonnet 4.5 context window
  private readonly MAX_CONTEXT_TOKENS = 200_000;

  // Minimum tokens for caching (Sonnet requirement)
  private readonly MIN_CACHE_TOKENS = 1024;

  constructor(config?: Partial<ContextConfig>) {
    this.config = {
      // Trigger context editing at 150K tokens (75% of 200K)
      triggerThreshold: config?.triggerThreshold || 150_000,

      // Keep last 3 tool uses after clearing
      keepToolUses: config?.keepToolUses || 3,

      // Clear at least 10K tokens to make cache invalidation worthwhile
      clearAtLeast: config?.clearAtLeast || 10_000,

      // Don't clear extract_context or take_snapshot tools
      excludeTools: config?.excludeTools || [
        'extract_context',
        'take_snapshot',
      ],

      // Keep tool inputs by default (only clear results)
      clearToolInputs: config?.clearToolInputs || false,
    };
  }

  /**
   * Build system prompt with cache control
   * Places cacheable content at the beginning with proper markers
   */
  buildCachedSystemPrompt(
    systemPrompt: string,
    cachedContext?: string
  ): string | Array<Anthropic.Messages.TextBlockParam> {
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];

    // Add main system prompt
    systemBlocks.push({
      type: 'text',
      text: systemPrompt,
    });

    // Add cached context (recorded session) with cache control
    if (cachedContext && cachedContext.length > this.MIN_CACHE_TOKENS / 4) {
      systemBlocks.push({
        type: 'text',
        text: cachedContext,
        cache_control: { type: 'ephemeral' },
      });
    }

    return systemBlocks;
  }

  /**
   * Add cache control to tool definitions
   * Caches all tools at once (they rarely change)
   */
  addToolCacheControl(tools: Anthropic.Tool[]): Anthropic.Tool[] {
    if (tools.length === 0) return tools;

    // Calculate approximate token count for tools
    const toolsJson = JSON.stringify(tools);
    const approxTokens = toolsJson.length / 4; // Rough estimate

    // Only cache if tools exceed minimum
    if (approxTokens < this.MIN_CACHE_TOKENS) {
      return tools;
    }

    // Add cache control to last tool (caches all tools before it)
    const cachedTools = [...tools];
    const lastTool = cachedTools[cachedTools.length - 1];

    cachedTools[cachedTools.length - 1] = {
      ...lastTool,
      cache_control: { type: 'ephemeral' },
    };

    return cachedTools;
  }

  /**
   * Optimize messages for caching
   * Adds cache control markers to appropriate message positions
   */
  optimizeMessagesForCaching(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    if (messages.length === 0) return messages;

    // For long conversations, cache the conversation history
    // Keep last few messages uncached for flexibility
    const cacheThreshold = Math.max(0, messages.length - 5);

    if (cacheThreshold > 0) {
      const optimized = [...messages];

      // Add cache control to a message in the middle of history
      // This allows the model to reuse the conversation prefix
      const cacheIndex = Math.floor(cacheThreshold / 2);

      if (cacheIndex > 0 && cacheIndex < optimized.length) {
        const message = optimized[cacheIndex];

        // Add cache control to message content
        if (Array.isArray(message.content)) {
          const lastBlock = message.content[message.content.length - 1];
          if (lastBlock.type === 'text' || lastBlock.type === 'tool_result') {
            optimized[cacheIndex] = {
              ...message,
              content: [
                ...message.content.slice(0, -1),
                {
                  ...lastBlock,
                  cache_control: { type: 'ephemeral' },
                } as any,
              ],
            };
          }
        }
      }
    }

    return messages;
  }

  /**
   * Check if context editing should be triggered
   */
  shouldTriggerContextEditing(stats: ContextStats): boolean {
    return stats.totalTokens >= this.config.triggerThreshold;
  }

  /**
   * Apply context editing to messages
   * Removes old tool uses while preserving important context
   */
  applyContextEditing(messages: Anthropic.MessageParam[]): {
    editedMessages: Anthropic.MessageParam[];
    clearedCount: number;
    clearedTokens: number;
  } {
    // Find all tool use/result pairs
    const toolUsePairs: Array<{
      assistantIndex: number;
      userIndex: number;
      toolName: string;
      tokens: number;
    }> = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const message = messages[i];
      const nextMessage = messages[i + 1];

      // Look for assistant message with tool_use followed by user message with tool_result
      if (message.role === 'assistant' && nextMessage.role === 'user') {
        const toolUse = this.findToolUse(message.content);
        const toolResult = this.findToolResult(nextMessage.content);

        if (toolUse && toolResult) {
          toolUsePairs.push({
            assistantIndex: i,
            userIndex: i + 1,
            toolName: toolUse.name,
            tokens:
              this.estimateMessageTokens(message) +
              this.estimateMessageTokens(nextMessage),
          });
        }
      }
    }

    // Determine how many to clear
    const totalPairs = toolUsePairs.length;
    const toKeep = this.config.keepToolUses;
    const toClear = Math.max(0, totalPairs - toKeep);

    if (toClear === 0) {
      return {
        editedMessages: messages,
        clearedCount: 0,
        clearedTokens: 0,
      };
    }

    // Filter out excluded tools and calculate tokens
    const clearablePairs = toolUsePairs.filter(
      (pair) => !this.config.excludeTools.includes(pair.toolName)
    );

    const pairsToRemove = clearablePairs.slice(0, toClear);
    const totalClearedTokens = pairsToRemove.reduce(
      (sum, pair) => sum + pair.tokens,
      0
    );

    // Check if we're clearing enough tokens
    if (totalClearedTokens < this.config.clearAtLeast) {
      return {
        editedMessages: messages,
        clearedCount: 0,
        clearedTokens: 0,
      };
    }

    // Create edited messages
    const indicesToRemove = new Set<number>();
    pairsToRemove.forEach((pair) => {
      indicesToRemove.add(pair.assistantIndex);
      indicesToRemove.add(pair.userIndex);
    });

    const editedMessages = messages.filter(
      (_, index) => !indicesToRemove.has(index)
    );

    return {
      editedMessages,
      clearedCount: pairsToRemove.length,
      clearedTokens: totalClearedTokens,
    };
  }

  /**
   * Calculate context statistics
   */
  calculateContextStats(
    messages: Anthropic.MessageParam[],
    systemPrompt: string | Array<Anthropic.Messages.TextBlockParam>,
    tools: Anthropic.Tool[]
  ): ContextStats {
    // Estimate tokens for each component
    const systemTokens = this.estimateSystemTokens(systemPrompt);
    const toolsTokens = this.estimateToolsTokens(tools);
    const messagesTokens = messages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );

    const totalTokens = systemTokens + toolsTokens + messagesTokens;
    const cachedTokens = 0; // Would need actual API response to know

    return {
      totalTokens,
      messagesTokens,
      toolsTokens,
      systemTokens,
      cachedTokens,
      remainingCapacity: this.MAX_CONTEXT_TOKENS - totalTokens,
    };
  }

  /**
   * Build cache breakpoints for tracking
   */
  buildCacheBreakpoints(
    systemBlocks: number,
    toolCount: number,
    messageCount: number
  ): CacheBreakpoint[] {
    const breakpoints: CacheBreakpoint[] = [];

    // Tools breakpoint (if tools are cached)
    if (toolCount > 0) {
      breakpoints.push({
        type: 'tools',
        position: toolCount,
      });
    }

    // System breakpoint (if cached context exists)
    if (systemBlocks > 1) {
      breakpoints.push({
        type: 'system',
        position: systemBlocks,
      });
    }

    // Messages breakpoint (if conversation is long enough)
    if (messageCount > 10) {
      breakpoints.push({
        type: 'messages',
        position: Math.floor(messageCount / 2),
        messageIndex: Math.floor(messageCount / 2),
      });
    }

    return breakpoints;
  }

  /**
   * Estimate tokens for a message (rough approximation)
   * Real token counting should use Anthropic's API
   */
  private estimateMessageTokens(message: Anthropic.MessageParam): number {
    const content = JSON.stringify(message.content);
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  /**
   * Estimate tokens for system prompt
   */
  private estimateSystemTokens(
    system: string | Array<Anthropic.Messages.TextBlockParam>
  ): number {
    const content = Array.isArray(system)
      ? system.map((b) => b.text).join('')
      : system;
    return Math.ceil(content.length / 4);
  }

  /**
   * Estimate tokens for tools
   */
  private estimateToolsTokens(tools: Anthropic.Tool[]): number {
    const content = JSON.stringify(tools);
    return Math.ceil(content.length / 4);
  }

  /**
   * Find tool_use block in message content
   */
  private findToolUse(
    content: Anthropic.MessageParam['content']
  ): { name: string } | null {
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      if (block.type === 'tool_use') {
        return { name: block.name };
      }
    }

    return null;
  }

  /**
   * Find tool_result block in message content
   */
  private findToolResult(content: Anthropic.MessageParam['content']): boolean {
    if (!Array.isArray(content)) return false;

    return content.some((block) => block.type === 'tool_result');
  }

  /**
   * Get configuration
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
