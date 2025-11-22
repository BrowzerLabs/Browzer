import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation/BrowserAutomationExecutor';
import { RecordingStore } from '@/main/recording';
import { AutomationClient } from './clients/AutomationClient';
import { AutomationStateManager } from './core/AutomationStateManager';
import { SessionManager } from './session/SessionManager';
import { PlanExecutor } from './core/PlanExecutor';
import { ErrorRecoveryHandler } from './core/ErrorRecoveryHandler';
import { IntermediatePlanHandler } from './core/IntermediatePlanHandler';
import { SystemPromptBuilder } from './builders/SystemPromptBuilder';
import { MessageBuilder } from './builders/MessageBuilder';
import { AutomationPlanParser } from './parsers/AutomationPlanParser';
import { IterativeAutomationResult, PlanExecutionResult, AutomationStatus, ParsedAutomationPlan } from './core/types';
import Anthropic from '@anthropic-ai/sdk';
import { AutomationProgressEvent, AutomationEventType, RecordingSession } from '@/shared/types';

export class AutomationService extends EventEmitter {
  private executor: BrowserAutomationExecutor;
  private recordingStore: RecordingStore;
  private recordedSession: RecordingSession | null = null;
  
  private automationClient: AutomationClient;
  
  private stateManager: AutomationStateManager;
  private sessionManager: SessionManager;
  private planExecutor: PlanExecutor;
  private errorRecoveryHandler: ErrorRecoveryHandler;
  private intermediatePlanHandler: IntermediatePlanHandler;

  constructor(
    executor: BrowserAutomationExecutor,
    recordingStore: RecordingStore,
    sessionManager: SessionManager,
  ) {
    super(); // Initialize EventEmitter
    this.executor = executor;
    this.recordingStore = recordingStore;
    this.sessionManager = sessionManager;
    
    this.automationClient = new AutomationClient();
    
    this.setupAutomationClientListeners();
  }

  private setupAutomationClientListeners(): void {
    this.automationClient.on('thinking', (message: string) => {
      this.emitProgress('thinking', { message });
    });

    this.automationClient.on('automation_complete', (message: string) => {
      this.emitProgress('automation_complete', { message });
    });

    this.automationClient.on('error', (error: Error) => {
      console.error('❌ [AutomationService] AutomationClient error:', error);
      this.emitProgress('automation_error', {
        error: error.message,
        stack: error.stack
      });
    });
  }

  public getSessionId(): string | null {
    return this.stateManager?.getSessionId() || null;
  }

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
   * @returns Automation result with recovery information
   */
  public async executeAutomation(
    userGoal: string,
    recordedSessionId: string,
  ): Promise<IterativeAutomationResult> {
    this.recordedSession = this.recordingStore.getRecording(recordedSessionId);
    this.stateManager = new AutomationStateManager(
      userGoal,
      this.recordedSession,
      this.sessionManager
    );
    this.planExecutor = new PlanExecutor(this.executor, this.stateManager, this);
    this.errorRecoveryHandler = new ErrorRecoveryHandler(
      this.automationClient,
      this.stateManager
    );
    this.intermediatePlanHandler = new IntermediatePlanHandler(
      this.automationClient,
      this.stateManager
    );

    try {
      const initialPlan = await this.generateInitialPlan();
      this.stateManager.setCurrentPlan(initialPlan.plan);
      this.stateManager.addMessage({
        role: 'assistant',
        content: initialPlan.response.content
      });

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

      while (!this.stateManager.isComplete()) {
        const executionResult = await this.executePlanWithRecovery();
        
        if (executionResult.isComplete) {
          this.stateManager.markComplete(executionResult.success, executionResult.error);
          break;
        }
      }

      const finalResult = this.stateManager.getFinalResult();
      
      await this.automationClient.updateSessionStatus(AutomationStatus.COMPLETED);
      
      this.emitProgress('automation_complete', {
        success: finalResult.success,
        totalSteps: this.stateManager.getTotalStepsExecuted(),
      });

      return {
        success: finalResult.success,
        plan: this.stateManager.getCurrentPlan(),
        executionResults: this.stateManager.getExecutedSteps(),
        error: finalResult.error,
        totalStepsExecuted: this.stateManager.getTotalStepsExecuted()
      };

    } catch (error: any) {
      console.error('❌ [IterativeAutomation] Fatal error:', error);
      
      await this.automationClient.updateSessionStatus(AutomationStatus.FAILED);
      this.emitProgress('automation_error', {
        error: error.message || 'Unknown error occurred',
        stack: error.stack
      });

      return {
        success: false,
        executionResults: this.stateManager?.getExecutedSteps() || [],
        error: error.message || 'Unknown error occurred',
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
  }> {
    if (!this.stateManager) throw new Error('State manager not initialized');

    const userPrompt = this.stateManager.getUserGoal();

    // Add user message to conversation
    this.stateManager.addMessage({
      role: 'user',
      content: userPrompt
    });

    const formatted_session = SystemPromptBuilder.formatRecordedSession(this.recordedSession);

    const response = await this.automationClient.createAutomationPlan(formatted_session, userPrompt);

    const plan = AutomationPlanParser.parsePlan(response);

    return { plan, response };
  }

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
