/**
 * Workflow Executor
 *
 * Executes workflow steps with element finding and self-healing support.
 */

import { EventEmitter } from 'events';
import { WebContentsView } from 'electron';

import { SelfHealingService } from '../healing/SelfHealingService';

import { ActionExecutor } from './ActionExecutor';
import { ElementFinder } from './ElementFinder';
import { VariableResolver } from './VariableResolver';
import {
  ExecutionContext,
  StepExecutionResult,
  WorkflowDefinition,
  WorkflowStep,
  FoundElement,
} from './types';

// Custom error classes
export class ElementNotFoundError extends Error {
  constructor(
    message: string,
    public step: WorkflowStep
  ) {
    super(message);
    this.name = 'ElementNotFoundError';
  }
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export class WorkflowExecutor extends EventEmitter {
  private elementFinder: ElementFinder;
  private actionExecutor: ActionExecutor;
  private variableResolver: VariableResolver;
  private healingService: SelfHealingService;

  private isPaused = false;
  private isCancelled = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  constructor() {
    super();
    this.elementFinder = new ElementFinder();
    this.actionExecutor = new ActionExecutor();
    this.variableResolver = new VariableResolver();
    this.healingService = new SelfHealingService();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  async execute(
    workflow: WorkflowDefinition,
    context: ExecutionContext,
    browserView: WebContentsView
  ): Promise<StepExecutionResult[]> {
    const results: StepExecutionResult[] = [];
    this.isPaused = false;
    this.isCancelled = false;

    console.log(
      `[WorkflowExecutor] Starting execution of "${workflow.name}" with ${workflow.steps.length} steps`
    );

    for (let i = 0; i < workflow.steps.length; i++) {
      // Check for cancellation
      if (this.isCancelled) {
        console.log('[WorkflowExecutor] Execution cancelled');
        break;
      }

      // Wait if paused
      await this.waitIfPaused();

      const step = workflow.steps[i];
      this.emit('step:started', i);

      const startTime = Date.now();

      try {
        // Resolve variables in step
        const resolvedStep = this.variableResolver.resolveStep(step, context);

        // Execute the step
        const result = await this.executeStep(
          resolvedStep,
          i,
          context,
          browserView
        );

        result.duration = Date.now() - startTime;
        result.stepIndex = i;
        results.push(result);

        // Store extracted data
        if (result.extractedData && (step as any).output) {
          context.extractedData[(step as any).output] = result.extractedData;
        }

        console.log(
          `[WorkflowExecutor] Step ${i + 1}/${workflow.steps.length} completed: ${step.type}`
        );
        this.emit('step:completed', result);

        // Wait between steps if configured
        const waitTime =
          (step as any).wait_time ?? (workflow as any).default_wait_time ?? 0.5;
        if (waitTime > 0) {
          await this.sleep(waitTime * 1000);
        }
      } catch (error: any) {
        console.error(
          `[WorkflowExecutor] Step ${i + 1} failed:`,
          error.message
        );

        const result: StepExecutionResult = {
          stepIndex: i,
          status: 'failed',
          duration: Date.now() - startTime,
          error: error.message,
        };

        // Attempt self-healing
        const healed = await this.attemptHealing(
          step,
          error,
          context,
          browserView
        );

        if (healed) {
          result.status = 'success';
          result.error = undefined;
          result.strategyUsed = healed.strategy;
          results.push(result);
          console.log(
            `[WorkflowExecutor] Self-healing succeeded using: ${healed.strategy}`
          );
          this.emit('healing:succeeded', {
            stepIndex: i,
            strategy: healed.strategy,
          });
          this.emit('step:completed', result);
        } else {
          results.push(result);
          this.emit('step:failed', result);
          throw error;
        }
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  private async executeStep(
    step: WorkflowStep,
    stepIndex: number,
    context: ExecutionContext,
    browserView: WebContentsView
  ): Promise<StepExecutionResult> {
    const webContents = browserView.webContents;

    switch (step.type) {
      case 'navigation':
        return this.executeNavigation(step, webContents);

      case 'click':
        return this.executeClick(step, stepIndex, webContents);

      case 'input':
        return this.executeInput(step, stepIndex, webContents);

      case 'keypress':
        return this.executeKeyPress(step, webContents);

      case 'select_change':
        return this.executeSelectChange(step, stepIndex, webContents);

      case 'scroll':
        return this.executeScroll(step, webContents);

      case 'extract':
        return this.executeExtract(step, webContents);

      case 'wait':
        return this.executeWait(step);

      case 'assert':
        return this.executeAssert(step, webContents);

      case 'hover':
        return this.executeHover(step, stepIndex, webContents);

      default:
        console.warn(`[WorkflowExecutor] Unknown step type: ${step.type}`);
        return {
          stepIndex,
          status: 'skipped',
          duration: 0,
          error: `Unknown step type: ${step.type}`,
        };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private async executeNavigation(
    step: WorkflowStep,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const url = step.url || step.value;

    if (!url) {
      throw new Error('Navigation step requires a URL');
    }

    console.log(`[WorkflowExecutor] Navigating to: ${url}`);

    await webContents.loadURL(url);

    // Wait for page to stabilize
    await this.waitForPageLoad(webContents);

    return {
      stepIndex: -1,
      status: 'success',
      duration: 0,
    };
  }

  private async executeClick(
    step: WorkflowStep,
    stepIndex: number,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    // Find element using multi-strategy approach
    const element = await this.elementFinder.findElement(
      {
        strategies: step.selectorStrategies || [],
        targetText: step.target_text,
        containerHint: (step as any).container_hint,
        positionHint: (step as any).position_hint,
      },
      webContents
    );

    if (!element) {
      throw new ElementNotFoundError(
        `Could not find element: ${step.target_text || step.description || 'unknown'}`,
        step
      );
    }

    // Click the element
    await this.actionExecutor.click(element, webContents);

    // Wait for any navigation or DOM updates
    await this.waitForPageStability(webContents);

    return {
      stepIndex,
      status: 'success',
      duration: 0,
      selectorUsed: element.selector,
      strategyUsed: element.strategyUsed.type,
    };
  }

  private async executeInput(
    step: WorkflowStep,
    stepIndex: number,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    // Find input element
    const element = await this.elementFinder.findElement(
      {
        strategies: step.selectorStrategies || [],
        targetText: step.target_text,
      },
      webContents
    );

    if (!element) {
      throw new ElementNotFoundError(
        `Could not find input: ${step.target_text || step.description || 'unknown'}`,
        step
      );
    }

    // Clear existing value and type new value
    await this.actionExecutor.clearAndType(
      element,
      step.value || '',
      webContents
    );

    return {
      stepIndex,
      status: 'success',
      duration: 0,
      selectorUsed: element.selector,
      strategyUsed: element.strategyUsed.type,
    };
  }

  private async executeKeyPress(
    step: WorkflowStep,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const key = (step as any).key || step.value;

    if (!key) {
      throw new Error('KeyPress step requires a key');
    }

    await this.actionExecutor.pressKey(key, webContents);

    return {
      stepIndex: -1,
      status: 'success',
      duration: 0,
    };
  }

  private async executeSelectChange(
    step: WorkflowStep,
    stepIndex: number,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const element = await this.elementFinder.findElement(
      {
        strategies: step.selectorStrategies || [],
        targetText: step.target_text,
      },
      webContents
    );

    if (!element) {
      throw new ElementNotFoundError(
        `Could not find select: ${step.target_text || 'unknown'}`,
        step
      );
    }

    const selectedText = (step as any).selectedText || step.value;
    await this.actionExecutor.selectOption(element, selectedText, webContents);

    return {
      stepIndex,
      status: 'success',
      duration: 0,
      selectorUsed: element.selector,
      strategyUsed: element.strategyUsed.type,
    };
  }

  private async executeScroll(
    step: WorkflowStep,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const scrollX = (step as any).scrollX || 0;
    const scrollY = (step as any).scrollY || 0;

    await this.actionExecutor.scrollBy(scrollX, scrollY, webContents);

    return {
      stepIndex: -1,
      status: 'success',
      duration: 0,
    };
  }

  private async executeHover(
    step: WorkflowStep,
    stepIndex: number,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const element = await this.elementFinder.findElement(
      {
        strategies: step.selectorStrategies || [],
        targetText: step.target_text,
      },
      webContents
    );

    if (!element) {
      throw new ElementNotFoundError(
        `Could not find element to hover: ${step.target_text || 'unknown'}`,
        step
      );
    }

    await this.actionExecutor.hover(element, webContents);

    return {
      stepIndex,
      status: 'success',
      duration: 0,
      selectorUsed: element.selector,
      strategyUsed: element.strategyUsed.type,
    };
  }

  private async executeExtract(
    step: WorkflowStep,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const extractionGoal = (step as any).extractionGoal || step.description;

    // Get page content
    const pageContent = await webContents.executeJavaScript(`
      document.body.innerText;
    `);

    // For now, return raw content. In the future, use LLM for extraction.
    const extractedData = {
      raw: pageContent.substring(0, 5000),
      goal: extractionGoal,
    };

    return {
      stepIndex: -1,
      status: 'success',
      duration: 0,
      extractedData,
    };
  }

  private async executeWait(step: WorkflowStep): Promise<StepExecutionResult> {
    const duration = (step as any).duration || 1;
    await this.sleep(duration * 1000);

    return {
      stepIndex: -1,
      status: 'success',
      duration: duration * 1000,
    };
  }

  private async executeAssert(
    step: WorkflowStep,
    webContents: Electron.WebContents
  ): Promise<StepExecutionResult> {
    const assertion = (step as any).assertion;

    if (!assertion) {
      throw new Error('Assert step requires an assertion');
    }

    const result = await webContents.executeJavaScript(`
      (function() {
        ${assertion}
      })();
    `);

    if (!result) {
      throw new AssertionError(
        `Assertion failed: ${step.description || 'unknown'}`
      );
    }

    return {
      stepIndex: -1,
      status: 'success',
      duration: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELF-HEALING
  // ═══════════════════════════════════════════════════════════════════════════

  private async attemptHealing(
    step: WorkflowStep,
    error: Error,
    context: ExecutionContext,
    browserView: WebContentsView
  ): Promise<{ strategy: string } | null> {
    if (!(error instanceof ElementNotFoundError)) {
      return null;
    }

    this.emit('healing:attempted', { step, error: error.message });

    const webContents = browserView.webContents;

    // Try alternative strategies
    const healed = await this.healingService.attemptRecovery(
      step,
      webContents,
      context
    );

    return healed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  pause(): void {
    this.isPaused = true;
    this.pausePromise = new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  resume(): void {
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }
  }

  cancel(): void {
    this.isCancelled = true;
    this.resume(); // Unblock if paused
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private async waitIfPaused(): Promise<void> {
    if (this.isPaused && this.pausePromise) {
      await this.pausePromise;
    }
  }

  private async waitForPageLoad(
    webContents: Electron.WebContents
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 10000); // 10s timeout

      webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await this.sleep(500); // Additional stability wait
  }

  private async waitForPageStability(
    webContents: Electron.WebContents
  ): Promise<void> {
    // Wait for network idle
    await this.sleep(300);

    // Check if page is still loading
    const isLoading = await webContents.executeJavaScript(`
      document.readyState !== 'complete'
    `);

    if (isLoading) {
      await this.waitForPageLoad(webContents);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
