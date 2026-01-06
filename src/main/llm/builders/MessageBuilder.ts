/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';

import { ExecutedStep, AutomationPlan } from '../core/types';

export class MessageBuilder {
  public static buildToolResultsForPlan(
    plan: AutomationPlan,
    executedSteps: ExecutedStep[]
  ): Anthropic.Messages.ToolResultBlockParam[] {
    const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

    if (plan.planTypeToolId) {
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: plan.planTypeToolId,
        content: `✅`,
      });
    }

    for (let i = 0; i < plan.steps.length; i++) {
      const planStep = plan.steps[i];
      const executedStep = executedSteps.find(
        (es) => es.toolName === planStep.toolName && es.result
      );

      if (!executedStep || !executedStep.result) {
        // Step hasn't been executed yet - stop here
        break;
      }

      const result = executedStep.result;

      // For extract_context and take_snapshot, include full context/snapshot data
      if (
        planStep.toolName === 'extract_context' ||
        planStep.toolName === 'take_snapshot'
      ) {
        // extract_context returns 'context', take_snapshot returns 'data'
        const contextData =
          result.context ||
          (result as any).data ||
          (result as any).snapshot ||
          result.value;
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: planStep.toolUseId,
          content: contextData.toString(),
        });
      } else {
        // For other tools, simple success message
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: planStep.toolUseId,
          content: `✅`,
        });
      }
    }

    return toolResultBlocks;
  }

  public static buildToolResultsForErrorRecovery(
    plan: AutomationPlan,
    executedSteps: ExecutedStep[]
  ): Array<{
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  }> {
    const toolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    if (plan.planTypeToolId) {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: plan.planTypeToolId,
        content: `✅`,
      });
    }

    let executedCount = 0;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Check if this step was executed
      if (executedCount < executedSteps.length) {
        const executedStep = executedSteps[executedCount];

        // Verify this is the right step (match by tool name)
        if (executedStep.toolName === step.toolName) {
          // Add tool result for this executed step
          toolResults.push({
            type: 'tool_result',
            tool_use_id: step.toolUseId,
            content: executedStep.success
              ? `✅`
              : JSON.stringify({
                  error:
                    executedStep.error ||
                    executedStep.result?.error?.message ||
                    '❌ Unknown error',
                  toolName: step.toolName,
                }),
          });
          executedCount++;
        } else {
          // Mismatch - this step wasn't executed
          toolResults.push({
            type: 'tool_result',
            tool_use_id: step.toolUseId,
            content: `❌ - automation stopped before reaching this step`,
          });
        }
      } else {
        // This step wasn't executed yet
        toolResults.push({
          type: 'tool_result',
          tool_use_id: step.toolUseId,
          content: `❌ - automation stopped before reaching this step`,
        });
      }
    }

    return toolResults;
  }

  public static buildUserMessageWithToolResults(
    toolResults: Anthropic.Messages.ToolResultBlockParam[]
  ): Anthropic.MessageParam {
    return {
      role: 'user',
      content: toolResults,
    };
  }

  public static buildUserMessageWithToolResultsAndText(
    toolResults: any[],
    textPrompt: string
  ): Anthropic.MessageParam {
    return {
      role: 'user',
      content: [
        ...toolResults,
        {
          type: 'text',
          text: textPrompt,
        },
      ],
    };
  }
}
