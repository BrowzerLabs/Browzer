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
          tag: action.element.tagName || undefined,
          role: this.getElementRole(action.element),
          css_selector: this.getSimpleCssSelector(action.element),
          selectorStrategies: this.selectorGenerator.generate(action.element),
          container_hint: action.element.containerHint,
        };
      }

      case 'input':
        if (!action.element) return null;
        return {
          type: 'input',
          input: action.value || '',
          target_text: this.getInputTargetText(action.element),
          description: `Enter text into "${this.getInputTargetText(action.element)}"`,
          tag: action.element.tagName,
          css_selector: this.getSimpleCssSelector(action.element),
          selectorStrategies: this.selectorGenerator.generate(action.element),
        };

      case 'keypress': {
        // Format key with modifiers if present
        const modifiers = action.modifiers || [];
        let keyDescription = action.key || 'Enter';

        // Build keys array: modifiers + key
        const keys: string[] = [...modifiers];
        if (action.key) {
          keys.push(action.key);
        }

        if (modifiers.length > 0) {
          const modifierDisplay = modifiers
            .map((m) => {
              switch (m) {
                case 'cmd':
                  return 'Cmd';
                case 'ctrl':
                  return 'Ctrl';
                case 'alt':
                  return 'Alt';
                case 'shift':
                  return 'Shift';
                default:
                  return m;
              }
            })
            .join('+');
          keyDescription = `${modifierDisplay}+${action.key}`;
        }
        return {
          type: 'key_press',
          keys: keys,
          description: `Press ${keyDescription}`,
        };
      }

      case 'select_change':
        if (!action.element) return null;
        return {
          type: 'select_change',
          target_text: this.getInputTargetText(action.element),
          selectedText: action.selectedText || action.value || '',
          description: `Select "${action.selectedText}" from dropdown`,
          selectorStrategies: this.selectorGenerator.generate(action.element),
        };

      case 'checkbox_change': {
        if (!action.element) return null;
        const checkboxLabel =
          action.label || action.element.innerText || 'checkbox';
        const checkState = action.checked ? 'Check' : 'Uncheck';
        return {
          type: 'click',
          target_text: checkboxLabel,
          description: `${checkState} "${this.truncateText(checkboxLabel, 50)}"`,
          selectorStrategies: this.selectorGenerator.generate(action.element),
          container_hint: action.element.containerHint,
        };
      }

      case 'radio_change': {
        if (!action.element) return null;
        const radioLabel =
          action.label ||
          action.element.innerText ||
          action.value ||
          'radio option';
        return {
          type: 'click',
          target_text: radioLabel,
          description: `Select radio option "${this.truncateText(radioLabel, 50)}"`,
          selectorStrategies: this.selectorGenerator.generate(action.element),
          container_hint: action.element.containerHint,
        };
      }

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

  private getSimpleCssSelector(element: RecordedElement): string | undefined {
    // Prefer ID if available
    if (element.id) {
      return `#${element.id}`;
    }

    // If className exists, use the first simple class name
    if (element.className) {
      const classes = element.className.split(' ').filter((c) => c.trim());
      // Find a simple class (no special chars, not too generic)
      const simpleClass = classes.find((cls) => {
        const isSimple = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(cls);
        const isNotGeneric = ![
          'container',
          'wrapper',
          'inner',
          'outer',
        ].includes(cls.toLowerCase());
        return isSimple && isNotGeneric;
      });
      if (simpleClass) {
        return `.${simpleClass}`;
      }
    }

    return undefined;
  }

  private getElementRole(element: RecordedElement): string | undefined {
    // Map tag names to implicit ARIA roles
    const tagToRole: Record<string, string> = {
      button: 'button',
      a: 'link',
      input: 'textbox',
      select: 'combobox',
      textarea: 'textbox',
      checkbox: 'checkbox',
      radio: 'radio',
      img: 'img',
      nav: 'navigation',
      main: 'main',
      header: 'banner',
      footer: 'contentinfo',
      aside: 'complementary',
      article: 'article',
      section: 'region',
      form: 'form',
      table: 'table',
      ul: 'list',
      ol: 'list',
      li: 'listitem',
    };

    const tag = element.tagName?.toLowerCase();

    // Special handling for input types
    if (tag === 'input' && element.type) {
      const inputType = element.type.toLowerCase();
      if (inputType === 'checkbox') return 'checkbox';
      if (inputType === 'radio') return 'radio';
      if (inputType === 'button' || inputType === 'submit') return 'button';
    }

    // Return mapped role or undefined
    return tag ? tagToRole[tag] : undefined;
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
