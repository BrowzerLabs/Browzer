/**
 * Automation Executor - Orchestrates step-by-step execution of automation plans
 * 
 * Features:
 * - Sequential step execution
 * - Retry logic with exponential backoff
 * - Error handling and recovery
 * - Progress tracking
 * - Execution state management
 */

import { BrowserAutomation } from './BrowserAutomation';
import { AutomationStep, AutomationPlan, AutomationResult } from '@/shared/types/automation';

export class AutomationExecutor {
  private automation: BrowserAutomation;
  private readonly MAX_RETRIES = 3; // Maximum 3 attempts total (1 initial + 2 retries)
  private readonly RETRY_DELAY_BASE = 1000; // 1 second
  private readonly STEP_DELAY = 500; // Delay between steps
  private readonly MAX_CONSECUTIVE_FAILURES = 3; // Stop after 3 consecutive failures
  private consecutiveFailures = 0;

  constructor(automation: BrowserAutomation) {
    this.automation = automation;
  }

  /**
   * Execute an automation plan
   */
  public async executePlan(
    plan: AutomationPlan,
    onProgress?: (step: AutomationStep, index: number, total: number) => void
  ): Promise<AutomationResult> {
    const startTime = Date.now();

    console.log(`[AutomationExecutor] Starting execution of plan: ${plan.id}`);
    console.log(`[AutomationExecutor] Total steps: ${plan.steps.length}`);

    // Start automation session
    try {
      await this.automation.start();
    } catch (error) {
      console.error('[AutomationExecutor] Failed to start automation:', error);
      return {
        success: false,
        plan,
        error: 'Failed to start automation session',
        executionTime: Date.now() - startTime
      };
    }

    // Update plan status
    plan.status = 'running';
    plan.completedSteps = 0;
    plan.failedSteps = 0;

    // Execute steps sequentially
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      console.log(`[AutomationExecutor] Executing step ${i + 1}/${plan.steps.length}: ${step.description}`);

      // Notify progress
      if (onProgress) {
        onProgress(step, i, plan.steps.length);
      }

      // Execute step with retry logic
      const success = await this.executeStepWithRetry(step);

      if (success) {
        plan.completedSteps++;
        this.consecutiveFailures = 0; // Reset on success
      } else {
        plan.failedSteps++;
        this.consecutiveFailures++;

        // Check if we should continue after failure
        if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          console.error(`[AutomationExecutor] Too many consecutive failures (${this.consecutiveFailures}), stopping execution`);
          plan.status = 'failed';
          break;
        } else if (this.isCriticalStep(step)) {
          console.error(`[AutomationExecutor] Critical step failed, stopping execution`);
          plan.status = 'failed';
          break;
        } else {
          console.warn(`[AutomationExecutor] Non-critical step failed, continuing... (consecutive failures: ${this.consecutiveFailures})`);
        }
      }

      // Small delay between steps
      await this.sleep(this.STEP_DELAY);
    }

    // Determine final status
    if (plan.status !== 'failed') {
      plan.status = plan.failedSteps === 0 ? 'completed' : 'completed';
    }

    const executionTime = Date.now() - startTime;
    plan.totalDuration = executionTime;

    console.log(`[AutomationExecutor] Execution complete`);
    console.log(`[AutomationExecutor] Completed: ${plan.completedSteps}/${plan.steps.length}`);
    console.log(`[AutomationExecutor] Failed: ${plan.failedSteps}`);
    console.log(`[AutomationExecutor] Duration: ${executionTime}ms`);

    // Stop automation session
    this.automation.stop();

    return {
      success: plan.failedSteps === 0 || (plan.completedSteps > plan.failedSteps),
      plan,
      error: plan.failedSteps > 0 ? `${plan.failedSteps} steps failed` : undefined,
      executionTime
    };
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(step: AutomationStep): Promise<boolean> {
    step.status = 'running';
    step.startTime = Date.now();
    step.retryCount = 0;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 2);
          console.log(`[AutomationExecutor] Retry attempt ${attempt - 1}/${this.MAX_RETRIES - 1} (waiting ${delay}ms)`);
          await this.sleep(delay);
        }

        await this.executeStep(step);

        // Success
        step.status = 'completed';
        step.endTime = Date.now();
        console.log(`[AutomationExecutor] Step completed: ${step.description}`);
        return true;

      } catch (error) {
        step.retryCount = attempt;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        console.error(`[AutomationExecutor] Step failed (attempt ${attempt}/${this.MAX_RETRIES}):`, errorMessage);

        if (attempt === this.MAX_RETRIES) {
          // Final attempt failed
          step.status = 'failed';
          step.error = errorMessage;
          step.endTime = Date.now();
          console.error(`[AutomationExecutor] Step permanently failed after ${this.MAX_RETRIES} attempts`);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Execute a single automation step
   */
  private async executeStep(step: AutomationStep): Promise<void> {
    switch (step.action) {
      case 'navigate':
        if (typeof step.value === 'string') {
          await this.automation.navigate(step.value, true);
        } else {
          throw new Error('Navigate requires URL as string value');
        }
        break;

      case 'click':
        if (step.selector) {
          await this.automation.click(step.selector);
        } else {
          throw new Error('Click requires selector');
        }
        break;

      case 'type':
        if (step.selector && typeof step.value === 'string') {
          await this.automation.type(step.selector, step.value, { clear: true });
        } else {
          throw new Error('Type requires selector and text value');
        }
        break;

      case 'select':
        if (step.selector && typeof step.value === 'string') {
          await this.automation.select(step.selector, step.value);
        } else {
          throw new Error('Select requires selector and value');
        }
        break;

      case 'checkbox':
        if (step.selector && typeof step.value === 'boolean') {
          await this.automation.toggleCheckbox(step.selector, step.value);
        } else {
          throw new Error('Checkbox requires selector and boolean value');
        }
        break;

      case 'radio':
        if (step.selector) {
          await this.automation.selectRadio(step.selector);
        } else {
          throw new Error('Radio requires selector');
        }
        break;

      case 'pressKey':
        if (typeof step.value === 'string') {
          await this.automation.pressKey(step.value);
        } else {
          throw new Error('PressKey requires key name as string value');
        }
        break;

      case 'scroll':
        if (step.selector) {
          await this.automation.scroll({ selector: step.selector });
        } else if (typeof step.value === 'number') {
          await this.automation.scroll({ y: step.value });
        } else {
          throw new Error('Scroll requires selector or y position');
        }
        break;

      case 'wait':
        if (typeof step.value === 'number') {
          await this.sleep(step.value);
        } else {
          throw new Error('Wait requires duration in milliseconds');
        }
        break;

      case 'waitForElement':
        if (step.selector) {
          const timeout = typeof step.value === 'number' ? step.value : 10000;
          await this.automation.waitForElementVisible(step.selector, timeout);
        } else {
          throw new Error('WaitForElement requires selector');
        }
        break;

      default:
        throw new Error(`Unknown action type: ${step.action}`);
    }
  }

  /**
   * Determine if a step is critical (failure should stop execution)
   */
  private isCriticalStep(step: AutomationStep): boolean {
    // Navigation and initial waits are critical
    const criticalActions = ['navigate', 'waitForElement'];
    return criticalActions.includes(step.action);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
