import { ExecutedStep, CompletedPlan, AutomationStatus, ParsedAutomationPlan, PlanExecutionResult, AutomationStep } from './types';
import { RecordingSession } from '@/shared/types/recording';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { SessionManager } from '../session/SessionManager';
import { ContextWindowManager } from '../utils/ContextWindowManager';
import Anthropic from '@anthropic-ai/sdk';
import { MessageCompressionManager } from '../utils/MessageCompressionManager';
import { IntermediatePlanHandler } from '.';
import { AutomationClient, AutomationPlanParser, MessageBuilder } from '..';
import { MAX_AUTOMATION_STEPS } from '@/shared/constants/limits';
import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation';
import { AutomationEventType, AutomationProgressEvent, SystemPromptType, ToolExecutionResult } from '@/shared/types';

export class AutomationStateManager extends EventEmitter {
  private session_id: string;
  private user_goal: string;
  private cached_context: string;
  private session_manager: SessionManager;
  
  private messages: Anthropic.MessageParam[] = [];
  private current_plan: ParsedAutomationPlan | null = null;
  private executed_steps: ExecutedStep[] = [];
  private phase_number: number = 1;
  private completed_plans: CompletedPlan[] = [];
  private is_in_recovery: boolean = false;
  private status: AutomationStatus = AutomationStatus.RUNNING;
  private final_error?: string;

  private executor: BrowserAutomationExecutor;
  private automationClient: AutomationClient;
  private intermediatePlanHandler: IntermediatePlanHandler;

  constructor(
    userGoal: string,
    recordedSession: RecordingSession,
    sessionManager: SessionManager,
    automationClient: AutomationClient,
    executor: BrowserAutomationExecutor
  ) {
    super();
    this.user_goal = userGoal;
    this.cached_context = SystemPromptBuilder.formatRecordedSession(recordedSession);
    this.session_manager = sessionManager;

    const session = this.session_manager.createSession({
      userGoal,
      recordingId: recordedSession?.id || 'unknown',
      cachedContext: this.cached_context
    });
    this.session_id = session.id;

    this.automationClient = automationClient;
    this.executor = executor;
    this.intermediatePlanHandler = new IntermediatePlanHandler(
      this.automationClient,
      this
    );
  }

  public emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data
    };
    this.emit('progress', event);
  }

  public async generateInitialPlan(): Promise<void> {
    this.addMessage({
      role: 'user',
      content: this.user_goal
    });
    const response = await this.automationClient.createAutomationPlan(this.cached_context, this.user_goal);
    const plan = AutomationPlanParser.parsePlan(response);
    this.current_plan = plan;
    this.addMessage({
      role: 'assistant',
      content: response.content
    });
    const thinkingText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
      
    if (thinkingText) {
      this.emitProgress('claude_response', {
        message: thinkingText,
      });
    }
  }

  public async executePlanWithRecovery(): Promise<PlanExecutionResult> {
    if (!this.current_plan) {
      return { success: false, isComplete: true, error: 'No plan to execute. Please Try Again' };
    }

    const totalSteps = this.current_plan.steps.length;
    for (let i = 0; i < this.current_plan.steps.length; i++) {
      const step = this.current_plan.steps[i];
      const stepNumber = this.executed_steps.length + 1;
      const isLastStep = i === this.current_plan.steps.length - 1;

      const stepResult = await this.executeStep(step, stepNumber, totalSteps);

      if (this.executed_steps.length >= MAX_AUTOMATION_STEPS) {
        return { 
          success: false, 
          isComplete: true, 
          error: stepResult.error ?? 'Maximum execution steps limit reached. Please restart another automation.'
        };
      }

      if (!stepResult.success || stepResult.error) {
        const recoveryResult = await this.handleError(step, stepResult.result);
        return recoveryResult;
      }

      if (this.isAnalysisTool(step.toolName) && isLastStep) {
        const toolResultBlocks = MessageBuilder.buildToolResultsForPlan(
          this.current_plan,
          this.executed_steps
        );
        this.addMessage(
          MessageBuilder.buildUserMessageWithToolResults(toolResultBlocks)
        );
        const continuationResult = await this.intermediatePlanHandler.handleContextExtraction();
        return continuationResult;
      }
    }

    console.log(`✅ [IterativeAutomation] Plan completed - ${this.current_plan.steps.length} steps executed`);
    const toolResultBlocks = MessageBuilder.buildToolResultsForPlan(
      this.current_plan,
      this.executed_steps
    );

    this.addMessage(
      MessageBuilder.buildUserMessageWithToolResults(toolResultBlocks)
    );
    
    if (this.is_in_recovery) {
      if (this.current_plan.planType === 'final') {
        this.exitRecoveryMode();
        return { success: true, isComplete: true };
      }
      
      return await this.intermediatePlanHandler.handleRecoveryPlanCompletion();
    }

    if (this.current_plan.planType === 'intermediate') {
      this.completePhase();
      return await this.intermediatePlanHandler.handleIntermediatePlanCompletion();
    }

    return { success: true, isComplete: true };
  }

  private async executeStep(
    step: AutomationStep,
    stepNumber: number,
    totalSteps: number
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    if (this.executed_steps.length >= MAX_AUTOMATION_STEPS) {
      this.emitProgress('automation_complete', {
        success: false,
        error: `Maximum execution steps limit (${MAX_AUTOMATION_STEPS}) reached`
      });
      
      return {
        success: false,
        error: `Maximum execution steps limit (${MAX_AUTOMATION_STEPS}) reached`
      };
    }

    this.emitProgress('step_start', {
      stepNumber,
      totalSteps,
      toolName: step.toolName,
      toolUseId: step.toolUseId,
      params: step.input,
      status: 'running'
    });

    try {
      const startTime = Date.now();
      const result = await this.executor.executeTool(step.toolName, step.input);
      const duration = Date.now() - startTime;

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: step.toolName,
        success: result.success,
        result,
        error: result.success ? undefined : (result.error?.message || 'Unknown error')
      };

      this.addExecutedStep(executedStep);

      if (!result.success || result.error) {
        console.error(`❌ Step ${stepNumber} failed: ${result.error || 'Unknown error'}`);

        this.emitProgress('step_error', {
          stepNumber,
          totalSteps,
          toolName: step.toolName,
          toolUseId: step.toolUseId,
          error: result.error,
          duration,
          status: 'error'
        });
        
        return {
          success: false,
          result,
          error: result.error?.message || 'Automation failed'
        };
      }

      this.emitProgress('step_complete', {
        stepNumber,
        totalSteps,
        toolName: step.toolName,
          toolUseId: step.toolUseId,
          result: result,
          duration,
          status: 'success'
        }
      );
      
      return {
        success: true,
        result
      };
    } catch (error) {
      console.error(`❌ Step ${stepNumber} failed:`, error);

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: step.toolName,
        success: false,
        error: error.message
      };
      this.addExecutedStep(executedStep);

      return {
        success: false,
        error: error.message
      };
    }
  }

  public async handleError(
    failedStep: any,
    result: ToolExecutionResult
  ): Promise<PlanExecutionResult> {
    const toolResults = MessageBuilder.buildToolResultsForErrorRecovery(
      this.current_plan,
      this.executed_steps
    );

    const errorPrompt = SystemPromptBuilder.buildErrorRecoveryPrompt({
      errorInfo: {
        message: result.error?.message || 'Unknown error',
        code: result.error?.code,
        details: result.error?.details,
        suggestions: result.error?.details?.suggestions
      },
      userGoal: this.user_goal,
      failedStep: {
        stepNumber: this.executed_steps.length,
        toolName: failedStep.toolName,
        params: failedStep.input
      },
      executedSteps: this.executed_steps,
      currentUrl: result.url
    });

    this.addMessage(
      MessageBuilder.buildUserMessageWithToolResultsAndText(toolResults, errorPrompt)
    );

    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.getOptimizedMessages(),
      this.getCachedContext()
    );

    this.addMessage({
      role: 'assistant',
      content: response.content
    });
    this.compressMessages()

    const newPlan = AutomationPlanParser.parsePlan(response);
    this.setCurrentPlan(newPlan);
    this.enterRecoveryMode();

    return {
      success: false,
      isComplete: false,
    };
  }

  public getSessionId(): string {
    return this.session_id;
  }

  public setCurrentPlan(plan: ParsedAutomationPlan): void {
    this.current_plan = plan;
  }

  public addMessage(message: Anthropic.MessageParam): void {
    this.messages.push(message);

    this.session_manager.addMessage({
        sessionId: this.session_id,
        role: message.role,
        content: message.content
      });
  }

  public addExecutedStep(step: ExecutedStep): void {
    this.executed_steps.push(step);

    this.session_manager.addStep({
      sessionId: this.session_id,
      stepNumber: step.stepNumber,
      toolName: step.toolName,
      result: this.isAnalysisTool(step.toolName) ? `${step.toolName} executed successfully` : step.result,
      success: step.success,
      error: step.error
    });

    this.session_manager.updateSession(this.session_id, {
      metadata: {
        totalStepsExecuted: this.executed_steps.length
      }
    });
  }

  public enterRecoveryMode(): void {
    this.is_in_recovery = true;

    this.session_manager.updateSession(this.session_id, {
      metadata: {
        isInRecovery: true,
      }
    });
  }

  public exitRecoveryMode(): void {
    this.is_in_recovery = false;

    this.session_manager.updateSession(this.session_id, {
      metadata: {
        isInRecovery: false
      }
    });
  }

  public completePhase(): void {
    if (this.current_plan) {
      this.completed_plans.push({
        phaseNumber: this.phase_number,
        plan: this.current_plan,
        stepsExecuted: this.current_plan.totalSteps
      });
      this.phase_number++;

      this.session_manager.updateSession(this.session_id, {
        metadata: {
          phaseNumber: this.phase_number
        }
      });
    }
  }

  public markComplete(success: boolean, error?: string): void {
    this.status = success ? AutomationStatus.COMPLETED : AutomationStatus.FAILED;
    this.final_error = error;

    this.session_manager.completeSession(this.session_id, success, error);
  }

  public getMessages(): Anthropic.MessageParam[] {
    return this.messages;
  }

  public getOptimizedMessages(): Anthropic.MessageParam[] {
    const result = ContextWindowManager.optimizeMessages(
      this.messages,
      this.user_goal
    );

    // Update in-memory state with optimized messages if compression was applied
    if (result.compressionApplied) {
      this.messages = result.optimizedMessages;
    }

    return result.optimizedMessages;
  }

  public getCachedContext(): string | undefined {
    return this.cached_context;
  }

  public getCurrentPlan(): ParsedAutomationPlan | undefined {
    return this.current_plan;
  }

  public getExecutedSteps(): ExecutedStep[] {
    return this.executed_steps;
  }

  public getUserGoal(): string {
    return this.user_goal;
  }

  public isInRecovery(): boolean {
    return this.is_in_recovery;
  }

  public isComplete(): boolean {
    return this.status == AutomationStatus.COMPLETED || this.status == AutomationStatus.FAILED;
  }

  public getTotalStepsExecuted(): number {
    return this.executed_steps.length;
  }

  public getFinalResult(): { success: boolean; error?: string } {
    return {
      success: this.status == AutomationStatus.COMPLETED,
      error: this.final_error
    };
  }

  public getCompletedPlans(): CompletedPlan[] {
    return this.completed_plans;
  }

  public getLastCompletedPlan(): CompletedPlan | undefined {
    return this.completed_plans[this.completed_plans.length - 1];
  }

  private isAnalysisTool(toolName: string): boolean {
    return toolName === 'extract_context' || toolName === 'take_snapshot';
  }

  public compressMessages(): void {
    const result = MessageCompressionManager.compressMessages(this.messages);
    
    if (result.compressedCount > 0) {
      this.messages = result.compressedMessages;
    }
  }
}
