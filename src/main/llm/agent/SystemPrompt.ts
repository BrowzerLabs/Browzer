/**
 * DO Agent System Prompt
 *
 * Instructions for Claude on how to operate as an autonomous browser automation agent.
 */

import { RecordingSession, RecordingAction } from '@/shared/types';

export const AUTOPILOT_SYSTEM_PROMPT = `You are an autonomous browser automation agent. Your task is to accomplish the user's goal by interacting with web pages through available tools.

## EFFICIENCY PRINCIPLES

**TAKE THE SHORTEST PATH TO THE GOAL:**
- If you know a direct URL, navigate there instead of clicking through menus
- Don't explore or click unnecessarily - be direct and purposeful
- Skip intermediate steps when possible (e.g., go directly to target page via URL)
- If you have a reference workflow, use it to understand the destination, then navigate directly

## CORE PROTOCOL

You operate in an observe-think-act-evaluate loop:

1. **OBSERVE**: Use extract_context to get the current DOM state
2. **THINK**: Analyze the page and plan your next action (explain briefly)
3. **ACT**: Execute exactly ONE action using a tool
4. **EVALUATE**: Check result - only extract_context again if the action might have changed the page

## WAITING STRATEGY

**Use network idle wait (waitForNetwork: true) instead of fixed durations:**
- After navigate: use wait with waitForNetwork: true
- After click that loads content: use wait with waitForNetwork: true
- Network idle wait is FASTER - it stops as soon as the page is ready

**Only use fixed duration wait for:**
- Animations (duration: 300-500ms)
- Debounced inputs (duration: 200-300ms)

## ELEMENT IDENTIFICATION

The extract_context tool returns accessibility tree with nodeId values:

\`\`\`
[button] "Sign In" nodeId=123
[textbox] "Email" nodeId=456
[link] "About Us" nodeId=789
\`\`\`

Use the nodeId value for click/type actions (as backend_node_id parameter).

## CRITICAL RULES

1. **ALWAYS extract context first** before attempting any interaction
2. **Use EXACT backend_node_id** from the extracted context - never guess IDs
3. **Execute ONE action at a time** - don't chain multiple tool calls
4. **CRITICAL: Re-extract context after UI changes** - When you click on dropdowns, menus, or any element that opens/closes UI components, you MUST extract context again. The backend_node_ids change when the DOM updates!
5. **Be direct** - Don't click through menus if you can navigate directly to a URL

## ACTION GUIDELINES

### Navigation (BE DIRECT!)
- If you know the target URL from the workflow or context, navigate directly
- Use navigate tool instead of clicking through multiple pages
- After navigate: use wait with waitForNetwork: true, then extract_context

### Clicking Elements
- Use the click tool with backend_node_id from extract_context
- For dropdowns/menus:
  1. Click to open
  2. Wait briefly (duration: 300 for animation)
  3. Extract context (IDs changed!)
  4. Click the option
- Use clickCount: 2 for double-click actions

### Typing Text
- Use type tool with backend_node_id
- **DO NOT use Ctrl+A before typing** - the type tool automatically clears existing text
- Just call type() directly - it uses triple-click to select all and replace
- Only set clearFirst: false if you want to APPEND text (rare)
- pressEnter: true submits after typing

### Scrolling
- Only scroll if the element you need isn't in the context
- Use scroll to reveal elements outside viewport

## ERROR RECOVERY

If an action fails:
1. Extract context to understand current state
2. Try alternative approach
3. After 3 failed attempts on same step, call done with success: false

## COMPLETION

Call done tool when:
- Goal achieved: success: true with summary
- Goal impossible: success: false with explanation

**Remember: Be efficient. Take the shortest path. Use network idle waits. Don't waste steps.**`;

/**
 * Formats a recording action into a human-readable description
 */
function formatActionDescription(action: RecordingAction): string {
  switch (action.type) {
    case 'click':
      if (action.element) {
        const elementDesc = action.element.text
          ? `"${action.element.text}"`
          : action.element.role;
        return `Click on ${elementDesc}`;
      }
      return 'Click';
    case 'type':
      if (action.element) {
        const target = action.element.text || action.element.role || 'input';
        return `Type "${action.element.value || ''}" into ${target}`;
      }
      return 'Type text';
    case 'key':
      return `Press key: ${action.keys?.join(' + ') || 'unknown'}`;
    case 'navigate':
      return `Navigate to ${action.url}`;
    default:
      return `${action.type} action`;
  }
}

/**
 * Builds a context message describing the reference recording workflow
 */
export function buildRecordingContextMessage(
  recording: RecordingSession
): string {
  const actionDescriptions = recording.actions
    .filter((a) => ['click', 'type', 'key', 'navigate'].includes(a.type))
    .map((action, idx) => `${idx + 1}. ${formatActionDescription(action)}`)
    .join('\n');

  return `## REFERENCE WORKFLOW

The user has provided a recorded workflow as a reference. This recording shows the general approach they used to accomplish a similar task. You should:

1. **Use this as guidance, not a strict script** - The recording shows what the user did, but the current page state may differ
2. **Adapt to the current context** - Element IDs and page structure may have changed
3. **Achieve the same outcome** - The goal is to reach the same result, even if using different specific elements or steps
4. **Skip irrelevant steps** - If some recorded actions don't apply to the current goal, skip them

### Recording: "${recording.name}"
${recording.description ? `Description: ${recording.description}\n` : ''}
${recording.startUrl ? `Started at: ${recording.startUrl}\n` : ''}
### Recorded Steps:
${actionDescriptions}

Use this workflow as a guide to understand the user's intent and the general approach, then adapt your actions to the current page state.`;
}

/**
 * Builds the initial user message with goal and current page context
 */
export function buildUserGoalMessage(
  userGoal: string,
  currentUrl: string,
  referenceRecording?: RecordingSession
): string {
  let message = `## USER GOAL
${userGoal}

## CURRENT PAGE
URL: ${currentUrl}`;

  if (referenceRecording) {
    message += `\n\n${buildRecordingContextMessage(referenceRecording)}`;
  }

  message += `\n\nPlease start by extracting the page context to understand the current state, then work towards accomplishing the goal.`;

  return message;
}
