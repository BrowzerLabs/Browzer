import { AutomationClient } from '../clients/AutomationClient';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { MessageBuilder } from '../builders/MessageBuilder';
import { AutomationPlanParser } from '../parsers/AutomationPlanParser';
import { AutomationStateManager } from './AutomationStateManager';
import { UsageTracker } from '../utils/UsageTracker';
import { PlanExecutionResult } from './types';
import { ToolExecutionResult, SystemPromptType } from '@/shared/types';

/**
 * ErrorRecoveryHandler - Handles error recovery during automation
 * 
 * Responsibilities:
 * - Build error recovery prompts
 * - Request recovery plan from Claude (via AutomationClient)
 * - Parse and validate recovery plan
 * - Update state for recovery mode
 * 
 * This module centralizes error recovery logic for:
 * - Consistent error handling
 * - Easy debugging of recovery issues
 * - Proper recovery flow
 * - State management during recovery
 */
export class ErrorRecoveryHandler {
  private automationClient: AutomationClient;
  private stateManager: AutomationStateManager;

  constructor(
    automationClient: AutomationClient,
    stateManager: AutomationStateManager
  ) {
    this.automationClient = automationClient;
    this.stateManager = stateManager;
  }

  /**
   * Handle error recovery
   * Builds error prompt, gets recovery plan from Claude, updates state
   */
  public async handleError(
    failedStep: any,
    result: ToolExecutionResult
  ): Promise<PlanExecutionResult> {
    const currentPlan = this.stateManager.getCurrentPlan();

    if (!currentPlan) {
      return {
        success: false,
        isComplete: true,
        error: 'No plan available for recovery'
      };
    }

    // Build tool results for all steps (including failed one)
    const toolResults = MessageBuilder.buildToolResultsForErrorRecovery(
      currentPlan,
      this.stateManager.getExecutedSteps()
    );

    // Build error recovery prompt
    const errorPrompt = SystemPromptBuilder.buildErrorRecoveryPrompt({
      errorInfo: {
        message: result.error?.message || 'Unknown error',
        code: result.error?.code,
        details: result.error?.details,
        suggestions: result.error?.details?.suggestions
      },
      userGoal: this.stateManager.getUserGoal(),
      failedStep: {
        stepNumber: this.stateManager.getExecutedSteps().length,
        toolName: failedStep.toolName,
        params: failedStep.input
      },
      executedSteps: this.stateManager.getExecutedSteps(),
      currentUrl: result.url
    });

    // Add user message with tool results AND error prompt
    this.stateManager.addMessage(
      MessageBuilder.buildUserMessageWithToolResultsAndText(toolResults, errorPrompt)
    );

    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    // Add assistant response to conversation
    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    this.stateManager.compressMessages()

    const newPlan = AutomationPlanParser.parsePlan(response);

    this.stateManager.setCurrentPlan(newPlan);
    this.stateManager.enterRecoveryMode();

    const usage = UsageTracker.extractUsageFromResponse(response);

    return {
      success: false,
      isComplete: false,
      usage
    };
  }
}
