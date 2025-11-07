/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation/BrowserAutomationExecutor';
import { AutomationStateManager } from './AutomationStateManager';
import { PlanExecutionResult, ExecutedStep } from './types';
import { ParsedAutomationPlan, AutomationStep } from '../parsers/AutomationPlanParser';
import { MAX_AUTOMATION_STEPS } from '@/shared/constants/limits';

/**
 * PlanExecutor - Executes automation plans step-by-step
 * 
 * Responsibilities:
 * - Execute plan steps sequentially
 * - Track execution progress
 * - Handle step failures
 * - Detect special tools (extract_context, take_snapshot)
 * - Return execution results
 * - Emit real-time progress events
 * 
 * This module centralizes plan execution logic for:
 * - Consistent execution flow
 * - Easy debugging of execution issues
 * - Proper error handling
 * - Step tracking
 */
export class PlanExecutor {
  private static readonly MAX_STEPS = MAX_AUTOMATION_STEPS;
  private executor: BrowserAutomationExecutor;
  private stateManager: AutomationStateManager;
  private eventEmitter?: EventEmitter;

  constructor(
    executor: BrowserAutomationExecutor,
    stateManager: AutomationStateManager,
    eventEmitter: EventEmitter
  ) {
    this.executor = executor;
    this.stateManager = stateManager;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Execute a single step from the plan
   * Returns execution result and whether to continue
   */
  public async executeStep(
    step: AutomationStep,
    stepNumber: number,
    totalSteps: number
  ): Promise<{
    success: boolean;
    shouldContinue: boolean;
    isAnalysisTool: boolean;
    result?: any;
    error?: string;
    maxStepsReached?: boolean;
  }> {
    // Check if max steps limit reached
    const totalExecutedSteps = this.stateManager.getTotalStepsExecuted();
    if (totalExecutedSteps >= PlanExecutor.MAX_STEPS) {
      console.warn(`⚠️ Max steps limit (${PlanExecutor.MAX_STEPS}) reached, stopping automation`);
      
      this.eventEmitter?.emit('progress', {
        type: 'automation_complete',
        data: {
          success: false,
          reason: 'max_steps_reached',
          message: `Maximum ${PlanExecutor.MAX_STEPS} execution steps reached`,
          totalSteps: totalExecutedSteps
        },
        timestamp: Date.now()
      });
      
      return {
        success: false,
        shouldContinue: false,
        isAnalysisTool: false,
        maxStepsReached: true,
        error: `Maximum execution steps limit (${PlanExecutor.MAX_STEPS}) reached`
      };
    }

    // Emit step start event
    this.eventEmitter.emit('progress', {
      type: 'step_start',
      data: {
        stepNumber,
        totalSteps,
        toolName: step.toolName,
        toolUseId: step.toolUseId,
        params: step.input,
        status: 'running'
      },
      timestamp: Date.now()
    });

    try {
      const startTime = Date.now();
      
      const result = await this.executor.executeTool(step.toolName, step.input);
      const duration = Date.now() - startTime;

      const isAnalysisTool = step.toolName === 'extract_context' || step.toolName === 'take_snapshot';

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: step.toolName,
        success: result.success,
        result,
        error: result.success ? undefined : (result.error?.message || 'Unknown error')
      };

      this.stateManager.addExecutedStep(executedStep);

      if (!result.success || result.error) {
        console.error(`   ❌ Step ${stepNumber} failed: ${result.error?.message || 'Unknown error'}`);
        
        this.eventEmitter.emit('progress', {
          type: 'step_error',
          data: {
            stepNumber,
            totalSteps,
            toolName: step.toolName,
            toolUseId: step.toolUseId,
            error: result.error,
            duration,
            status: 'error'
          },
          timestamp: Date.now()
        });
        
        return {
          success: false,
          shouldContinue: false,
          isAnalysisTool: false,
          result,
          error: result.error?.message || 'Tool execution failed'
        };
      }

      this.eventEmitter.emit('progress', {
        type: 'step_complete',
        data: {
          stepNumber,
          totalSteps,
          toolName: step.toolName,
          toolUseId: step.toolUseId,
          result: result,
          duration,
          status: 'success'
        },
        timestamp: Date.now()
      });
      
      return {
        success: true,
        shouldContinue: true,
        isAnalysisTool,
        result
      };

    } catch (error: any) {
      console.error(`   ❌ Step ${stepNumber} failed:`, error.message);

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: step.toolName,
        success: false,
        error: error.message
      };

      this.stateManager.addExecutedStep(executedStep);

      return {
        success: false,
        shouldContinue: false,
        isAnalysisTool: false,
        error: error.message
      };
    }
  }

  /**
   * Execute all steps in a plan
   * Returns when:
   * - All steps complete successfully
   * - A step fails (triggers error recovery)
   * - An analysis tool is encountered AS THE LAST STEP (triggers continuation)
   */
  public async executePlan(plan: ParsedAutomationPlan): Promise<PlanExecutionResult> {
    const totalSteps = plan.steps.length;
    
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const stepNumber = this.stateManager.getExecutedSteps().length + 1;
      const isLastStep = i === plan.steps.length - 1;

      const stepResult = await this.executeStep(step, stepNumber, totalSteps);

      if (!stepResult.success) {
        return {
          success: false,
          isComplete: false,
          error: stepResult.error
        };
      }

      // Handle analysis tools (extract_context) ONLY if it's the last step
      // If there are more steps after it, continue executing them
      if (stepResult.isAnalysisTool && isLastStep) {
        console.log(`✅ [PlanExecutor] Analysis tool executed as last step - returning to Claude`);
        return {
          success: true,
          isComplete: false // Not complete, need to continue conversation
        };
      }

      // If analysis tool is NOT the last step, continue executing remaining steps
      if (stepResult.isAnalysisTool && !isLastStep) {
        console.log(`   ℹ️  Analysis tool executed (${step.toolName}) - continuing with remaining steps`);
      }
    }

    // All steps completed successfully
    return {
      success: true,
      isComplete: true
    };
  }

  /**
   * Check if plan ends with analysis tool
   */
  public static endsWithAnalysisTool(plan: ParsedAutomationPlan): boolean {
    if (plan.steps.length === 0) return false;
    const lastStep = plan.steps[plan.steps.length - 1];
    return lastStep.toolName === 'extract_context' || lastStep.toolName === 'take_snapshot';
  }
}
