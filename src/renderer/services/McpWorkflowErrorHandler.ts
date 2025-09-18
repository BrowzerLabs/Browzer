import { McpExecutionResult } from './McpExecutor';
import { ExecutionPlan, ExecutionStep } from './McpWorkflowPlanner';
import { McpContextManager, ContextState } from './McpContextManager';
import { McpErrorHandler } from './McpErrorHandler';

export interface WorkflowRecoveryStrategy {
  strategyType: 'retry' | 'skip' | 'alternative' | 'rollback' | 'user_input';
  description: string;
  canAttempt: boolean;
  estimatedSuccessRate: number;
}

export interface WorkflowFailureInfo {
  failedStep: ExecutionStep;
  failureReason: string;
  completedSteps: ExecutionStep[];
  remainingSteps: ExecutionStep[];
  contextState: ContextState;
}

export interface WorkflowRecoveryResult {
  recovered: boolean;
  strategy: WorkflowRecoveryStrategy;
  newResults: McpExecutionResult[];
  modifiedPlan?: ExecutionPlan;
  userMessage?: string;
}

/**
 * Phase 2 Week 5: Multi-Tool MCP Workflow Error Handler
 * Handles failures in complex multi-step workflows with intelligent recovery
 */
export class McpWorkflowErrorHandler {

  constructor(
    private contextManager: McpContextManager,
    private mcpErrorHandler: McpErrorHandler
  ) {}

  /**
   * Analyze workflow failure and determine recovery options
   */
  analyzeWorkflowFailure(
    plan: ExecutionPlan,
    failedStep: ExecutionStep,
    error: string,
    completedResults: McpExecutionResult[]
  ): WorkflowFailureInfo {
    console.log(`[McpWorkflowErrorHandler] Analyzing failure in step: ${failedStep.stepId}`);

    const completedSteps = plan.executionSteps.filter(step =>
      completedResults.some(result => result.stepId === step.stepId && result.success)
    );

    const remainingSteps = plan.executionSteps.filter(step =>
      step !== failedStep && !completedSteps.includes(step)
    );

    const contextState = this.contextManager.getContext(plan.workflowId);

    return {
      failedStep,
      failureReason: error,
      completedSteps,
      remainingSteps,
      contextState: contextState!
    };
  }

  /**
   * Generate recovery strategies for workflow failure
   */
  generateRecoveryStrategies(failureInfo: WorkflowFailureInfo): WorkflowRecoveryStrategy[] {
    const strategies: WorkflowRecoveryStrategy[] = [];
    const { failedStep, failureReason, completedSteps, remainingSteps } = failureInfo;

    // Strategy 1: Simple Retry (if failure seems transient)
    if (this.isTransientFailure(failureReason)) {
      strategies.push({
        strategyType: 'retry',
        description: `Retry ${failedStep.description} (transient failure detected)`,
        canAttempt: true,
        estimatedSuccessRate: 0.7
      });
    }

    // Strategy 2: Skip Non-Critical Step
    if (!failedStep.validationRequired && remainingSteps.length > 0) {
      strategies.push({
        strategyType: 'skip',
        description: `Skip ${failedStep.description} and continue with remaining steps`,
        canAttempt: true,
        estimatedSuccessRate: 0.8
      });
    }

    // Strategy 3: Alternative Tool (if available)
    if (failedStep.toolMatches && failedStep.toolMatches.length > 1) {
      strategies.push({
        strategyType: 'alternative',
        description: `Use alternative tool: ${failedStep.toolMatches[1]?.toolName}`,
        canAttempt: true,
        estimatedSuccessRate: 0.6
      });
    }

    // Strategy 4: Partial Rollback (for critical failures)
    if (failedStep.validationRequired && completedSteps.length > 0) {
      strategies.push({
        strategyType: 'rollback',
        description: `Rollback to before step: ${failedStep.stepId}`,
        canAttempt: this.canRollbackStep(failedStep, completedSteps),
        estimatedSuccessRate: 0.5
      });
    }

    // Strategy 5: User Input (for ambiguous failures)
    if (this.requiresUserDecision(failureReason, failedStep)) {
      strategies.push({
        strategyType: 'user_input',
        description: `Request user guidance for: ${failedStep.description}`,
        canAttempt: true,
        estimatedSuccessRate: 0.9
      });
    }

    // Sort by estimated success rate
    return strategies.sort((a, b) => b.estimatedSuccessRate - a.estimatedSuccessRate);
  }

  /**
   * Attempt workflow recovery using the best available strategy
   */
  async attemptWorkflowRecovery(
    failureInfo: WorkflowFailureInfo,
    plan: ExecutionPlan,
    executeStep: (step: ExecutionStep) => Promise<McpExecutionResult>
  ): Promise<WorkflowRecoveryResult> {
    console.log('[McpWorkflowErrorHandler] Attempting workflow recovery');

    const strategies = this.generateRecoveryStrategies(failureInfo);

    if (strategies.length === 0) {
      console.log('[McpWorkflowErrorHandler] No recovery strategies available');
      return {
        recovered: false,
        strategy: {
          strategyType: 'retry',
          description: 'No recovery options available',
          canAttempt: false,
          estimatedSuccessRate: 0
        },
        newResults: [],
        userMessage: `Workflow failed at step: ${failureInfo.failedStep.description}. No recovery options available.`
      };
    }

    // Try the best strategy first
    const bestStrategy = strategies[0];
    console.log(`[McpWorkflowErrorHandler] Attempting recovery strategy: ${bestStrategy.strategyType}`);

    switch (bestStrategy.strategyType) {
      case 'retry':
        return await this.executeRetryStrategy(failureInfo, executeStep);

      case 'skip':
        return await this.executeSkipStrategy(failureInfo, plan);

      case 'alternative':
        return await this.executeAlternativeStrategy(failureInfo, executeStep);

      case 'rollback':
        return await this.executeRollbackStrategy(failureInfo, plan);

      case 'user_input':
        return this.executeUserInputStrategy(failureInfo, bestStrategy);

      default:
        return {
          recovered: false,
          strategy: bestStrategy,
          newResults: [],
          userMessage: `Unknown recovery strategy: ${bestStrategy.strategyType}`
        };
    }
  }

  /**
   * Execute retry recovery strategy
   */
  private async executeRetryStrategy(
    failureInfo: WorkflowFailureInfo,
    executeStep: (step: ExecutionStep) => Promise<McpExecutionResult>
  ): Promise<WorkflowRecoveryResult> {
    console.log(`[McpWorkflowErrorHandler] Retrying step: ${failureInfo.failedStep.stepId}`);

    try {
      // Add small delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));

      const retryResult = await executeStep(failureInfo.failedStep);

      return {
        recovered: retryResult.success,
        strategy: {
          strategyType: 'retry',
          description: `Retry ${failureInfo.failedStep.description}`,
          canAttempt: true,
          estimatedSuccessRate: 0.7
        },
        newResults: [retryResult],
        userMessage: retryResult.success ?
          'Step retry successful' :
          `Step retry failed: ${retryResult.error}`
      };
    } catch (error) {
      return {
        recovered: false,
        strategy: {
          strategyType: 'retry',
          description: `Retry ${failureInfo.failedStep.description}`,
          canAttempt: false,
          estimatedSuccessRate: 0
        },
        newResults: [],
        userMessage: `Retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute skip recovery strategy
   */
  private async executeSkipStrategy(
    failureInfo: WorkflowFailureInfo,
    plan: ExecutionPlan
  ): Promise<WorkflowRecoveryResult> {
    console.log(`[McpWorkflowErrorHandler] Skipping step: ${failureInfo.failedStep.stepId}`);

    // Mark step as skipped in context
    this.contextManager.storeStepResult(
      plan.workflowId,
      failureInfo.failedStep.stepId,
      { skipped: true, reason: failureInfo.failureReason },
      'step_skipped'
    );

    return {
      recovered: true,
      strategy: {
        strategyType: 'skip',
        description: `Skip ${failureInfo.failedStep.description}`,
        canAttempt: true,
        estimatedSuccessRate: 0.8
      },
      newResults: [],
      userMessage: `Skipped non-critical step: ${failureInfo.failedStep.description}`
    };
  }

  /**
   * Execute alternative tool recovery strategy
   */
  private async executeAlternativeStrategy(
    failureInfo: WorkflowFailureInfo,
    executeStep: (step: ExecutionStep) => Promise<McpExecutionResult>
  ): Promise<WorkflowRecoveryResult> {
    console.log(`[McpWorkflowErrorHandler] Using alternative tool for step: ${failureInfo.failedStep.stepId}`);

    if (!failureInfo.failedStep.toolMatches || failureInfo.failedStep.toolMatches.length < 2) {
      return {
        recovered: false,
        strategy: {
          strategyType: 'alternative',
          description: 'No alternative tools available',
          canAttempt: false,
          estimatedSuccessRate: 0
        },
        newResults: [],
        userMessage: 'No alternative tools available for this step'
      };
    }

    // Use second-best tool
    const alternativeStep = {
      ...failureInfo.failedStep,
      selectedTool: failureInfo.failedStep.toolMatches[1].toolName
    };

    try {
      const alternativeResult = await executeStep(alternativeStep);

      return {
        recovered: alternativeResult.success,
        strategy: {
          strategyType: 'alternative',
          description: `Use ${alternativeStep.selectedTool}`,
          canAttempt: true,
          estimatedSuccessRate: 0.6
        },
        newResults: [alternativeResult],
        userMessage: alternativeResult.success ?
          `Successfully used alternative tool: ${alternativeStep.selectedTool}` :
          `Alternative tool also failed: ${alternativeResult.error}`
      };
    } catch (error) {
      return {
        recovered: false,
        strategy: {
          strategyType: 'alternative',
          description: `Use ${alternativeStep.selectedTool}`,
          canAttempt: false,
          estimatedSuccessRate: 0
        },
        newResults: [],
        userMessage: `Alternative tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute rollback recovery strategy
   */
  private async executeRollbackStrategy(
    failureInfo: WorkflowFailureInfo,
    plan: ExecutionPlan
  ): Promise<WorkflowRecoveryResult> {
    console.log(`[McpWorkflowErrorHandler] Rolling back workflow before step: ${failureInfo.failedStep.stepId}`);

    // This would involve undoing previous steps if possible
    // For now, we'll mark it as a manual rollback requirement
    return {
      recovered: false,
      strategy: {
        strategyType: 'rollback',
        description: `Rollback required before ${failureInfo.failedStep.description}`,
        canAttempt: false,
        estimatedSuccessRate: 0.5
      },
      newResults: [],
      userMessage: `Critical step failed. Manual intervention may be required to rollback changes from: ${failureInfo.completedSteps.map(s => s.description).join(', ')}`
    };
  }

  /**
   * Execute user input recovery strategy
   */
  private executeUserInputStrategy(
    failureInfo: WorkflowFailureInfo,
    strategy: WorkflowRecoveryStrategy
  ): WorkflowRecoveryResult {
    console.log(`[McpWorkflowErrorHandler] Requesting user input for step: ${failureInfo.failedStep.stepId}`);

    return {
      recovered: false,
      strategy: strategy,
      newResults: [],
      userMessage: `Step "${failureInfo.failedStep.description}" failed: ${failureInfo.failureReason}. Please provide guidance on how to proceed.`
    };
  }

  /**
   * Check if failure appears to be transient
   */
  private isTransientFailure(error: string): boolean {
    const transientIndicators = [
      'timeout', 'network', 'connection', 'temporarily',
      'rate limit', 'server error', '503', '502', '429'
    ];

    return transientIndicators.some(indicator =>
      error.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if rollback is possible for the given step
   */
  private canRollbackStep(failedStep: ExecutionStep, completedSteps: ExecutionStep[]): boolean {
    // For now, assume rollback is possible for non-destructive operations
    const destructiveActions = ['delete', 'remove', 'send'];

    return !completedSteps.some(step =>
      destructiveActions.some(action => step.description.toLowerCase().includes(action))
    );
  }

  /**
   * Check if failure requires user decision
   */
  private requiresUserDecision(error: string, step: ExecutionStep): boolean {
    const userDecisionIndicators = [
      'ambiguous', 'multiple matches', 'unclear', 'permission',
      'authentication', 'authorization', 'access denied'
    ];

    return userDecisionIndicators.some(indicator =>
      error.toLowerCase().includes(indicator)
    ) || step.validationRequired;
  }
}