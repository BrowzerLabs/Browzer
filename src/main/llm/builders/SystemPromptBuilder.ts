import { RecordedAction, RecordingSession } from "@/shared/types";

export class SystemPromptBuilder {

  public static buildIntermediatePlanContinuationPrompt(params: {
    userGoal: string;
    extractedContext?: {
      url: string;
      interactiveElements: number;
      forms: number;
    };
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
    
    let formatted = `<recorded_session>
<metadata>
  <name>${session.name}</name>
  <description>${session.description || 'No description provided'}</description>
  <duration_seconds>${Math.round(session.duration / 1000)}</duration_seconds>
  <starting_url>${session.url || session.tabs?.[0]?.url || 'Unknown'}</starting_url>
  <timing_guidance>
    <important>The timestamps below show REAL USER TIMING. Use these gaps to determine realistic wait times between actions.</important>
  </timing_guidance>
</metadata>\n\n`;
    
    formatted += `<actions>\n`;
    
    let previousTimestamp: number | null = null;
    
    actions.forEach((action: RecordedAction, index: number) => {
      const currentTimestamp = action.timestamp;
      const timeSinceLastAction = previousTimestamp ? currentTimestamp - previousTimestamp : 0;
      const timeSinceLastActionSec = (timeSinceLastAction / 1000).toFixed(1);
      
      formatted += `  <action id="${index + 1}" type="${action.type}" timestamp="${currentTimestamp}" time_gap_from_previous_sec="${timeSinceLastActionSec}">\n`;
      
      // Current page context
      if (action.tabUrl) {
        formatted += `    <page_url>${this.escapeXml(action.tabUrl)}</page_url>\n`;
      }
      
      // Target element (if applicable)
      if (action.target) {
        formatted += `    <target_element>\n`;
        formatted += `      <tag>${action.target.tagName}</tag>\n`;
        
        // Element text/value
        if (action.target.text) {
          const text = action.target.text.substring(0, 100);
          formatted += `      <text>${this.escapeXml(text)}</text>\n`;
        }
        if (action.target.value) {
          formatted += `      <value>${this.escapeXml(action.target.value)}</value>\n`;
        }
        
        // Bounding box for visual context
        if (action.target.boundingBox) {
          const bb = action.target.boundingBox;
          formatted += `      <position x="${bb.x}" y="${bb.y}" width="${bb.width}" height="${bb.height}" />\n`;
        }
        
        // Element state
        if (action.target.isDisabled) {
          formatted += `      <disabled>true</disabled>\n`;
        }
        
        // All element attributes (CRITICAL for selector generation)
        if (action.target.attributes && Object.keys(action.target.attributes).length > 0) {
          formatted += `      <attributes>\n`;
          
          // Prioritize important attributes first
          const priorityAttrs = ['id', 'name', 'title', 'type', 'role', 'aria-label', 'data-testid', 'placeholder', 'data-test-id', 'href'];
          const attrs = action.target.attributes;
          
          // Add priority attributes first
          priorityAttrs.forEach(key => {
            if (attrs[key]) {
              formatted += `        <attr name="${key}">${this.escapeXml(attrs[key])}</attr>\n`;
            }
          });
          
          // Add remaining attributes (limit to most relevant)
          const remainingAttrs = Object.keys(attrs)
            .filter(key => !priorityAttrs.includes(key))
            .filter(key => !key.startsWith('data-ved') && !key.startsWith('jsname')) // Filter noise
            .slice(0, 10); // Limit to 10 additional attributes
          
          remainingAttrs.forEach(key => {
            formatted += `        <attr name="${key}">${this.escapeXml(attrs[key])}</attr>\n`;
          });
          
          formatted += `      </attributes>\n`;
        }
        
        formatted += `    </target_element>\n`;
      }
      
      // Action value (for input, select, etc.)
      if (action.value !== undefined && action.value !== null && !action.target?.value) {
        formatted += `    <input_value>${this.escapeXml(String(action.value))}</input_value>\n`;
      }
      
      // Click position (for reference)
      if (action.position) {
        formatted += `    <click_position x="${action.position.x}" y="${action.position.y}" />\n`;
      }
      
      formatted += `  </action>\n\n`;
      previousTimestamp = currentTimestamp;
    });
    
    formatted += `</actions>\n</recorded_session>`;
    
    return formatted;
  }


  /**
   * Escape XML special characters
   */
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
