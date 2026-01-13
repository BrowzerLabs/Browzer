/**
 * Automation Engine
 *
 * Main orchestrator for workflow execution. Manages the lifecycle of
 * workflow executions, coordinates between components, and handles events.
 */

import { EventEmitter } from 'events';
import { WebContentsView } from 'electron';

import { v4 as uuidv4 } from 'uuid';

import {
  ExecutionContext,
  ExecutionStatus,
  StepExecutionResult,
  WorkflowDefinition,
  ExecutionOptions,
  AutomationEvents,
} from './types';
import { GeneralizationService } from './GeneralizationService';
import { IntentParser } from './IntentParser';
import { VariableResolver } from './VariableResolver';
import { WorkflowExecutor } from './WorkflowExecutor';

interface TypedEventEmitter extends EventEmitter {
  emit<K extends keyof AutomationEvents>(
    event: K,
    ...args: Parameters<AutomationEvents[K]>
  ): boolean;
  on<K extends keyof AutomationEvents>(
    event: K,
    listener: AutomationEvents[K]
  ): this;
  once<K extends keyof AutomationEvents>(
    event: K,
    listener: AutomationEvents[K]
  ): this;
}

export class AutomationEngine extends (EventEmitter as new () => TypedEventEmitter) {
  private workflowExecutor: WorkflowExecutor;
  private variableResolver: VariableResolver;
  private generalizationService: GeneralizationService;
  private intentParser: IntentParser;

  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private browserViews: Map<string, WebContentsView> = new Map();

  constructor() {
    super();
    this.workflowExecutor = new WorkflowExecutor();
    this.variableResolver = new VariableResolver();
    this.generalizationService = new GeneralizationService();
    this.intentParser = new IntentParser();

    this.setupExecutorEvents();
  }

  /**
   * Forward events from WorkflowExecutor
   */
  private setupExecutorEvents(): void {
    this.workflowExecutor.on('step:started', (stepIndex: number) => {
      const context = this.getActiveContext();
      if (context) {
        context.currentStepIndex = stepIndex;
        this.emit('step:started', { stepIndex, context });
      }
    });

    this.workflowExecutor.on(
      'step:completed',
      (result: StepExecutionResult) => {
        this.emit('step:completed', result);
      }
    );

    this.workflowExecutor.on('step:failed', (result: StepExecutionResult) => {
      this.emit('step:failed', result);
    });

    this.workflowExecutor.on('healing:attempted', (data: any) => {
      this.emit('healing:attempted', data);
    });

    this.workflowExecutor.on('healing:succeeded', (data: any) => {
      this.emit('healing:succeeded', data);
    });
  }

  /**
   * Execute a workflow with variables
   */
  async execute(
    workflow: WorkflowDefinition,
    variables: Record<string, any>,
    browserView: WebContentsView,
    options: ExecutionOptions = {}
  ): Promise<{
    success: boolean;
    results: StepExecutionResult[];
    context: ExecutionContext;
  }> {
    const sessionId = uuidv4();

    // Create execution context
    const context: ExecutionContext = {
      sessionId,
      workflowId: workflow.id,
      variables,
      extractedData: {},
      currentStepIndex: 0,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };

    // Validate variables
    const validation = this.variableResolver.validateVariables(
      workflow,
      variables
    );
    if (!validation.valid) {
      context.status = 'failed';
      context.error = {
        stepIndex: -1,
        type: 'validation_failed',
        message: `Missing required variables: ${validation.missing.join(', ')}`,
        recoveryAttempted: false,
        recoverySucceeded: false,
      };
      return { success: false, results: [], context };
    }

    // Register execution
    this.activeExecutions.set(sessionId, context);
    this.browserViews.set(sessionId, browserView);

    console.log(`[AutomationEngine] Starting execution: ${sessionId}`);
    console.log(`[AutomationEngine] Workflow: ${workflow.name}`);
    console.log(`[AutomationEngine] Variables:`, Object.keys(variables));

    // Update status and emit event
    context.status = 'running';
    this.emit('execution:started', context);

    try {
      // Execute the workflow
      const results = await this.workflowExecutor.execute(
        workflow,
        context,
        browserView
      );

      // Mark as completed
      context.status = 'completed';
      context.completedAt = new Date().toISOString();

      console.log(`[AutomationEngine] Execution completed: ${sessionId}`);
      this.emit('execution:completed', { context, results });

      // Handle post-execution options
      if (options.closeBrowserOnComplete) {
        // Optionally close browser - handled by caller
      }

      return { success: true, results, context };
    } catch (error: any) {
      console.error(`[AutomationEngine] Execution failed:`, error.message);

      context.status = 'failed';
      context.completedAt = new Date().toISOString();
      context.error = {
        stepIndex: context.currentStepIndex,
        type: 'action_failed',
        message: error.message,
        recoveryAttempted: true,
        recoverySucceeded: false,
      };

      this.emit('execution:failed', context);

      return { success: false, results: [], context };
    } finally {
      // Cleanup
      this.activeExecutions.delete(sessionId);
      this.browserViews.delete(sessionId);
    }
  }

  /**
   * Execute a workflow with dynamic generalization from natural language
   */
  async executeWithPrompt(
    workflow: WorkflowDefinition,
    userPrompt: string,
    browserView: WebContentsView,
    options: ExecutionOptions = {}
  ): Promise<{
    success: boolean;
    results: StepExecutionResult[];
    context: ExecutionContext;
    adaptedWorkflow?: WorkflowDefinition;
  }> {
    console.log(`[AutomationEngine] Executing with prompt: "${userPrompt}"`);

    // Parse user intent
    const intent = await this.intentParser.parse(userPrompt, {
      url: browserView.webContents.getURL(),
    });

    console.log(`[AutomationEngine] Parsed intent:`, intent);

    // Get page context for generalization
    const pageContext = await this.getPageContext(browserView);

    // Generalize workflow based on intent
    const generalizationResult = await this.generalizationService.generalize(
      {
        workflowId: workflow.id,
        userPrompt,
        pageContext,
      },
      workflow,
      intent
    );

    if (!generalizationResult.adaptedWorkflow) {
      console.error('[AutomationEngine] Failed to generalize workflow');
      const context: ExecutionContext = {
        sessionId: uuidv4(),
        workflowId: workflow.id,
        variables: {},
        extractedData: {},
        currentStepIndex: 0,
        status: 'failed',
        startedAt: new Date().toISOString(),
        error: {
          stepIndex: -1,
          type: 'validation_failed',
          message: 'Failed to generalize workflow from prompt',
          recoveryAttempted: false,
          recoverySucceeded: false,
        },
      };
      return { success: false, results: [], context };
    }

    // Emit generalization event
    this.emit('generalization:completed', generalizationResult);

    // Execute the adapted workflow
    const result = await this.execute(
      generalizationResult.adaptedWorkflow,
      generalizationResult.newVariables.reduce(
        (acc, v) => ({ ...acc, [v.name]: v.default_value }),
        {}
      ),
      browserView,
      options
    );

    return {
      ...result,
      adaptedWorkflow: generalizationResult.adaptedWorkflow,
    };
  }

  /**
   * Pause current execution
   */
  pause(sessionId?: string): void {
    const id = sessionId || this.getActiveSessionId();
    if (!id) return;

    const context = this.activeExecutions.get(id);
    if (context && context.status === 'running') {
      this.workflowExecutor.pause();
      context.status = 'paused';
      this.emit('execution:paused', context);
      console.log(`[AutomationEngine] Execution paused: ${id}`);
    }
  }

  /**
   * Resume paused execution
   */
  resume(sessionId?: string): void {
    const id = sessionId || this.getActiveSessionId();
    if (!id) return;

    const context = this.activeExecutions.get(id);
    if (context && context.status === 'paused') {
      this.workflowExecutor.resume();
      context.status = 'running';
      this.emit('execution:resumed', context);
      console.log(`[AutomationEngine] Execution resumed: ${id}`);
    }
  }

  /**
   * Cancel execution
   */
  cancel(sessionId?: string): void {
    const id = sessionId || this.getActiveSessionId();
    if (!id) return;

    const context = this.activeExecutions.get(id);
    if (
      context &&
      (context.status === 'running' || context.status === 'paused')
    ) {
      this.workflowExecutor.cancel();
      context.status = 'cancelled';
      context.completedAt = new Date().toISOString();
      this.emit('execution:cancelled', context);
      console.log(`[AutomationEngine] Execution cancelled: ${id}`);
    }
  }

  /**
   * Get current execution status
   */
  getStatus(sessionId?: string): ExecutionStatus | null {
    const id = sessionId || this.getActiveSessionId();
    if (!id) return null;

    const context = this.activeExecutions.get(id);
    return context?.status || null;
  }

  /**
   * Get execution context
   */
  getContext(sessionId: string): ExecutionContext | null {
    return this.activeExecutions.get(sessionId) || null;
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): ExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get page context for generalization
   */
  private async getPageContext(
    browserView: WebContentsView
  ): Promise<{
    url: string;
    title: string;
    visibleElements: any[];
    pageStructure: string;
  }> {
    const webContents = browserView.webContents;

    const [url, title, elements, structure] = await Promise.all([
      webContents.getURL(),
      webContents.getTitle(),
      this.getVisibleElements(webContents),
      this.getPageStructure(webContents),
    ]);

    return {
      url,
      title,
      visibleElements: elements,
      pageStructure: structure,
    };
  }

  /**
   * Get visible interactive elements on the page
   */
  private async getVisibleElements(
    webContents: Electron.WebContents
  ): Promise<any[]> {
    return webContents.executeJavaScript(`
      (function() {
        const elements = [];
        const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [role="link"], [onclick]';
        const interactiveElements = document.querySelectorAll(interactiveSelectors);

        let index = 0;
        for (const el of interactiveElements) {
          const rect = el.getBoundingClientRect();

          // Skip hidden elements
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.top > window.innerHeight || rect.bottom < 0) continue;

          elements.push({
            index: index++,
            tagName: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 100),
            ariaLabel: el.getAttribute('aria-label'),
            role: el.getAttribute('role'),
            isClickable: true,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          });

          if (index >= 100) break; // Limit to 100 elements
        }

        return elements;
      })();
    `);
  }

  /**
   * Get simplified page structure
   */
  private async getPageStructure(
    webContents: Electron.WebContents
  ): Promise<string> {
    return webContents.executeJavaScript(`
      (function() {
        function getStructure(el, depth = 0) {
          if (depth > 3) return '';

          const tag = el.tagName?.toLowerCase();
          if (!tag || ['script', 'style', 'noscript'].includes(tag)) return '';

          const classes = el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : '';
          const id = el.id ? '#' + el.id : '';
          const indent = '  '.repeat(depth);

          let result = indent + tag + id + classes + '\\n';

          for (const child of el.children) {
            result += getStructure(child, depth + 1);
          }

          return result;
        }

        return getStructure(document.body).substring(0, 2000);
      })();
    `);
  }

  /**
   * Get active context (first one)
   */
  private getActiveContext(): ExecutionContext | undefined {
    return this.activeExecutions.values().next().value;
  }

  /**
   * Get active session ID
   */
  private getActiveSessionId(): string | undefined {
    return this.activeExecutions.keys().next().value;
  }
}
