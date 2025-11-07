/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClaudeClient } from '../clients/ClaudeClient';
import { ToolRegistry } from '../utils/ToolRegistry';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { MessageBuilder } from '../builders/MessageBuilder';
import { AutomationPlanParser } from '../parsers/AutomationPlanParser';
import { AutomationStateManager } from './AutomationStateManager';
import { UsageTracker } from '../utils/UsageTracker';
import { PlanExecutionResult } from './types';

/**
 * IntermediatePlanHandler - Handles intermediate plan continuation
 * 
 * Responsibilities:
 * - Detect intermediate vs final plans
 * - Build continuation prompts
 * - Request next plan from Claude
 * - Handle phase transitions
 * 
 * This module centralizes intermediate plan logic for:
 * - Multi-phase automation support
 * - Context-based decision making
 * - Proper phase tracking
 * - State management across phases
 */
export class IntermediatePlanHandler {
  private claudeClient: ClaudeClient;
  private toolRegistry: ToolRegistry;
  private stateManager: AutomationStateManager;

  constructor(
    claudeClient: ClaudeClient,
    toolRegistry: ToolRegistry,
    stateManager: AutomationStateManager
  ) {
    this.claudeClient = claudeClient;
    this.toolRegistry = toolRegistry;
    this.stateManager = stateManager;
  }

  /**
   * Handle continuation after intermediate plan completion
   */
  public async handleIntermediatePlanCompletion(): Promise<PlanExecutionResult> {
    console.log('🔄 [IntermediatePlan] Continuing after intermediate plan completion...');

    const currentPlan = this.stateManager.getCurrentPlan();
    if (!currentPlan) {
      return {
        success: false,
        isComplete: true,
        error: 'No plan available'
      };
    }


    // Build continuation prompt
    const lastCompletedPlan = this.stateManager.getLastCompletedPlan();
    const continuationPrompt = SystemPromptBuilder.buildIntermediatePlanContinuationPrompt({
      userGoal: this.stateManager.getUserGoal(),
      completedPlan: {
        analysis: lastCompletedPlan?.plan.analysis || '',
        stepsExecuted: lastCompletedPlan?.stepsExecuted || 0
      },
      executedSteps: this.stateManager.getExecutedSteps().map(es => ({
        stepNumber: es.stepNumber,
        toolName: es.toolName,
        success: es.success,
        summary: es.result?.effects?.summary
      })),
      extractedContext: this.getExtractedContextSummary(),
      currentUrl: this.getCurrentUrl()
    });

    // Add user message with continuation prompt only
    this.stateManager.addMessage({
      role: 'user',
      content: continuationPrompt
    });

    // Continue conversation with automation system prompt
    const systemPrompt = SystemPromptBuilder.buildAutomationSystemPrompt();
    const tools = this.toolRegistry.getToolDefinitions();

    const response = await this.claudeClient.continueConversation({
      systemPrompt,
      messages: this.stateManager.getOptimizedMessages(),
      tools,
      cachedContext: this.stateManager.getCachedContext()
    });

    // Add assistant response to conversation
    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    this.stateManager.compressMessages();

    // Parse new plan
    const newPlan = AutomationPlanParser.parsePlan(response);

    // Update current plan
    this.stateManager.setCurrentPlan(newPlan);

    const usage = UsageTracker.extractUsageFromResponse(response);

    return {
      success: false,
      isComplete: false,
      usage
    };
  }

  /**
   * Handle continuation after context extraction (mid-execution)
   */
  public async handleContextExtraction(): Promise<PlanExecutionResult> {
    console.log('🔄 [IntermediatePlan] Continuing after context extraction...');

    // Continue conversation with same system prompt
    const systemPrompt = this.stateManager.getRecoveryAttempts() > 0
      ? SystemPromptBuilder.buildErrorRecoverySystemPrompt()
      : SystemPromptBuilder.buildAutomationSystemPrompt();

    const tools = this.toolRegistry.getToolDefinitions();

    const response = await this.claudeClient.continueConversation({
      systemPrompt,
      messages: this.stateManager.getOptimizedMessages(),
      tools,
      cachedContext: this.stateManager.getCachedContext()
    });

    // Add assistant response to conversation
    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    this.stateManager.compressMessages();

    // Parse new plan
    const newPlan = AutomationPlanParser.parsePlan(response);
    console.log('📋 [IntermediatePlan] Plan after context extraction');

    // Update current plan
    this.stateManager.setCurrentPlan(newPlan);

    const usage = UsageTracker.extractUsageFromResponse(response);

    return {
      success: false,
      isComplete: false,
      usage
    };
  }

  /**
   * Handle continuation after recovery plan completion
   */
  public async handleRecoveryPlanCompletion(): Promise<PlanExecutionResult> {
    console.log('✅ [IntermediatePlan] Recovery plan completed - generating new plan from context');

    const currentPlan = this.stateManager.getCurrentPlan();
    if (!currentPlan) {
      return {
        success: false,
        isComplete: true,
        error: 'No plan available'
      };
    }


    // Continue conversation to get new plan
    const systemPrompt = SystemPromptBuilder.buildErrorRecoverySystemPrompt();
    const tools = this.toolRegistry.getToolDefinitions();

    const response = await this.claudeClient.continueConversation({
      systemPrompt,
      messages: this.stateManager.getOptimizedMessages(),
      tools,
      cachedContext: this.stateManager.getCachedContext()
    });

    // Add assistant response
    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    this.stateManager.compressMessages();

    const newPlan = AutomationPlanParser.parsePlan(response);

    this.stateManager.setCurrentPlan(newPlan);
    this.stateManager.exitRecoveryMode();

    const usage = UsageTracker.extractUsageFromResponse(response);

    return {
      success: false,
      isComplete: false,
      usage
    };
  }

  /**
   * Get extracted context summary from last executed step
   */
  private getExtractedContextSummary(): { url: string; interactiveElements: number; forms: number } | undefined {
    const executedSteps = this.stateManager.getExecutedSteps();
    if (executedSteps.length === 0) return undefined;

    const lastStep = executedSteps[executedSteps.length - 1];
    if (!lastStep.result) return undefined;

    return {
      url: lastStep.result.url,
      interactiveElements: lastStep.result.context?.dom?.stats?.interactiveElements || 0,
      forms: lastStep.result.context?.dom?.forms?.length || 0
    };
  }

  /**
   * Get current URL from last executed step
   */
  private getCurrentUrl(): string {
    const executedSteps = this.stateManager.getExecutedSteps();
    if (executedSteps.length === 0) return '';
    return executedSteps[executedSteps.length - 1]?.result?.url || '';
  }
}
