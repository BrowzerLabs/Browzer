import { ElementTarget, RecordedAction, RecordingSession } from "@/shared/types";

export class SystemPromptBuilder {

  public static buildIntermediatePlanContinuationPrompt(params: {
    userGoal: string;
    currentUrl: string;
  }): string {
    const { userGoal, currentUrl } = params;

    return `**INTERMEDIATE PLAN COMPLETED SUCCESSFULLY**
**Original Goal:**
${userGoal}

**Current State:**
- Current URL: ${currentUrl}

**Your Task:**
You have successfully executed your intermediate plan. Now:

1. **Analyze the extracted context/snapshot** (the latest tool_result)
   - Review the current page elements, attributes, and structure
   - Identify the correct elements to interact with

2. **Generate the NEXT plan** to continue toward the goal:
   - This can be another INTERMEDIATE plan (only if dynamic analysis needed in further step(s))
   - Or a FINAL plan (if you can now complete the remaining tasks from the current state)
   - Use the extracted context to choose accurate selectors
   - Start from the CURRENT state (don't repeat completed steps)

3. **Decide plan type:**
   - INTERMEDIATE: ONLY if you need to execute some steps and analyze again
   - FINAL: If you can now complete all remaining steps to achieve the goal
`;
  }

  public static buildErrorRecoveryPrompt(params: {
    errorInfo: {
      message: string;
      code?: string;
      details?: unknown;
      suggestions?: string[];
    };
    userGoal: string;
    failedStep: {
      stepNumber: number;
      toolName: string;
      params: unknown;
    };
    successfullyExecutedSteps: number;
    currentUrl?: string;
  }): string {
    const { errorInfo, userGoal, failedStep, successfullyExecutedSteps, currentUrl } = params;

    return `**AUTOMATION ERROR ENCOUNTERED**

**Original Goal:**
${userGoal}

**Failed Step:**
- Step ${failedStep.stepNumber}: ${failedStep.toolName}
- Parameters: ${JSON.stringify(failedStep.params, null, 2)}

**Error Details:**
- Message: ${errorInfo.message}
${errorInfo.code ? `- Code: ${errorInfo.code}` : ''}
${errorInfo.details ? `- Details: ${JSON.stringify(errorInfo.details, null, 2)}` : ''}
${errorInfo.suggestions ? `- Suggestions: ${errorInfo.suggestions.join(', ')}` : ''}

**Current State:**
${currentUrl ? `- Current URL: ${currentUrl}` : '- URL unknown'}

**Your Task:**
1. Analyze what went wrong and why, you may use the analysis tools (extract_context, & take_snapshot)
2. Generate a NEW complete automation plan that:
   - Starts from the CURRENT state (don't repeat successful steps)
   - Completes the remaining work to achieve the goal

Remember: The automation has already completed ${successfullyExecutedSteps} steps successfully. Focus on what remains to achieve the goal.`;
  }

  public static formatRecordedSession(session: RecordingSession): string {
  const actions = session.actions || [];

  let formatted =
`<rec name="${this.escapeXml(session.name)}" desc="${this.escapeXml(session.description)}" dur="${Math.round(session.duration / 1000)}" start_url="${this.escapeXml(session.url || session.tabs?.[0]?.url || '')}">
<actions>\n`;

  let previousTimestamp: number | null = null;

  actions.forEach((action: RecordedAction, index: number) => {
    const gap =
      previousTimestamp !== null
        ? ((action.timestamp - previousTimestamp) / 1000).toFixed(1)
        : '0.0';

    previousTimestamp = action.timestamp;

    formatted +=
`  <action id="${index + 1}" type="${action.type}" url="${this.escapeXml(action.tabUrl || '')}" gap="${gap}">\n`;

    if (action.target) {
      formatted += this.formatElementInline(action.target);
    }

    if (action.value !== undefined && action.value !== null && !action.target?.value) {
      formatted += `    <input_value>${this.escapeXml(String(action.value))}</input_value>\n`;
    }

    if (action.position) {
      formatted += `    <click_pos x="${action.position.x}" y="${action.position.y}" />\n`;
    }

    formatted += `  </action>\n`;
  });

  formatted += `</actions>\n</rec>`;
  return formatted;
}

private static formatElementInline(target: ElementTarget): string {
  const bb = target.boundingBox;
  const attrs = target.attributes || {};

  let element = `    <element tag="${this.escapeXml(target.tagName)}" x="${bb.x}" y="${bb.y}" width="${bb.width}" height="${bb.height}"\n`;

  if (target.value !== undefined) {
    element += `      value="${this.escapeXml(target.value)}"\n`;
  }

  if (target.text) {
    element += `      text="${this.escapeXml(target.text.slice(0, 120))}"\n`;
  }

  if (target.isDisabled) {
    element += `      disabled="true"\n`;
  }
  Object.entries(attrs).forEach(([key, value]) => {
    element += `      ${this.escapeXml(key)}="${this.escapeXml(value)}"\n`;
  });

  element += `    />\n`;
  return element;
}


  private static escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
