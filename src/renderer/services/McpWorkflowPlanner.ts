import { ParsedWorkflow, WorkflowStep } from './McpQueryParser';
import { ToolMatch } from './McpRouter';
import { McpClientManager } from './McpClientManager';
import { McpRouter } from './McpRouter';

export interface ExecutionPlan {
  workflowId: string;
  originalQuery: string;
  executionSteps: ExecutionStep[];
  estimatedDuration: number; // in milliseconds
  requiresUserInput: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ExecutionStep {
  stepId: string;
  description: string;
  toolMatches: ToolMatch[];
  selectedTool?: string;
  parameters: Record<string, any>;
  dependencies: string[];
  outputVariable?: string;
  estimatedTime: number;
  canRunInParallel: boolean;
  validationRequired: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Phase 2 Week 4: Multi-Tool Workflow Planner
 * Creates executable plans from parsed workflows
 */
export class McpWorkflowPlanner {

  constructor(
    private mcpManager: McpClientManager,
    private router: McpRouter
  ) {}

  /**
   * Create executable plan from parsed workflow
   */
  async createExecutionPlan(workflow: ParsedWorkflow): Promise<ExecutionPlan> {
    console.log('[McpWorkflowPlanner] Creating execution plan for:', workflow.originalQuery);

    const workflowId = this.generateWorkflowId();
    const executionSteps: ExecutionStep[] = [];

    // Convert each workflow step to execution step with tool selection
    for (const step of workflow.steps) {
      const executionStep = await this.planExecutionStep(step);
      executionSteps.push(executionStep);
    }

    // Analyze parallel execution opportunities
    this.analyzeParallelExecution(executionSteps);

    // Calculate estimates
    const estimatedDuration = this.calculateEstimatedDuration(executionSteps);
    const requiresUserInput = this.checkRequiresUserInput(workflow, executionSteps);
    const riskLevel = this.assessRiskLevel(workflow, executionSteps);

    const plan: ExecutionPlan = {
      workflowId,
      originalQuery: workflow.originalQuery,
      executionSteps,
      estimatedDuration,
      requiresUserInput,
      riskLevel
    };

    console.log('[McpWorkflowPlanner] Created execution plan:', JSON.stringify(plan, null, 2));
    return plan;
  }

  /**
   * Validate execution plan before running
   */
  async validatePlan(plan: ExecutionPlan): Promise<ValidationResult> {
    console.log('[McpWorkflowPlanner] Validating execution plan:', plan.workflowId);

    const issues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check tool availability
    for (const step of plan.executionSteps) {
      if (step.selectedTool) {
        const toolExists = await this.mcpManager.getToolInfo(step.selectedTool);
        if (!toolExists) {
          issues.push(`Tool ${step.selectedTool} not available for step: ${step.description}`);
        }
      } else if (step.toolMatches.length === 0) {
        issues.push(`No tools found for step: ${step.description}`);
      }
    }

    // Check dependencies
    for (const step of plan.executionSteps) {
      for (const depId of step.dependencies) {
        const dependencyExists = plan.executionSteps.find(s => s.stepId === depId);
        if (!dependencyExists) {
          issues.push(`Step ${step.stepId} depends on missing step ${depId}`);
        }
      }
    }

    // Check for circular dependencies
    if (this.hasCircularDependencies(plan.executionSteps)) {
      issues.push('Circular dependencies detected in workflow');
    }

    // Performance warnings
    if (plan.estimatedDuration > 30000) { // 30 seconds
      warnings.push(`Workflow may take ${Math.round(plan.estimatedDuration / 1000)}+ seconds to complete`);
    }

    // Risk assessment warnings
    if (plan.riskLevel === 'high') {
      warnings.push('High-risk workflow - may modify data or send communications');
    }

    // Optimization suggestions
    const parallelSteps = plan.executionSteps.filter(s => s.canRunInParallel);
    if (parallelSteps.length > 1) {
      suggestions.push(`${parallelSteps.length} steps can run in parallel for better performance`);
    }

    const result: ValidationResult = {
      isValid: issues.length === 0,
      issues,
      warnings,
      suggestions
    };

    console.log('[McpWorkflowPlanner] Validation result:', result);
    return result;
  }

  /**
   * Plan execution for individual step
   */
  private async planExecutionStep(step: WorkflowStep): Promise<ExecutionStep> {
    console.log('[McpWorkflowPlanner] Planning execution step:', step.id);

    // Find matching MCP tools for this step
    const toolMatches = await this.findToolsForStep(step);

    // Select best tool if available
    const selectedTool = toolMatches.length > 0 ? toolMatches[0].toolName : undefined;

    // Estimate execution time
    const estimatedTime = this.estimateStepTime(step, toolMatches);

    // Check if validation is required
    const validationRequired = this.requiresValidation(step);

    const executionStep: ExecutionStep = {
      stepId: step.id,
      description: step.description,
      toolMatches,
      selectedTool,
      parameters: step.parameters,
      dependencies: step.dependencies,
      outputVariable: step.outputVariable,
      estimatedTime,
      canRunInParallel: false, // Will be updated by analyzeParallelExecution
      validationRequired
    };

    return executionStep;
  }

  /**
   * Find MCP tools that can handle this step
   */
  private async findToolsForStep(step: WorkflowStep): Promise<ToolMatch[]> {
    try {
      // Create a query string for tool matching
      const queryForMatching = `${step.action} ${step.description}`;

      // Use existing router to find matching tools
      const matches = await this.router.routeQuery(queryForMatching, 3);

      // Filter by tool type if we have a specific type
      let filteredMatches = matches;

      if (step.toolType !== 'generic') {
        filteredMatches = matches.filter(match => {
          const toolName = match.toolName.toLowerCase();

          switch (step.toolType) {
            case 'email':
              return toolName.includes('gmail') || toolName.includes('mail') || toolName.includes('email');
            case 'calendar':
              return toolName.includes('calendar') || toolName.includes('gcal') || toolName.includes('event');
            case 'jira':
              return toolName.includes('jira') || toolName.includes('ticket') || toolName.includes('issue');
            case 'trello':
              return toolName.includes('trello') || toolName.includes('card');
            case 'slack':
              return toolName.includes('slack') || toolName.includes('message');
            case 'notion':
              return toolName.includes('notion') || toolName.includes('page');
            case 'file':
              return toolName.includes('file') || toolName.includes('read') || toolName.includes('write');
            case 'web':
              return toolName.includes('search') || toolName.includes('web') || toolName.includes('browser');
            default:
              return true;
          }
        });
      }

      console.log(`[McpWorkflowPlanner] Found ${filteredMatches.length} tools for step ${step.id}:`, filteredMatches.map(m => m.toolName));
      return filteredMatches;

    } catch (error) {
      console.error('[McpWorkflowPlanner] Error finding tools for step:', error);
      return [];
    }
  }

  /**
   * Analyze which steps can run in parallel
   */
  private analyzeParallelExecution(steps: ExecutionStep[]): void {
    console.log('[McpWorkflowPlanner] Analyzing parallel execution opportunities');

    for (const step of steps) {
      // Step can run in parallel if:
      // 1. It has no dependencies, OR
      // 2. All its dependencies can also run in parallel
      step.canRunInParallel = step.dependencies.length === 0;

      if (!step.canRunInParallel && step.dependencies.length > 0) {
        // Check if all dependencies are independent of each other
        const depSteps = steps.filter(s => step.dependencies.includes(s.stepId));
        const independentDeps = depSteps.every(depStep =>
          depSteps.every(otherDep =>
            depStep === otherDep || !depStep.dependencies.includes(otherDep.stepId)
          )
        );

        if (independentDeps) {
          step.canRunInParallel = true;
        }
      }
    }

    const parallelCount = steps.filter(s => s.canRunInParallel).length;
    console.log(`[McpWorkflowPlanner] ${parallelCount} of ${steps.length} steps can run in parallel`);
  }

  /**
   * Calculate estimated total duration
   */
  private calculateEstimatedDuration(steps: ExecutionStep[]): number {
    if (steps.length === 0) return 0;

    // If all steps can run in parallel, duration = longest step
    const allParallel = steps.every(s => s.canRunInParallel);
    if (allParallel) {
      return Math.max(...steps.map(s => s.estimatedTime));
    }

    // Otherwise, sum of all step times (worst case: all sequential)
    return steps.reduce((total, step) => total + step.estimatedTime, 0);
  }

  /**
   * Estimate execution time for individual step
   */
  private estimateStepTime(step: WorkflowStep, toolMatches: ToolMatch[]): number {
    // Base times by tool type (in milliseconds)
    const baseTimes = {
      email: 3000,    // Email operations are typically quick
      file: 2000,     // File operations are usually fast
      slack: 2000,    // Slack API is responsive
      web: 5000,      // Web searches can be slower
      calendar: 3000, // Calendar operations are moderate
      jira: 4000,     // JIRA can be slower due to complexity
      trello: 3000,   // Trello is usually responsive
      notion: 4000,   // Notion can be slower
      generic: 3000   // Default time
    };

    let baseTime = baseTimes[step.toolType] || baseTimes.generic;

    // Adjust based on action complexity
    if (step.action === 'create' || step.action === 'update') {
      baseTime *= 1.5; // Write operations take longer
    }

    // Adjust based on parameters
    if (step.parameters.limit && step.parameters.limit > 10) {
      baseTime *= 1.2; // More data = more time
    }

    // Adjust based on tool availability
    if (toolMatches.length === 0) {
      baseTime *= 2; // No direct tool = might need workarounds
    }

    return Math.round(baseTime);
  }

  /**
   * Check if step requires validation
   */
  private requiresValidation(step: WorkflowStep): boolean {
    // Actions that modify data or send communications need validation
    const highRiskActions = ['send', 'create', 'update', 'delete', 'reply'];
    return highRiskActions.includes(step.action);
  }

  /**
   * Check if workflow requires user input
   */
  private checkRequiresUserInput(workflow: ParsedWorkflow, steps: ExecutionStep[]): boolean {
    // Workflows with conditional logic might need user decisions
    if (workflow.hasConditionalLogic) {
      return true;
    }

    // High-risk steps might need confirmation
    return steps.some(step => step.validationRequired);
  }

  /**
   * Assess risk level of workflow
   */
  private assessRiskLevel(workflow: ParsedWorkflow, steps: ExecutionStep[]): ExecutionPlan['riskLevel'] {
    let riskScore = 0;

    // High-risk actions
    const highRiskActions = ['send', 'delete', 'update', 'reply'];
    const mediumRiskActions = ['create'];

    for (const step of steps) {
      const stepDescription = step.description.toLowerCase();

      if (highRiskActions.some(action => stepDescription.includes(action))) {
        riskScore += 3;
      } else if (mediumRiskActions.some(action => stepDescription.includes(action))) {
        riskScore += 2;
      } else {
        riskScore += 1;
      }
    }

    // External communications are higher risk
    if (workflow.originalQuery.toLowerCase().includes('send') ||
        workflow.originalQuery.toLowerCase().includes('email') ||
        workflow.originalQuery.toLowerCase().includes('slack')) {
      riskScore += 2;
    }

    if (riskScore <= 3) return 'low';
    if (riskScore <= 6) return 'medium';
    return 'high';
  }

  /**
   * Check for circular dependencies
   */
  private hasCircularDependencies(steps: ExecutionStep[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        return true; // Found cycle
      }

      if (visited.has(stepId)) {
        return false; // Already processed
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find(s => s.stepId === stepId);
      if (step) {
        for (const depId of step.dependencies) {
          if (hasCycleDFS(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    return steps.some(step => hasCycleDFS(step.stepId));
  }

  /**
   * Generate unique workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get execution order considering dependencies
   */
  getExecutionOrder(plan: ExecutionPlan): ExecutionStep[][] {
    const result: ExecutionStep[][] = [];
    const completed = new Set<string>();
    const remaining = [...plan.executionSteps];

    while (remaining.length > 0) {
      // Find steps that can be executed now (dependencies satisfied)
      const readySteps = remaining.filter(step =>
        step.dependencies.every(depId => completed.has(depId))
      );

      if (readySteps.length === 0) {
        console.error('[McpWorkflowPlanner] Deadlock detected - no steps can be executed');
        break;
      }

      // Add ready steps to current execution group
      result.push([...readySteps]);

      // Mark as completed and remove from remaining
      readySteps.forEach(step => {
        completed.add(step.stepId);
        const index = remaining.indexOf(step);
        if (index > -1) {
          remaining.splice(index, 1);
        }
      });
    }

    console.log(`[McpWorkflowPlanner] Execution order: ${result.length} groups`);
    return result;
  }

  /**
   * Get human-readable plan summary
   */
  getPlanSummary(plan: ExecutionPlan): string {
    const executionOrder = this.getExecutionOrder(plan);

    let summary = `Execution Plan for: "${plan.originalQuery}"\n`;
    summary += `ID: ${plan.workflowId}\n`;
    summary += `Estimated Duration: ${Math.round(plan.estimatedDuration / 1000)}s\n`;
    summary += `Risk Level: ${plan.riskLevel}\n`;

    if (plan.requiresUserInput) {
      summary += `⚠️  Requires user input/confirmation\n`;
    }

    summary += `\nExecution Order:\n`;

    executionOrder.forEach((group, index) => {
      summary += `  Group ${index + 1} (${group.length > 1 ? 'parallel' : 'sequential'}):\n`;
      group.forEach(step => {
        const toolInfo = step.selectedTool ? `[${step.selectedTool}]` : '[no tool]';
        summary += `    - ${toolInfo} ${step.description}\n`;
      });
    });

    return summary;
  }
}