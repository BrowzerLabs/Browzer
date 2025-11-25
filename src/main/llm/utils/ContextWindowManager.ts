/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';

/**
 * ContextWindowManager - Advanced context window optimization for long-running automations
 * 
 * Problem:
 * - Automation sessions can have 50+ message turns (100+ messages with tool results)
 * - Each turn adds 5K-20K tokens (tool calls + results + errors)
 * - Context window fills up quickly, hitting 200K limit
 * - System prompt + tools = ~40K tokens (fixed)
 * - Messages must stay under ~160K tokens
 * 
 * Solution: Hybrid Sliding Window + Summarization
 * 
 * Strategy:
 * 1. Keep RECENT messages (last 10 turns) in FULL detail
 * 2. SUMMARIZE older messages into condensed execution history
 * 3. ALWAYS preserve: User goal, successful steps count, current state
 * 4. AGGRESSIVELY remove: Failed attempts, redundant errors, old analysis results
 * 
 * This approach:
 * - Maintains context quality for recent actions
 * - Provides historical context without token bloat
 * - Allows unlimited automation length
 * - Follows Anthropic's best practices for long-context management
 */
export class ContextWindowManager {
  // Token limits
  private static readonly MAX_TOTAL_TOKENS = 200_000;
  private static readonly SYSTEM_AND_TOOLS_TOKENS = 40_000; // Reserved for system + tools
  private static readonly TARGET_MESSAGE_TOKENS = 140_000; // Target to stay under

  // Sliding window configuration
  private static readonly RECENT_TURNS_TO_KEEP = 10; // Keep last 10 conversation turns in full
  private static readonly MIN_MESSAGES_TO_COMPRESS = 20; // Only compress if we have 20+ messages

  public static optimizeMessages(
    messages: Anthropic.MessageParam[],
    userGoal: string
  ): {
    optimizedMessages: Anthropic.MessageParam[];
    compressionApplied: boolean;
  } {
    const originalTokens = this.estimateTokens(messages);

    // Check if optimization is needed
    if (originalTokens <= this.TARGET_MESSAGE_TOKENS) {
      console.log(`✅ [ContextWindow] Messages within limit: ${originalTokens.toLocaleString()} tokens`);
      return {
        optimizedMessages: messages,
        compressionApplied: false,
      };
    }

    console.log(`⚠️  [ContextWindow] Messages exceed target: ${originalTokens.toLocaleString()} / ${this.TARGET_MESSAGE_TOKENS.toLocaleString()} tokens`);
    console.log(`🗜️  [ContextWindow] Applying hybrid sliding window + summarization...`);

    // Apply optimization
    const optimizedMessages = this.applyHybridOptimization(messages, userGoal);
    const optimizedTokens = this.estimateTokens(optimizedMessages);
    const tokensSaved = originalTokens - optimizedTokens;

    console.log(`✅ [ContextWindow] Optimization complete:`);
    console.log(`   - Original: ${originalTokens.toLocaleString()} tokens`);
    console.log(`   - Optimized: ${optimizedTokens.toLocaleString()} tokens`);
    console.log(`   - Saved: ${tokensSaved.toLocaleString()} tokens (${Math.round(tokensSaved / originalTokens * 100)}%)`);

    return {
      optimizedMessages,
      compressionApplied: true,
    };
  }

  private static applyHybridOptimization(
    messages: Anthropic.MessageParam[],
    userGoal: string
  ): Anthropic.MessageParam[] {
    if (messages.length < this.MIN_MESSAGES_TO_COMPRESS) {
      return messages;
    }

    const turns = this.splitIntoTurns(messages);

    if (turns.length <= this.RECENT_TURNS_TO_KEEP) {
      return messages;
    }

    // Keep recent turns in full
    const recentTurns = turns.slice(-this.RECENT_TURNS_TO_KEEP);
    const olderTurns = turns.slice(0, -this.RECENT_TURNS_TO_KEEP);

    // Summarize older turns
    const summary = this.summarizeOlderTurns(olderTurns, userGoal);

    // Reconstruct messages: summary + recent turns
    const optimizedMessages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: summary
      },
      ...recentTurns.flatMap(turn => turn.messages)
    ];

    return optimizedMessages;
  }

  private static splitIntoTurns(messages: Anthropic.MessageParam[]): Array<{
    turnNumber: number;
    messages: Anthropic.MessageParam[];
  }> {
    const turns: Array<{ turnNumber: number; messages: Anthropic.MessageParam[] }> = [];
    let currentTurn: Anthropic.MessageParam[] = [];
    let turnNumber = 0;

    for (const message of messages) {
      currentTurn.push(message);

      // A turn completes when we see an assistant message
      if (message.role === 'assistant') {
        turns.push({
          turnNumber: ++turnNumber,
          messages: [...currentTurn]
        });
        currentTurn = [];
      }
    }

    // Add any remaining messages as incomplete turn
    if (currentTurn.length > 0) {
      turns.push({
        turnNumber: ++turnNumber,
        messages: currentTurn
      });
    }

    return turns;
  }

  private static summarizeOlderTurns(
    olderTurns: Array<{ turnNumber: number; messages: Anthropic.MessageParam[] }>,
    userGoal: string
  ): string {
    // Extract execution summary from older turns
    const successfulSteps: string[] = [];
    const failedSteps: string[] = [];
    let totalSteps = 0;

    olderTurns.forEach(turn => {
      turn.messages.forEach(message => {
        if (message.role === 'user' && Array.isArray(message.content)) {
          // Extract tool results
          message.content.forEach(block => {
            if (block.type === 'tool_result') {
              totalSteps++;
              try {
                const result = typeof block.content === 'string' 
                  ? JSON.parse(block.content) 
                  : block.content;
                
                // Check if this is a compressed analysis result
                if (result.note && result.note.includes('compressed')) {
                  // Skip compressed results in summary
                  return;
                }

                if (result.success) {
                  // Extract tool name from result or use generic
                  const toolName = result.toolName || 'action';
                  successfulSteps.push(toolName);
                } else if (result.error && !result.error.includes('Not executed')) {
                  // Only include actual errors, not "not executed" placeholders
                  const toolName = result.toolName || 'action';
                  failedSteps.push(`${toolName}: ${result.error}`);
                }
              } catch {
                // Skip malformed results
              }
            }
          });
        }
      });
    });

    // Build condensed summary
    const summary = `**EXECUTION HISTORY SUMMARY**

**Original Goal:** ${userGoal}

**Progress Overview:**
- Total steps attempted: ${totalSteps}
- Successful steps: ${successfulSteps.length}
- Failed steps: ${failedSteps.length}

**Successful Actions:**
${successfulSteps.length > 0 ? successfulSteps.slice(0, 20).join(', ') : 'None yet'}
${successfulSteps.length > 20 ? `... and ${successfulSteps.length - 20} more` : ''}

**Key Errors Encountered:**
${failedSteps.length > 0 ? failedSteps.slice(0, 5).map((err, i) => `${i + 1}. ${err}`).join('\n') : 'None'}
${failedSteps.length > 5 ? `... and ${failedSteps.length - 5} more errors` : ''}

**Note:** This is a compressed summary of earlier execution history. Recent messages below contain full details.

---`;

    return summary;
  }

  /**
   * Estimate token count for messages
   * Uses rough approximation: 1 token ≈ 4 characters
   */
  private static estimateTokens(messages: Anthropic.MessageParam[]): number {
    const content = JSON.stringify(messages);
    return Math.ceil(content.length / 4);
  }

  /**
   * Check if messages are approaching context limit
   */
  public static isApproachingLimit(messages: Anthropic.MessageParam[]): boolean {
    const tokens = this.estimateTokens(messages);
    return tokens > (this.TARGET_MESSAGE_TOKENS * 0.9); // 90% threshold
  }

  /**
   * Get context window statistics
   */
  public static getStats(messages: Anthropic.MessageParam[]): {
    messageTokens: number;
    systemAndToolsTokens: number;
    totalTokens: number;
    remainingTokens: number;
    utilizationPercent: number;
    needsOptimization: boolean;
  } {
    const messageTokens = this.estimateTokens(messages);
    const totalTokens = messageTokens + this.SYSTEM_AND_TOOLS_TOKENS;
    const remainingTokens = this.MAX_TOTAL_TOKENS - totalTokens;
    const utilizationPercent = (totalTokens / this.MAX_TOTAL_TOKENS) * 100;
    const needsOptimization = messageTokens > this.TARGET_MESSAGE_TOKENS;

    return {
      messageTokens,
      systemAndToolsTokens: this.SYSTEM_AND_TOOLS_TOKENS,
      totalTokens,
      remainingTokens,
      utilizationPercent,
      needsOptimization
    };
  }
}
