/**
 * Workflow Generator
 *
 * Converts recorded actions into workflow definitions that can be
 * saved and replayed.
 */

import { v4 as uuidv4 } from 'uuid';

import {
  RecordedAction,
  RecordedElement,
  WorkflowDefinition,
  WorkflowStep,
} from '../types';

import { SelectorGenerator } from './SelectorGenerator';
import { VariableExtractor } from './VariableExtractor';

export class WorkflowGenerator {
  private selectorGenerator: SelectorGenerator;
  private variableExtractor: VariableExtractor;

  constructor() {
    this.selectorGenerator = new SelectorGenerator();
    this.variableExtractor = new VariableExtractor();
  }

  generate(
    actions: RecordedAction[],
    name: string,
    description: string
  ): WorkflowDefinition {
    // Step 1: Convert actions to workflow steps
    const steps = this.convertActionsToSteps(actions);

    // Step 2: Identify variables
    const { steps: stepsWithVars, variables } =
      this.variableExtractor.extract(steps);

    // Step 3: Create workflow definition
    const workflow: WorkflowDefinition = {
      id: uuidv4(),
      name,
      description,
      version: '1.0',
      default_wait_time: 0.5,
      input_schema: variables,
      steps: stepsWithVars,
      metadata: {
        created_at: new Date().toISOString(),
        generation_mode: 'recording',
        action_count: actions.length,
      },
    };

    // Step 4: Validate and clean
    return this.cleanWorkflow(workflow);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTION TO STEP CONVERSION
  // ═══════════════════════════════════════════════════════════════════════

  private convertActionsToSteps(actions: RecordedAction[]): WorkflowStep[] {
    const steps: WorkflowStep[] = [];

    for (const action of actions) {
      const step = this.actionToStep(action);
      if (step) {
        steps.push(step);
      }
    }

    // Merge consecutive inputs into same field
    return this.mergeConsecutiveInputs(steps);
  }

  private actionToStep(action: RecordedAction): WorkflowStep | null {
    switch (action.type) {
      case 'navigation':
        return {
          type: 'navigation',
          url: action.value || action.pageUrl,
          description: `Navigate to ${this.getHostname(action.pageUrl)}`,
        };

      case 'click': {
        if (!action.element) return null;
        const clickTargetText = this.getClickTargetText(action.element);
        return {
          type: 'click',
          target_text: clickTargetText,
          description: clickTargetText
            ? `Click on "${this.truncateText(clickTargetText, 50)}"`
            : `Click on element`,
          selectorStrategies: this.selectorGenerator.generate(action.element),
          container_hint: action.element.containerHint,
        };
      }

      case 'input':
        if (!action.element) return null;
        return {
          type: 'input',
          target_text: this.getInputTargetText(action.element),
          value: action.value || '',
          description: `Enter text into "${this.getInputTargetText(action.element)}"`,
          selectorStrategies: this.selectorGenerator.generate(action.element),
        };

      case 'keypress':
        return {
          type: 'key_press',
          key: action.key || 'Enter',
          target_text: action.element?.innerText,
          description: `Press ${action.key} key`,
        };

      case 'select_change':
        if (!action.element) return null;
        return {
          type: 'select_change',
          target_text: this.getInputTargetText(action.element),
          selectedText: action.selectedText || action.value || '',
          description: `Select "${action.selectedText}" from dropdown`,
          selectorStrategies: this.selectorGenerator.generate(action.element),
        };

      case 'scroll':
        return {
          type: 'scroll',
          scrollX: action.scrollX || 0,
          scrollY: action.scrollY || 0,
          description: `Scroll page to (${action.scrollX}, ${action.scrollY})`,
        };

      case 'submit':
        if (!action.element) return null;
        return {
          type: 'click',
          target_text: 'Submit',
          description: 'Submit form',
          selectorStrategies: this.selectorGenerator.generate(action.element),
        };

      default:
        return null;
    }
  }

  private getClickTargetText(element: RecordedElement): string {
    // Priority: innerText > aria-label > title > alt > parent context
    return (
      element.innerText ||
      element.ariaLabel ||
      element.title ||
      element.altText ||
      element.parentText ||
      ''
    );
  }

  private getInputTargetText(element: RecordedElement): string {
    // Priority: placeholder > aria-label > label text > parent context
    return (
      element.placeholder ||
      element.ariaLabel ||
      element.parentText ||
      element.innerText ||
      'Input field'
    );
  }

  private getHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private mergeConsecutiveInputs(steps: WorkflowStep[]): WorkflowStep[] {
    // Merge rapid consecutive inputs to same field
    const merged: WorkflowStep[] = [];

    for (let i = 0; i < steps.length; i++) {
      const current = steps[i];

      if (current.type === 'input' && merged.length > 0) {
        const previous = merged[merged.length - 1];

        // If same field, update value instead of adding new step
        if (
          previous.type === 'input' &&
          previous.target_text === current.target_text
        ) {
          previous.value = current.value;
          continue;
        }
      }

      merged.push(current);
    }

    return merged;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════

  private cleanWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
    // Remove redundant navigations
    workflow.steps = this.removeRedundantNavigations(workflow.steps);

    // Remove truly empty steps (keep clicks without text if they have selectors)
    workflow.steps = workflow.steps.filter((step) => {
      if (
        step.type === 'click' &&
        !step.target_text &&
        !step.selectorStrategies?.length
      ) {
        return false;
      }
      // Keep input steps even with empty value - the value might be intentionally cleared
      return true;
    });

    // Limit selector strategies to top 5 per step
    workflow.steps = workflow.steps.map((step) => {
      if (step.selectorStrategies && step.selectorStrategies.length > 5) {
        step.selectorStrategies = step.selectorStrategies.slice(0, 5);
      }
      return step;
    });

    return workflow;
  }

  private removeRedundantNavigations(steps: WorkflowStep[]): WorkflowStep[] {
    // Remove navigations that are immediately followed by another navigation
    return steps.filter((step, index) => {
      if (
        step.type === 'navigation' &&
        index < steps.length - 1 &&
        steps[index + 1].type === 'navigation'
      ) {
        return false;
      }
      return true;
    });
  }
}
