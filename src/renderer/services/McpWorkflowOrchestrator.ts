/**
 * MCP Workflow Orchestrator
 *
 * Handles conditional MCP workflows with if/then/else logic:
 * - "Read email, schedule meeting. If no time, reply asking for slots"
 * - Gmail → GCal → Conditional (schedule OR reply)
 *
 * Week 6: Conditional Multi-Tool MCP Orchestration
 */

import { McpExecutor } from './McpExecutor';
import { McpContextManager } from './McpContextManager';
import { McpWorkflowErrorHandler } from './McpWorkflowErrorHandler';
import { McpWorkflowTemplates } from './McpWorkflowTemplates';

export interface ConditionalStep {
  condition: string;
  conditionType: 'success' | 'failure' | 'contains' | 'empty' | 'custom';
  conditionTarget?: string; // which previous step result to check
  trueSteps: WorkflowStep[];
  falseSteps: WorkflowStep[];
}

export interface WorkflowStep {
  stepId: string;
  stepType: 'execute' | 'conditional';
  toolName?: string;
  query?: string;
  parameters?: Record<string, any>;
  conditional?: ConditionalStep;
  dependsOn?: string[];
}

export interface ConditionalWorkflow {
  workflowId: string;
  steps: WorkflowStep[];
  context: Record<string, any>;
  currentStepIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export class McpWorkflowOrchestrator {
  private workflowTemplates: McpWorkflowTemplates;

  constructor(
    private mcpExecutor: McpExecutor,
    private contextManager: McpContextManager,
    private errorHandler: McpWorkflowErrorHandler
  ) {
    this.workflowTemplates = new McpWorkflowTemplates();
  }

  /**
   * Execute conditional workflow with branch/merge logic
   */
  async executeConditionalWorkflow(workflow: ConditionalWorkflow): Promise<any> {
    console.log(`[McpWorkflowOrchestrator] Starting conditional workflow: ${workflow.workflowId}`);

    workflow.status = 'running';
    const results: Record<string, any> = {};

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        workflow.currentStepIndex = i;

        console.log(`[McpWorkflowOrchestrator] Executing step ${i + 1}/${workflow.steps.length}: ${step.stepId}`);

        if (step.stepType === 'execute') {
          // Execute regular MCP tool step
          const result = await this.executeStep(step, results, workflow.context);
          results[step.stepId] = result;

        } else if (step.stepType === 'conditional') {
          // Handle conditional branching
          const branchResults = await this.executeConditionalStep(step, results, workflow.context);
          // Merge branch results back into main results
          Object.assign(results, branchResults);
        }
      }

      workflow.status = 'completed';
      console.log(`[McpWorkflowOrchestrator] Workflow completed successfully: ${workflow.workflowId}`);

      return {
        workflowId: workflow.workflowId,
        status: 'completed',
        results: results,
        finalContext: workflow.context
      };

    } catch (error) {
      workflow.status = 'failed';
      console.error(`[McpWorkflowOrchestrator] Workflow failed: ${workflow.workflowId}`, error);

      return {
        workflowId: workflow.workflowId,
        status: 'failed',
        error: (error as Error).message,
        partialResults: results
      };
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: WorkflowStep, previousResults: Record<string, any>, context: Record<string, any>): Promise<any> {
    if (!step.toolName || !step.query) {
      throw new Error(`Invalid step configuration: ${step.stepId}`);
    }

    // Use original query for now - context substitution needs workflow ID
    const enhancedQuery = step.query;

    console.log(`[McpWorkflowOrchestrator] Executing tool: ${step.toolName} with query: ${enhancedQuery}`);

    // Execute the MCP tool
    const result = await this.mcpExecutor.executeQuery(enhancedQuery);

    // Store result in context for now
    context[step.stepId] = result;

    return result;
  }

  /**
   * Execute conditional step with if/then/else logic
   */
  private async executeConditionalStep(step: WorkflowStep, previousResults: Record<string, any>, context: Record<string, any>): Promise<Record<string, any>> {
    if (!step.conditional) {
      throw new Error(`Missing conditional configuration for step: ${step.stepId}`);
    }

    const condition = step.conditional;
    console.log(`[McpWorkflowOrchestrator] Evaluating condition: ${condition.condition}`);

    // Evaluate the condition
    const conditionResult = this.evaluateCondition(condition, previousResults, context);
    console.log(`[McpWorkflowOrchestrator] Condition result: ${conditionResult}`);

    // Choose which branch to execute
    const stepsToExecute = conditionResult ? condition.trueSteps : condition.falseSteps;
    const branchResults: Record<string, any> = {};

    // Execute the chosen branch
    for (const branchStep of stepsToExecute) {
      console.log(`[McpWorkflowOrchestrator] Executing ${conditionResult ? 'TRUE' : 'FALSE'} branch step: ${branchStep.stepId}`);

      const result = await this.executeStep(branchStep, { ...previousResults, ...branchResults }, context);
      branchResults[branchStep.stepId] = result;
    }

    return branchResults;
  }

  /**
   * Evaluate conditional logic
   */
  private evaluateCondition(condition: ConditionalStep, previousResults: Record<string, any>, context: Record<string, any>): boolean {
    const targetResult = condition.conditionTarget ? previousResults[condition.conditionTarget] : null;

    switch (condition.conditionType) {
      case 'success':
        return targetResult && !targetResult.error;

      case 'failure':
        return !targetResult || !!targetResult.error;

      case 'empty':
        return !targetResult ||
               (Array.isArray(targetResult) && targetResult.length === 0) ||
               (typeof targetResult === 'object' && Object.keys(targetResult).length === 0);

      case 'contains':
        const searchText = condition.condition.toLowerCase();
        const resultText = JSON.stringify(targetResult).toLowerCase();
        return resultText.includes(searchText);

      case 'custom':
        // For complex conditions, use simple text matching for now
        return this.evaluateCustomCondition(condition.condition, previousResults, context);

      default:
        console.warn(`[McpWorkflowOrchestrator] Unknown condition type: ${condition.conditionType}`);
        return false;
    }
  }

  /**
   * Evaluate custom conditional logic
   */
  private evaluateCustomCondition(conditionExpression: string, previousResults: Record<string, any>, context: Record<string, any>): boolean {
    // Simple pattern matching for common conditions
    const expr = conditionExpression.toLowerCase();

    // Check for availability patterns
    if (expr.includes('available') || expr.includes('time slot') || expr.includes('free time')) {
      // Look for calendar results that indicate availability
      for (const [key, result] of Object.entries(previousResults)) {
        if (key.includes('calendar') || key.includes('schedule')) {
          // If calendar query returned empty results, means time is available
          const isEmpty = Array.isArray(result) && result.length === 0;
          return !isEmpty; // Available if not empty (has conflicts)
        }
      }
    }

    // Check for email patterns
    if (expr.includes('email') || expr.includes('message')) {
      for (const [key, result] of Object.entries(previousResults)) {
        if (key.includes('email') || key.includes('gmail')) {
          return Array.isArray(result) && result.length > 0;
        }
      }
    }

    // Default: if any previous step succeeded
    return Object.values(previousResults).some(result => result && !result.error);
  }

  /**
   * Parse conditional workflow from query
   */
  parseConditionalQuery(query: string): ConditionalWorkflow {
    console.log(`[McpWorkflowOrchestrator] Parsing conditional query: ${query}`);

    // Try to find a matching template first
    const templateMatch = this.workflowTemplates.findMatchingTemplate(query);
    if (templateMatch) {
      console.log(`[McpWorkflowOrchestrator] Using template: ${templateMatch.template.name}`);
      return templateMatch.template.generateWorkflow(query, templateMatch.matches);
    }

    // Fallback to manual parsing for custom queries
    console.log(`[McpWorkflowOrchestrator] No template match, using manual parsing`);
    const workflowId = `workflow_${Date.now()}`;
    const steps: WorkflowStep[] = [];

    // Look for conditional patterns
    const conditionalPattern = /(.+?)\.\s*if\s+(.+?),?\s*then\s+(.+?)(?:\s*(?:else|otherwise)\s+(.+?))?$/i;
    const match = query.match(conditionalPattern);

    if (match) {
      const [, baseAction, condition, trueAction, falseAction] = match;

      // Step 1: Execute the base action
      steps.push({
        stepId: 'base_action',
        stepType: 'execute',
        toolName: this.inferToolFromQuery(baseAction),
        query: baseAction.trim(),
        parameters: {}
      });

      // Step 2: Conditional logic
      const conditionalStep: WorkflowStep = {
        stepId: 'conditional_logic',
        stepType: 'conditional',
        conditional: {
          condition: condition.trim(),
          conditionType: this.inferConditionType(condition),
          conditionTarget: 'base_action',
          trueSteps: [{
            stepId: 'true_branch',
            stepType: 'execute',
            toolName: this.inferToolFromQuery(trueAction),
            query: trueAction.trim(),
            parameters: {}
          }],
          falseSteps: falseAction ? [{
            stepId: 'false_branch',
            stepType: 'execute',
            toolName: this.inferToolFromQuery(falseAction),
            query: falseAction.trim(),
            parameters: {}
          }] : []
        }
      };

      steps.push(conditionalStep);
    } else {
      // No conditional pattern found, treat as simple workflow
      steps.push({
        stepId: 'simple_action',
        stepType: 'execute',
        toolName: this.inferToolFromQuery(query),
        query: query,
        parameters: {}
      });
    }

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Infer MCP tool from query text
   */
  private inferToolFromQuery(query: string): string {
    const queryLower = query.toLowerCase();

    if (queryLower.includes('email') || queryLower.includes('gmail') || queryLower.includes('reply')) {
      if (queryLower.includes('send') || queryLower.includes('reply')) {
        return 'zap2.gmail_send_email';
      }
      return 'zap2.gmail_find_email';
    }

    if (queryLower.includes('calendar') || queryLower.includes('schedule') || queryLower.includes('meeting')) {
      if (queryLower.includes('create') || queryLower.includes('schedule') || queryLower.includes('book')) {
        return 'zap2.google_calendar_quick_add_event';
      }
      return 'zap2.google_calendar_find_events';
    }

    // Default to generic execution
    return 'generic';
  }

  /**
   * Infer condition type from condition text
   */
  private inferConditionType(condition: string): ConditionalStep['conditionType'] {
    const conditionLower = condition.toLowerCase();

    if (conditionLower.includes('available') || conditionLower.includes('free') || conditionLower.includes('time')) {
      return 'custom';
    }

    if (conditionLower.includes('empty') || conditionLower.includes('no ')) {
      return 'empty';
    }

    if (conditionLower.includes('success') || conditionLower.includes('work')) {
      return 'success';
    }

    return 'custom';
  }

  /**
   * Get workflow template suggestions for a query
   */
  getSuggestionsForQuery(query: string) {
    return this.workflowTemplates.suggestTemplates(query);
  }

  /**
   * Get workflow template statistics
   */
  getTemplateStats() {
    return this.workflowTemplates.getTemplateStats();
  }
}