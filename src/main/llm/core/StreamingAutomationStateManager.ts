import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { BrowserAutomationExecutor } from '@/main/automation';
import { 
  RecordingSession, 
  AutomationStatus, 
  QueuedTool, 
  AutomationEventType, 
  AutomationProgressEvent,
  SystemPromptType 
} from '@/shared/types';
import { ExecutedStep, CompletedPlan, ParsedAutomationPlan, PlanExecutionResult } from './types';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { SessionManager } from '../session/SessionManager';
import { AutomationPlanParser } from '../parsers/AutomationPlanParser';
import { MessageBuilder } from '../builders/MessageBuilder';
import { ContextWindowManager } from '../utils/ContextWindowManager';
import { MessageCompressionManager } from '../utils/MessageCompressionManager';
import { AutomationClient } from '../clients/AutomationClient';
import { api, sse } from '@/main/api';
import { MAX_AUTOMATION_STEPS } from '@/shared/constants/limits';

export class StreamingAutomationStateManager extends EventEmitter {
  private session_id: string;
  private user_goal: string;
  private cached_context: string;
  private executor: BrowserAutomationExecutor;
  private automationClient: AutomationClient;

  private messages: Anthropic.MessageParam[] = [];
  private current_plan: ParsedAutomationPlan | null = null;
  private executed_steps: ExecutedStep[] = [];
  private phase_number: number = 1;
  private completed_plans: CompletedPlan[] = [];
  private is_in_recovery: boolean = false;
  private status: AutomationStatus = AutomationStatus.RUNNING;
  private final_error?: string;

  private isStreaming: boolean = false;
  private currentThinkingText: string = '';
  private currentThinkingMessageId: string | null = null;
  private streamingMessage: Anthropic.Message | null = null;
  private contentBlocks: Map<number, any> = new Map();

  private toolQueue: Map<number, QueuedTool> = new Map();
  private nextExecutionIndex: number = 1;
  private isExecuting: boolean = false;
  private totalSteps: number = 0;

  private sseUnsubscribe: (() => void) | null = null;

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
    this.automationClient = automationClient;
    this.executor = executor;

    this.session_id = recordedSession?.id || 'unknown';

    this.setupSSEListener();
  }

  private setupSSEListener(): void {
    sse.on('automation', (data: any) => this.handleSSEEvent(data.type, data));

    this.sseUnsubscribe = () => {
      sse.off('automation', (data: any) => this.handleSSEEvent(data.type, data));
    };
  }

  private handleSSEEvent(eventType: string, data: any): void {
    switch (eventType) {
      case 'automation_start':
      case 'continuation_start':
        this.handleStreamStart();
        break;

      case 'message_start':
        this.handleMessageStart(data);
        break;

      case 'content_block_start':
        this.handleContentBlockStart(data);
        break;

      case 'text_delta':
        this.handleTextDelta(data);
        break;

      case 'tool_use_start':
        this.handleToolUseStart(data);
        break;

      case 'tool_use_complete':
        this.handleToolUseComplete(data);
        break;

      case 'content_block_stop':
        this.handleContentBlockStop(data);
        break;

      case 'message_delta':
        this.handleMessageDelta(data);
        break;

      case 'message_stop':
        console.log('Message stop');
        this.handleMessageStop();
        break;

      case 'stream_complete':
        this.handleStreamComplete(data);
        break;

      case 'stream_error':
        this.handleStreamError(data);
        break;

      default:
        console.warn(`Unknown event type: ${eventType}`);
        break;
    }
  }

  private handleStreamStart(): void {
    this.isStreaming = true;
    this.currentThinkingText = '';
    this.currentThinkingMessageId = null;
    this.contentBlocks.clear();
    this.toolQueue.clear();
    this.nextExecutionIndex = 1;
    this.totalSteps = 0;
  }

  private handleMessageStart(data: any): void {
    this.currentThinkingMessageId = data.message_id;
    this.streamingMessage = {
      id: data.message_id,
      model: data.model,
      content: [],
      role: 'assistant',
      type: 'message',
      usage: data.usage,
      stop_reason: null,
      stop_sequence: null
    } as Anthropic.Message;
  }

  private handleContentBlockStart(data: any): void {
    const { index, block_type } = data;

    if (block_type === 'text') {
      this.contentBlocks.set(index, {
        type: 'text',
        text: ''
      });
    }
  }

  private handleTextDelta(data: any): void {
    const { index, text } = data;
    const block = this.contentBlocks.get(index);

    if (block && block.type === 'text') {
      block.text += text;
      this.currentThinkingText += text;

      this.emitProgress('thinking', {
        message: this.currentThinkingText,
        messageId: this.currentThinkingMessageId
      });
    }
  }

  private handleToolUseStart(data: any): void {
    const { index, tool_use_id, tool_name } = data;

    this.contentBlocks.set(index, {
      type: 'tool_use',
      id: tool_use_id,
      name: tool_name,
      input: {}
    });

    this.toolQueue.set(index, {
      index,
      toolUseId: tool_use_id,
      toolName: tool_name,
      input: null,
      status: 'buffering'
    });
  }

  private handleToolUseComplete(data: any): void {
    const { index, input } = data;

    const block = this.contentBlocks.get(index);
    if (block && block.type === 'tool_use') {
      block.input = input;
    }

    const tool = this.toolQueue.get(index);
    if (tool) {
      tool.input = input;
      tool.status = 'ready';
      this.processQueue();
    }
  }

  private handleContentBlockStop(data: any): void {
    if (this.currentThinkingText) {
      this.currentThinkingText = '';
    }
  }

  private handleMessageDelta(data: any): void {
    if (this.streamingMessage) {
      this.streamingMessage.stop_reason = data.stop_reason;
      if (data.usage) {
        this.streamingMessage.usage = data.usage;
      }
    }
  }

  private handleMessageStop(): void {
    // Message streaming stopped
  }

  private handleStreamComplete(data: any): void {
    this.isStreaming = false;

    if (this.streamingMessage && data.message) {
      this.streamingMessage = data.message;
    } else if (this.streamingMessage) {
      this.streamingMessage.content = Array.from(this.contentBlocks.values());
    }

    this.totalSteps = this.toolQueue.size;
    this.processQueue();
  }

  private handleStreamError(data: any): void {
    console.error('❌ [StreamStateManager] Stream error:', data.error);
    this.isStreaming = false;

    this.emitProgress('automation_error', {
      error: data.error
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isExecuting) {
      return;
    }

    this.isExecuting = true;

    try {
      while (true) {
        const tool = this.toolQueue.get(this.nextExecutionIndex);
        
        console.log(`🔄 [Queue] Checking index ${this.nextExecutionIndex}:`, tool ? `${tool.toolName} (${tool.status})` : 'not found');

        if (!tool) {
          break;
        }

        if (tool.status !== 'ready') {
          console.log(`⏸️ [Queue] Tool ${this.nextExecutionIndex} not ready yet (${tool.status})`);
          break;
        }

        await this.executeTool(tool);
        this.nextExecutionIndex++;
      }
    } finally {
      this.isExecuting = false;
    }
  }

  private async executeTool(tool: QueuedTool): Promise<void> {
    // Skip metadata tool - it's not an actual action
    if (tool.toolName === 'declare_plan_metadata') {
      console.log(`⏭️ [Queue] Skipping metadata tool at index ${tool.index}`);
      tool.status = 'completed';
      return;
    }

    tool.status = 'executing';

    const stepNumber = tool.index + 1;

    this.emitProgress('step_start', {
      stepNumber,
      totalSteps: this.totalSteps,
      toolName: tool.toolName,
      toolUseId: tool.toolUseId,
      params: tool.input,
      status: 'running'
    });

    try {
      const startTime = Date.now();
      const result = await this.executor.executeTool(tool.toolName, tool.input);
      const duration = Date.now() - startTime;

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: tool.toolName,
        success: result.success,
        result,
        error: result.success ? undefined : (result.error?.message || 'Unknown error')
      };

      this.addExecutedStep(executedStep);

      if (!result.success || result.error) {
        tool.status = 'error';

        this.emitProgress('step_error', {
          stepNumber,
          totalSteps: this.totalSteps,
          toolName: tool.toolName,
          toolUseId: tool.toolUseId,
          error: result.error,
          duration,
          status: 'error',
          executedStep
        });

        console.log(`❌ [StreamStateManager] Step ${stepNumber} failed, stopping queue processing`);
        this.isExecuting = false;
        return;
      } else {
        tool.status = 'completed';

        this.emitProgress('step_complete', {
          stepNumber,
          totalSteps: this.totalSteps,
          toolName: tool.toolName,
          toolUseId: tool.toolUseId,
          result: result,
          duration,
          status: 'success',
          executedStep
        });
      }
    } catch (error: any) {
      tool.status = 'error';

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: tool.toolName,
        success: false,
        error: error.message
      };

      this.addExecutedStep(executedStep);

      this.emitProgress('step_error', {
        stepNumber,
        totalSteps: this.totalSteps,
        toolName: tool.toolName,
        toolUseId: tool.toolUseId,
        error: { message: error.message },
        duration: 0,
        status: 'error',
        executedStep
      });

      console.log(`❌ [StreamStateManager] Step ${stepNumber} exception, stopping queue processing`);
      this.isExecuting = false;
      return;
    }
  }

  public async generateInitialPlan(): Promise<void> {
    this.addMessage({
      role: 'user',
      content: this.user_goal
    });

    this.emitProgress('thinking', {
      message: 'Creating automation plan...'
    });

    const response = await api.post<{ message: any; session_id: string }>(
      '/automation/plan/stream',
      {
        recording_session: this.cached_context,
        user_goal: this.user_goal
      }
    );

    if (!response.success || !response.data?.session_id) {
      throw new Error(response.error || 'Failed to create automation plan');
    }

    this.session_id = response.data.session_id;

    await this.waitForStreamComplete();
    await this.waitForToolCompletion();

    if (this.streamingMessage) {
      const plan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.current_plan = plan;

      this.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      console.log(`📋 [StreamStateManager] Plan: ${plan.planType}, ${plan.steps.length} steps`);
    } else {
      throw new Error('Stream completed but no message received');
    }
  }

  public async executePlanWithRecovery(): Promise<PlanExecutionResult> {
    if (!this.current_plan) {
      return { success: false, isComplete: true, error: 'No plan to execute' };
    }

    if (this.executed_steps.length >= MAX_AUTOMATION_STEPS) {
      return {
        success: false,
        isComplete: true,
        error: 'Maximum execution steps limit reached'
      };
    }

    const failedStep = this.executed_steps.find(step => !step.success);
    if (failedStep) {
      console.log(`❌ [StreamStateManager] Step ${failedStep.stepNumber} failed, initiating recovery`);
      return await this.handleError(failedStep);
    }

    const lastStep = this.current_plan.steps[this.current_plan.steps.length - 1];
    if (this.isAnalysisTool(lastStep.toolName)) {
      const toolResultBlocks = MessageBuilder.buildToolResultsForPlan(
        this.current_plan,
        this.executed_steps
      );
      this.addMessage(
        MessageBuilder.buildUserMessageWithToolResults(toolResultBlocks)
      );
      return await this.handleContextExtraction();
    }

    console.log(`✅ [StreamStateManager] Plan completed - ${this.current_plan.steps.length} steps`);
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

      return await this.handleRecoveryPlanCompletion();
    }

    if (this.current_plan.planType === 'intermediate') {
      this.completePhase();
      return await this.handleIntermediatePlanCompletion();
    }

    return { success: true, isComplete: true };
  }

  private async handleError(failedStep: ExecutedStep): Promise<PlanExecutionResult> {
    const toolResults = MessageBuilder.buildToolResultsForErrorRecovery(
      this.current_plan,
      this.executed_steps
    );

    const errorPrompt = SystemPromptBuilder.buildErrorRecoveryPrompt({
      errorInfo: {
        message: failedStep.error || 'Unknown error',
        code: undefined,
        details: undefined,
        suggestions: undefined
      },
      userGoal: this.user_goal,
      failedStep: {
        stepNumber: failedStep.stepNumber,
        toolName: failedStep.toolName,
        params: {}
      },
      successfullyExecutedSteps: this.executed_steps.filter(s => s.success).length,
      currentUrl: failedStep.result?.url
    });

    this.addMessage(
      MessageBuilder.buildUserMessageWithToolResultsAndText(toolResults, errorPrompt)
    );

    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.getOptimizedMessages(),
      this.getCachedContext()
    );

    await this.waitForStreamComplete();
    await this.waitForToolCompletion();

    if (this.streamingMessage) {
      this.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });
      this.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.setCurrentPlan(newPlan);
      this.enterRecoveryMode();
    }

    return {
      success: false,
      isComplete: false
    };
  }

  private async handleContextExtraction(): Promise<PlanExecutionResult> {
    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.getOptimizedMessages(),
      this.getCachedContext()
    );

    await this.waitForStreamComplete();
    await this.waitForToolCompletion();

    if (this.streamingMessage) {
      this.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      this.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.setCurrentPlan(newPlan);
    } else {
      throw new Error('Stream completed but no message received');
    }

    return {
      success: false,
      isComplete: false
    };
  }

  private async handleIntermediatePlanCompletion(): Promise<PlanExecutionResult> {
    const continuationPrompt = SystemPromptBuilder.buildIntermediatePlanContinuationPrompt({
      userGoal: this.user_goal,
      currentUrl: this.getCurrentUrl()
    });

    this.addMessage({
      role: 'user',
      content: continuationPrompt
    });

    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.getOptimizedMessages(),
      this.getCachedContext()
    );

    await this.waitForStreamComplete();
    await this.waitForToolCompletion();

    if (this.streamingMessage) {
      this.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      this.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.setCurrentPlan(newPlan);
    } else {
      throw new Error('Stream completed but no message received');
    }

    return {
      success: false,
      isComplete: false
    };
  }

  private async handleRecoveryPlanCompletion(): Promise<PlanExecutionResult> {
    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.getOptimizedMessages(),
      this.getCachedContext()
    );

    await this.waitForStreamComplete();
    await this.waitForToolCompletion();

    if (this.streamingMessage) {
      this.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      this.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);

      this.setCurrentPlan(newPlan);
      this.exitRecoveryMode();
    } else {
      throw new Error('Stream completed but no message received');
    }

    return {
      success: false,
      isComplete: false
    };
  }

  private async waitForStreamComplete(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stream timeout'));
      }, 120000);

      const checkComplete = () => {
        if (this.streamingMessage && !this.isStreaming) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };

      checkComplete();
    });
  }

  private async waitForToolCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const allCompleted = Array.from(this.toolQueue.values()).every(
          tool => tool.status === 'completed' || tool.status === 'error'
        );

        if (allCompleted && this.toolQueue.size > 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 300000);
    });
  }

  private getCurrentUrl(): string {
    const executedSteps = this.executed_steps;
    if (executedSteps.length === 0) return '';
    return executedSteps[executedSteps.length - 1]?.result?.url || '';
  }

  private isAnalysisTool(toolName: string): boolean {
    return toolName === 'extract_context' || toolName === 'take_snapshot';
  }

  private emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data
    };
    this.emit('progress', event);
  }

  public getSessionId(): string {
    return this.session_id;
  }

  public setCurrentPlan(plan: ParsedAutomationPlan): void {
    this.current_plan = plan;
  }

  public addMessage(message: Anthropic.MessageParam): void {
    this.messages.push(message);
  }

  public addExecutedStep(step: ExecutedStep): void {
    this.executed_steps.push(step);
  }

  public enterRecoveryMode(): void {
    this.is_in_recovery = true;
  }

  public exitRecoveryMode(): void {
    this.is_in_recovery = false;
  }

  public completePhase(): void {
    if (this.current_plan) {
      this.completed_plans.push({
        phaseNumber: this.phase_number,
        plan: this.current_plan,
        stepsExecuted: this.current_plan.totalSteps
      });
      this.phase_number++;
    }
  }

  public markComplete(success: boolean, error?: string): void {
    this.status = success ? AutomationStatus.COMPLETED : AutomationStatus.FAILED;
    this.final_error = error;
  }

  public getMessages(): Anthropic.MessageParam[] {
    return this.messages;
  }

  public getOptimizedMessages(): Anthropic.MessageParam[] {
    const result = ContextWindowManager.optimizeMessages(
      this.messages,
      this.user_goal
    );

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
    return this.status === AutomationStatus.COMPLETED || this.status === AutomationStatus.FAILED;
  }

  public getTotalStepsExecuted(): number {
    return this.executed_steps.length;
  }

  public getFinalResult(): { success: boolean; error?: string } {
    return {
      success: this.status === AutomationStatus.COMPLETED,
      error: this.final_error
    };
  }

  public getCompletedPlans(): CompletedPlan[] {
    return this.completed_plans;
  }

  public compressMessages(): void {
    const result = MessageCompressionManager.compressMessages(this.messages);

    if (result.compressedCount > 0) {
      this.messages = result.compressedMessages;
    }
  }

  public destroy(): void {
    if (this.sseUnsubscribe) {
      this.sseUnsubscribe();
      this.sseUnsubscribe = null;
    }

    this.toolQueue.clear();
    this.contentBlocks.clear();
    this.removeAllListeners();
  }
}
