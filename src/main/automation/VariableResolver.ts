/**
 * Variable Resolver
 *
 * Handles variable substitution in workflow steps.
 */

import { WorkflowStep, ExecutionContext } from './types';

export class VariableResolver {
  private readonly VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

  /**
   * Resolve all variables in a workflow step
   */
  resolveStep(step: WorkflowStep, context: ExecutionContext): WorkflowStep {
    const resolved = JSON.parse(JSON.stringify(step)) as WorkflowStep;

    // Resolve value field
    if (resolved.value) {
      resolved.value = this.resolveString(resolved.value, context);
    }

    // Resolve URL field
    if (resolved.url) {
      resolved.url = this.resolveString(resolved.url, context);
    }

    // Resolve target_text field
    if (resolved.target_text) {
      resolved.target_text = this.resolveString(resolved.target_text, context);
    }

    // Resolve description field
    if (resolved.description) {
      resolved.description = this.resolveString(resolved.description, context);
    }

    // Resolve selector strategies
    if (resolved.selectorStrategies) {
      resolved.selectorStrategies = resolved.selectorStrategies.map(
        (strategy) => ({
          ...strategy,
          value: this.resolveString(strategy.value, context),
        })
      );
    }

    return resolved;
  }

  /**
   * Resolve variables in a string
   */
  resolveString(template: string, context: ExecutionContext): string {
    return template.replace(this.VARIABLE_PATTERN, (match, varName) => {
      // Check variables first
      if (context.variables[varName] !== undefined) {
        return String(context.variables[varName]);
      }

      // Check extracted data
      if (context.extractedData[varName] !== undefined) {
        return String(context.extractedData[varName]);
      }

      // Return original placeholder if not found
      console.warn(`[VariableResolver] Variable not found: ${varName}`);
      return match;
    });
  }

  /**
   * Extract variable names from a template string
   */
  extractVariableNames(template: string): string[] {
    const names: string[] = [];
    let match;

    while ((match = this.VARIABLE_PATTERN.exec(template)) !== null) {
      if (!names.includes(match[1])) {
        names.push(match[1]);
      }
    }

    // Reset regex lastIndex
    this.VARIABLE_PATTERN.lastIndex = 0;

    return names;
  }

  /**
   * Check if a string contains variables
   */
  hasVariables(str: string): boolean {
    const result = this.VARIABLE_PATTERN.test(str);
    this.VARIABLE_PATTERN.lastIndex = 0;
    return result;
  }

  /**
   * Validate that all required variables are provided
   */
  validateVariables(
    template: string,
    context: ExecutionContext
  ): { valid: boolean; missing: string[] } {
    const required = this.extractVariableNames(template);
    const missing: string[] = [];

    for (const name of required) {
      if (
        context.variables[name] === undefined &&
        context.extractedData[name] === undefined
      ) {
        missing.push(name);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
