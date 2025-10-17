/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LLM Service for Browser Automation
 * 
 * Uses Anthropic Claude Sonnet 4.5 with:
 * - Tool use (not system prompt tools)
 * - Prompt caching for recorded context
 * - Proper error handling
 */

import Anthropic from '@anthropic-ai/sdk';
import { RecordingSession, RecordedAction } from '@/shared/types/recording';
import { AutomationStep, LLMAutomationResponse } from '@/shared/types/automation';
import { AutomationTools } from './AutomationTools';

export class LLMService {
  private client: Anthropic | null = null;

  /**
   * Initialize the Anthropic client with API key
   */
  public initialize(apiKey: string): void {
    this.client = new Anthropic({
      apiKey: apiKey
    });
  }

  /**
   * Generate automation plan from user prompt and recorded session
   */
  public async generateAutomationPlan(
    userPrompt: string,
    recordingSession: RecordingSession
  ): Promise<LLMAutomationResponse> {
    if (!this.client) {
      return {
        success: false,
        error: 'LLM Service not initialized. Please provide API key.'
      };
    }

    try {
      console.log('[LLMService] Generating automation plan...');
      console.log('[LLMService] User prompt:', userPrompt);
      console.log('[LLMService] Recording session:', recordingSession.name);

      // Build system prompt with recorded context (will be cached)
      const systemPrompt = this.buildSystemPrompt(recordingSession);

      // Get automation tools
      const tools = AutomationTools.getAllTools();

      // Call Claude with tool use
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' } // Cache the recorded context
          }
        ],
        tools: tools as Anthropic.Tool[],
        messages: [
          {
            role: 'user',
            content: `${userPrompt}\n\nIMPORTANT: Generate the COMPLETE automation plan with ALL necessary steps in this single response. Use multiple tool calls to create the full sequence of actions from start to finish. Do not generate just one step.`
          }
        ]
      });

      console.log('[LLMService] Response received');
      console.log('[LLMService] Stop reason:', response.stop_reason);
      console.log('[LLMService] Usage:', response.usage);
      console.log('[LLMService] Content blocks:', response.content.length);
      console.log('[LLMService] Content types:', response.content.map((block: any) => block.type).join(', '));

      // Extract automation steps from tool use blocks
      const steps = this.extractStepsFromResponse(response);
      console.log('[LLMService] Extracted steps:', steps);

      if (steps.length === 0) {
        return {
          success: false,
          error: 'No automation steps generated. Claude did not use any tools.'
        };
      }

      return {
        success: true,
        steps: steps,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cacheCreation: response.usage.cache_creation_input_tokens,
          cacheRead: response.usage.cache_read_input_tokens
        }
      };

    } catch (error) {
      console.error('[LLMService] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Build system prompt with recorded context
   */
  private buildSystemPrompt(session: RecordingSession): string {
    console.log("actions: ", this.formatRecordedActions(session.actions));

    return `You are an expert browser automation assistant. Your task is to generate a COMPLETE sequence of browser automation actions based on a user's request and a previously recorded workflow.

## YOUR ROLE
You will receive:
1. A recorded browser workflow showing how a similar task was performed
2. A user's request for what they want to automate

You must generate a COMPLETE, DETAILED sequence of ALL automation actions needed to accomplish the user's goal in a SINGLE response. Do not generate just one step - generate the ENTIRE plan from start to finish.

## RECORDED WORKFLOW CONTEXT
This is a recording of how a user previously performed a similar task. Use it as a reference pattern, but adapt it to the current request.

**Recording:** ${session.name}
**Description:** ${session.description || 'No description'}
**Duration:** ${Math.round(session.duration / 1000)}s
**Actions:** ${session.actionCount}
**URL:** ${session.url || 'N/A'}

### Recorded Actions:
${this.formatRecordedActions(session.actions)}

## IMPORTANT GUIDELINES

### 1. Tool Usage
- You MUST use the provided tools to generate automation steps
- Each tool call represents one automation action
- Use multiple tool calls in sequence to build the complete automation
- Do NOT try to explain or describe actions - just use the tools

### 2. Selector Strategy
- Prefer IDs when available (most reliable)
- Use data-testid or aria-label for better stability
- Use text content for buttons and links
- Keep selectors simple and specific
- Look at the recorded actions for selector patterns

### 3. Optimization
- Skip unnecessary intermediate steps when you know the direct path
- If you know the exact URL, navigate directly instead of searching
- Consolidate multiple similar actions when possible
- BUT: Never skip authentication, validation, or state-dependent steps

### 4. Reliability
- Always wait for elements before interacting (use waitForElement)
- Add appropriate waits after navigation or async operations
- Use the most reliable selectors from the recording
- Handle dynamic content with proper waits

### 5. Adaptation
- The recorded workflow is a TEMPLATE, not a script
- Adapt selectors and values to match the user's specific request
- Maintain the same logical flow but update the specifics
- If the user's request differs significantly, use your judgment

## EXAMPLE WORKFLOW

If the recording shows:
1. Navigate to https://github.com
2. Click "New" button
3. Type repository name
4. Click "Create repository"

And the user asks to "create a repo called my-project":

You should generate tool calls for:
1. navigate(url="https://github.com/new") - Skip homepage, go directly
2. waitForElement(selector="#repository-name")
3. type(selector="#repository-name", text="my-project")
4. click(selector="button[type='submit']")

## RESPONSE FORMAT
You MUST use multiple tool calls in your response to create the complete automation plan. Each tool call represents one step. Generate ALL steps needed from start to finish:

1. Start with navigation (if needed)
2. Add wait steps for page loads
3. Include all interactions (clicks, typing, selections)
4. Add waits between actions for stability
5. Complete the entire workflow

**CRITICAL**: Generate the COMPLETE plan with ALL steps in this single response. Do NOT generate just one step. The system will execute all your tool calls sequentially without asking you again.

Example: If the user wants to "create a repo called X", you should generate:
- navigate to github.com/new
- waitForElement for the form
- type into repository name field
- scroll to submit button (if needed)
- click submit button

Generate ALL these steps in your response, not just the first one.`;
  }

  /**
   * Format recorded actions for context with rich details
   */
  private formatRecordedActions(actions: RecordedAction[]): string {
    if (!actions || actions.length === 0) {
      return 'No actions recorded.';
    }

    return actions.slice(0, 50).map((action, index) => {
      let description = `${index + 1}. [${action.type}]`;

      switch (action.type) {
        case 'click':
          description += ` Click on ${this.formatTarget(action.target)}`;
          break;
        case 'input':
          description += ` Type "${action.value}" into ${this.formatTarget(action.target)}`;
          break;
        case 'navigate':
          description += ` Navigate to ${action.url || action.tabUrl || 'new page'}`;
          break;
        case 'select':
          description += ` Select "${action.value}" from ${this.formatTarget(action.target)}`;
          break;
        case 'checkbox':
          description += ` ${action.value ? 'Check' : 'Uncheck'} ${this.formatTarget(action.target)}`;
          break;
        case 'submit':
          description += ` Submit form`;
          break;
        default:
          description += ` ${action.type}`;
      }

      // Add detailed selector info for better automation
      const details: string[] = [];
      
      if (action.target?.id) {
        details.push(`ID: #${action.target.id}`);
      }
      if (action.target?.selector) {
        details.push(`Selector: ${action.target.selector}`);
      }
      if (action.target?.ariaLabel) {
        details.push(`Aria-label: "${action.target.ariaLabel}"`);
      }
      if (action.target?.name) {
        details.push(`Name: ${action.target.name}`);
      }
      if (action.target?.tagName) {
        details.push(`Tag: ${action.target.tagName}`);
      }
      if (action.target?.text && action.target.text.length < 50) {
        details.push(`Text: "${action.target.text}"`);
      }
      
      if (details.length > 0) {
        description += `\n   ${details.join(' | ')}`;
      }

      return description;
    }).join('\n\n');
  }

  /**
   * Format element target for display
   */
  private formatTarget(target: any): string {
    if (!target) return 'element';

    if (target.text) return `"${target.text}"`;
    if (target.ariaLabel) return `[${target.ariaLabel}]`;
    if (target.id) return `#${target.id}`;
    if (target.selector) return target.selector;

    return 'element';
  }

  /**
   * Extract automation steps from Claude's response
   */
  private extractStepsFromResponse(response: any): AutomationStep[] {
    const steps: AutomationStep[] = [];

    // Find all tool_use blocks in the response
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const step = this.convertToolUseToStep(block);
        if (step) {
          steps.push(step);
        }
      }
    }

    return steps;
  }

  /**
   * Convert a tool_use block to an AutomationStep
   */
  private convertToolUseToStep(toolUse: any): AutomationStep | null {
    const { name, input } = toolUse;

    // Map tool name to action type
    const actionMap: Record<string, any> = {
      'navigate': { action: 'navigate', selector: undefined, value: input.url },
      'click': { action: 'click', selector: input.selector, value: undefined },
      'type': { action: 'type', selector: input.selector, value: input.text },
      'select': { action: 'select', selector: input.selector, value: input.value },
      'checkbox': { action: 'checkbox', selector: input.selector, value: input.checked },
      'radio': { action: 'radio', selector: input.selector, value: undefined },
      'pressKey': { action: 'pressKey', selector: undefined, value: input.key },
      'scroll': { action: 'scroll', selector: input.selector, value: input.y || input.x },
      'wait': { action: 'wait', selector: undefined, value: input.duration },
      'waitForElement': { action: 'waitForElement', selector: input.selector, value: input.timeout }
    };

    const mapping = actionMap[name];
    if (!mapping) {
      console.warn('[LLMService] Unknown tool:', name);
      return null;
    }

    return {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action: mapping.action,
      selector: mapping.selector,
      value: mapping.value,
      description: this.generateStepDescription(name, input),
      status: 'pending',
      retryCount: 0
    };
  }

  /**
   * Generate human-readable description for a step
   */
  private generateStepDescription(toolName: string, input: any): string {
    switch (toolName) {
      case 'navigate':
        return `Navigate to ${input.url}`;
      case 'click':
        return `Click ${input.selector}`;
      case 'type':
        return `Type "${input.text}" into ${input.selector}`;
      case 'select':
        return `Select "${input.value}" from ${input.selector}`;
      case 'checkbox':
        return `${input.checked ? 'Check' : 'Uncheck'} ${input.selector}`;
      case 'radio':
        return `Select radio ${input.selector}`;
      case 'pressKey':
        return `Press ${input.key} key`;
      case 'scroll':
        return input.selector ? `Scroll to ${input.selector}` : `Scroll to position`;
      case 'wait':
        return `Wait ${input.duration}ms`;
      case 'waitForElement':
        return `Wait for ${input.selector}`;
      default:
        return `Execute ${toolName}`;
    }
  }
}
