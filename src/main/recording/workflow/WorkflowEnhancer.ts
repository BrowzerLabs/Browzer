import { WorkflowDefinition, InputVariable } from '../types';

export interface EnhancementResult {
  success: boolean;
  workflow?: WorkflowDefinition;
  error?: string;
}

export interface EnhancementOptions {
  improveDescriptions?: boolean;
  detectVariables?: boolean;
  suggestGrouping?: boolean;
}

export class WorkflowEnhancer {
  async enhance(
    workflow: WorkflowDefinition,
    options: EnhancementOptions = {}
  ): Promise<EnhancementResult> {
    const { improveDescriptions = true, detectVariables = true } = options;

    console.log('[WorkflowEnhancer] Enhancing workflow locally');

    try {
      let enhancedWorkflow = { ...workflow };

      // Apply local enhancements
      if (improveDescriptions) {
        enhancedWorkflow = this.improveStepDescriptions(enhancedWorkflow);
      }

      if (detectVariables) {
        enhancedWorkflow = this.detectAndAddVariables(enhancedWorkflow);
      }

      // Update metadata
      enhancedWorkflow.metadata = {
        ...enhancedWorkflow.metadata,
        created_at:
          enhancedWorkflow.metadata?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        generation_mode: 'ai_generated',
      };

      console.log('[WorkflowEnhancer] Enhancement complete');
      return {
        success: true,
        workflow: enhancedWorkflow,
      };
    } catch (error) {
      console.error('[WorkflowEnhancer] Enhancement failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Enhancement failed',
      };
    }
  }

  /**
   * Improve step descriptions based on action type
   */
  private improveStepDescriptions(
    workflow: WorkflowDefinition
  ): WorkflowDefinition {
    const steps = workflow.steps.map((step) => {
      if (step.description && step.description.length > 10) {
        return step; // Already has a good description
      }

      // Generate description based on step type and target
      let description = step.description || '';

      switch (step.type) {
        case 'click':
          description = step.target_text
            ? `Click on "${step.target_text}"`
            : 'Click element';
          break;
        case 'input':
          description = step.target_text
            ? `Enter value in "${step.target_text}" field`
            : 'Enter value in input field';
          break;
        case 'navigation':
          description = `Navigate to ${step.url || 'page'}`;
          break;
        case 'select_change':
          description = step.selectedText
            ? `Select "${step.selectedText}" option`
            : 'Select option';
          break;
        case 'scroll':
          description = 'Scroll page';
          break;
        case 'wait':
          description = `Wait for ${step.wait_time || 1000}ms`;
          break;
        case 'key_press':
          description = step.key ? `Press "${step.key}" key` : 'Press key';
          break;
        case 'extract':
          description = step.extractionGoal
            ? `Extract: ${step.extractionGoal}`
            : 'Extract data';
          break;
        default:
          description = step.type || 'Action';
      }

      return { ...step, description };
    });

    return { ...workflow, steps };
  }

  /**
   * Detect potential variables in the workflow
   */
  private detectAndAddVariables(
    workflow: WorkflowDefinition
  ): WorkflowDefinition {
    const detectedVariables: InputVariable[] = [];
    const existingVarNames = new Set(
      (workflow.input_schema || []).map((v) => v.name)
    );

    // Patterns that suggest parameterizable values
    const patterns = [
      {
        regex: /[\w.-]+@[\w.-]+\.\w+/,
        name: 'email',
        format: 'email' as const,
        description: 'Email address',
      },
      {
        regex: /^(http|https):\/\//,
        name: 'url',
        format: 'url' as const,
        description: 'URL',
      },
    ];

    // Scan input steps for parameterizable values
    workflow.steps.forEach((step, index) => {
      if (step.type === 'input' && step.value) {
        for (const pattern of patterns) {
          if (pattern.regex.test(step.value)) {
            const varName = `${pattern.name}_${index}`;
            if (!existingVarNames.has(varName)) {
              detectedVariables.push({
                name: varName,
                type: 'string',
                format: pattern.format,
                description: pattern.description,
                required: true,
                default: step.value,
              });
              existingVarNames.add(varName);
            }
            break;
          }
        }
      }
    });

    // Merge with existing variables
    const input_schema = [
      ...(workflow.input_schema || []),
      ...detectedVariables,
    ];

    return { ...workflow, input_schema };
  }
}
