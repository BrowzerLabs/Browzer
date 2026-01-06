import { EventEmitter } from 'events';

import Anthropic from '@anthropic-ai/sdk';

import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { SessionManager } from '../session/SessionManager';
import { ContextWindowManager } from '../utils/ContextWindowManager';
import { AutomationClient } from '..';

import {
  ExecutedStep,
  CompletedPlan,
  PlanExecutionResult,
  AutomationStep,
  AutomationPlan,
} from './types';

import {
  RecordingSession,
  AutomationStatus,
  AutomationEventType,
  AutomationProgressEvent,
  SystemPromptType,
  ToolExecutionResult,
} from '@/shared/types';
import { MAX_AUTOMATION_STEPS } from '@/shared/constants/limits';
import { BrowserAutomationExecutor } from '@/main/automation';
import { ContextWindowService } from './ContextWindowService';

export class AutomationStateManager extends EventEmitter {
  private session_id: string;
  private user_goal: string;
  private cached_context: string;
  private session_manager: SessionManager;

  private messages: Anthropic.MessageParam[] = [];
  private current_plan: AutomationPlan | null = null;
  private executed_steps: ExecutedStep[] = [];
  private phase_number = 1;
  private completed_plans: CompletedPlan[] = [];
  private is_in_recovery = false;
  private status: AutomationStatus = AutomationStatus.RUNNING;
  private final_error?: string;

  private executor: BrowserAutomationExecutor;
  private automationClient: AutomationClient;
  private current_url: string;

  constructor(
    userGoal: string,
    recordedSession: RecordingSession,
    sessionManager: SessionManager,
    automationClient: AutomationClient,
    executor: BrowserAutomationExecutor
  ) {
    super();
    this.user_goal = userGoal;
    this.cached_context =
      SystemPromptBuilder.formatRecordedSession(recordedSession);
    this.session_manager = sessionManager;

    const session = this.session_manager.createSession({
      userGoal,
      recordingId: recordedSession?.id || 'unknown',
      cachedContext: this.cached_context,
    });
    this.session_id = session.id;

    this.automationClient = automationClient;
    this.executor = executor;
    this.current_url = recordedSession.url;
  }

  public emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data,
    };
    this.emit('progress', event);
  }

  public async generateInitialPlan(): Promise<void> {
    setTimeout(() => {
      this.emitProgress('thinking', {
        message:
          'Analyzing recorded session & goal to generate initial plan...',
      });
    }, 400);
    this.addMessage({
      role: 'user',
      content: this.user_goal,
    });
    const response = await this.automationClient.createAutomationPlan(
      this.cached_context,
      this.user_goal
    );
    this.current_plan = this.parsePlan(response);
    this.addMessage({ role: 'assistant', content: response.content });
  }

  public async executePlanWithRecovery(): Promise<PlanExecutionResult> {
    if (!this.current_plan) {
      return {
        status: AutomationStatus.FAILED,
        isComplete: true,
        error: 'No plan to execute. Please Try Again',
      };
    }

    const totalSteps = this.current_plan.steps.length;
    for (let i = 0; i < this.current_plan.steps.length; i++) {
      if (this.status === AutomationStatus.STOPPED) {
        return {
          status: AutomationStatus.STOPPED,
          isComplete: true,
          error: 'Automation stopped',
        };
      } else if (this.status === AutomationStatus.FAILED) {
        return {
          status: AutomationStatus.FAILED,
          isComplete: true,
          error: 'Automation failed',
        };
      }

      const step = this.current_plan.steps[i];
      const stepNumber = this.executed_steps.length + 1;
      const isLastStep = i === this.current_plan.steps.length - 1;

      const stepResult = await this.executeStep(step, stepNumber, totalSteps);

      if (this.executed_steps.length >= MAX_AUTOMATION_STEPS) {
        return {
          status: AutomationStatus.STOPPED,
          isComplete: true,
          error:
            'Maximum execution steps limit reached. Please restart another automation.',
        };
      }

      if (!stepResult.success || stepResult.error) {
        return await this.handleError(step, stepResult.result);
      }

      if (this.isAnalysisTool(step.toolName) && isLastStep) {
        const toolResultBlocks = this.buildToolResultsForPlan(
          this.current_plan,
          this.executed_steps
        );
        this.addMessage({ role: 'user', content: toolResultBlocks });

        const response = await this.automationClient.continueConversation(
          SystemPromptType.AUTOMATION_CONTINUATION,
          this.optimizedMessages(),
          this.cached_context
        );

        this.addMessage({
          role: 'assistant',
          content: response.content,
        });

        this.compressMessages();

        const newPlan = this.parsePlan(response);
        this.setCurrentPlan(newPlan);

        return {
          status: AutomationStatus.RUNNING,
          isComplete: false,
        };
      }
    }

    const toolResultBlocks = this.buildToolResultsForPlan(
      this.current_plan,
      this.executed_steps
    );

    this.addMessage({ role: 'user', content: toolResultBlocks });

    if (this.is_in_recovery) {
      if (this.current_plan.planType === 'final') {
        this.exitRecoveryMode();
        return { status: AutomationStatus.COMPLETED, isComplete: true };
      }

      const response = await this.automationClient.continueConversation(
        SystemPromptType.AUTOMATION_ERROR_RECOVERY,
        this.optimizedMessages(),
        this.cached_context
      );

      this.addMessage({ role: 'assistant', content: response.content });

      this.compressMessages();

      const newPlan = this.parsePlan(response);

      this.setCurrentPlan(newPlan);
      this.exitRecoveryMode();

      return {
        status: AutomationStatus.RUNNING,
        isComplete: false,
      };
    }

    if (this.current_plan.planType === 'intermediate') {
      this.completePhase();
      const continuationPrompt =
        SystemPromptBuilder.buildIntermediatePlanContinuationPrompt({
          userGoal: this.user_goal,
          currentUrl: this.current_url,
        });

      this.addMessage({ role: 'user', content: continuationPrompt });

      const response = await this.automationClient.continueConversation(
        SystemPromptType.AUTOMATION_CONTINUATION,
        this.optimizedMessages(),
        this.cached_context
      );

      this.addMessage({ role: 'assistant', content: response.content });

      this.compressMessages();

      const newPlan = this.parsePlan(response);
      this.setCurrentPlan(newPlan);

      return {
        status: AutomationStatus.RUNNING,
        isComplete: false,
      };
    }

    return { status: AutomationStatus.COMPLETED, isComplete: true };
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
        error: `Maximum execution steps limit (${MAX_AUTOMATION_STEPS}) reached`,
      });

      return {
        success: false,
        error: `Maximum execution steps limit (${MAX_AUTOMATION_STEPS}) reached`,
      };
    }

    this.emitProgress('step_start', {
      stepNumber,
      totalSteps,
      toolName: step.toolName,
      toolUseId: step.toolUseId,
      params: step.input,
      status: 'running',
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
        error: result.success
          ? undefined
          : result.error?.message || 'Unknown error',
      };

      this.addExecutedStep(executedStep);

      if (!result.success || result.error) {
        console.error(
          `❌ Step ${stepNumber} failed: ${result.error?.message || 'Unknown error'}`
        );

        this.emitProgress('step_error', {
          stepNumber,
          totalSteps,
          toolName: step.toolName,
          toolUseId: step.toolUseId,
          error: result.error,
          duration,
          status: 'error',
        });

        return {
          success: false,
          result,
          error: result.error?.message || 'Automation failed',
        };
      }

      this.emitProgress('step_complete', {
        stepNumber,
        totalSteps,
        toolName: step.toolName,
        toolUseId: step.toolUseId,
        result: result,
        duration,
        status: 'success',
      });

      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error(
        `❌ Step ${stepNumber} failed:`,
        error.message,
        error.stack
      );

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: step.toolName,
        success: false,
        error: error.message,
      };
      this.addExecutedStep(executedStep);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  public async handleError(
    failedStep: any,
    result: ToolExecutionResult
  ): Promise<PlanExecutionResult> {
    const toolResults = this.buildToolResultsForErrorRecovery(
      this.current_plan,
      this.executed_steps
    );

    const errorPrompt = SystemPromptBuilder.buildErrorRecoveryPrompt({
      errorInfo: {
        message: result.error?.message || 'Unknown error',
        code: result.error?.code,
        details: result.error?.details,
        suggestions: result.error?.details?.suggestions,
      },
    });

    this.addMessage({
      role: 'user',
      content: [
        ...toolResults,
        {
          type: 'text',
          text: errorPrompt,
        },
      ],
    });

    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.optimizedMessages(),
      this.cached_context
    );

    this.addMessage({ role: 'assistant', content: response.content });
    this.compressMessages();

    const newPlan = this.parsePlan(response);
    this.setCurrentPlan(newPlan);
    this.enterRecoveryMode();

    return {
      status: AutomationStatus.RUNNING,
      isComplete: false,
      error: 'Recovery mode initiated - continuing with updated plan',
    };
  }

  public getSessionId(): string {
    return this.session_id;
  }

  public setCurrentPlan(plan: AutomationPlan): void {
    this.current_plan = plan;
  }

  public addMessage(message: Anthropic.MessageParam): void {
    this.messages.push(message);

    this.session_manager.addMessage({
      sessionId: this.session_id,
      role: message.role,
      content: message.content,
    });
  }

  public addExecutedStep(step: ExecutedStep): void {
    this.executed_steps.push(step);

    this.session_manager.addStep({
      sessionId: this.session_id,
      stepNumber: step.stepNumber,
      toolName: step.toolName,
      result: this.isAnalysisTool(step.toolName)
        ? `${step.toolName} executed successfully`
        : step.result,
      success: step.success,
      error: step.error,
    });

    this.session_manager.updateSession(this.session_id, {
      metadata: {
        totalStepsExecuted: this.executed_steps.length,
      },
    });
  }

  public enterRecoveryMode(): void {
    this.is_in_recovery = true;

    this.session_manager.updateSession(this.session_id, {
      metadata: {
        isInRecovery: true,
      },
    });
  }

  public exitRecoveryMode(): void {
    this.is_in_recovery = false;

    this.session_manager.updateSession(this.session_id, {
      metadata: {
        isInRecovery: false,
      },
    });
  }

  public completePhase(): void {
    if (this.current_plan) {
      this.completed_plans.push({
        phaseNumber: this.phase_number,
        plan: this.current_plan,
        stepsExecuted: this.current_plan.steps.length,
      });
      this.phase_number++;

      this.session_manager.updateSession(this.session_id, {
        metadata: {
          phaseNumber: this.phase_number,
        },
      });
    }
  }

  public markComplete(status: AutomationStatus, error?: string): void {
    this.status = status;
    this.final_error = error;

    this.session_manager.completeSession(this.session_id, status, error);
  }

  public getMessages(): Anthropic.MessageParam[] {
    return this.messages;
  }

  public optimizedMessages(): Anthropic.MessageParam[] {
    const result = ContextWindowManager.optimizeMessages(
      this.messages,
      this.user_goal
    );

    if (result.compressionApplied) {
      this.messages = result.optimizedMessages;
    }

    return result.optimizedMessages;
  }

  public getCurrentPlan(): AutomationPlan | null {
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

  public isRunning(): boolean {
    return this.status === AutomationStatus.RUNNING;
  }

  public getTotalStepsExecuted(): number {
    return this.executed_steps.length;
  }

  public getFinalResult(): { success: boolean; error?: string } {
    return {
      success: this.status === AutomationStatus.COMPLETED,
      error: this.final_error,
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
    this.messages = ContextWindowService.compressMessages(this.messages);
  }

  private parsePlan(response: Anthropic.Message): AutomationPlan {
    const steps: AutomationStep[] = [];
    let stepOrder = 0;
    let planType: 'intermediate' | 'final' = 'final';
    let planTypeToolId: string | undefined = undefined;

    for (const block of response.content) {
      if (block.type === 'text') {
        this.emitProgress('text_response', {
          message: block.text,
        });
      } else if (block.type === 'tool_use') {
        if (block.name === 'declare_plan_metadata') {
          planType = (block.input as any).planType ?? 'final';
          planTypeToolId = block.id;
        } else {
          steps.push({
            toolName: block.name,
            toolUseId: block.id,
            input: block.input,
            order: stepOrder++,
          });
        }
      }
    }

    return { steps, planType, planTypeToolId };
  }

  private buildToolResultsForPlan(
    plan: AutomationPlan,
    executedSteps: ExecutedStep[]
  ): Anthropic.Messages.ToolResultBlockParam[] {
    const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

    if (plan.planTypeToolId) {
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: plan.planTypeToolId,
        content: `✅`,
      });
    }

    let executedIndex = 0;
    for (let i = 0; i < plan.steps.length; i++) {
      const planStep = plan.steps[i];
      if (executedIndex >= executedSteps.length) {
        break;
      }
      const executedStep = executedSteps[executedIndex];

      if (!executedStep.result || executedStep.toolName !== planStep.toolName) {
        break;
      }
      executedIndex++;

      const result = executedStep.result;

      if (planStep.toolName === 'extract_context') {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: planStep.toolUseId,
          content: result.value.toString(),
        });
      } else if (
        planStep.toolName === 'take_snapshot' &&
        typeof result.value === 'string'
      ) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: planStep.toolUseId,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: result.value,
              },
            },
          ],
        });
      } else {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: planStep.toolUseId,
          content: `✅`,
        });
      }
    }

    return toolResultBlocks;
  }

  public buildToolResultsForErrorRecovery(
    plan: AutomationPlan,
    executedSteps: ExecutedStep[]
  ): Array<{
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  }> {
    const toolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    if (plan.planTypeToolId) {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: plan.planTypeToolId,
        content: `✅`,
      });
    }

    let executedCount = 0;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Check if this step was executed
      if (executedCount < executedSteps.length) {
        const executedStep = executedSteps[executedCount];

        // Verify this is the right step (match by tool name)
        if (executedStep.toolName === step.toolName) {
          // Add tool result for this executed step
          toolResults.push({
            type: 'tool_result',
            tool_use_id: step.toolUseId,
            content: executedStep.success
              ? `✅`
              : JSON.stringify({
                  error:
                    executedStep.error ||
                    executedStep.result?.error?.message ||
                    '❌ Unknown error',
                  toolName: step.toolName,
                }),
          });
          executedCount++;
        } else {
          // Mismatch - this step wasn't executed
          toolResults.push({
            type: 'tool_result',
            tool_use_id: step.toolUseId,
            content: `❌ automation stopped before reaching this step`,
          });
        }
      } else {
        // This step wasn't executed yet
        toolResults.push({
          type: 'tool_result',
          tool_use_id: step.toolUseId,
          content: `❌ automation stopped before reaching this step`,
        });
      }
    }

    return toolResults;
  }
}
