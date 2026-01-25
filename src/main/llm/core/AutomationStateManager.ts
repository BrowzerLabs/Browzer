import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

import Anthropic from '@anthropic-ai/sdk';

import { AutomationClient } from '..';
import { FormatService } from '../utils/FormatService';

import {
  ExecutedStep,
  PlanExecutionResult,
  AutomationStep,
  AutomationPlan,
} from './types';
import { ContextWindowService } from './ContextWindowService';

import { ExecutionService } from '@/main/automation';
import {
  RecordingSession,
  AutomationStatus,
  AutomationEventType,
  AutomationProgressEvent,
  SystemPromptType,
} from '@/shared/types';
import { MAX_AUTOMATION_STEPS } from '@/shared/constants/limits';

export class AutomationStateManager extends EventEmitter {
  private session_id: string;
  private user_goal: string;
  private cached_context: string;

  private messages: Anthropic.MessageParam[] = [];
  private current_plan: AutomationPlan | null = null;
  private executed_steps: ExecutedStep[] = [];
  private iteration_number = 1;
  private status: AutomationStatus = AutomationStatus.RUNNING;
  private final_error?: string;
  private lastExecutedTabId?: string;

  private automationClient: AutomationClient;
  private executionService: ExecutionService;

  constructor(
    userGoal: string,
    recordedSession: RecordingSession,
    automationClient: AutomationClient,
    executionService: ExecutionService
  ) {
    super();
    this.user_goal = userGoal;
    this.cached_context = FormatService.formatRecordedSession(recordedSession);
    this.session_id = randomUUID();

    this.automationClient = automationClient;
    this.executionService = executionService;
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
      this.emitProgress('thinking', { message: 'Browzer is thinking...' });
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
        const toolResults = this.buildToolResultsForErrorRecovery(
          this.current_plan,
          this.executed_steps
        );

        const browserContext = await this.captureBrowserContext();
        const snapshot = await this.executionService.executeTool('snapshot', {
          tabId: this.lastExecutedTabId,
        });

        const contentBlocks: Array<
          | Anthropic.Messages.TextBlockParam
          | Anthropic.Messages.ImageBlockParam
          | Anthropic.Messages.ToolResultBlockParam
        > = [
          ...toolResults,
          {
            type: 'text',
            text: browserContext,
          },
        ];

        if (snapshot.success && snapshot.value && snapshot.value.length > 0) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: snapshot.value,
            },
          });
        }

        const userMessage: Anthropic.MessageParam = {
          role: 'user',
          content: contentBlocks,
        };

        this.addMessage(userMessage);
        this.messages = ContextWindowService.removeUnexecutedToolCalls(
          this.messages
        );
        // console.info('Handling Error ❌')
        // this.messages.forEach((message, index)=> {
        //   console.info(index, message);
        // });
        const response = await this.automationClient.continueConversation(
          SystemPromptType.AUTOMATION_ERROR_RECOVERY,
          this.getMessages(),
          this.cached_context
        );

        this.addMessage({ role: 'assistant', content: response.content });
        this.compressMessages();
        const newPlan = this.parsePlan(response);
        this.setCurrentPlan(newPlan);
        this.iteration_number++;

        if (newPlan.steps.length === 0) {
          return {
            status: AutomationStatus.COMPLETED,
            isComplete: true,
          };
        }

        return {
          status: AutomationStatus.RUNNING,
          isComplete: false,
          error: 'Recovery mode initiated - continuing with updated plan',
        };
      }
    }

    return await this.handlePlanCompletion();
  }

  private async handlePlanCompletion(): Promise<PlanExecutionResult> {
    const toolResultBlocks = this.buildToolResultsForPlan(
      this.current_plan,
      this.executed_steps
    );

    const browserContext = await this.captureBrowserContext();
    const snapshot = await this.executionService.executeTool('snapshot', {
      tabId: this.lastExecutedTabId,
    });

    const contentBlocks: Array<
      | Anthropic.Messages.TextBlockParam
      | Anthropic.Messages.ImageBlockParam
      | Anthropic.Messages.ToolResultBlockParam
    > = [
      ...toolResultBlocks,
      {
        type: 'text',
        text: browserContext,
      },
    ];

    if (snapshot.success && snapshot.value && snapshot.value.length > 0) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: snapshot.value,
        },
      });
    }

    const userMessage: Anthropic.MessageParam = {
      role: 'user',
      content: contentBlocks,
    };

    this.addMessage(userMessage);
    // console.log("Continuing Automation ✅")
    // this.messages.forEach((message, index)=> {
    //   console.info(index, message);
    // });
    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.getMessages(),
      this.cached_context
    );

    this.addMessage({ role: 'assistant', content: response.content });
    this.compressMessages();

    const newPlan = this.parsePlan(response);
    this.setCurrentPlan(newPlan);
    this.iteration_number++;

    if (newPlan.steps.length === 0) {
      console.log(
        '✅ [AutomationStateManager] LLM returned text only - automation complete'
      );
      return { status: AutomationStatus.COMPLETED, isComplete: true };
    }

    return {
      status: AutomationStatus.RUNNING,
      isComplete: false,
    };
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
    });

    try {
      const result = await this.executionService.executeTool(
        step.toolName,
        step.input
      );

      if (step.input && step.input.tabId) {
        this.lastExecutedTabId = step.input.tabId;
      }

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: step.toolName,
        result: result,
      };

      this.addExecutedStep(executedStep);

      if (!result.success || result.error) {
        console.error(
          `❌ Step ${stepNumber} failed: ${result.error || 'Unknown error'}`
        );

        this.emitProgress('step_error', {
          toolUseId: step.toolUseId,
          params: step.input,
          error: result.error,
          status: 'error',
        });

        return {
          success: false,
          result,
          error: result.error || 'Automation failed',
        };
      }

      this.emitProgress('step_complete', {
        toolUseId: step.toolUseId,
        params: step.input,
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
        result: {
          success: false,
          error: error.message,
        },
      };
      this.addExecutedStep(executedStep);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async captureBrowserContext(): Promise<string> {
    try {
      const result = await this.executionService.executeTool('context', {
        maxElements: 100,
        tags: [],
        attributes: {},
        tabId: this.lastExecutedTabId,
      });

      if (result.success && result.value) {
        return result.value;
      }

      return 'Failed to capture browser context';
    } catch (error) {
      console.error('Failed to capture browser context:', error);
      return 'Error capturing browser context';
    }
  }

  public getSessionId(): string {
    return this.session_id;
  }

  public setCurrentPlan(plan: AutomationPlan): void {
    this.current_plan = plan;
  }

  public addMessage(message: Anthropic.MessageParam): void {
    this.messages.push(message);
  }

  public addExecutedStep(step: ExecutedStep): void {
    this.executed_steps.push(step);
  }

  public markComplete(status: AutomationStatus, error?: string): void {
    this.status = status;
    this.final_error = error;
  }

  public getMessages(): Anthropic.MessageParam[] {
    return this.messages;
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

  public compressMessages(): void {
    this.messages = ContextWindowService.compressMessages(this.messages);
  }

  private parsePlan(response: Anthropic.Message): AutomationPlan {
    const steps: AutomationStep[] = [];
    let stepOrder = 0;

    for (const block of response.content) {
      if (block.type === 'text') {
        this.emitProgress('text_response', {
          message: block.text,
        });
      } else if (block.type === 'tool_use') {
        steps.push({
          toolName: block.name,
          toolUseId: block.id,
          input: block.input,
          order: stepOrder++,
        });
      }
    }

    return { steps };
  }

  private buildToolResultsForPlan(
    plan: AutomationPlan,
    executedSteps: ExecutedStep[]
  ): Anthropic.Messages.ToolResultBlockParam[] {
    const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const planStep = plan.steps[i];
      const executedStep = executedSteps.find(
        (es) => es.toolName === planStep.toolName && es.result
      );

      if (!executedStep || !executedStep.result) {
        break;
      }

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: planStep.toolUseId,
        content: `✅`,
      });
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
  }> {
    const toolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    }> = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const executedStep = executedSteps[i];

      if (executedStep) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: step.toolUseId,
          content: executedStep.result?.success
            ? `✅`
            : '❌ Error: ' + executedStep.result?.error || 'Unknown error',
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: step.toolUseId,
          content: `❌`,
        });
      }
    }

    return toolResults;
  }
}
