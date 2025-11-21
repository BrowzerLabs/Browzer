import { AutomationState, ExecutedStep, CompletedPlan, AutomationStatus } from './types';
import { ParsedAutomationPlan } from '../parsers/AutomationPlanParser';
import { RecordingSession } from '@/shared/types/recording';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { SessionManager } from '../session/SessionManager';
import { ContextWindowManager } from '../utils/ContextWindowManager';
import Anthropic from '@anthropic-ai/sdk';
import { MessageCompressionManager } from '../utils/MessageCompressionManager';

/**
 * AutomationStateManager - State manager with persistent storage
 * 
 * Extends the original AutomationStateManager with:
 * - Persistent session storage via SessionManager
 * - Automatic conversation history saving
 * - Context optimization and caching
 * - Session resume capability
 * - Manage conversation history
 * - Handle phase transitions
 * - Provide state queries and updates
 * 
 * This manager can work in two modes:
 * 1. New session: Creates a new session and tracks all state
 * 2. Resume session: Loads existing session and continues from where it left off
 */
export class AutomationStateManager {
  private state: AutomationState;
  private sessionManager: SessionManager;
  private sessionId: string;

  constructor(
    userGoal: string,
    recordedSession: RecordingSession,
    maxRecoveryAttempts: number,
    sessionManager: SessionManager,
    existingSessionId?: string
  ) {
    this.sessionManager = sessionManager;

    if (existingSessionId) {
      // Resume existing session
      this.sessionId = existingSessionId;
      this.state = this.loadExistingSession(existingSessionId);
    } else {
      // Create new session
      this.state = this.initializeState(userGoal, recordedSession, maxRecoveryAttempts);
      
      const session = this.sessionManager.createSession({
        userGoal,
        recordingId: recordedSession?.id || 'unknown',
        cachedContext: this.state.cachedContext
      });
      this.sessionId = session.id;
    }
  }

  /**
   * Initialize automation state for new session
   */
  private initializeState(
    userGoal: string,
    recordedSession: RecordingSession | undefined,
    maxRecoveryAttempts: number
  ): AutomationState {
    return {
      userGoal,
      recordedSession,
      cachedContext: SystemPromptBuilder.formatRecordedSession(recordedSession),
      messages: [],
      executedSteps: [],
      phaseNumber: 1,
      completedPlans: [],
      isInRecovery: false,
      recoveryAttempts: 0,
      maxRecoveryAttempts,
      status: AutomationStatus.RUNNING,
      finalSuccess: false
    };
  }

  /**
   * Load existing session from storage
   */
  private loadExistingSession(sessionId: string): AutomationState {
    const sessionData = this.sessionManager.loadSession(sessionId);
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { session, messages, steps } = sessionData;

    // Reconstruct state from stored data
    const state: AutomationState = {
      userGoal: session.userGoal,
      recordedSession: undefined, // Would need to load from RecordingStore
      cachedContext: sessionData.cache.cachedContext,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      executedSteps: steps.map(step => ({
        stepNumber: step.stepNumber,
        toolName: step.toolName,
        success: step.success,
        result: step.result,
        error: step.error
      })),
      phaseNumber: session.metadata.phaseNumber,
      completedPlans: [],
      isInRecovery: session.metadata.isInRecovery,
      recoveryAttempts: session.metadata.recoveryAttempts,
      maxRecoveryAttempts: 10, // Default
      status: session.status,
      finalSuccess: session.metadata.finalSuccess || false,
      finalError: session.metadata.finalError
    };

    return state;
  }

  /**
   * Get session ID
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get current state (read-only)
   */
  public getState(): Readonly<AutomationState> {
    return this.state;
  }

  /**
   * Set current plan
   */
  public setCurrentPlan(plan: ParsedAutomationPlan): void {
    this.state.currentPlan = plan;
  }

  /**
   * Add message to conversation history
   * Automatically persists to database if enabled
   */
  public addMessage(message: Anthropic.MessageParam): void {
    this.state.messages.push(message);

    this.sessionManager.addMessage({
        sessionId: this.sessionId,
        role: message.role,
        content: message.content
      });
  }

  /**
   * Add executed step
   * Automatically persists to database if enabled
   */
  public addExecutedStep(step: ExecutedStep): void {
    this.state.executedSteps.push(step);

    this.sessionManager.addStep({
      sessionId: this.sessionId,
      stepNumber: step.stepNumber,
      toolName: step.toolName,
      result: this.isAnalysisTool(step.toolName) ? `${step.toolName} executed successfully` : step.result,
      success: step.success,
      error: step.error
    });

    // Update step count in metadata
    this.sessionManager.updateSession(this.sessionId, {
      metadata: {
        totalStepsExecuted: this.state.executedSteps.length
      }
    });
  }

  /**
   * Mark as in recovery mode
   */
  public enterRecoveryMode(): void {
    this.state.isInRecovery = true;
    this.state.recoveryAttempts++;

    this.sessionManager.updateSession(this.sessionId, {
      metadata: {
        isInRecovery: true,
        recoveryAttempts: this.state.recoveryAttempts
      }
    });
  }

  /**
   * Exit recovery mode
   */
  public exitRecoveryMode(): void {
    this.state.isInRecovery = false;

    this.sessionManager.updateSession(this.sessionId, {
      metadata: {
        isInRecovery: false
      }
    });
  }

  /**
   * Complete current phase and move to next
   */
  public completePhase(): void {
    if (this.state.currentPlan) {
      this.state.completedPlans.push({
        phaseNumber: this.state.phaseNumber,
        plan: this.state.currentPlan,
        stepsExecuted: this.state.currentPlan.totalSteps
      });
      this.state.phaseNumber++;

      this.sessionManager.updateSession(this.sessionId, {
        metadata: {
          phaseNumber: this.state.phaseNumber
        }
      });
    }
  }

  /**
   * Mark automation as complete
   */
  public markComplete(success: boolean, error?: string): void {
    this.state.status = AutomationStatus.COMPLETED;
    this.state.finalSuccess = success;
    this.state.finalError = error;

    this.sessionManager.completeSession(this.sessionId, success, error);
  }

  /**
   * Pause session for later resume
   */
  public pauseSession(): void {
    this.sessionManager.pauseSession(this.sessionId);
  }

  /**
   * Check if max recovery attempts reached
   */
  public isMaxRecoveryAttemptsReached(): boolean {
    return this.state.recoveryAttempts > this.state.maxRecoveryAttempts;
  }

  /**
   * Get conversation messages
   */
  public getMessages(): Anthropic.MessageParam[] {
    return this.state.messages;
  }

  /**
   * Get optimized messages for API call
   * 
   * This applies context window optimization if messages exceed limits.
   * Uses hybrid sliding window + summarization strategy.
   * 
   * Call this instead of getMessages() when sending to Claude API.
   */
  public getOptimizedMessages(): Anthropic.MessageParam[] {
    const result = ContextWindowManager.optimizeMessages(
      this.state.messages,
      this.state.userGoal
    );

    // Update in-memory state with optimized messages if compression was applied
    if (result.compressionApplied) {
      this.state.messages = result.optimizedMessages;
    }

    return result.optimizedMessages;
  }

  /**
   * Get context window statistics
   */
  public getContextWindowStats() {
    return ContextWindowManager.getStats(this.state.messages);
  }

  /**
   * Get cached context (recorded session)
   */
  public getCachedContext(): string | undefined {
    return this.state.cachedContext;
  }

  /**
   * Get current plan
   */
  public getCurrentPlan(): ParsedAutomationPlan | undefined {
    return this.state.currentPlan;
  }

  /**
   * Get executed steps
   */
  public getExecutedSteps(): ExecutedStep[] {
    return this.state.executedSteps;
  }

  /**
   * Get user goal
   */
  public getUserGoal(): string {
    return this.state.userGoal;
  }

  /**
   * Check if in recovery mode
   */
  public isInRecovery(): boolean {
    return this.state.isInRecovery;
  }

  /**
   * Check if complete
   */
  public isComplete(): boolean {
    return this.state.status == AutomationStatus.COMPLETED
  }

  /**
   * Get recovery attempts count
   */
  public getRecoveryAttempts(): number {
    return this.state.recoveryAttempts;
  }

  /**
   * Get total steps executed
   */
  public getTotalStepsExecuted(): number {
    return this.state.executedSteps.length;
  }

  /**
   * Get final result
   */
  public getFinalResult(): { success: boolean; error?: string } {
    return {
      success: this.state.finalSuccess,
      error: this.state.finalError
    };
  }

  /**
   * Get completed plans
   */
  public getCompletedPlans(): CompletedPlan[] {
    return this.state.completedPlans;
  }

  /**
   * Get last completed plan
   */
  public getLastCompletedPlan(): CompletedPlan | undefined {
    return this.state.completedPlans[this.state.completedPlans.length - 1];
  }

  /**
   * Update usage statistics
   */
  public updateUsageStats(usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    cost: number;
  }): void {
    this.sessionManager.updateUsageStats(this.sessionId, usage);
  }

  /**
   * Get context statistics
   */
  public getContextStats() {
    return this.sessionManager.getContextStats(this.sessionId);
  }

  /**
   * Get session manager instance
   */
  public getSessionManager(): SessionManager | undefined {
    return this.sessionManager;
  }

  private isAnalysisTool(toolName: string): boolean {
    return toolName === 'extract_context' || toolName === 'take_snapshot';
  }

  /**
   * Compress messages to optimize context window
   * 
   * Problem:
   * - Large payloads accumulate in message history (analysis results, errors, etc.)
   * - Context window explodes exponentially, hitting 200K limit quickly
   * 
   * Solution:
   * - Analysis results: Compress ALL extract_context/take_snapshot results
   * - Error messages: Keep only the LATEST error, compress all older ones
   * - Call this AFTER the model receives new content
   * 
   * This can save 50K-200K+ tokens in long-running automations!
   */
  public compressMessages(): void {
    const result = MessageCompressionManager.compressMessages(this.state.messages);
    
    if (result.compressedCount > 0) {
      this.state.messages = result.compressedMessages;
    }
  }
}
