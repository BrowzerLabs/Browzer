/**
 * ReActEngine - Reasoning + Acting execution loop
 * 
 * Implements the ReAct (Reason + Act) pattern for agent execution:
 * 1. **Observe**: Gather current browser state and context
 * 2. **Think**: Reason about what to do next
 * 3. **Act**: Execute tool/action
 * 4. **Reflect**: Evaluate result and adjust if needed
 * 
 * This is the core execution loop that makes the agent "agentic".
 * 
 * Pattern:
 * ```
 * while (not done):
 *   observation = observe_environment()
 *   thought = think(observation, goal, history)
 *   action = decide_action(thought)
 *   result = execute(action)
 *   reflect(result)
 *   if task_complete(result):
 *     break
 * ```
 */

import { LLMMessage } from '../llm/types';
import { BaseLLMProvider } from '../llm/BaseLLMProvider';
import { ToolRegistry } from '../tools/ToolRegistry';
import { BrowserContextProvider } from '../context/BrowserContextProvider';
import { ToolResult } from '../tools/types';
import { BrowserContext } from '../context/types';
import {
  AgentState,
  AgentObservation,
  AgentThought,
  AgentAction,
  ReActIteration,
  ExecutionContext,
  AgentEventCallback
} from './types';

export class ReActEngine {
  private llmProvider: BaseLLMProvider;
  private toolRegistry: ToolRegistry;
  private contextProvider: BrowserContextProvider;
  private maxIterations: number;
  private enableReflection: boolean;

  constructor(
    llmProvider: BaseLLMProvider,
    toolRegistry: ToolRegistry,
    contextProvider: BrowserContextProvider,
    options: {
      maxIterations?: number;
      enableReflection?: boolean;
    } = {}
  ) {
    this.llmProvider = llmProvider;
    this.toolRegistry = toolRegistry;
    this.contextProvider = contextProvider;
    this.maxIterations = options.maxIterations || 10;
    this.enableReflection = options.enableReflection ?? true;
  }

  /**
   * Execute ReAct loop
   */
  public async execute(
    goal: string,
    context: ExecutionContext,
    onEvent?: AgentEventCallback
  ): Promise<{
    success: boolean;
    finalState: AgentState;
    iterations: ReActIteration[];
    finalResponse: string;
    totalTokensUsed: number;
  }> {
    const iterations: ReActIteration[] = [];
    let totalTokensUsed = 0;
    let iterationCount = 0;
    let taskComplete = false;
    let finalResponse = '';

    console.log(`[ReAct] Starting execution loop for goal: "${goal}"`);

    // Main ReAct loop
    while (iterationCount < this.maxIterations && !taskComplete) {
      iterationCount++;
      console.log(`\n[ReAct] === Iteration ${iterationCount}/${this.maxIterations} ===`);

      try {
        // 1. OBSERVE - Gather current state
        const observation = await this.observe(context);
        await onEvent?.({
          type: 'observation',
          timestamp: Date.now(),
          sessionId: context.sessionId,
          data: observation
        });

        // 2. THINK - Reason about next action
        const { thought, reasoning, messages, tokensUsed } = await this.think(
          goal,
          observation,
          context,
          iterations
        );
        
        totalTokensUsed += tokensUsed;

        await onEvent?.({
          type: 'thought',
          timestamp: Date.now(),
          sessionId: context.sessionId,
          data: thought
        });

        console.log(`[ReAct] Thought: ${thought.content}`);

        // 3. ACT - Decide and execute action
        const { action, actionResult, finalAnswer } = await this.act(
          messages,
          context,
          onEvent
        );

        // Check if this is the final answer
        if (finalAnswer) {
          finalResponse = finalAnswer;
          taskComplete = true;
          console.log(`[ReAct] Task completed with final answer`);
        }

        // 4. REFLECT - Evaluate result (if enabled)
        if (this.enableReflection && actionResult) {
          await this.reflect(action, actionResult, context, onEvent);
        }

        // Record iteration
        const iteration: ReActIteration = {
          iteration: iterationCount,
          observation,
          browserContext: context.browserContext,
          thought,
          reasoning,
          action,
          actionResult,
          timestamp: Date.now(),
          tokensUsed
        };

        iterations.push(iteration);

        // Update context
        context.executionCount++;
        context.lastUpdateTime = Date.now();

        // Check for failure conditions
        if (actionResult && !actionResult.success) {
          console.warn(`[ReAct] Action failed: ${actionResult.error}`);
          
          // Increment failure count
          const consecutiveFailures = iterations
            .slice(-3)
            .filter(it => it.actionResult && !it.actionResult.success)
            .length;

          if (consecutiveFailures >= 3) {
            console.error(`[ReAct] Too many consecutive failures, aborting`);
            return {
              success: false,
              finalState: 'failed',
              iterations,
              finalResponse: 'Task failed due to repeated errors',
              totalTokensUsed
            };
          }
        }

      } catch (error) {
        console.error(`[ReAct] Error in iteration ${iterationCount}:`, error);
        
        await onEvent?.({
          type: 'error',
          timestamp: Date.now(),
          sessionId: context.sessionId,
          data: { error: String(error), iteration: iterationCount }
        });

        // Continue to next iteration or abort based on error severity
        if (iterationCount >= 3) {
          return {
            success: false,
            finalState: 'failed',
            iterations,
            finalResponse: `Task failed: ${error}`,
            totalTokensUsed
          };
        }
      }
    }

    // Check if we hit max iterations without completing
    if (!taskComplete && iterationCount >= this.maxIterations) {
      console.warn(`[ReAct] Reached max iterations (${this.maxIterations}) without completion`);
      finalResponse = 'Task did not complete within iteration limit';
    }

    return {
      success: taskComplete,
      finalState: taskComplete ? 'completed' : 'failed',
      iterations,
      finalResponse,
      totalTokensUsed
    };
  }

  /**
   * Step 1: OBSERVE - Gather current browser state
   */
  private async observe(context: ExecutionContext): Promise<AgentObservation> {
    console.log(`[ReAct] Observing browser state...`);

    // Get current browser context
    const browserContext = await this.contextProvider.getContext({
      includePrunedDOM: true,
      includeAccessibilityTree: false,
      includeConsoleLogs: true,
      includeNetworkActivity: false,
      maxElements: 50,
      maxConsoleEntries: 10
    });
    context.browserContext = browserContext;

    const observation: AgentObservation = {
      type: 'browser_state',
      timestamp: Date.now(),
      data: browserContext,
      summary: this.generateObservationSummary(browserContext)
    };

    return observation;
  }

  /**
   * Step 2: THINK - Reason about next action
   */
  private async think(
    goal: string,
    observation: AgentObservation,
    context: ExecutionContext,
    previousIterations: ReActIteration[]
  ): Promise<{
    thought: AgentThought;
    reasoning: string;
    messages: LLMMessage[];
    tokensUsed: number;
  }> {
    console.log(`[ReAct] Thinking about next action...`);

    // Build context for LLM
    const messages = this.buildThinkingMessages(goal, observation, context, previousIterations);

    // Get tool definitions (convert to MCP format for LLM)
    const tools = this.toolRegistry.getToolsAsMCP();

    // Call LLM to reason
    const response = await this.llmProvider.generateCompletion({
      messages,
      tools,
      temperature: 0.2, // Lower temperature for more focused reasoning
      systemPrompt: this.buildSystemPrompt(context)
    });

    // Extract reasoning
    const reasoning = typeof response.message.content === 'string' 
      ? response.message.content 
      : JSON.stringify(response.message.content);
    const tokensUsed = response.usage?.totalTokens || 0;

    const thought: AgentThought = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'reasoning',
      content: reasoning
    };

    // Add assistant message to context
    context.messages.push(response.message);

    return {
      thought,
      reasoning,
      messages: [...messages, response.message],
      tokensUsed
    };
  }

  /**
   * Step 3: ACT - Execute decided action
   */
  private async act(
    messages: LLMMessage[],
    context: ExecutionContext,
    onEvent?: AgentEventCallback
  ): Promise<{
    action: AgentAction;
    actionResult?: ToolResult;
    finalAnswer?: string;
  }> {
    // Get last assistant message
    const lastMessage = messages[messages.length - 1];

    // Check if LLM wants to use a tool
    if (lastMessage.toolCalls && lastMessage.toolCalls.length > 0) {
      const toolCall = lastMessage.toolCalls[0]; // Execute first tool call

      const action: AgentAction = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'tool_call',
        toolCall,
        reasoning: lastMessage.content as string
      };

      console.log(`[ReAct] Executing tool: ${toolCall.function.name}`);

      await onEvent?.({
        type: 'action',
        timestamp: Date.now(),
        sessionId: context.sessionId,
        data: action
      });

      // Execute tool
      const args = JSON.parse(toolCall.function.arguments);
      const result = await this.toolRegistry.executeTool(toolCall.function.name, args);

      console.log(`[ReAct] Tool result: ${result.success ? 'SUCCESS' : 'FAILED'}`);

      // Add tool result to context
      context.messages.push({
        role: 'tool',
        content: JSON.stringify(result.data),
        toolCallId: toolCall.id,
        name: toolCall.function.name
      });

      return { action, actionResult: result };
    }

    // No tool call - LLM gave text response instead
    // This should NOT happen for automation tasks - we need to force tool usage!
    console.warn(`[ReAct] ⚠️ LLM provided text response instead of tool call!`);
    console.warn(`[ReAct] Response: ${String(lastMessage.content).substring(0, 200)}`);
    
    // Check if this looks like task completion keywords
    const content = String(lastMessage.content).toLowerCase();
    const completionKeywords = ['task complete', 'completed successfully', 'finished', 'done', 'i cannot', 'unable to', 'impossible'];
    const isCompletion = completionKeywords.some(keyword => content.includes(keyword));
    
    if (isCompletion) {
      // LLM thinks task is done or cannot be done
      const action: AgentAction = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'complete_task',
        reasoning: 'LLM indicated task completion or inability to proceed'
      };

      console.log(`[ReAct] Task marked as complete by LLM`);
      return { action, finalAnswer: String(lastMessage.content) };
    }
    
    // Otherwise, this is an error - LLM should have called a tool
    // Treat as a failed action and continue loop
    console.warn(`[ReAct] Forcing LLM to use tools...`);
    const action: AgentAction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'tool_call',
      reasoning: 'LLM failed to provide tool call, will retry'
    };
    
    const failureResult: ToolResult = {
      success: false,
      message: 'You did not call any tool. You MUST use the available tools to accomplish the task.',
      data: { llm_response: lastMessage.content }
    };
    
    // Add this as a user message to force LLM to try again with tools
    context.messages.push({
      role: 'user',
      content: 'ERROR: You must use the available tools to accomplish this task. Do not provide text instructions - actually execute actions by calling tools. Based on the current page state, which specific tool should you call RIGHT NOW to make progress? Call that tool.'
    });

    return { action, actionResult: failureResult };
  }

  /**
   * Step 4: REFLECT - Evaluate action result and learn
   */
  private async reflect(
    action: AgentAction,
    result: ToolResult,
    context: ExecutionContext,
    onEvent?: AgentEventCallback
  ): Promise<void> {
    if (!result.success) {
      console.log(`[ReAct] Reflecting on failed action: ${result.error}`);

      // Add reflection to context
      const reflection: AgentThought = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'reflection',
        content: `The action failed with error: ${result.error}. I should try a different approach.`,
        relatedStepId: action.id
      };

      await onEvent?.({
        type: 'thought',
        timestamp: Date.now(),
        sessionId: context.sessionId,
        data: reflection
      });
    } else {
      console.log(`[ReAct] Action succeeded, continuing...`);
    }
  }

  /**
   * Build system prompt for the agent
   */
  private buildSystemPrompt(context: ExecutionContext): string {
    return `You are an intelligent browser automation agent. You control a web browser by calling tools/functions.

## YOUR ROLE
You are a ROBOT that EXECUTES browser actions. You are NOT a chatbot that describes actions.

## AVAILABLE TOOLS
You have 18 tools for browser automation:

**Navigation:**
- navigate_to_url: Go to a URL
- go_back: Browser back button
- go_forward: Browser forward button  
- reload_page: Refresh current page

**Interaction:**
- click_element: Click an element (button, link, etc)
- type_text: Type text into an input/textarea
- press_key: Press keyboard key (Enter, Tab, etc)
- select_option: Select from dropdown
- check_checkbox: Check/uncheck checkbox
- submit_form: Submit a form

**Observation:**
- get_page_info: Get URL, title, ready state
- find_element: Find element by description
- verify_element_exists: Check if element exists
- verify_text_present: Check if text is on page
- get_element_text: Extract text from element
- get_element_attribute: Get element attribute (href, value, etc)
- wait_for_element: Wait for element to appear
- take_screenshot: Capture page screenshot

## CRITICAL RULES

1. **YOU MUST CALL FUNCTIONS** - Every response MUST call a tool unless task is complete or impossible
2. **NO TEXT INSTRUCTIONS** - Do NOT say "click the button" - CALL click_element()
3. **NO PSEUDOCODE** - Do NOT write Python-style code - USE ACTUAL FUNCTION CALLS
4. **ONE TOOL PER TURN** - Call one tool, see result, then decide next tool

## SELECTOR STRATEGIES
When calling tools that need to find elements, use:
- \`selector_strategy: "css"\`, \`selector_value: "button.primary"\` - For CSS selectors
- \`selector_strategy: "text"\`, \`selector_value: "Sign In"\` - For visible text
- \`selector_strategy: "aria_label"\`, \`selector_value: "Search"\` - For ARIA labels
- \`selector_strategy: "placeholder"\`, \`selector_value: "Enter email"\` - For placeholders

## EXAMPLES

**BAD Response (TEXT ONLY - FORBIDDEN):**
"You should navigate to github.com first, then click the sign in button"

**GOOD Response (ACTUAL FUNCTION CALL):**
Call: navigate_to_url
Parameters: {"url": "https://github.com", "wait_for_load": true}

**BAD Response (PSEUDOCODE - FORBIDDEN):**
\`\`\`python
call_tool("type_text", {"selector": "input[name='q']", "text": "hello"})
\`\`\`

**GOOD Response (ACTUAL FUNCTION CALL):**
Call: type_text
Parameters: {"selector_strategy": "css", "selector_value": "input[name='q']", "text": "hello"}

## YOUR WORKFLOW
1. Observe the current page (you'll get URL, title, visible elements)
2. Decide which tool to call next
3. CALL THE TOOL (using function calling)
4. See the result
5. Repeat until task complete

## COMPLETION
Only stop calling tools when:
- Task is successfully complete (e.g., repo created, form submitted)
- Task is impossible (e.g., "I need login credentials but don't have them")

**Current Execution:**
Mode: ${context.mode} | Steps: ${context.executionCount}/${context.maxExecutionSteps}

**REMEMBER: CALL FUNCTIONS, DON'T DESCRIBE THEM!**`;
  }

  /**
   * Build messages for thinking phase
   */
  private buildThinkingMessages(
    goal: string,
    observation: AgentObservation,
    context: ExecutionContext,
    previousIterations: ReActIteration[]
  ): LLMMessage[] {
    const messages: LLMMessage[] = [...context.messages];

    // If this is the first iteration, add the goal
    if (previousIterations.length === 0) {
      messages.push({
        role: 'user',
        content: `Please help me accomplish this task: ${goal}`
      });
    }

    // Add current observation
    const observationMessage = `Current browser state:\n${observation.summary}\n\nWhat should I do next to accomplish the goal?`;
    
    messages.push({
      role: 'user',
      content: observationMessage
    });

    return messages;
  }

  /**
   * Generate human-readable observation summary
   */
  private generateObservationSummary(browserContext: BrowserContext): string {
    const parts: string[] = [];

    // Page info
    parts.push(`Page: ${browserContext.metadata.title || 'Untitled'}`);
    parts.push(`URL: ${browserContext.metadata.url}`);

    // DOM elements count
    parts.push(`Interactive elements: ${browserContext.elementCount.interactive}`);
    parts.push(`Total elements: ${browserContext.elementCount.total}`);
      
    // List some key elements by type
    const buttons = browserContext.interactiveElements.filter((e: { tagName: string; role?: string }) => 
      e.tagName === 'BUTTON' || e.role === 'button'
    );
    const inputs = browserContext.interactiveElements.filter((e: { tagName: string }) => e.tagName === 'INPUT');
    const links = browserContext.interactiveElements.filter((e: { tagName: string }) => e.tagName === 'A');
      
    if (buttons.length > 0) parts.push(`Buttons: ${buttons.length}`);
    if (inputs.length > 0) parts.push(`Inputs: ${inputs.length}`);
    if (links.length > 0) parts.push(`Links: ${links.length}`);

    // Recent console logs
    if (browserContext.recentConsoleLogs && browserContext.recentConsoleLogs.length > 0) {
      parts.push(`Recent console logs: ${browserContext.recentConsoleLogs.length}`);
    }

    return parts.join('\n');
  }
}

