import { ExecutedStep, CompletedPlan, ParsedAutomationPlan, PlanExecutionResult, AutomationStep } from './types';
import { RecordingSession, AutomationStatus } from '@/shared/types';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { SessionManager } from '../session/SessionManager';
import { ContextWindowManager } from '../utils/ContextWindowManager';
import Anthropic from '@anthropic-ai/sdk';
import { MessageCompressionManager } from '../utils/MessageCompressionManager';
import { IntermediatePlanHandler, StreamingToolExecutor } from '.';
import { AutomationClient, AutomationPlanParser, MessageBuilder } from '..';
import { MAX_AUTOMATION_STEPS } from '@/shared/constants/limits';
import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation';
import { AutomationEventType, AutomationProgressEvent, SystemPromptType, ToolExecutionResult } from '@/shared/types';
import { api, sse } from '@/main/api';

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

  private currentToolCalls: any[] = [];
  private streamingMessage: any = null;
  private isStreaming: boolean = false;
  private streamingExecutor: StreamingToolExecutor | null = null;
  private contentBlocks: Map<number, any> = new Map();
  private sseListenersSetup: boolean = false;
  private currentThinkingText: string = '';

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

    sse.on('automation', (data: any) => {
      console.log("Automation Stream Data: ", data)
      const eventType = data.type;
      this.handleSSEEvent(eventType, data);
    });
  }

  public emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data
    };
    this.emit('progress', event);
  }

  private handleSSEEvent(eventType: string, data: any): void {
    switch (eventType) {
      case 'automation_start':
      case 'continuation_start':
        this.handleStreamStart(data);
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

      case 'tool_input_delta':
        this.handleToolInputDelta(data);
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
        this.handleMessageStop(data);
        break;

      case 'stream_complete':
        this.handleStreamComplete(data);
        break;

      case 'stream_error':
        this.handleStreamError(data);
        break;

      default:
        console.warn(`⚠️ [StateManager] Unknown event type: ${eventType}`);
    }
  }

  private handleStreamStart(data: any): void {
    console.log('🚀 [StateManager] Stream started');
    this.resetStreamBuffers();
    this.isStreaming = true;
    
    // Initialize streaming executor
    this.streamingExecutor = new StreamingToolExecutor(this.executor);
    
    // Forward executor events to progress
    this.streamingExecutor.on('step_start', (stepData: any) => {
      this.emitProgress('step_start', stepData);
    });
    
    this.streamingExecutor.on('step_complete', (stepData: any) => {
      this.addExecutedStep(stepData.executedStep);
      this.emitProgress('step_complete', stepData);
    });
    
    this.streamingExecutor.on('step_error', (stepData: any) => {
      this.addExecutedStep(stepData.executedStep);
      this.emitProgress('step_error', stepData);
    });
  }

  private handleMessageStart(data: any): void {
    console.log('📨 [StateManager] Message started:', data.message_id);
    this.streamingMessage = {
      id: data.message_id,
      model: data.model,
      content: [],
      role: 'assistant'
    };
  }

  private handleContentBlockStart(data: any): void {
    const { index, block_type } = data;
    console.log(`📦 [StateManager] Content block ${index} started: ${block_type}`);
    
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
        message: this.currentThinkingText
      });
    }
  }

  private handleToolUseStart(data: any): void {
    const { index, tool_use_id, tool_name } = data;
    console.log(`🔧 [StateManager] Tool use started: ${tool_name} (${tool_use_id})`);
    
    this.contentBlocks.set(index, {
      type: 'tool_use',
      id: tool_use_id,
      name: tool_name,
      input: {}
    });
    
    if (this.streamingExecutor) {
      this.streamingExecutor.handleToolStart({ index, tool_use_id, tool_name });
    }
  }

  private handleToolInputDelta(data: any): void {
    const { index, partial_json } = data;
    
    if (this.streamingExecutor) {
      this.streamingExecutor.handleToolInputDelta({ index, partial_json });
    }
  }

  private handleToolUseComplete(data: any): void {
    const { index, tool_use_id, tool_name, input } = data;
    console.log(`✅ [StateManager] Tool use complete: ${tool_name}`);
    
    // Update content block with complete input
    const block = this.contentBlocks.get(index);
    if (block && block.type === 'tool_use') {
      block.input = input;
    }
    
    // Trigger execution in streaming executor
    if (this.streamingExecutor) {
      this.streamingExecutor.handleToolComplete({ index, tool_use_id, tool_name, input });
    }
  }

  private handleContentBlockStop(data: any): void {
    const { index } = data;
    console.log(`📦 [StateManager] Content block ${index} stopped`);
  }

  private handleMessageDelta(data: any): void {
    console.log('📨 [StateManager] Message delta:', data.stop_reason);
  }

  private handleMessageStop(data: any): void {
    console.log('📨 [StateManager] Message stopped');
  }

  private handleStreamComplete(data: any): void {
    console.log('🏁 [StateManager] Stream complete');
    
    // Build final message from content blocks
    if (this.streamingMessage) {
      this.streamingMessage.content = Array.from(this.contentBlocks.values());
      
      // Store the message from the stream data if available
      if (data.message) {
        this.streamingMessage = data.message;
      }
    }
    
    // Notify streaming executor that stream is complete
    if (this.streamingExecutor) {
      this.streamingExecutor.handleStreamComplete(data);
    }
    
    this.isStreaming = false;
  }

  private handleStreamError(data: any): void {
    console.error('❌ [StateManager] Stream error:', data.error);
    this.isStreaming = false;
    
    this.emitProgress('automation_error', {
      error: data.error
    });
  }

  private resetStreamBuffers(): void {
    this.currentToolCalls = [];
    this.streamingMessage = null;
  }

  public async generateInitialPlanStream(): Promise<void> {
    this.resetStreamBuffers();
    this.contentBlocks.clear();

    this.addMessage({
      role: 'user',
      content: this.user_goal
    });
    this.emitProgress('thinking', {
      message: 'Creating automation plan...'
    })

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
    console.log(`🚀 [StateManager] Streaming session: ${this.session_id}`);

    await this.waitForStreamComplete();

    if (this.streamingExecutor) {
      console.log('⏳ [StateManager] Waiting for tool execution to complete...');
      await this.streamingExecutor.waitForCompletion();
    }

    if (this.streamingMessage) {
      const plan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.current_plan = plan;
      
      this.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      console.log(`📋 [StateManager] Plan generated: ${plan.planType}, ${plan.steps.length} steps`);
    } else {
      throw new Error('Stream completed but no message received');
    }
  }

  private async waitForStreamComplete(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stream timeout'));
      }, 120000);

      const checkComplete = () => {
        if (this.streamingMessage) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };

      checkComplete();
    });
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

  public async executePlanWithRecoveryStream(): Promise<PlanExecutionResult> {
    if (!this.current_plan) {
      return { success: false, isComplete: true, error: 'No plan to execute. Please Try Again' };
    }

    
    if (this.executed_steps.length >= MAX_AUTOMATION_STEPS) {
      return { 
        success: false, 
        isComplete: true, 
        error: 'Maximum execution steps limit reached. Please restart another automation.'
      };
    }

    const failedStep = this.executed_steps.find(step => !step.success);
    if (failedStep) {
      console.log(`❌ [StateManager] Step ${failedStep.stepNumber} failed, initiating recovery`);
      const recoveryResult = await this.handleErrorStream(failedStep);
      return recoveryResult;
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
      return await this.intermediatePlanHandler.handleContextExtractionStream();
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
      
      return await this.intermediatePlanHandler.handleRecoveryPlanCompletionStream();
    }

    if (this.current_plan.planType === 'intermediate') {
      this.completePhase();
      return await this.intermediatePlanHandler.handleIntermediatePlanCompletionStream();
    }

    return { success: true, isComplete: true };
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

  public async handleErrorStream(
    failedStep: ExecutedStep
  ): Promise<PlanExecutionResult> {
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

    this.resetStreamBuffers();
    this.contentBlocks.clear();

    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.getOptimizedMessages(),
      this.getCachedContext()
    );

    await this.waitForStreamComplete();

    if (this.streamingExecutor) {
      await this.streamingExecutor.waitForCompletion();
    }

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
      isComplete: false,
    };
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
      successfullyExecutedSteps: this.executed_steps.filter(s => s.success).length,
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

  public getStreamingMessage() {
    return this.streamingMessage
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
