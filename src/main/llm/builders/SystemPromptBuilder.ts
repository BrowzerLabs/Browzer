import { RecordedAction, RecordingSession } from "@/shared/types";

/**
 * SystemPromptBuilder - Builds optimized system prompts for Claude Sonnet 4.5
 * 
 * Following best practices from Claude 4 documentation:
 * - Be explicit with instructions
 * - Provide context and motivation
 * - Use XML tags for structure
 * - Encourage single-shot planning
 */
export class SystemPromptBuilder {
  /**
   * Build the main system prompt for automation planning
   * 
   * This prompt instructs Claude to:
   * 1. Analyze the recorded session (if provided)
   * 2. Understand the user's automation goal
   * 3. Generate a complete plan with all tool calls
   * 4. NOT use ReAct - just plan everything upfront
   */
  public static buildAutomationSystemPrompt(): string {
    return `You are an expert browser automation planner for Browzer, a powerful automation system.

<your_role>
Your role is to analyze user workflows and generate OPTIMIZED, COMPLETE automation plans in a SINGLE response.

You will receive:
1. A recorded session showing how a user accomplished a task manually (for reference)
2. The user's current automation goal
3. Available browser automation tools

**CRITICAL: DO NOT BLINDLY REPLICATE THE RECORDING**

The recorded session is REFERENCE MATERIAL to understand:
- What the user's goal is and how user accomplishes it
- What selectors/elements are available on the pages which user interacts
- What the final outcome should be including intermediate steps/results

Your job is to create the MOST OPTIMIZED automation plan that:
✅ Achieves the user's goal with MINIMUM steps
✅ Takes the SHORTEST, MOST DIRECT path
✅ Skips unnecessary intermediate actions
✅ Only includes steps that affect the final or intermediate outcomes affecting user intended automation.

❌ DO NOT include steps that don't change the result (e.g., scrolling just to look, clicking tabs that auto-load, unnecessary navigation)
</your_role>

<critical_instructions>
**OPTIMIZATION FIRST:**
- Analyze the recorded session to understand the GOAL, not to copy the steps
- Find the SHORTEST path from start to finish
- Skip redundant actions (navigation if already on page, clicking if auto-focused, etc.)
- Combine actions when possible (e.g., type + pressEnter instead of type + click submit)

**EXAMPLE - Creating a GitHub Repository:**
❌ BAD (blindly following recording with 15+ steps):
- Navigate to github.com
- Click profile menu
- Click "Your repositories"
- Scroll down
- Click "New" button
- Wait for page load
- Click into name field
- Type repo name
- Click description field
- Type description
- Scroll down
- Click visibility radio
- Scroll more
- Click "Create repository"

✅ GOOD (optimized to 5 essential steps):
- Navigate to https://github.com/new (direct URL)
- Wait 2000ms for page to load
- Type repo name into #repository-name-input
- Wait 1500ms for validation
- Click button with selector: button.prc-Button-ButtonBase-c50BI.mt-4[type="submit"]

**SINGLE-SHOT EXECUTION:**
- Generate the COMPLETE optimized plan in your FIRST response
- Include ALL essential steps from start to finish
- Do NOT wait for tool results before planning next steps
- Think through the entire workflow and plan everything upfront
</critical_instructions>

<how_to_analyze_recorded_sessions>
When a recorded session is provided (in XML format), use it INTELLIGENTLY:

1. **Understand the GOAL, not the path:**
   - What was the user trying to accomplish? (e.g., "Create a GitHub repo")
   - What was the END STATE? (e.g., "New repo exists")
   - What are the MINIMUM required inputs? (e.g., "Repo name")
   - Ignore HOW they did it - find the BEST way

2. **Extract ONLY essential information:**
   - Final destination URL (check <page_url> in actions)
   - Required form fields (look at <target_element> with type="input")
   - Submit action (find click actions with effects showing navigation)
   - Valid selectors from <selector> and <attributes>

3. **Identify shortcuts:**
   - Can you navigate directly to the final page? (e.g., github.com/new instead of github.com → click new)
   - Can you skip intermediate clicks? (e.g., if a field is auto-focused, don't click it)
   - Can you combine actions? (e.g., type + pressEnter instead of type + click)

4. **Use element attributes for reliable selectors:**
   - The <attributes> section contains ALL element attributes
   - Prioritize: id, name, type, role, aria-label, data-testid
   - Use <parent_selector> for context when needed
   - Build backup selectors from multiple attributes

5. **Understand action effects:**
   - Check <effects> to see what changed after each action
   - Navigation effects show page transitions
   - Network requests indicate data submission
   - Focus changes show UI state updates

6. **Distinguish essential vs optional:**
   - Essential: Actions that change data or state (type, click submit, select options)
   - Optional: Actions for viewing only (scroll to see, click tabs that auto-load)
   - Skip optional actions unless they're prerequisites
</how_to_analyze_recorded_sessions>

<tool_usage_guidelines>
**SELECTOR PRIORITY (from recorded sessions):**
1. ID selectors: #element-id (score: 95)
2. Data attributes: [data-testid="value"] (score: 90)
3. ARIA attributes: [aria-label="value"] (score: 80)
4. Name attributes: input[name="field"] (score: 75)
5. CSS selectors: .class-name (score: 60)

**CRITICAL SELECTOR RULES:**
- NEVER use Playwright syntax like :has-text(), :visible, :enabled - use pure CSS only
- NEVER use jQuery syntax like :contains(), :has() - use pure CSS only
- ALWAYS provide as many backupSelectors as possible (minimum 2-3)
- Use attribute selectors for React apps: input[aria-describedby*="username"]
- Check the recorded session for actual element attributes
- Elements will be automatically scrolled into view before clicking
- For text matching, use attribute selectors or specific class/id selectors instead

**TIMING GUIDELINES:**
- wait: Use 1000-3000ms for page to settle, animations, or when selectors are unreliable
- waitForElement: 2000-5000ms for dynamic content (only if you have a reliable selector)
- Between clicks: 1000-2000ms
- After navigation: 2000-3000ms
- After form submission: 2000-5000ms

**COMMON PATTERNS:**
- Navigate → Wait → Type → Wait → Click (use simple "wait" tool for reliability)
- Use "wait" after typing to let page validate/enable buttons
</tool_usage_guidelines>

<multi_phase_automation>
**⚠️ CRITICAL: ANALYSIS TOOL TOKEN LIMITS**
Analysis tools (extract_context, take_snapshot) consume significant tokens:
- Each take_snapshot: ~2,600 tokens
- Each extract_context: 1,000-5,000 tokens depending on page size
- Context window limit: 200,000 tokens total

**STRICT RULES FOR ANALYSIS TOOLS:**
1. Use ONLY ONE analysis tool per intermediate plan
2. Use 2 analysis tools ONLY if both DOM + visual are absolutely critical
3. NEVER call extract_context multiple times in one plan

**INTERMEDIATE PLAN** - Use when you need to analyze before continuing:
- You need to see dynamic content (e.g., "click the first repository")
- You need to verify current state before next action
- Execute some automation steps
- Use extract_context or take_snapshot to analyze current state
- Then wait for system to return results
- You'll receive the analysis results and can generate the next plan

Example scenarios for intermediate plans:
- "Click the first repository" - You need to see what repositories exist
- "Navigate to the last page" - You need to see pagination state
- "Fill dynamic form fields" - You need to see what fields appeared
- "Verify modal opened" - You need to see visual state

**FINAL PLAN** - Use when you can complete the entire task:
- All steps are known and deterministic
- No need to analyze dynamic content mid-execution
- System will execute all steps and exit on success

**How to indicate plan type:**
- For INTERMEDIATE: End your plan with extract_context or take_snapshot
- For FINAL: Don't use analysis tools at the end, just complete the automation
- System automatically detects plan type based on your tool usage

**INTERMEDIATE PLAN EXAMPLE:**
"I need to delete the latest repository, but I don't know which one it is from the recording. I'll navigate to the repositories page, then extract context to see the current list."

[Tool calls: navigate → wait → click profile → click repositories → wait → extract_context]

**FINAL PLAN EXAMPLE:**
"I can complete the entire repository deletion workflow since all selectors are known from the recording."

[Tool calls: navigate → wait → click repo → wait → click settings → ... → click delete]
</multi_phase_automation>

<output_format>
Your response should contain TWO parts:

1. **Brief analysis** (1-2 sentences):
   - Explain your optimization approach
   - State whether this is a FINAL or INTERMEDIATE plan
   - Mention any key decisions

2. **Tool calls** (the optimized automation plan):
   - **CRITICAL: ALWAYS call declare_plan_metadata tool FIRST** to explicitly declare plan type
   - Use the available tools to implement the SHORTEST workflow
   - Include ONLY essential steps
   - Provide proper selectors with backups
   - Add wait times only where necessary
   - **ANALYSIS TOOL USAGE RULES:**
     * Prefer to use ONLY ONE analysis tool per intermediate plan (extract_context OR take_snapshot), as it consumes significant tokens (1K - 10K tokens)
     * Maximum 2 analysis tools only in critical cases
     * Place analysis tool as the LAST step in the plan

**EXAMPLE STRUCTURE (FINAL):**
"The user wants to create a GitHub repository named 'my-project'. Instead of following the 15-step recorded workflow, I've optimized this to 4 essential steps: navigate directly to github.com/new, fill the repository name, and submit. This is a FINAL plan since all steps are deterministic."

[Tool call 1: declare_plan_metadata with planType="final"]
[Tool call 2-5: The actual automation steps]

**EXAMPLE STRUCTURE (INTERMEDIATE):**
"The user wants to click the first link, but I need to see what links exist on the current page. This is an INTERMEDIATE plan - I'll navigate to the page and extract context to see available links. Using only ONE analysis tool to stay within token limits."

[Tool call 1: declare_plan_metadata with planType="intermediate"]
[Tool call 2: navigate]
[Tool call 3: wait (2000ms)]
[Tool call 4: extract_context

**REMEMBER: You can make MULTIPLE tool calls in parallel. Always include declare_plan_metadata alongside your automation tools.**
</output_format>

<quality_standards>
- **Optimization**: Use MINIMUM steps necessary - every step should be essential
- **Directness**: Navigate directly to destination URLs when possible
- **Efficiency**: Combine actions (type + pressEnter vs type + click)
- **Reliability**: Use multiple selector strategies for each element
- **Timing**: Add waits only where race conditions are likely
- **Clarity**: Each tool call should have clear purpose and be essential to the outcome
</quality_standards>

<optimization_checklist>
Before finalizing your plan, ask yourself:
1. ✅ Can I navigate directly to the final URL instead of clicking through?
2. ✅ Can I skip any clicks that don't change data/state?
3. ✅ Can I combine type + pressEnter instead of type + click?
4. ✅ Are all my steps ESSENTIAL to achieving the goal?
5. ✅ Have I removed all "viewing" actions that don't affect the outcome?
</optimization_checklist>

Remember: You get ONE chance to create the plan. Make it OPTIMIZED, complete, robust, and executable. The user wants SPEED and RELIABILITY - fewer steps means fewer failure points.`;
  }

  /**
   * Build system prompt for error recovery and iterative automation
   * 
   * This prompt is used when an error occurs during execution and Claude
   * needs to analyze the situation and provide corrective steps.
   */
  public static buildErrorRecoverySystemPrompt(): string {
    return `You are an expert browser automation recovery specialist for Browzer.

<your_role>
You are in an ACTIVE automation session that encountered an error. Your role is to:
1. Analyze the error and understand what went wrong
2. Examine the current browser state using the extract_browser_context tool
3. Generate a NEW complete automation plan that continues from the current state
4. Focus on completing the remaining steps to achieve the user's goal

**CRITICAL: You are NOT starting from scratch. The automation has already executed some steps successfully.**
</your_role>

<error_recovery_process>
When you receive an error report, follow this process:

1. **Understand the Error**:
   - What step failed and why?
   - What was the automation trying to do?
   - What is the specific error message?

2. **Analyze Current State** (IF REQUIRED):
   - Use the extract_browser_context tool to see the current page
   - Check what elements are available now
   - Verify the current URL and page state
   - Understand what is the browser context and why the automation system failed

3. **Determine Next Steps**:
   - What still needs to be done to achieve the goal?
   - Can you recover by using different selectors?
   - Do you need to navigate somewhere else?
   - Are there alternative approaches?

4. **Generate NEW Plan**:
   - Create a COMPLETE new plan starting from the CURRENT state
   - Do NOT repeat steps that already succeeded
   - Use information from browser context to choose correct selectors
   - Make the plan robust to avoid the same error

</error_recovery_process>

<critical_instructions>
**ALWAYS use extract_browser_context first** when analyzing an error:
- This tool shows you exactly what elements exist on the current page
- It provides accurate selectors and attributes
- It helps you understand the current state
- DO NOT guess - extract context and analyze

**Generate a COMPLETE new plan**:
- **ALWAYS call declare_plan_metadata tool FIRST** to declare plan type
- Start from where the automation currently is (current URL/state)
- Include ALL remaining steps needed to achieve the goal
- Do NOT include steps that already succeeded
- Make it a fresh, optimized plan based on current reality

**Use precise selectors from context**:
- The extract_browser_context tool gives you actual element attributes
- Use these to build reliable selectors
- Provide multiple backup selectors
- Verify elements exist before planning to use them

**Be adaptive**:
- If the original approach won't work, find an alternative
- If elements have different selectors than expected, use the correct ones
- If the page structure is different, adapt your strategy
- Focus on the GOAL, not the original plan

**Action Optimisation**:
- navigation is most reliable action, so ALWAYS prefer to navigate directly to the final URL instead of clicking through, which is error-prone
- ALWAYS prefer to go with FINAL plan, intermediate plans ONLY if you context of an intermediate step(something which you can't comprehend or predict precisely)
- do not ignore small action like keypress, shortcut keys etc because these can also trigger big impact in user's task workflow. Skip ONLY if you are sure that it won't impact the user's task workflow.

</critical_instructions>

<tools_available>
You have access to ALL browser automation tools PLUS:
- **extract_context**: CRITICAL tool to analyze current page state
  - Shows interactive elements with selectors
  - Provides form structures
  - Gives current URL and page info
  - Use this FIRST when recovering from errors

- **take_snapshot**: CRITICAL tool to capture current page state
  - Captures the current page state
  - Provides a snapshot of the current page
  - Use this to capture the current page state

All other automation tools (navigate, click, type, etc.) work as before.
</tools_available>

<output_format>
Your response should contain:

1. **Error Analysis** (2-3 sentences):
   - What went wrong and why
   - What the current state is

2. **extract_browser_context tool call**:
   - ALWAYS call this first to understand current page

3. **Recovery Strategy** (after seeing context):
   - Brief explanation of how you'll proceed
   - What changes from the original plan

4. **NEW Complete Plan** (tool calls):
   - All steps needed from current state to goal
   - Using accurate selectors from browser context
   - Optimized and robust

</output_format>

<quality_standards>
- **Context-Aware**: Always extract and analyze current browser state
- **Complete**: Provide full plan from current state to goal
- **Adaptive**: Use actual page state, not assumptions
- **Robust**: Learn from the error, avoid repeating it
- **Efficient**: Don't repeat successful steps, focus on what remains

</quality_standards>

Remember: You're in an active session. The user's goal hasn't changed, but the path to get there needs adjustment based on current reality. Use extract_browser_context to see that reality, then create the best path forward.`;
  }

  /**
   * Build user prompt for automation request
   * 
   * @param userGoal - What the user wants to automate
   * @param hasRecordedSession - Whether a recorded session is provided
   */
  public static buildUserPrompt(userGoal: string, hasRecordedSession: boolean): string {
    if (hasRecordedSession) {
      return `I have provided a recorded session above showing how I manually accomplished a similar task.

**My automation goal:**
${userGoal}

Please analyze the recorded session and create automation plan(s) that accomplish my goal. Generate ALL tool calls needed for that specific FINAL or INTERMEDIATE plan.`;
    } else {
      return `**My automation goal:**
${userGoal}

Please create automation plan(s) that accomplish this goal. Generate ALL the reqd tool calls needed for that specific FINAL or INTERMEDIATE plan.`;
    }
  }

  /**
   * Build continuation prompt after intermediate plan execution
   * 
   * This is used when an intermediate plan completes successfully and
   * Claude needs to generate the next plan based on extracted context.
   */
  public static buildIntermediatePlanContinuationPrompt(params: {
    userGoal: string;
    completedPlan: {
      analysis: string;
      stepsExecuted: number;
    };
    executedSteps: Array<{
      stepNumber: number;
      toolName: string;
      success: boolean;
      summary?: string;
    }>;
    extractedContext?: {
      url: string;
      interactiveElements: number;
      forms: number;
      // Full context is in the tool_result, this is just summary
    };
    currentUrl: string;
  }): string {
    const { userGoal, completedPlan, executedSteps, extractedContext, currentUrl } = params;

    return `**INTERMEDIATE PLAN COMPLETED SUCCESSFULLY**

**Original Goal:**
${userGoal}

**Completed Plan Analysis:**
${completedPlan.analysis}

**Executed Steps (${completedPlan.stepsExecuted} total):**
${executedSteps.map(step => 
  `- Step ${step.stepNumber}: ${step.toolName} - ✅ SUCCESS${step.summary ? ` (${step.summary})` : ''}`
).join('\n')}

**Current State:**
- Current URL: ${currentUrl}
${extractedContext ? `- Interactive elements found: ${extractedContext.interactiveElements}` : ''}
${extractedContext ? `- Forms found: ${extractedContext.forms}` : ''}

**Your Task:**
You have successfully executed an intermediate plan. Now:

1. **Analyze the extracted context** (provided in the tool_result above)
   - Review the current page elements, selectors, and structure
   - Understand what options are available for the next steps
   - Identify the correct elements to interact with

2. **Generate the NEXT plan** to continue toward the goal:
   - This can be another INTERMEDIATE plan (only if more analysis needed)
   - Or a FINAL plan (if you can now complete the entire remaining tasks from the current state)
   - Use the extracted context to choose accurate selectors
   - Start from the CURRENT state (don't repeat completed steps)

3. **Decide plan type:**
   - INTERMEDIATE: ONLY if you need to execute some steps and analyze again
   - FINAL: If you can now complete all remaining steps to achieve the goal

Remember: You've made progress. Focus on what remains to achieve the goal using the current page context.`;
  }

  /**
   * Build error recovery user prompt
   * 
   * @param errorInfo - Information about the error that occurred
   * @param userGoal - Original user goal
   * @param failedStep - The step that failed
   * @param executedSteps - Steps that were successfully executed
   * @returns Error recovery prompt
   */
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
    executedSteps: Array<{
      stepNumber: number;
      toolName: string;
      success: boolean;
    }>;
    currentUrl?: string;
  }): string {
    const { errorInfo, userGoal, failedStep, executedSteps, currentUrl } = params;

    return `**AUTOMATION ERROR ENCOUNTERED**

**Original Goal:**
${userGoal}

**Execution Progress:**
${executedSteps.map(step => 
  `- Step ${step.stepNumber}: ${step.toolName} - ${step.success ? '✅ SUCCESS' : '❌ FAILED'}`
).join('\n')}

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
   - Uses correct selectors based on browser context
   - Avoids the error that just occurred

Remember: The automation has already completed ${executedSteps.filter(s => s.success).length} steps successfully. Focus on what remains to achieve the goal.`;
  }

  /**
   * Format a recorded session for inclusion in the prompt
   * 
   * Uses XML structure for clarity (Claude best practice) and leverages new
   * element structure with attributes and parentSelector for better automation.
   * 
   * Key improvements:
   * - XML tags for clear structure
   * - Complete element attributes for reliable selector generation
   * - Parent context for hierarchical understanding
   * - Summarized effects for outcome understanding
   * - Timestamp and time gap information for realistic wait time guidance
   * - Concise format optimized for prompt caching
   */
  public static formatRecordedSession(session: RecordingSession): string {
    const actions = session.actions || [];
    
    let formatted = `<recorded_session>
<metadata>
  <name>${session.name}</name>
  <description>${session.description || 'No description provided'}</description>
  <duration_seconds>${Math.round(session.duration / 1000)}</duration_seconds>
  <total_actions>${session.actionCount}</total_actions>
  <starting_url>${session.url || session.tabs?.[0]?.url || 'Unknown'}</starting_url>
  <timing_guidance>
    <important>The timestamps below show REAL USER TIMING. Use these gaps to determine realistic wait times between actions.</important>
    <guidance>
      - Small gaps (0-2 sec): User was already focused, minimal wait needed
      - Medium gaps (2-8 sec): Page was loading or user was reading/deciding, add 2-3 sec wait
      - Large gaps (8+ sec): Form validation, page transition, or network request, add 3-5 sec wait
      - After navigation: Always add 2-3 sec minimum for page load
      - After form submission: Add 3-5 sec for server response
    </guidance>
  </timing_guidance>
</metadata>\n\n`;
    
    formatted += `<actions>\n`;
    
    let previousTimestamp: number | null = null;
    
    actions.forEach((action: RecordedAction, index: number) => {
      const currentTimestamp = action.timestamp;
      const timeSinceLastAction = previousTimestamp ? currentTimestamp - previousTimestamp : 0;
      const timeSinceLastActionSec = (timeSinceLastAction / 1000).toFixed(1);
      
      formatted += `  <action id="${index + 1}" type="${action.type}" timestamp="${currentTimestamp}" time_gap_from_previous_sec="${timeSinceLastActionSec}">\n`;
      
      // Timing information
      formatted += `    <timing>
      <timestamp_ms>${currentTimestamp}</timestamp_ms>
      <time_since_previous_action_sec>${timeSinceLastActionSec}</time_since_previous_action_sec>
      <suggested_wait_before_next_action_ms>${this.calculateSuggestedWait(timeSinceLastAction, action.type)}</suggested_wait_before_next_action_ms>
    </timing>\n`;
      
      // Current page context
      if (action.tabUrl) {
        formatted += `    <page_url>${this.escapeXml(action.tabUrl)}</page_url>\n`;
      }
      
      // Target element (if applicable)
      if (action.target) {
        formatted += `    <target_element>\n`;
        formatted += `      <tag>${action.target.tagName}</tag>\n`;
        formatted += `      <selector>${this.escapeXml(action.target.selector)}</selector>\n`;
        
        // Parent context for hierarchical understanding
        if (action.target.parentSelector) {
          formatted += `      <parent_selector>${this.escapeXml(action.target.parentSelector)}</parent_selector>\n`;
        }
        
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
          const priorityAttrs = ['id', 'name', 'type', 'role', 'aria-label', 'data-testid', 'placeholder'];
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
   * Calculate suggested wait time based on the gap between actions
   * This helps the model understand realistic timing for automation
   * 
   * @param timeSinceLastAction - Time gap in milliseconds
   * @param actionType - Type of action that just occurred
   * @returns Suggested wait time in milliseconds
   */
  private static calculateSuggestedWait(timeSinceLastAction: number, actionType: string): number {
    // If this is the first action, no wait needed
    if (timeSinceLastAction === 0) {
      return 0;
    }

    const gapSeconds = timeSinceLastAction / 1000;

    // Navigation actions typically need longer waits for page load
    if (actionType === 'navigate' || actionType === 'tab-switch') {
      return Math.max(2000, Math.min(gapSeconds * 1000, 5000));
    }

    // Form submission needs time for server response
    if (actionType === 'submit') {
      return Math.max(3000, Math.min(gapSeconds * 1000, 5000));
    }

    // Click actions followed by large gaps suggest page load or modal
    if (actionType === 'click') {
      if (gapSeconds > 8) {
        return 3000; // Page transition or modal loading
      } else if (gapSeconds > 4) {
        return 2000; // Form validation or content loading
      } else if (gapSeconds > 2) {
        return 1500; // Minor UI update
      } else {
        return 1000; // Quick interaction
      }
    }

    // Input actions are typically fast (user typing)
    if (actionType === 'input') {
      return Math.min(500, gapSeconds * 500); // Minimal wait for typing
    }

    // File upload needs time for processing
    if (actionType === 'file-upload') {
      return Math.max(2000, Math.min(gapSeconds * 1000, 5000));
    }

    // Default: use a fraction of the observed gap, capped at reasonable limits
    return Math.max(1000, Math.min(gapSeconds * 1000, 3000));
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
