import { UsageStats } from '../core/types';
import Anthropic from '@anthropic-ai/sdk';

/**
 * UsageTracker - Tracks and accumulates token usage and costs
 * 
 * Responsibilities:
 * - Extract usage stats from Claude responses
 * - Accumulate usage across multiple API calls
 * - Calculate costs based on Claude pricing
 * - Provide usage summaries
 * 
 * This module centralizes all usage tracking logic for easy:
 * - Cost monitoring
 * - Usage optimization
 * - Billing analysis
 * - Performance tracking
 */
export class UsageTracker {
  private totalUsage: UsageStats;

  // Claude Sonnet 4.5 pricing (as of 2025)
  private static readonly PRICING = {
    inputPerMTok: 3.0,      // $3/MTok
    outputPerMTok: 15.0,    // $15/MTok
    cacheWritePerMTok: 3.75, // $3.75/MTok (1.25x)
    cacheReadPerMTok: 0.30   // $0.30/MTok (0.1x)
  };

  constructor() {
    this.totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0
    };
  }

  /**
   * Extract usage stats from Claude response
   */
  public static extractUsageFromResponse(response: Anthropic.Message): UsageStats {
    const usage = response.usage as any;
    
    const inputCost = (usage.input_tokens / 1_000_000) * UsageTracker.PRICING.inputPerMTok;
    const outputCost = (usage.output_tokens / 1_000_000) * UsageTracker.PRICING.outputPerMTok;
    const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1_000_000) * UsageTracker.PRICING.cacheWritePerMTok;
    const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1_000_000) * UsageTracker.PRICING.cacheReadPerMTok;

    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost
    };
  }

  /**
   * Add usage from a response
   */
  public addUsage(usage: UsageStats): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
    this.totalUsage.cacheCreationTokens += usage.cacheCreationTokens;
    this.totalUsage.cacheReadTokens += usage.cacheReadTokens;
    this.totalUsage.totalCost += usage.totalCost;
  }

  /**
   * Get total accumulated usage
   */
  public getTotalUsage(): UsageStats {
    return { ...this.totalUsage };
  }
}
