import Anthropic from '@anthropic-ai/sdk';

/**
 * Parsed automation step from Claude's response
 */
export interface AutomationStep {
  toolName: string;
  toolUseId: string;
  input: any;
  order: number; // Sequence number in the plan
}

/**
 * Result of parsing Claude's automation plan
 */
export interface ParsedAutomationPlan {
  steps: AutomationStep[];
  analysis?: string; // Claude's initial analysis/explanation
  totalSteps: number;
  hasToolCalls: boolean;
  planType: 'intermediate' | 'final'; // Whether this is a partial plan or final plan
  metadataToolUseId?: string; // Tool use ID for declare_plan_metadata (needed for tool_result)
}

/**
 * AutomationPlanParser - Extracts tool calls from Claude's response
 * 
 * Claude Sonnet 4.5 returns a Message with content blocks.
 * We need to extract:
 * 1. Text blocks (analysis/explanation)
 * 2. Tool use blocks (the actual automation steps)
 */
export class AutomationPlanParser {
  /**
   * Parse Claude's response into an executable automation plan
   * 
   * @param response - Claude's Message response
   * @returns Parsed automation plan with ordered steps
   */
  public static parsePlan(response: Anthropic.Message): ParsedAutomationPlan {
    const steps: AutomationStep[] = [];
    let analysis = '';
    let stepOrder = 0;
    let planMetadata: { planType?: 'intermediate' | 'final'; } | null = null;
    let metadataToolUseId: string | undefined = undefined;

    // Iterate through content blocks
    for (const block of response.content) {
      if (block.type === 'text') {
        analysis += block.text + '\n';
      } else if (block.type === 'tool_use') {
        // Check if this is the metadata tool
        if (block.name === 'declare_plan_metadata') {
          planMetadata = block.input as any;
          metadataToolUseId = block.id; // Store the tool_use_id for tool_result
        } else {
          // Regular automation tool
          steps.push({
            toolName: block.name,
            toolUseId: block.id,
            input: block.input,
            order: stepOrder++
          });
        }
      }
    }

    const planType = planMetadata?.planType ?? 'final';
  

    return {
      steps,
      analysis: analysis.trim(),
      totalSteps: steps.length,
      hasToolCalls: steps.length > 0,
      planType,
      metadataToolUseId // Include the tool_use_id for tool_result
    };
  }

}
