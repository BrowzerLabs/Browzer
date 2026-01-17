/**
 * DO Agent Service
 *
 * Core agent logic implementing the observe-think-act-evaluate loop
 * for autonomous browser automation using Claude AI.
 */

import { EventEmitter } from 'events';

import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

import {
  AutopilotConfig,
  DEFAULT_AUTOPILOT_CONFIG,
  AutopilotStatus,
  AgentLoopState,
  DOAgentResult,
  ClickToolInput,
  TypeToolInput,
  ScrollToolInput,
  NavigateToolInput,
  KeyPressToolInput,
  WaitToolInput,
  DoneToolInput,
  ToolResultForClaude,
  AutopilotProgressEvent,
} from './types';
import {
  AUTOPILOT_SYSTEM_PROMPT,
  buildUserGoalMessage,
  buildRecordingContextMessage,
} from './SystemPrompt';
import { AUTOPILOT_TOOLS, TOOL_NAMES } from './ToolDefinitions';

import { BrowserAutomationExecutor } from '@/main/automation';
import { RecordingSession } from '@/shared/types';

export class DOAgentService extends EventEmitter {
  private client: Anthropic;
  private executor: BrowserAutomationExecutor;
  private config: AutopilotConfig;
  private sessionId: string;
  private status: AutopilotStatus = 'running';
  private messages: Anthropic.MessageParam[] = [];
  private loopState: AgentLoopState;

  constructor(
    executor: BrowserAutomationExecutor,
    config: Partial<AutopilotConfig> = {}
  ) {
    super();
    this.executor = executor;
    this.config = { ...DEFAULT_AUTOPILOT_CONFIG, ...config };
    this.sessionId = uuidv4();

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize loop state
    this.loopState = {
      isRunning: false,
      currentStep: 0,
      consecutiveFailures: 0,
      lastToolResult: null,
    };
  }

  /**
   * Get the session ID for this agent instance
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get current agent status
   */
  public getStatus(): AutopilotStatus {
    return this.status;
  }

  /**
   * Stop the agent execution
   */
  public stop(): void {
    console.log(`[DOAgentService] Stopping agent session: ${this.sessionId}`);
    this.status = 'stopped';
    this.loopState.isRunning = false;
    this.emitProgress('autopilot_stopped', {
      message: 'Agent stopped by user',
    });
  }

  /**
   * Execute the agent with a user goal and optional reference recording
   */
  public async execute(
    userGoal: string,
    startUrl?: string,
    referenceRecording?: RecordingSession
  ): Promise<DOAgentResult> {
    console.log(`[DOAgentService] Starting execution for goal: "${userGoal}"`);
    if (referenceRecording) {
      console.log(
        `[DOAgentService] Reference recording provided: "${referenceRecording.name}"`
      );
    }

    // Initialize state
    this.loopState = {
      isRunning: true,
      currentStep: 0,
      consecutiveFailures: 0,
      lastToolResult: null,
    };
    this.status = 'running';
    this.messages = [];

    try {
      // Wait for the page to load (the tab is already created with the startUrl)
      // The startUrl is passed from BrowserService which creates the tab with it
      if (startUrl) {
        console.log(`[DOAgentService] Waiting for page to load: ${startUrl}`);
        await this.sleep(2000); // Wait for page load
      }

      // Get current URL for context
      const currentUrl = startUrl || 'about:blank';

      // Build initial message with goal and optional recording context
      const initialMessage = buildUserGoalMessage(
        userGoal,
        currentUrl,
        referenceRecording
      );
      this.messages.push({ role: 'user', content: initialMessage });

      // Enter the agent loop
      return await this.agentLoop();
    } catch (error) {
      console.error('[DOAgentService] Execution error:', error);
      this.status = 'failed';
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.emitProgress('autopilot_error', { error: errorMessage });
      return {
        success: false,
        message: `Agent failed: ${errorMessage}`,
        stepCount: this.loopState.currentStep,
      };
    }
  }

  /**
   * Main agent loop - observe-think-act-evaluate
   */
  private async agentLoop(): Promise<DOAgentResult> {
    while (
      this.loopState.isRunning &&
      this.status === 'running' &&
      this.loopState.currentStep < this.config.maxSteps
    ) {
      this.loopState.currentStep++;
      console.log(
        `[DOAgentService] Step ${this.loopState.currentStep}/${this.config.maxSteps}`
      );

      this.emitProgress('thinking', {
        step: this.loopState.currentStep,
        message: 'Analyzing page and planning next action...',
      });

      // Call Claude API
      const response = await this.callClaude();

      // Process response and execute tools
      const result = await this.processResponse(response);

      if (result.done) {
        return result.result!;
      }

      // Check failure threshold
      if (
        this.loopState.consecutiveFailures >= this.config.maxConsecutiveFailures
      ) {
        console.log(
          `[DOAgentService] Max consecutive failures (${this.config.maxConsecutiveFailures}) reached`
        );
        this.status = 'failed';
        return {
          success: false,
          message: `Agent stopped after ${this.config.maxConsecutiveFailures} consecutive failures`,
          stepCount: this.loopState.currentStep,
          finalUrl: await this.getCurrentUrl(),
        };
      }
    }

    // Max steps reached
    if (this.loopState.currentStep >= this.config.maxSteps) {
      console.log(
        `[DOAgentService] Max steps (${this.config.maxSteps}) reached`
      );
      this.status = 'failed';
      return {
        success: false,
        message: `Agent stopped after reaching maximum steps (${this.config.maxSteps})`,
        stepCount: this.loopState.currentStep,
        finalUrl: await this.getCurrentUrl(),
      };
    }

    // Stopped by user
    return {
      success: false,
      message: 'Agent was stopped',
      stepCount: this.loopState.currentStep,
      finalUrl: await this.getCurrentUrl(),
    };
  }

  /**
   * Call Claude API with current conversation
   */
  private async callClaude(): Promise<Anthropic.Message> {
    console.log('[DOAgentService] Calling Claude API...');

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: AUTOPILOT_SYSTEM_PROMPT,
      messages: this.messages,
      tools: AUTOPILOT_TOOLS,
    });

    console.log(
      `[DOAgentService] Claude response - stop_reason: ${response.stop_reason}`
    );
    return response;
  }

  /**
   * Process Claude's response and execute any tools
   */
  private async processResponse(
    response: Anthropic.Message
  ): Promise<{ done: boolean; result?: DOAgentResult }> {
    // Add assistant message to conversation history
    this.messages.push({
      role: 'assistant',
      content: response.content,
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        // Log Claude's thinking
        console.log(`[DOAgentService] Claude: ${block.text}`);
        this.emitProgress('text_response', { message: block.text });
      } else if (block.type === 'tool_use') {
        console.log(
          `[DOAgentService] Tool call: ${block.name}`,
          JSON.stringify(block.input)
        );

        // Check for completion signal
        if (block.name === TOOL_NAMES.DONE) {
          const input = block.input as DoneToolInput;
          this.status = input.success ? 'completed' : 'failed';

          this.emitProgress('autopilot_complete', {
            success: input.success,
            message: input.message,
          });

          return {
            done: true,
            result: {
              success: input.success,
              message: input.message,
              stepCount: this.loopState.currentStep,
              finalUrl: await this.getCurrentUrl(),
            },
          };
        }

        // Execute the tool
        const toolResult = await this.executeTool(
          block.name,
          block.input as Record<string, unknown>
        );

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolResult.content,
          is_error: toolResult.isError,
        });

        // Track consecutive failures
        if (toolResult.isError) {
          this.loopState.consecutiveFailures++;
        } else {
          this.loopState.consecutiveFailures = 0;
        }
      }
    }

    // Add tool results as user message for next iteration
    if (toolResults.length > 0) {
      // Check if any of the tool results are from extract_context
      const hasNewContextResult = response.content.some(
        (block) =>
          block.type === 'tool_use' && block.name === TOOL_NAMES.EXTRACT_CONTEXT
      );

      // If we have a new context extraction, prune old context results
      if (hasNewContextResult) {
        this.pruneOldContextResults();
      }

      this.messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    return { done: false };
  }

  /**
   * Prune old extract_context results from conversation history
   * to prevent context window overflow. Only keeps the most recent context.
   */
  private pruneOldContextResults(): void {
    const CONTEXT_PLACEHOLDER =
      '[Previous page context removed - see latest extract_context result]';

    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];

      // Only process user messages (which contain tool results)
      if (message.role !== 'user' || typeof message.content === 'string') {
        continue;
      }

      // Check if this is an array of content blocks (tool results)
      if (Array.isArray(message.content)) {
        const updatedContent = message.content.map((block) => {
          // Check if this is a tool_result block with large content (likely context)
          if (
            block.type === 'tool_result' &&
            typeof block.content === 'string' &&
            block.content.length > 5000 &&
            block.content.includes('[') &&
            block.content.includes('<')
          ) {
            // This looks like an accessibility tree result - truncate it
            return {
              ...block,
              content: CONTEXT_PLACEHOLDER,
            };
          }
          return block;
        });

        this.messages[i] = {
          ...message,
          content: updatedContent,
        };
      }
    }

    console.log(
      '[DOAgentService] Pruned old context results from conversation history'
    );
  }

  /**
   * Execute a tool and return formatted result for Claude
   */
  private async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<ToolResultForClaude> {
    this.emitProgress('step_start', {
      toolName,
      toolInput,
      stepNumber: this.loopState.currentStep,
    });

    try {
      let result: any;

      switch (toolName) {
        case TOOL_NAMES.EXTRACT_CONTEXT: {
          result = await this.executor.executeTool('context', {});
          break;
        }

        case TOOL_NAMES.TAKE_SNAPSHOT: {
          result = await this.executor.executeTool('snapshot', {
            scrollTo: 'current',
          });
          break;
        }

        case TOOL_NAMES.CLICK: {
          const input = toolInput as ClickToolInput;
          result = await this.executor.executeTool('click', {
            nodeId: input.backend_node_id,
          });
          break;
        }

        case TOOL_NAMES.TYPE: {
          const input = toolInput as TypeToolInput;
          result = await this.executor.executeTool('type', {
            nodeId: input.backend_node_id,
            value: input.text,
            clearFirst: input.clearFirst ?? true,
          });
          // Handle pressEnter by sending Enter key after typing
          if (result?.success && input.pressEnter) {
            await this.executor.executeTool('key', { key: 'Enter' });
          }
          break;
        }

        case TOOL_NAMES.SCROLL: {
          const input = toolInput as ScrollToolInput;
          result = await this.executor.executeTool('scroll', {
            direction: input.direction,
            amount: input.amount,
          });
          break;
        }

        case TOOL_NAMES.NAVIGATE: {
          const input = toolInput as NavigateToolInput;
          result = await this.executor.executeTool('navigate', {
            url: input.url,
          });
          // Wait for page load after navigation
          await this.sleep(1500);
          break;
        }

        case TOOL_NAMES.KEY_PRESS: {
          const input = toolInput as KeyPressToolInput;
          result = await this.executor.executeTool('key', {
            key: input.key,
            modifiers: input.modifiers,
          });
          break;
        }

        case TOOL_NAMES.WAIT: {
          const input = toolInput as WaitToolInput;
          const duration = Math.min(input.duration, 5000);
          await this.sleep(duration);
          result = {
            success: true,
            value: `Waited ${duration}ms`,
          };
          break;
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const success = result?.success !== false;
      this.emitProgress('step_complete', {
        toolName,
        success,
        stepNumber: this.loopState.currentStep,
      });

      return {
        content: this.formatToolResult(toolName, result),
        isError: !success,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DOAgentService] Tool error (${toolName}):`, errorMessage);

      this.emitProgress('step_error', {
        toolName,
        error: errorMessage,
        stepNumber: this.loopState.currentStep,
      });

      return {
        content: `Error executing ${toolName}: ${errorMessage}`,
        isError: true,
      };
    }
  }

  /**
   * Format tool result for Claude
   */
  private formatToolResult(toolName: string, result: any): string {
    if (!result) {
      return `Tool ${toolName} returned no result`;
    }

    if (result.error) {
      return `Error: ${result.error.message || result.error}`;
    }

    if (toolName === TOOL_NAMES.EXTRACT_CONTEXT) {
      // Return the accessibility tree with truncation to prevent token overflow
      const contextStr =
        typeof result.value === 'string'
          ? result.value
          : JSON.stringify(result.value, null, 2);

      // Limit context to ~50k characters (~12k tokens) to leave room for conversation
      const MAX_CONTEXT_LENGTH = 50000;
      if (contextStr.length > MAX_CONTEXT_LENGTH) {
        const truncated = contextStr.substring(0, MAX_CONTEXT_LENGTH);
        // Try to end at a complete element
        const lastNewline = truncated.lastIndexOf('\n');
        const cleanTruncated =
          lastNewline > MAX_CONTEXT_LENGTH - 1000
            ? truncated.substring(0, lastNewline)
            : truncated;
        console.log(
          `[DOAgentService] Truncated context from ${contextStr.length} to ${cleanTruncated.length} characters`
        );
        return (
          cleanTruncated +
          '\n\n[... context truncated due to size. Use scroll to see more elements if needed ...]'
        );
      }
      return contextStr;
    }

    if (toolName === TOOL_NAMES.TAKE_SNAPSHOT) {
      return 'Screenshot captured successfully';
    }

    // Default: stringify the result
    if (result.value !== undefined) {
      return typeof result.value === 'string'
        ? result.value
        : JSON.stringify(result.value);
    }

    return result.success ? 'Action completed successfully' : 'Action failed';
  }

  /**
   * Get current URL from the browser
   */
  private async getCurrentUrl(): Promise<string> {
    try {
      // The executor doesn't have a direct getCurrentUrl method,
      // so we'll extract it from context or use a fallback
      return 'about:blank';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Emit a progress event
   */
  private emitProgress(
    type: AutopilotProgressEvent['type'],
    data: Record<string, any>
  ): void {
    const event: AutopilotProgressEvent = {
      id: uuidv4(),
      sessionId: this.sessionId,
      type,
      data,
      timestamp: Date.now(),
    };
    this.emit('progress', event);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
