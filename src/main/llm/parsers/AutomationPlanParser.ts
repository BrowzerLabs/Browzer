import Anthropic from '@anthropic-ai/sdk';
import { AutomationStep, ParsedAutomationPlan } from '..';


export class AutomationPlanParser {
  
  public static parsePlan(response: Anthropic.Message): ParsedAutomationPlan {
    const steps: AutomationStep[] = [];
    let analysis = '';
    let stepOrder = 0;
    let planMetadata: { planType?: 'intermediate' | 'final'; } | null = null;
    let metadataToolUseId: string | undefined = undefined;

    for (const block of response.content) {
      if (block.type === 'text') {
        analysis += block.text + '\n';
      } else if (block.type === 'tool_use') {
        if (block.name === 'declare_plan_metadata') {
          planMetadata = block.input as any;
          metadataToolUseId = block.id;
        } else {
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
      planType,
      metadataToolUseId
    };
  }

}
