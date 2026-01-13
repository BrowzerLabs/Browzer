/**
 * Generalization Service
 *
 * Adapts workflows based on user prompts and page context.
 * Supports dynamic modifications like "change visibility of 3rd repo".
 */

import {
  GeneralizationRequest,
  GeneralizationResult,
  WorkflowModification,
  WorkflowDefinition,
  WorkflowStep,
  ParsedIntent,
  InputVariable,
  PageContext,
  SelectorStrategy,
} from './types';

export class GeneralizationService {
  /**
   * Generalize a workflow based on user prompt and intent
   */
  async generalize(
    request: GeneralizationRequest,
    workflow: WorkflowDefinition,
    intent: ParsedIntent
  ): Promise<GeneralizationResult> {
    console.log(
      '[GeneralizationService] Generalizing workflow:',
      workflow.name
    );
    console.log('[GeneralizationService] Intent:', intent);

    // Handle different intent types
    switch (intent.type) {
      case 'select_nth_item':
        return this.handleNthItemSelection(
          workflow,
          intent,
          request.pageContext
        );

      case 'change_target':
        return this.handleTargetChange(workflow, intent, request.pageContext);

      case 'add_condition':
        return this.handleAddCondition(workflow, intent);

      case 'loop_items':
        return this.handleLoopItems(workflow, intent, request.pageContext);

      case 'filter_items':
        return this.handleFilterItems(workflow, intent, request.pageContext);

      case 'custom':
      default:
        return this.handleCustomGeneralization(workflow, request, intent);
    }
  }

  /**
   * Handle nth item selection (e.g., "3rd repo")
   */
  private async handleNthItemSelection(
    workflow: WorkflowDefinition,
    intent: ParsedIntent,
    pageContext?: PageContext
  ): Promise<GeneralizationResult> {
    const { index, itemType } = intent.parameters;
    const modifications: WorkflowModification[] = [];
    const newVariables: InputVariable[] = [];

    // Clone workflow for modification
    const adaptedWorkflow = JSON.parse(
      JSON.stringify(workflow)
    ) as WorkflowDefinition;

    // Find steps that interact with lists/items
    adaptedWorkflow.steps = adaptedWorkflow.steps.map((step, stepIndex) => {
      // Look for steps that might target list items
      const isListItemStep = this.isListItemInteraction(step, itemType);

      if (isListItemStep) {
        // Add nth_item selector strategy
        const nthStrategy: SelectorStrategy = {
          type: 'nth_item',
          value: this.getContainerSelector(step, itemType),
          priority: 1,
          metadata: {
            index: index,
            containerSelector: this.getContainerSelector(step, itemType),
          },
        };

        // Prepend nth_item strategy for higher priority
        step.selectorStrategies = [
          nthStrategy,
          ...(step.selectorStrategies || []),
        ];

        modifications.push({
          type: 'modify_step',
          stepIndex,
          originalStep: workflow.steps[stepIndex],
          newStep: step,
          reason: `Modified to target ${this.indexToOrdinal(index + 1)} ${itemType}`,
        });
      }

      return step;
    });

    // Add variable for index if not handling specific index
    if (index === -1) {
      newVariables.push({
        name: 'item_index',
        type: 'number',
        description: `Index of the ${itemType} to select (1-based)`,
        required: true,
        default_value: '1',
      });
    }

    return {
      adaptedWorkflow,
      modifications,
      newVariables,
      explanation: `Workflow adapted to target the ${this.indexToOrdinal(index + 1)} ${itemType}`,
    };
  }

  /**
   * Handle target change (e.g., "change visibility to private")
   */
  private async handleTargetChange(
    workflow: WorkflowDefinition,
    intent: ParsedIntent,
    pageContext?: PageContext
  ): Promise<GeneralizationResult> {
    const { target, newValue, action } = intent.parameters;
    const modifications: WorkflowModification[] = [];
    const newVariables: InputVariable[] = [];

    const adaptedWorkflow = JSON.parse(
      JSON.stringify(workflow)
    ) as WorkflowDefinition;

    // Find steps related to the target
    adaptedWorkflow.steps = adaptedWorkflow.steps.map((step, stepIndex) => {
      const isTargetStep = this.isRelatedToTarget(step, target);

      if (isTargetStep && step.type === 'input' && newValue) {
        // Update the value for input steps
        step.value = newValue;
        modifications.push({
          type: 'modify_step',
          stepIndex,
          originalStep: workflow.steps[stepIndex],
          newStep: step,
          reason: `Changed ${target} to ${newValue}`,
        });
      } else if (isTargetStep && step.type === 'click' && action) {
        // For clicks, we might need to target specific options
        step.target_text = this.getActionTargetText(action);
        modifications.push({
          type: 'modify_step',
          stepIndex,
          originalStep: workflow.steps[stepIndex],
          newStep: step,
          reason: `Changed click target for ${action}`,
        });
      }

      return step;
    });

    // Add variable for the new value if parameterized
    if (newValue && newValue.startsWith('{{')) {
      const varName = newValue.replace(/[{}]/g, '');
      newVariables.push({
        name: varName,
        type: 'string',
        description: `New value for ${target}`,
        required: true,
      });
    }

    return {
      adaptedWorkflow,
      modifications,
      newVariables,
      explanation: `Workflow adapted to change ${target}${newValue ? ` to ${newValue}` : ''}`,
    };
  }

  /**
   * Handle adding conditions
   */
  private async handleAddCondition(
    workflow: WorkflowDefinition,
    intent: ParsedIntent
  ): Promise<GeneralizationResult> {
    const { condition, action } = intent.parameters;
    const modifications: WorkflowModification[] = [];
    const newVariables: InputVariable[] = [];

    const adaptedWorkflow = JSON.parse(
      JSON.stringify(workflow)
    ) as WorkflowDefinition;

    // Add an assert step for the condition before the relevant action
    const assertStep: WorkflowStep = {
      type: 'assert',
      description: `Check condition: ${condition}`,
      target_text: condition,
      selectorStrategies: [],
    };

    // Find where to insert the assertion
    const actionIndex = adaptedWorkflow.steps.findIndex(
      (step) =>
        step.description?.toLowerCase().includes(action.toLowerCase()) ||
        step.target_text?.toLowerCase().includes(action.toLowerCase())
    );

    if (actionIndex > 0) {
      adaptedWorkflow.steps.splice(actionIndex, 0, assertStep);
      modifications.push({
        type: 'add_step',
        stepIndex: actionIndex,
        newStep: assertStep,
        reason: `Added condition check: ${condition}`,
      });
    }

    return {
      adaptedWorkflow,
      modifications,
      newVariables,
      explanation: `Added conditional check: if ${condition} then ${action}`,
    };
  }

  /**
   * Handle looping through items
   */
  private async handleLoopItems(
    workflow: WorkflowDefinition,
    intent: ParsedIntent,
    pageContext?: PageContext
  ): Promise<GeneralizationResult> {
    const { itemType } = intent.parameters;
    const modifications: WorkflowModification[] = [];

    const adaptedWorkflow = JSON.parse(
      JSON.stringify(workflow)
    ) as WorkflowDefinition;

    // Add metadata to mark this as a loop workflow
    adaptedWorkflow.metadata = {
      ...adaptedWorkflow.metadata,
      isLoop: true,
      loopItemType: itemType,
      loopSelector: this.getContainerSelector(
        adaptedWorkflow.steps[0],
        itemType
      ),
    };

    const newVariables: InputVariable[] = [
      {
        name: 'loop_count',
        type: 'number',
        description: `Number of ${itemType}s to process`,
        required: false,
        default_value: '0', // 0 means all items
      },
      {
        name: 'current_index',
        type: 'number',
        description: `Current ${itemType} index (auto-managed)`,
        required: false,
        default_value: '0',
      },
    ];

    modifications.push({
      type: 'modify_step',
      reason: `Workflow configured to loop through ${itemType}s`,
    });

    return {
      adaptedWorkflow,
      modifications,
      newVariables,
      explanation: `Workflow will iterate through each ${itemType}`,
    };
  }

  /**
   * Handle filtering items
   */
  private async handleFilterItems(
    workflow: WorkflowDefinition,
    intent: ParsedIntent,
    pageContext?: PageContext
  ): Promise<GeneralizationResult> {
    const { filterCondition } = intent.parameters;
    const modifications: WorkflowModification[] = [];
    const newVariables: InputVariable[] = [];

    const adaptedWorkflow = JSON.parse(
      JSON.stringify(workflow)
    ) as WorkflowDefinition;

    // Add filter metadata
    adaptedWorkflow.metadata = {
      ...adaptedWorkflow.metadata,
      filter: filterCondition,
    };

    // Add assertion step to check filter condition
    const filterStep: WorkflowStep = {
      type: 'assert',
      description: `Filter check: ${filterCondition}`,
      target_text: filterCondition,
      selectorStrategies: [],
    };

    adaptedWorkflow.steps.unshift(filterStep);
    modifications.push({
      type: 'add_step',
      stepIndex: 0,
      newStep: filterStep,
      reason: `Added filter: ${filterCondition}`,
    });

    newVariables.push({
      name: 'filter_value',
      type: 'string',
      description: 'Value to filter by',
      required: true,
      default_value: filterCondition,
    });

    return {
      adaptedWorkflow,
      modifications,
      newVariables,
      explanation: `Workflow will only process items where ${filterCondition}`,
    };
  }

  /**
   * Handle custom generalization
   * Returns unchanged workflow for custom prompts (LLM integration not available)
   */
  private async handleCustomGeneralization(
    workflow: WorkflowDefinition,
    request: GeneralizationRequest,
    _intent: ParsedIntent
  ): Promise<GeneralizationResult> {
    console.log(
      '[GeneralizationService] Custom generalization not supported, returning unchanged workflow'
    );

    // Return workflow unchanged for custom prompts
    return {
      adaptedWorkflow: workflow,
      modifications: [],
      newVariables: [],
      explanation: `Custom generalization not available. Prompt: ${request.userPrompt}`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a step interacts with list items
   */
  private isListItemInteraction(step: WorkflowStep, itemType: string): boolean {
    const listIndicators = [
      'repo',
      'repository',
      'item',
      'row',
      'entry',
      'result',
      'card',
      'post',
      'article',
      'list',
      'menu',
    ];

    const stepText = [
      step.description || '',
      step.target_text || '',
      ...(step.selectorStrategies?.map((s) => s.value) || []),
    ]
      .join(' ')
      .toLowerCase();

    return (
      listIndicators.some((indicator) => stepText.includes(indicator)) ||
      stepText.includes(itemType.toLowerCase())
    );
  }

  /**
   * Get container selector for a list
   */
  private getContainerSelector(step: WorkflowStep, itemType: string): string {
    // Try to find existing container from selector strategies
    const cssStrategy = step.selectorStrategies?.find((s) => s.type === 'css');
    if (cssStrategy) {
      // Extract parent selector pattern
      const selector = cssStrategy.value;
      const parts = selector.split(' ');
      if (parts.length > 1) {
        return parts.slice(0, -1).join(' ');
      }
    }

    // Default container selectors based on item type
    const defaultContainers: Record<string, string> = {
      repo: '[class*="repo"], [class*="repository"]',
      repository: '[class*="repo"], [class*="repository"]',
      item: 'ul > li, ol > li, [role="listitem"]',
      row: 'tbody > tr, [role="row"]',
      card: '[class*="card"], [role="article"]',
      result: '[class*="result"], [class*="search"]',
    };

    return defaultContainers[itemType.toLowerCase()] || '*';
  }

  /**
   * Check if step is related to a target
   */
  private isRelatedToTarget(step: WorkflowStep, target: string): boolean {
    const stepText = [
      step.description || '',
      step.target_text || '',
      step.value || '',
    ]
      .join(' ')
      .toLowerCase();

    return stepText.includes(target.toLowerCase());
  }

  /**
   * Get target text for visibility actions
   */
  private getActionTargetText(action: string): string {
    const actionMappings: Record<string, string> = {
      make_private: 'Private',
      make_public: 'Public',
      toggle: 'Change visibility',
    };

    return actionMappings[action] || action;
  }

  /**
   * Convert index to ordinal string
   */
  private indexToOrdinal(n: number): string {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }
}
