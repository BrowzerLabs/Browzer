/**
 * AgentOrchestrator - The Brain of the Agentic Browser
 * 
 * This is the main coordinator that brings everything together:
 * - LLM providers (Claude, Gemini)
 * - Tool execution engine
 * - Browser context provider
 * - Chat session management
 * - Context memory management
 * - ReAct execution engine
 * 
 * Responsibilities:
 * - Orchestrate agent execution from user input to completion
 * - Manage conversation state and context
 * - Stream real-time updates to UI
 * - Handle errors and retries
 * - Optimize token usage and costs
 * - Provide agent lifecycle management
 */

import { ToolCall } from '../llm/types';
import { BaseLLMProvider } from '../llm/BaseLLMProvider';
import { AnthropicProvider } from '../llm/providers/AnthropicProvider';
import { GeminiProvider } from '../llm/providers/GeminiProvider';
import { ToolRegistry } from '../tools/ToolRegistry';
import { BrowserContextProvider } from '../context/BrowserContextProvider';
import { ChatSessionManager } from './ChatSessionManager';
import { ContextMemoryManager } from './ContextMemoryManager';
import { ReActEngine } from './ReActEngine';
import {
  AgentConfig,
  AgentMode,
  ExecutionContext,
  AgentExecutionResult,
  AgentEventCallback,
  ChatSession,
  AgentThought,
  AgentAction,
  AgentObservation,
  ReActIteration
} from './types';

export class AgentOrchestrator {
  // Core components
  private llmProviders: Map<string, BaseLLMProvider> = new Map();
  private toolRegistry: ToolRegistry;
  private contextProvider: BrowserContextProvider;
  private sessionManager: ChatSessionManager;
  private memoryManager: ContextMemoryManager;
  private reactEngine: ReActEngine;

  // Configuration
  private config: AgentConfig;

  // State
  private activeExecutions: Map<string, ExecutionContext> = new Map();

  constructor(
    toolRegistry: ToolRegistry,
    contextProvider: BrowserContextProvider,
    config: Partial<AgentConfig> = {}
  ) {
    this.toolRegistry = toolRegistry;
    this.contextProvider = contextProvider;

    // Apply default configuration
    this.config = {
      model: 'claude-4-5-sonnet',
      mode: 'autonomous',
      maxExecutionSteps: 20,
      maxThinkingTime: 300000, // 5 minutes
      temperature: 0.7,
      maxContextTokens: 100000,
      contextCompressionEnabled: true,
      maxRetries: 3,
      retryDelay: 1000,
      dangerousActionsRequireApproval: ['delete', 'purchase', 'transfer'],
      enableReflection: true,
      enablePlanning: true,
      enableMemory: true,
      streamingEnabled: true,
      ...config
    };

    // Initialize managers
    this.sessionManager = new ChatSessionManager({
      persistenceEnabled: true
    });

    this.memoryManager = new ContextMemoryManager({
      strategy: 'sliding_window',
      maxContextTokens: this.config.maxContextTokens
    });

    // Initialize LLM providers
    this.initializeLLMProviders();

    // Initialize ReAct engine
    const llmProvider = this.selectLLMProvider(this.config.model);
    this.reactEngine = new ReActEngine(
      llmProvider,
      this.toolRegistry,
      this.contextProvider,
      {
        maxIterations: this.config.maxExecutionSteps,
        enableReflection: this.config.enableReflection
      }
    );

    console.log('[AgentOrchestrator] Initialized with config:', this.config);
  }

  /**
   * Initialize LLM providers
   */
  private initializeLLMProviders(): void {
    // Anthropic Claude
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const anthropic = new AnthropicProvider({
        apiKey: anthropicKey,
        defaultModel: 'claude-4-5-sonnet'
      });
      this.llmProviders.set('claude-4-5-sonnet', anthropic);
      // this.llmProviders.set('claude-4-5-haiku', anthropic);
      console.log('[AgentOrchestrator] Anthropic provider initialized');
    }

    // Google Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const gemini = new GeminiProvider({
        apiKey: geminiKey,
        defaultModel: 'gemini-2.5-flash'
      });
      this.llmProviders.set('gemini-2.5-pro', gemini);
      this.llmProviders.set('gemini-2.5-flash', gemini);
      console.log('[AgentOrchestrator] Gemini provider initialized');
    }

    if (this.llmProviders.size === 0) {
      console.warn('[AgentOrchestrator] No LLM providers configured! Set API keys.');
    }
  }

  /**
   * Select appropriate LLM provider based on model
   */
  private selectLLMProvider(model: string): BaseLLMProvider {
    const provider = this.llmProviders.get(model);
    
    if (!provider) {
      // Fallback to first available provider
      const firstProvider = Array.from(this.llmProviders.values())[0];
      if (!firstProvider) {
        throw new Error('No LLM providers available');
      }
      console.warn(`[AgentOrchestrator] Model ${model} not found, using fallback`);
      return firstProvider;
    }

    return provider;
  }

  /**
   * Main execution method - process user message and execute agent
   */
  public async executeTask(
    userMessage: string,
    tabId: string,
    options: {
      sessionId?: string;
      userId?: string;
      mode?: AgentMode;
      recordingContext?: {
        id: string;
        name: string;
        actions: any[];
        url?: string;
      };
      streamingCallback?: AgentEventCallback;
    } = {}
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    console.log(`\n[AgentOrchestrator] ========================================`);
    console.log(`[AgentOrchestrator] Executing task: "${userMessage}"`);
    console.log(`[AgentOrchestrator] ========================================\n`);

    // Get or create session
    const sessionId = options.sessionId || this.sessionManager.createSession(tabId, options.userId).id;
    const session = this.sessionManager.getSession(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Add user message to session
    this.sessionManager.addUserMessage(sessionId, userMessage);

    // Create or get execution context
    let context = this.activeExecutions.get(sessionId);
    
    if (!context) {
      context = this.createExecutionContext(sessionId, tabId, options.userId);
      this.activeExecutions.set(sessionId, context);
    }

    // Update context
    context.currentGoal = userMessage;
    context.mode = options.mode || this.config.mode;
    context.state = 'thinking';
    
    // Add recording context if provided
    if (options.recordingContext) {
      console.log(`[AgentOrchestrator] Using recording context: ${options.recordingContext.name} (${options.recordingContext.actions.length} actions)`);
      context.recordingContext = options.recordingContext;
      
      // Add recording context to messages
      const recordingPrompt = this.buildRecordingContextPrompt(options.recordingContext);
      context.messages.push({
        role: 'user',
        content: recordingPrompt
      });
    }

    // Prepare for execution
    const thoughts: AgentThought[] = [];
    const actions: AgentAction[] = [];
    const observations: AgentObservation[] = [];
    let totalTokensUsed = 0;
    let finalResponse = '';
    let executionSuccess = false;

    try {
      // Optimize context if needed
      if (this.config.contextCompressionEnabled && session) {
        await this.optimizeContext(context, session);
      }

      // Execute ReAct loop with streaming
      const reactResult = await this.reactEngine.execute(
        userMessage,
        context,
        async (event) => {
          // Collect events
          if (event.type === 'thought') {
            thoughts.push(event.data as AgentThought);
          } else if (event.type === 'action') {
            actions.push(event.data as AgentAction);
          } else if (event.type === 'observation') {
            observations.push(event.data as AgentObservation);
          }

          // Forward to UI callback
          if (options.streamingCallback) {
            await options.streamingCallback(event);
          }
        }
      );

      executionSuccess = reactResult.success;
      finalResponse = reactResult.finalResponse;
      totalTokensUsed = reactResult.totalTokensUsed;

      // Add assistant response to session
      const toolCalls = actions
        .filter(a => a.type === 'tool_call' && a.toolCall)
        .map(a => a.toolCall as ToolCall);

      this.sessionManager.addAssistantMessage(sessionId, finalResponse, toolCalls);

      // Add tool results to session
      for (const iteration of reactResult.iterations) {
        if (iteration.actionResult && iteration.action.toolCall && iteration.action.type === 'tool_call') {
          const tc = iteration.action.toolCall;
          this.sessionManager.addToolResult(
            sessionId,
            tc.id,
            tc.function.name,
            iteration.actionResult
          );
        }
      }

      // Update session stats
      const cost = this.estimateCost(totalTokensUsed, this.config.model);
      this.sessionManager.updateStats(sessionId, totalTokensUsed, cost);

      // Store important memories if enabled
      if (this.config.enableMemory && executionSuccess) {
        await this.storeMemories(sessionId, userMessage, finalResponse, reactResult.iterations);
      }

      // Update context state
      context.state = executionSuccess ? 'completed' : 'failed';
      context.executionCount += reactResult.iterations.length;

      console.log(`\n[AgentOrchestrator] ========================================`);
      console.log(`[AgentOrchestrator] Task ${executionSuccess ? 'COMPLETED' : 'FAILED'}`);
      console.log(`[AgentOrchestrator] Iterations: ${reactResult.iterations.length}`);
      console.log(`[AgentOrchestrator] Tokens used: ${totalTokensUsed}`);
      console.log(`[AgentOrchestrator] Cost: $${cost.toFixed(4)}`);
      console.log(`[AgentOrchestrator] Time: ${Date.now() - startTime}ms`);
      console.log(`[AgentOrchestrator] ========================================\n`);

      return {
        success: executionSuccess,
        finalState: context.state,
        response: finalResponse,
        thoughts,
        actions,
        observations,
        metadata: {
          executionTime: Date.now() - startTime,
          stepsExecuted: reactResult.iterations.length,
          tokensUsed: totalTokensUsed,
          cost
        }
      };

    } catch (error) {
      console.error('[AgentOrchestrator] Execution error:', error);
      
      context.state = 'failed';

      // Notify via callback
      if (options.streamingCallback) {
        await options.streamingCallback({
          type: 'error',
          timestamp: Date.now(),
          sessionId,
          data: { error: String(error) }
        });
      }

      return {
        success: false,
        finalState: 'failed',
        response: `Task failed: ${error}`,
        thoughts,
        actions,
        observations,
        error: String(error),
        metadata: {
          executionTime: Date.now() - startTime,
          stepsExecuted: 0,
          tokensUsed: totalTokensUsed,
          cost: 0
        }
      };
    }
  }

  /**
   * Create execution context for a new task
   */
  private createExecutionContext(
    sessionId: string,
    tabId: string,
    userId?: string
  ): ExecutionContext {
    return {
      sessionId,
      tabId,
      userId,
      state: 'idle',
      mode: this.config.mode,
      messages: [],
      executedSteps: [],
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      executionCount: 0,
      maxExecutionSteps: this.config.maxExecutionSteps,
      maxThinkingTime: this.config.maxThinkingTime,
      requiresUserApproval: this.config.mode === 'supervised'
    };
  }

  /**
   * Optimize context to fit within token budget
   */
  private async optimizeContext(context: ExecutionContext, session: ChatSession): Promise<void> {
    // Get current browser context (lightweight version for optimization)
    const browserContext = await this.contextProvider.getContext({
      includePrunedDOM: true,
      includeAccessibilityTree: false,
      includeConsoleLogs: false,
      includeNetworkActivity: false,
      maxElements: 20
    });

    // Get tool definitions
    const toolDefinitions = this.toolRegistry.getAllTools();

    // Build system prompt (using a dedicated method)
    const systemPrompt = this.buildSystemPrompt(context);

    // Optimize messages
    const optimizationResult = this.memoryManager.optimizeMessages(
      session.messages,
      systemPrompt,
      browserContext,
      toolDefinitions,
      this.config.maxContextTokens
    );

    if (optimizationResult.compressionApplied) {
      console.log(`[AgentOrchestrator] Context optimized: saved ${optimizationResult.tokensSaved} tokens`);
      context.messages = optimizationResult.optimizedMessages;
    } else {
      context.messages = session.messages;
    }
  }

  /**
   * Store important memories from execution
   */
  private async storeMemories(
    sessionId: string,
    userMessage: string,
    agentResponse: string,
    iterations: ReActIteration[]
  ): Promise<void> {
    // Store user preference/fact if present
    if (userMessage.toLowerCase().includes('i like') || userMessage.toLowerCase().includes('i prefer')) {
      this.memoryManager.addMemory(sessionId, {
        type: 'preference',
        content: userMessage,
        source: `task_${Date.now()}`,
        importance: 0.8
      });
    }

    // Store successful tool usage patterns
    const successfulTools = iterations
      .filter(it => it.actionResult?.success)
      .map(it => it.action.toolCall?.function.name)
      .filter(Boolean);

    if (successfulTools.length > 0) {
      this.memoryManager.addMemory(sessionId, {
        type: 'tool_usage',
        content: `Successfully used: ${successfulTools.join(', ')}`,
        source: `task_${Date.now()}`,
        importance: 0.6
      });
    }
  }

  /**
   * Estimate cost based on tokens and model
   */
  private estimateCost(tokens: number, model: string): number {
    // Rough estimates (input and output averaged)
    const costPer1M: Record<string, number> = {
      'claude-3-5-sonnet': 9.0,  // ($3 + $15) / 2
      'claude-3-5-haiku': 2.4,   // ($0.8 + $4) / 2
      'gemini-2.5-pro': 3.125,   // ($1.25 + $5) / 2
      'gemini-2.5-flash': 0.1875 // ($0.075 + $0.30) / 2
    };

    const cost = (costPer1M[model] || 5.0) * (tokens / 1000000);
    return cost;
  }

  /**
   * Update agent configuration
   */
  public updateConfig(config: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[AgentOrchestrator] Configuration updated:', config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Get session manager (for UI/API access)
   */
  public getSessionManager(): ChatSessionManager {
    return this.sessionManager;
  }

  /**
   * Get memory manager (for UI/API access)
   */
  public getMemoryManager(): ContextMemoryManager {
    return this.memoryManager;
  }

  /**
   * Get active execution context
   */
  public getExecutionContext(sessionId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(sessionId);
  }

  /**
   * Pause execution (if supported in future)
   */
  public pauseExecution(sessionId: string): void {
    const context = this.activeExecutions.get(sessionId);
    if (context) {
      context.state = 'paused';
      console.log(`[AgentOrchestrator] Execution paused for session ${sessionId}`);
    }
  }

  /**
   * Resume execution (if supported in future)
   */
  public resumeExecution(sessionId: string): void {
    const context = this.activeExecutions.get(sessionId);
    if (context && context.state === 'paused') {
      context.state = 'thinking';
      console.log(`[AgentOrchestrator] Execution resumed for session ${sessionId}`);
    }
  }

  /**
   * Cancel execution
   */
  public cancelExecution(sessionId: string): void {
    const context = this.activeExecutions.get(sessionId);
    if (context) {
      context.state = 'failed';
      this.activeExecutions.delete(sessionId);
      console.log(`[AgentOrchestrator] Execution cancelled for session ${sessionId}`);
    }
  }

  /**
   * Clear all executions
   */
  public clearAllExecutions(): void {
    this.activeExecutions.clear();
    console.log('[AgentOrchestrator] All executions cleared');
  }

  /**
   * Get statistics across all sessions
   */
  public getGlobalStats(): {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
  } {
    const sessions = this.sessionManager.getAllSessions();
    
    const totalMessages = sessions.reduce((sum, s) => sum + s.stats.totalMessages, 0);
    const totalTokens = sessions.reduce((sum, s) => sum + s.stats.totalTokensUsed, 0);
    const totalCost = sessions.reduce((sum, s) => sum + s.stats.totalCost, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: this.activeExecutions.size,
      totalMessages,
      totalTokens,
      totalCost
    };
  }

  /**
   * Build system prompt for the agent (helper method)
   */
  private buildSystemPrompt(context: ExecutionContext): string {
    return `You are an intelligent browser automation agent. Your goal is to help users accomplish tasks by controlling a web browser.

**Your Capabilities:**
- You can navigate to URLs, click elements, fill forms, and interact with web pages
- You have access to the current page state (URL, title, visible elements)
- You can observe what's on the page and make decisions based on that

**Your Process (ReAct):**
1. **Observe** the current browser state
2. **Think** about what action to take next to accomplish the goal
3. **Act** by using available tools
4. **Reflect** on the result and adjust your approach if needed

**Guidelines:**
- Think step-by-step and explain your reasoning
- Use tools carefully and check their results
- If something fails, try alternative approaches
- When you complete the task, provide a clear final answer
- Ask for user help if you're stuck or need clarification

**Current Mode:** ${context.mode}
**Execution Count:** ${context.executionCount}/${context.maxExecutionSteps}

Remember: You are helping the user accomplish their goal efficiently and accurately.`;
  }

  /**
   * Build recording context prompt
   */
  private buildRecordingContextPrompt(recordingContext: {
    id: string;
    name: string;
    actions: any[];
    url?: string;
  }): string {
    // Summarize the recording
    const actionSummary = recordingContext.actions
      .slice(0, 20) // First 20 actions
      .map((action, idx) => {
        const type = action.type;
        const target = action.target?.text || action.target?.ariaLabel || action.target?.selector || '';
        const value = action.value || '';
        return `${idx + 1}. ${type}${target ? ` on "${target.substring(0, 50)}"` : ''}${value ? ` with "${value}"` : ''}`;
      })
      .join('\n');

    return `[REFERENCE WORKFLOW]
The user has provided a recorded workflow as reference context. This shows how they previously accomplished a similar task.

Recording: "${recordingContext.name}"
Starting URL: ${recordingContext.url || 'N/A'}
Total Actions: ${recordingContext.actions.length}

Key Actions (first 20):
${actionSummary}
${recordingContext.actions.length > 20 ? `\n... and ${recordingContext.actions.length - 20} more actions` : ''}

You can use this as a reference for understanding the user's workflow, but adapt it to the current task and page state. The page may have changed since this was recorded, so verify elements exist before interacting with them.`;
  }
}

