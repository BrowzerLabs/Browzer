import { ExecutedStep, CompletedPlan, AutomationStatus, ParsedAutomationPlan } from './types';
import { RecordingSession } from '@/shared/types/recording';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { SessionManager } from '../session/SessionManager';
import { ContextWindowManager } from '../utils/ContextWindowManager';
import Anthropic from '@anthropic-ai/sdk';
import { MessageCompressionManager } from '../utils/MessageCompressionManager';

export class AutomationStateManager {
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
  
  private session_id: string;

  constructor(
    userGoal: string,
    recordedSession: RecordingSession,
    sessionManager: SessionManager,
  ) {
    this.user_goal = userGoal;
    this.cached_context = SystemPromptBuilder.formatRecordedSession(recordedSession);
    this.session_manager = sessionManager;

    const session = this.session_manager.createSession({
      userGoal,
      recordingId: recordedSession?.id || 'unknown',
      cachedContext: this.cached_context
    });
    this.session_id = session.id;
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

  public getContextWindowStats() {
    return ContextWindowManager.getStats(this.messages);
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
