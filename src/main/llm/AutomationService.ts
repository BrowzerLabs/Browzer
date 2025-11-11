/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation/BrowserAutomationExecutor';
import { RecordingStore } from '@/main/recording';
import { AutomationClient } from './clients/AutomationClient';
import { ToolRegistry } from './utils/ToolRegistry';
import { UsageTracker } from './utils/UsageTracker';
import { AutomationStateManager } from './core/AutomationStateManager';
import { SessionManager } from './session/SessionManager';
import { PlanExecutor } from './core/PlanExecutor';
import { ErrorRecoveryHandler } from './core/ErrorRecoveryHandler';
import { IntermediatePlanHandler } from './core/IntermediatePlanHandler';
import { SystemPromptBuilder } from './builders/SystemPromptBuilder';
import { MessageBuilder } from './builders/MessageBuilder';
import { AutomationPlanParser, ParsedAutomationPlan } from './parsers/AutomationPlanParser';
import { IterativeAutomationResult, PlanExecutionResult, UsageStats } from './core/types';
import Anthropic from '@anthropic-ai/sdk';
import { AutomationProgressEvent, AutomationEventType } from '@/shared/types';

/**
 * AutomationService - Smart ReAct-based browser automation orchestrator
 * 
 * **Architecture:**
 * - AutomationStateManager: Manages session state and conversation history
 * - PlanExecutor: Executes automation plans step-by-step
 * - ErrorRecoveryHandler: Handles errors and generates recovery plans
 * - IntermediatePlanHandler: Manages multi-phase automation
 * - UsageTracker: Tracks token usage and costs
 * - MessageBuilder: Builds tool result messages
 * 
 * **Flow:**
 * 1. Generate initial plan from user goal
 * 2. Execute plan steps sequentially
 * 3. On error: Trigger error recovery
 * 4. On analysis tool: Continue conversation with context
 * 5. On intermediate plan: Generate next phase
 * 6. Repeat until success or max recovery attempts
 * 
 */
export class AutomationService extends EventEmitter {
  // External dependencies
  private executor: BrowserAutomationExecutor;
  private recordingStore: RecordingStore;
  
  // Core services
  private automationClient: AutomationClient;
  private toolRegistry: ToolRegistry;
  
  // State and execution managers (initialized per session)
  private stateManager: AutomationStateManager;
  private sessionManager: SessionManager;
  private planExecutor: PlanExecutor;
  private errorRecoveryHandler: ErrorRecoveryHandler;
  private intermediatePlanHandler: IntermediatePlanHandler;
  private usageTracker: UsageTracker;

  constructor(
    executor: BrowserAutomationExecutor,
    recordingStore: RecordingStore,
    sessionManager: SessionManager,
  ) {
    super(); // Initialize EventEmitter
    this.executor = executor;
    this.recordingStore = recordingStore;
    
    // Pass thinking callback to AutomationClient
    this.automationClient = new AutomationClient((message: string) => {
      this.emitProgress('claude_thinking', { message });
    });
    
    this.toolRegistry = new ToolRegistry();
    this.sessionManager = sessionManager;
  }

  /**
   * Get current session ID
   */
  public getSessionId(): string | null {
    return this.stateManager?.getSessionId() || null;
  }

  /**
   * Emit progress event for real-time UI updates
   */
  private emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data,
      timestamp: Date.now()
    };
    this.emit('progress', event);
  }

  /**
   * Execute automation with Smart ReAct error recovery
   * 
   * @param userGoal - What the user wants to automate
   * @param recordedSessionId - Optional recorded session as reference
   * @param maxRecoveryAttempts - Maximum number of error recovery attempts (default: 7)
   * @returns Automation result with recovery information
   */
  public async executeAutomation(
    userGoal: string,
    recordedSessionId: string,
    maxRecoveryAttempts = 7
  ): Promise<IterativeAutomationResult> {
    // Initialize session-specific managers with persistent storage
    const recordedSession = this.recordingStore.getRecording(recordedSessionId);
    this.stateManager = new AutomationStateManager(
      userGoal,
      recordedSession,
      maxRecoveryAttempts,
      this.sessionManager
    );
    this.planExecutor = new PlanExecutor(this.executor, this.stateManager, this); // Pass event emitter
    this.errorRecoveryHandler = new ErrorRecoveryHandler(
      this.automationClient,
      this.toolRegistry,
      this.stateManager
    );
    this.intermediatePlanHandler = new IntermediatePlanHandler(
      this.automationClient,
      this.toolRegistry,
      this.stateManager
    );
    this.usageTracker = new UsageTracker();

    try {
      // Step 1: Start automation session
      await this.automationClient.startAutomation();
      
      // Step 2: Generate initial plan (thinking event emitted by AutomationClient)
      const initialPlan = await this.generateInitialPlan();
      this.usageTracker.addUsage(initialPlan.usage);
      this.stateManager.setCurrentPlan(initialPlan.plan);
      this.stateManager.addMessage({
        role: 'assistant',
        content: initialPlan.response.content
      });

      // Extract Claude's thinking/reasoning text
      const thinkingText = initialPlan.response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
      
      // Emit Claude response event
      if (thinkingText) {
        this.emitProgress('claude_response', {
          message: thinkingText,
          planType: initialPlan.plan.planType
        });
      }
      
      // Emit plan generated event
      this.emitProgress('plan_generated', {
        plan: initialPlan.plan,
        planType: initialPlan.plan.planType,
        totalSteps: initialPlan.plan.totalSteps,
      });

      // Step 2: Execute plan with error recovery loop
      while (!this.stateManager.isComplete() && !this.stateManager.isMaxRecoveryAttemptsReached()) {
        const executionResult = await this.executePlanWithRecovery();
        
        if (executionResult.usage) {
          this.usageTracker.addUsage(executionResult.usage);
        }

        if (executionResult.isComplete) {
          this.stateManager.markComplete(executionResult.success, executionResult.error);
          break;
        }
      }

      // Return final result
      const finalResult = this.stateManager.getFinalResult();
      
      // End automation session
      await this.automationClient.endAutomation();
      
      // Emit completion event
      this.emitProgress('automation_complete', {
        success: finalResult.success,
        totalSteps: this.stateManager.getTotalStepsExecuted(),
        recoveryAttempts: this.stateManager.getRecoveryAttempts(),
        usage: this.usageTracker.getTotalUsage()
      });

      return {
        success: finalResult.success,
        plan: this.stateManager.getCurrentPlan(),
        executionResults: this.stateManager.getExecutedSteps(),
        error: finalResult.error,
        usage: this.usageTracker.getTotalUsage(),
        recoveryAttempts: this.stateManager.getRecoveryAttempts(),
        totalStepsExecuted: this.stateManager.getTotalStepsExecuted()
      };

    } catch (error: any) {
      console.error('❌ [IterativeAutomation] Fatal error:', error);
      
      // End automation session even on error
      try {
        await this.automationClient.endAutomation();
      } catch (endError) {
        console.error('❌ [IterativeAutomation] Failed to end automation session:', endError);
      }
      
      // Emit error event
      this.emitProgress('automation_error', {
        error: error.message || 'Unknown error occurred',
        stack: error.stack
      });

      return {
        success: false,
        executionResults: this.stateManager?.getExecutedSteps() || [],
        error: error.message || 'Unknown error occurred',
        usage: this.usageTracker?.getTotalUsage() || {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0
        },
        recoveryAttempts: this.stateManager?.getRecoveryAttempts() || 0,
        totalStepsExecuted: this.stateManager?.getTotalStepsExecuted() || 0
      };
    }
  }

  /**
   * Generate initial automation plan
   */
  private async generateInitialPlan(): Promise<{
    plan: ParsedAutomationPlan;
    response: Anthropic.Message;
    usage: UsageStats;
  }> {
    if (!this.stateManager) throw new Error('State manager not initialized');

    const systemPrompt = SystemPromptBuilder.buildAutomationSystemPrompt();
    const userPrompt = this.stateManager.getUserGoal();
    const tools = this.toolRegistry.getToolDefinitions();

    // Add user message to conversation
    this.stateManager.addMessage({
      role: 'user',
      content: userPrompt
    });

    // Generate plan
    const response = await this.automationClient.createAutomationPlan({
      systemPrompt,
      userPrompt,
      tools,
      cachedContext: this.stateManager.getCachedContext()
    });

    // Parse plan
    const plan = AutomationPlanParser.parsePlan(response);

    // Validate plan
    const validation = AutomationPlanParser.validatePlan(
      plan,
      this.toolRegistry.getToolNames()
    );

    if (!validation.valid) {
      throw new Error(`Invalid automation plan: ${validation.errors.join(', ')}`);
    }

    const usage = UsageTracker.extractUsageFromResponse(response);

    return { plan, response, usage };
  }

  /**
   * Execute plan with error recovery
   * Returns execution result and whether we're complete
   */
  private async executePlanWithRecovery(): Promise<PlanExecutionResult> {
    if (!this.stateManager || !this.planExecutor || !this.errorRecoveryHandler || !this.intermediatePlanHandler) {
      throw new Error('Managers not initialized');
    }

    const currentPlan = this.stateManager.getCurrentPlan();
    if (!currentPlan) {
      return { success: false, isComplete: true, error: 'No plan to execute' };
    }

    // Execute steps one by one
    const totalSteps = currentPlan.steps.length;
    for (let i = 0; i < currentPlan.steps.length; i++) {
      const step = currentPlan.steps[i];
      const stepNumber = this.stateManager.getExecutedSteps().length + 1;
      const isLastStep = i === currentPlan.steps.length - 1;

      const stepResult = await this.planExecutor.executeStep(step, stepNumber, totalSteps);

      // Handle max steps reached - stop automation immediately
      if (stepResult.maxStepsReached) {
        console.log('🛑 Max steps limit reached, stopping automation');
        return { 
          success: false, 
          isComplete: true, 
          error: stepResult.error || 'Maximum execution steps limit reached'
        };
      }

      // Handle step failure - trigger error recovery
      if (!stepResult.success) {
        const recoveryResult = await this.errorRecoveryHandler.handleError(step, stepResult.result);
        return recoveryResult;
      }

      // Handle extract_context tool ONLY if it's the last step
      // This means the plan is designed to extract context and return to Claude
      if (stepResult.isAnalysisTool && isLastStep) {
        // Build tool results for all executed steps in this plan
        const toolResultBlocks = MessageBuilder.buildToolResultsForPlan(
          currentPlan,
          this.stateManager.getExecutedSteps()
        );

        console.log(`✅ [IterativeAutomation] Plan ended with analysis tool - submitting ${toolResultBlocks.length} tool_result blocks`);

        // Add tool results to conversation
        this.stateManager.addMessage(
          MessageBuilder.buildUserMessageWithToolResults(toolResultBlocks)
        );

        // Continue conversation to get next steps
        const continuationResult = await this.intermediatePlanHandler.handleContextExtraction();
        return continuationResult;
      }
    }

    // All steps in current plan completed successfully
    console.log(`✅ [IterativeAutomation] Plan completed - ${currentPlan.steps.length} steps executed`);
    
    // Build tool results for ALL executed steps in this plan
    const toolResultBlocks = MessageBuilder.buildToolResultsForPlan(
      currentPlan,
      this.stateManager.getExecutedSteps()
    );

    // Add tool results to conversation
    this.stateManager.addMessage(
      MessageBuilder.buildUserMessageWithToolResults(toolResultBlocks)
    );

    // Check if we're in recovery mode
    if (this.stateManager.isInRecovery()) {
      console.log(`🔄 [IterativeAutomation] Recovery plan completed - getting new plan from Claude`);
      const recoveryCompletionResult = await this.intermediatePlanHandler.handleRecoveryPlanCompletion();
      return recoveryCompletionResult;
    }

    // Check if this was an intermediate or final plan
    const planType = currentPlan.planType || 'final';

    if (planType === 'intermediate') {
      this.stateManager.completePhase();
      const intermediateContinuationResult = await this.intermediatePlanHandler.handleIntermediatePlanCompletion();
      return intermediateContinuationResult;
    }

    return { success: true, isComplete: true };
  }
}
