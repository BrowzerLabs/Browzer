import { ToolInstruction, ToolExecutionResult, McpToolInfo } from './types';
import { ServiceExtractor } from './ServiceExtractor';
import { ToolDescriptionAnalyzer } from './ToolDescriptionAnalyzer';

export class ClaudeToolAnalyzer {
  private async callClaudeAPI(prompt: string): Promise<string> {
    try {
      console.log('[ClaudeToolAnalyzer] Making direct API call to Anthropic...');

      // Get API key from localStorage
      const apiKey = localStorage.getItem('anthropic_api_key');
      if (!apiKey) {
        throw new Error('Anthropic API key not found. Please configure it in settings.');
      }

      // Direct fetch to Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Invalid response format from Anthropic API');
      }

      console.log('[ClaudeToolAnalyzer] API response received, length:', data.content[0].text.length);
      return data.content[0].text;

    } catch (error) {
      console.error('[ClaudeToolAnalyzer] Direct API call failed:', error);
      throw new Error(`Anthropic API call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async discoverRequiredTools(userQuery: string, availableTools: McpToolInfo[]): Promise<string[]> {
    // Step 1: Extract services from tools (dynamic, no hardcoding)
    const serviceExtractor = new ServiceExtractor();
    const availableServices = serviceExtractor.extractServicesFromTools(availableTools);

    console.log('[Discovery] Available services:', Array.from(availableServices));

    // Step 2: Extract services mentioned in query
    const queryServices = serviceExtractor.extractServicesFromQuery(userQuery, availableServices);

    console.log('[Discovery] Query services:', queryServices);

    // Step 3: Filter tools by detected services
    const filteredTools = serviceExtractor.filterToolsByServices(availableTools, queryServices);

    // Safety: If no services detected or too few tools, use all tools
    const toolsToUse = filteredTools.length >= 3 ? filteredTools : availableTools;

    console.log(`[Discovery] Filtered: ${availableTools.length} → ${toolsToUse.length} tools`);

    // Step 4: Format tools with descriptions for Claude
    const descriptionAnalyzer = new ToolDescriptionAnalyzer();
    const toolsList = descriptionAnalyzer.formatToolsForClaude(toolsToUse);

    // Step 5: Enhanced prompt for Claude with tool chaining intelligence
    const prompt = `
You are a tool selection expert. Analyze the user query and select ALL tools needed to complete the request.

User Query: "${userQuery}"
Detected Services: [${queryServices.join(', ')}]

Available Tools (filtered by service):
${toolsList}

CRITICAL INSTRUCTIONS:

1. READ TOOL DESCRIPTIONS CAREFULLY
   - Each tool has a description explaining what it does
   - If user provides a NAME but tool needs ID, find a tool that searches by name first
   - Example: User says "find board EB1A" → Use tool that "Finds board by name", not "by ID"

2. HANDLE TOOL CHAINING
   - If user provides NAME but tool needs ID:
     a) First, select tool that finds by name (returns ID)
     b) Then, select tool that uses ID (if needed for next action)
   - Example chain: trello_find_board (by name) → trello_find_card (uses board_id from previous result)

3. BREAK DOWN QUERY INTO ACTIONS
   - What information does user provide? (name, title, ID, etc.)
   - What information does tool need? (check description)
   - If mismatch, find intermediate tool to convert

4. TOOL SELECTION RULES
   ✓ Read EACH tool description to understand capabilities
   ✓ Match user input format (name/ID/title) with tool requirements
   ✓ If tool needs ID but user gives name, include "find by name" tool
   ✓ Include ALL tools for complete workflow
   ✓ Tool names must EXACTLY match list above
   ✓ Be CONSERVATIVE - select minimum tools needed

EXAMPLES:

Example 1: Query with NAME instead of ID
Query: "find trello board EB1A"
Analysis:
  - User provides: board NAME "EB1A"
  - Check descriptions:
    • trello_find_board: "Finds a board by name" ✓ MATCH
    • trello_find_board_by_id: "Finds board by ID" ✗ (needs ID, not name)
  - Decision: Use trello_find_board (matches user's input format)
Result: ["trello_find_board"]

Example 2: Tool Chaining
Query: "get cards from board EB1A"
Analysis:
  - User provides: board NAME "EB1A"
  - Goal: Get cards (needs board_id)
  - Check descriptions:
    • trello_find_board: "Finds board by name" → returns board_id
    • trello_find_card: "Search for cards" (needs board_id)
  - Decision: Chain tools (name → ID → cards)
Result: ["trello_find_board", "trello_find_card"]

Example 3: Direct ID provided
Query: "find board by id 67954b86"
Analysis:
  - User provides: board ID
  - Check descriptions:
    • trello_find_board_by_id: "Finds board by ID" ✓ MATCH
Result: ["trello_find_board_by_id"]

Example 4: Multi-step workflow
Query: "find gmail email about meeting and add to existing doc titled report"
Analysis:
  - Step 1: Find email → gmail_find_email
  - Step 2: Find document by title → google_docs_find_a_document (or similar)
  - Step 3: Add to document → append/update tool
  - Note: "existing doc" means don't use create tool
Result: ["gmail_find_email", "google_docs_find_a_document", "google_docs_append_text_to_document"]

5. COMMON MISTAKES TO AVOID:
   ✗ Don't include create tool if query says "add to existing" or "titled"
   ✗ Don't include find tool if query says "create new"
   ✗ Don't miss intermediate steps (e.g., finding by name before using ID)
   ✗ Don't hallucinate tool names not in the list

NOW ANALYZE THIS QUERY STEP-BY-STEP:

Query: "${userQuery}"

Think step-by-step:
1. What information does user provide? (name, ID, title, keyword, etc.)
2. For each available tool, read its description carefully
3. Which tool(s) match the user's input format?
4. Do I need to chain tools? (name → ID → action)
5. What is the complete workflow from start to finish?

Return ONLY JSON array of tool names in execution order:`;

    try {
      const response = await this.callClaudeAPI(prompt);

      // Extract JSON from response
      const jsonMatch = response.match(/\[.*?\]/s);
      if (jsonMatch) {
        const tools = JSON.parse(jsonMatch[0]);

        // Validate that all tools exist in filtered tools
        const toolNames = toolsToUse.map(t => t.name);
        const validTools = tools.filter((tool: string) => toolNames.includes(tool));

        console.log('[ClaudeToolAnalyzer] Discovered tools:', validTools);

        // Log hallucinations (tools not in filtered list)
        const hallucinated = tools.filter((tool: string) => !toolNames.includes(tool));
        if (hallucinated.length > 0) {
          console.warn('[ClaudeToolAnalyzer] Hallucinated tools (removed):', hallucinated);
        }

        return validTools;
      }

      // Fallback: try to parse the entire response as JSON
      try {
        const tools = JSON.parse(response.trim());
        if (Array.isArray(tools)) {
          const toolNames = toolsToUse.map(t => t.name);
          return tools.filter(tool => toolNames.includes(tool));
        }
      } catch (parseError) {
        console.warn('[ClaudeToolAnalyzer] Failed to parse response as JSON:', response);
      }

      console.warn('[ClaudeToolAnalyzer] No valid JSON array found in response, returning empty array');
      return [];

    } catch (error) {
      console.error('[ClaudeToolAnalyzer] Tool discovery failed:', error);
      return [];
    }
  }

  async mapToolInstructions(userQuery: string, requiredTools: string[]): Promise<ToolInstruction[]> {
    const prompt = `
You are an AI assistant that maps user queries to specific tool instructions.

Original User Query: "${userQuery}"
Required Tools: ${requiredTools.join(', ')}

Your task:
1. For each tool, extract the specific part of the user query that applies to that tool
2. Create a clear, actionable instruction for each tool
3. Return ONLY a JSON array of objects with "toolName" and "instruction" fields

Requirements:
- Each instruction should be specific and actionable
- Instructions should contain all necessary details from the original query
- If a tool needs parameters, include them in natural language in the instruction
- Return ONLY the JSON array, no other text

Example:
[
  {"toolName": "send_email", "instruction": "send email to john@example.com with subject 'Meeting Tomorrow' and body 'Hi John, let's meet tomorrow at 2pm'"},
  {"toolName": "create_calendar_event", "instruction": "create calendar event for tomorrow at 2pm with title 'Meeting with John'"}
]

Response:`;

    try {
      const response = await this.callClaudeAPI(prompt);

      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const instructions = JSON.parse(jsonMatch[0]);

        // Validate structure
        const validInstructions = instructions.filter((item: any) =>
          item && typeof item === 'object' &&
          typeof item.toolName === 'string' &&
          typeof item.instruction === 'string' &&
          requiredTools.includes(item.toolName)
        );

        console.log('[ClaudeToolAnalyzer] Mapped instructions:', validInstructions);
        return validInstructions;
      }

      // Fallback: try to parse entire response
      try {
        const instructions = JSON.parse(response.trim());
        if (Array.isArray(instructions)) {
          return instructions.filter(item =>
            item && typeof item.toolName === 'string' && typeof item.instruction === 'string'
          );
        }
      } catch (parseError) {
        console.warn('[ClaudeToolAnalyzer] Failed to parse mapping response:', response);
      }

      // Final fallback: create basic mappings
      console.warn('[ClaudeToolAnalyzer] Creating fallback mappings');
      return requiredTools.map(tool => ({
        toolName: tool,
        instruction: userQuery
      }));

    } catch (error) {
      console.error('[ClaudeToolAnalyzer] Instruction mapping failed:', error);
      // Fallback mappings
      return requiredTools.map(tool => ({
        toolName: tool,
        instruction: userQuery
      }));
    }
  }

  async formatFinalResponse(executionResults: ToolExecutionResult[], originalQuery: string): Promise<string> {
    const resultsText = executionResults.map(result => {
      const status = result.success ? '✅ Success' : '❌ Failed';
      const responseText = result.success
        ? (typeof result.response === 'string' ? result.response : JSON.stringify(result.response, null, 2))
        : result.error || 'Unknown error';

      return `${result.toolName}: ${status}\n${responseText}\n`;
    }).join('\n');

    const prompt = `
You are an AI assistant that formats task execution results into user-friendly responses.

Original User Request: "${originalQuery}"

Tool Execution Results:
${resultsText}

Your task:
1. Analyze the execution results
2. Create a clear, concise summary of what was accomplished
3. Use emojis appropriately to make the response engaging
4. If any tools failed, mention what went wrong
5. Show only the actual results/content - no meta-commentary about execution
6. Do NOT ask follow-up questions or include conversational prompts - provide only factual information
7. Do NOT mention "tool successfully retrieved" or "execution completed" - show only the actual data

Format the response as a direct summary that addresses what the user requested without technical details or questions.

Response:`;

    try {
      const response = await this.callClaudeAPI(prompt);
      console.log('[ClaudeToolAnalyzer] Formatted final response:', response);
      return response.trim();

    } catch (error) {
      console.error('[ClaudeToolAnalyzer] Response formatting failed:', error);

      // Fallback formatting
      const successCount = executionResults.filter(r => r.success).length;
      const totalCount = executionResults.length;

      if (successCount === totalCount) {
        return `✅ Successfully completed all ${totalCount} tasks:\n\n${executionResults.map(r => `• ${r.toolName}: Completed successfully`).join('\n')}`;
      } else {
        return `⚠️ Completed ${successCount}/${totalCount} tasks:\n\n${executionResults.map(r =>
          `• ${r.toolName}: ${r.success ? '✅ Success' : '❌ Failed - ' + (r.error || 'Unknown error')}`
        ).join('\n')}`;
      }
    }
  }

  async enhanceParametersFromContext(
    toolSchema: McpToolInfo,
    executionContext: any[],
    originalInstruction: string
  ): Promise<any> {
    console.log('[ClaudeToolAnalyzer] Enhancing parameters from context for:', toolSchema.name);

    // Create context summary for Claude
    const contextSummary = executionContext.map(ctx =>
      `Tool: ${ctx.toolName}\nResult: ${JSON.stringify(ctx.result, null, 2)}\nTimestamp: ${new Date(ctx.timestamp).toISOString()}`
    ).join('\n\n');

    const prompt = `
You are an AI assistant that intelligently extracts parameters from previous tool execution results to enhance the current tool call.

Current Tool to Execute: ${toolSchema.name}
Tool Description: ${toolSchema.description || 'No description available'}
Original Instruction: "${originalInstruction}"

Tool Input Schema:
${JSON.stringify(toolSchema.inputSchema, null, 2)}

Previous Execution Context:
${contextSummary}

Your task:
1. Analyze the previous execution results to find data relevant to the current tool
2. Extract specific parameter values that the current tool needs from the context
3. Merge the extracted parameters with the original instruction
4. Return a JSON object with the enhanced parameters

Requirements:
- Always include the original instruction as "instructions" field
- Extract specific values (IDs, names, etc.) from previous results when they match the tool's input schema
- Only include parameters that exist in the tool's input schema
- If no relevant context is found, just return {"instructions": originalInstruction}
- Return ONLY the JSON object, no other text

Example outputs:
{"instructions": "Find cards in EB1A tracker", "board_id": "67954b86a0aa3b5ca4bf662f"}
{"instructions": "Send email about meeting", "recipient": "user@example.com", "subject": "Meeting Update"}

Response:`;

    try {
      const response = await this.callClaudeAPI(prompt);

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const enhancedParams = JSON.parse(jsonMatch[0]);

        // Validate that we have the basic instructions field
        if (!enhancedParams.instructions) {
          enhancedParams.instructions = originalInstruction;
        }

        console.log('[ClaudeToolAnalyzer] Enhanced parameters:', enhancedParams);
        return enhancedParams;
      }

      // Fallback: try to parse entire response
      try {
        const enhancedParams = JSON.parse(response.trim());
        if (typeof enhancedParams === 'object') {
          if (!enhancedParams.instructions) {
            enhancedParams.instructions = originalInstruction;
          }
          return enhancedParams;
        }
      } catch (parseError) {
        console.warn('[ClaudeToolAnalyzer] Failed to parse parameter enhancement response:', response);
      }

      // Final fallback
      console.warn('[ClaudeToolAnalyzer] Parameter enhancement failed, using fallback');
      return { instructions: originalInstruction };

    } catch (error) {
      console.error('[ClaudeToolAnalyzer] Parameter enhancement failed:', error);
      // Always return fallback to maintain functionality
      return { instructions: originalInstruction };
    }
  }
}