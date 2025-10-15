/**
 * ContextMemoryManager - Intelligent context window optimization
 * 
 * Responsibilities:
 * - Manage LLM context window efficiently
 * - Compress old messages when approaching token limits
 * - Maintain important information (facts, preferences, key actions)
 * - Implement sliding window and importance-based strategies
 * - Token counting and optimization
 * 
 * Challenge: Modern LLMs have large context windows (200K-2M tokens) but:
 * - Cost increases with tokens
 * - Latency increases with context size
 * - Need to fit: system prompt + browser context + conversation + tools
 */

import { LLMMessage } from '../llm/types';
import { BrowserContext } from '../context/types';
import {
  MemoryEntry,
  CompressedContext,
  ContextOptimizationStrategy
} from './types';

export class ContextMemoryManager {
  private memories: Map<string, MemoryEntry[]> = new Map(); // sessionId -> memories
  private strategy: ContextOptimizationStrategy;
  private maxContextTokens: number;

  constructor(options: {
    strategy?: ContextOptimizationStrategy;
    maxContextTokens?: number;
  } = {}) {
    this.strategy = options.strategy || 'sliding_window';
    this.maxContextTokens = options.maxContextTokens || 100000; // 100K tokens default
  }

  /**
   * Optimize message history to fit within token budget
   */
  public optimizeMessages(
    messages: LLMMessage[],
    systemPrompt: string,
    browserContext: BrowserContext,
    toolDefinitions: unknown[],
    targetTokens: number = this.maxContextTokens
  ): {
    optimizedMessages: LLMMessage[];
    compressionApplied: boolean;
    tokensSaved: number;
    summary?: CompressedContext;
  } {
    // Estimate current token usage
    const currentTokens = this.estimateTokens({
      systemPrompt,
      messages,
      browserContext,
      toolDefinitions
    });

    console.log(`[ContextMemory] Current tokens: ${currentTokens}, Target: ${targetTokens}`);

    // If within budget, no optimization needed
    if (currentTokens <= targetTokens) {
      return {
        optimizedMessages: messages,
        compressionApplied: false,
        tokensSaved: 0
      };
    }

    // Apply optimization strategy
    switch (this.strategy) {
      case 'sliding_window':
        return this.applySlidingWindow(messages, targetTokens, currentTokens);
      
      case 'compression':
        return this.applyCompression(messages, targetTokens, currentTokens);
      
      case 'importance_based':
        return this.applyImportanceBased(messages, targetTokens, currentTokens);
      
      case 'hierarchical':
        return this.applyHierarchical(messages, targetTokens, currentTokens);
      
      default:
        return this.applySlidingWindow(messages, targetTokens, currentTokens);
    }
  }

  /**
   * Sliding window: Keep recent N messages
   */
  private applySlidingWindow(
    messages: LLMMessage[],
    targetTokens: number,
    currentTokens: number
  ): {
    optimizedMessages: LLMMessage[];
    compressionApplied: boolean;
    tokensSaved: number;
  } {
    // Always keep system message if present
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // Calculate how many messages to keep
    const tokensToRemove = currentTokens - targetTokens;
    const avgTokensPerMessage = currentTokens / messages.length;
    const messagesToRemove = Math.ceil(tokensToRemove / avgTokensPerMessage);

    // Keep recent messages
    const keptMessages = otherMessages.slice(messagesToRemove);
    const optimizedMessages = [...systemMessages, ...keptMessages];

    const tokensSaved = this.estimateTokens({ messages }) - 
                        this.estimateTokens({ messages: optimizedMessages });

    console.log(`[ContextMemory] Sliding window: Removed ${messagesToRemove} messages, saved ~${tokensSaved} tokens`);

    return {
      optimizedMessages,
      compressionApplied: true,
      tokensSaved
    };
  }

  /**
   * Compression: Summarize old messages
   */
  private applyCompression(
    messages: LLMMessage[],
    targetTokens: number,
    currentTokens: number
  ): {
    optimizedMessages: LLMMessage[];
    compressionApplied: boolean;
    tokensSaved: number;
    summary?: CompressedContext;
  } {
    // For now, use sliding window + summary placeholder
    // In production, you'd use an LLM to generate summaries
    
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // Calculate split point (compress first half, keep second half)
    const splitPoint = Math.floor(otherMessages.length / 2);
    const toCompress = otherMessages.slice(0, splitPoint);
    const toKeep = otherMessages.slice(splitPoint);

    // Create compression summary
    const summary: CompressedContext = {
      summary: this.generateQuickSummary(toCompress),
      keyFacts: this.extractKeyFacts(toCompress),
      importantActions: [],
      compressedFrom: toCompress.length,
      tokensaved: this.estimateTokens({ messages: toCompress }) - 
                  this.estimateTokens({ messages: [{ role: 'system', content: '' }] })
    };

    // Create summary message
    const summaryMessage: LLMMessage = {
      role: 'system',
      content: `Previous conversation summary:\n${summary.summary}\n\nKey facts:\n${summary.keyFacts.join('\n')}`
    };

    const optimizedMessages = [...systemMessages, summaryMessage, ...toKeep];
    const tokensSaved = currentTokens - this.estimateTokens({ messages: optimizedMessages });

    console.log(`[ContextMemory] Compression: Compressed ${toCompress.length} messages, saved ~${tokensSaved} tokens`);

    return {
      optimizedMessages,
      compressionApplied: true,
      tokensSaved,
      summary
    };
  }

  /**
   * Importance-based: Keep important messages, remove less important
   */
  private applyImportanceBased(
    messages: LLMMessage[],
    targetTokens: number,
    currentTokens: number
  ): {
    optimizedMessages: LLMMessage[];
    compressionApplied: boolean;
    tokensSaved: number;
  } {
    // Score messages by importance
    const scoredMessages = messages.map((msg, idx) => ({
      message: msg,
      index: idx,
      score: this.scoreMessageImportance(msg, idx, messages.length)
    }));

    // Sort by score (descending)
    scoredMessages.sort((a, b) => b.score - a.score);

    // Keep messages until we reach token budget
    const kept: typeof scoredMessages = [];
    let tokenCount = 0;

    for (const scored of scoredMessages) {
      const msgTokens = this.estimateTokens({ messages: [scored.message] });
      if (tokenCount + msgTokens <= targetTokens) {
        kept.push(scored);
        tokenCount += msgTokens;
      }
    }

    // Re-sort by original order
    kept.sort((a, b) => a.index - b.index);
    const optimizedMessages = kept.map(k => k.message);

    const tokensSaved = currentTokens - tokenCount;

    console.log(`[ContextMemory] Importance-based: Kept ${kept.length}/${messages.length} messages, saved ~${tokensSaved} tokens`);

    return {
      optimizedMessages,
      compressionApplied: true,
      tokensSaved
    };
  }

  /**
   * Hierarchical: Multi-level summarization
   */
  private applyHierarchical(
    messages: LLMMessage[],
    targetTokens: number,
    currentTokens: number
  ): {
    optimizedMessages: LLMMessage[];
    compressionApplied: boolean;
    tokensSaved: number;
  } {
    // Combine compression + importance-based
    // First compress oldest, then apply importance to remainder
    
    const compressionResult = this.applyCompression(messages, targetTokens, currentTokens);
    
    if (this.estimateTokens({ messages: compressionResult.optimizedMessages }) <= targetTokens) {
      return compressionResult;
    }

    // Still too large, apply importance-based
    return this.applyImportanceBased(
      compressionResult.optimizedMessages,
      targetTokens,
      this.estimateTokens({ messages: compressionResult.optimizedMessages })
    );
  }

  /**
   * Score message importance (0-1)
   */
  private scoreMessageImportance(msg: LLMMessage, index: number, total: number): number {
    let score = 0;

    // Recency boost (more recent = more important)
    const recencyFactor = index / total;
    score += recencyFactor * 0.3;

    // System messages are important
    if (msg.role === 'system') {
      score += 0.4;
    }

    // Messages with tool calls are important
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      score += 0.3;
    }

    // Tool results are important
    if (msg.role === 'tool') {
      score += 0.2;
    }

    // Longer messages might be more important
    const contentLength = typeof msg.content === 'string' 
      ? msg.content.length 
      : JSON.stringify(msg.content).length;
    
    if (contentLength > 500) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Estimate token count
   * 
   * Rough estimation: 1 token ≈ 4 characters for English
   * This is a simplification - in production use tiktoken or similar
   */
  public estimateTokens(context: {
    systemPrompt?: string;
    messages?: LLMMessage[];
    browserContext?: BrowserContext;
    toolDefinitions?: unknown[];
  }): number {
    let totalChars = 0;

    // System prompt
    if (context.systemPrompt) {
      totalChars += context.systemPrompt.length;
    }

    // Messages
    if (context.messages) {
      for (const msg of context.messages) {
        if (typeof msg.content === 'string') {
          totalChars += msg.content.length;
        } else {
          // Multimodal - estimate based on text parts
          for (const part of msg.content) {
            if (part.type === 'text') {
              totalChars += part.text.length;
            } else if (part.type === 'image') {
              // Images typically use ~258-1024 tokens depending on size
              totalChars += 1000; // Rough estimate
            }
          }
        }

        // Tool calls
        if (msg.toolCalls) {
          totalChars += JSON.stringify(msg.toolCalls).length;
        }
      }
    }

    // Browser context
    if (context.browserContext) {
      // Estimate based on pruned DOM and accessibility tree
      // if (context.browserContext.domContext) {
      //   totalChars += JSON.stringify(context.browserContext.domContext).length;
      // }
      if (context.browserContext.accessibilityTree) {
        totalChars += JSON.stringify(context.browserContext.accessibilityTree).length;
      }
    }

    // Tool definitions
    if (context.toolDefinitions) {
      totalChars += JSON.stringify(context.toolDefinitions).length;
    }

    // Convert chars to tokens (rough: 1 token ≈ 4 chars)
    return Math.ceil(totalChars / 4);
  }

  /**
   * Add memory entry for a session
   */
  public addMemory(sessionId: string, entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'accessCount' | 'lastAccessedAt'>): void {
    const memories = this.memories.get(sessionId) || [];
    
    const memoryEntry: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now()
    };

    memories.push(memoryEntry);
    this.memories.set(sessionId, memories);
  }

  /**
   * Get relevant memories for current context
   */
  public getRelevantMemories(sessionId: string, query: string, limit = 5): MemoryEntry[] {
    const memories = this.memories.get(sessionId) || [];
    
    // Score memories by relevance (simple keyword matching)
    const scored = memories.map(memory => ({
      memory,
      score: this.scoreMemoryRelevance(memory, query)
    }));

    // Sort by score and recency
    scored.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.1) {
        return b.memory.timestamp - a.memory.timestamp; // Newer first
      }
      return b.score - a.score;
    });

    // Update access counts
    const relevant = scored.slice(0, limit).map(s => s.memory);
    relevant.forEach(m => {
      m.accessCount++;
      m.lastAccessedAt = Date.now();
    });

    return relevant;
  }

  /**
   * Score memory relevance to query
   */
  private scoreMemoryRelevance(memory: MemoryEntry, query: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = memory.content.toLowerCase();

    // Simple keyword matching
    const keywords = queryLower.split(' ').filter(k => k.length > 3);
    const matches = keywords.filter(k => contentLower.includes(k)).length;
    const relevanceScore = keywords.length > 0 ? matches / keywords.length : 0;

    // Boost by importance
    return relevanceScore * memory.importance;
  }

  /**
   * Generate quick summary from messages
   */
  private generateQuickSummary(messages: LLMMessage[]): string {
    // Extract key points from messages
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    const summary = `User discussed ${userMessages.length} topics. Agent performed ${assistantMessages.length} responses.`;
    
    return summary;
  }

  /**
   * Extract key facts from messages
   */
  private extractKeyFacts(messages: LLMMessage[]): string[] {
    const facts: string[] = [];

    // Extract from user messages (user preferences, goals)
    const userMessages = messages.filter(m => m.role === 'user' && typeof m.content === 'string');
    userMessages.forEach(msg => {
      const content = msg.content as string;
      // Simple heuristic: short, declarative statements
      if (content.length < 200 && !content.includes('?')) {
        facts.push(content.slice(0, 100));
      }
    });

    return facts.slice(0, 5); // Top 5 facts
  }

  /**
   * Clear memories for a session
   */
  public clearMemories(sessionId: string): void {
    this.memories.delete(sessionId);
  }

  /**
   * Get memory count for session
   */
  public getMemoryCount(sessionId: string): number {
    return (this.memories.get(sessionId) || []).length;
  }
}

