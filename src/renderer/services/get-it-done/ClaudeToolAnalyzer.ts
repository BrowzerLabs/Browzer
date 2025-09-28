import { ToolInstruction, ToolExecutionResult, McpToolInfo } from './types';

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
    const toolsList = availableTools.map(tool =>
      `- ${tool.name}${tool.description ? ': ' + tool.description : ''}`
    ).join('\n');

    const prompt = `
You are an AI assistant that analyzes user queries to determine which MCP tools are needed.

User Query: "${userQuery}"

Available MCP Tools:
${toolsList}

Your task:
1. Analyze the user query to understand what actions need to be performed
2. Identify which tools from the available list are required to complete this task
3. Return ONLY a JSON array of tool names (strings) that are needed

Requirements:
- Only include tools that are actually available in the list above
- Be precise - don't include unnecessary tools
- If no suitable tools are found, return an empty array []
- Return ONLY the JSON array, no other text

Example responses:
["send_email", "create_calendar_event"]
["search_documentation"]
[]

Response:`;

    try {
      const response = await this.callClaudeAPI(prompt);

      // Extract JSON from response
      const jsonMatch = response.match(/\[.*?\]/s);
      if (jsonMatch) {
        const tools = JSON.parse(jsonMatch[0]);

        // Validate that all tools exist in available tools
        const availableToolNames = availableTools.map(t => t.name);
        const validTools = tools.filter((tool: string) => availableToolNames.includes(tool));

        console.log('[ClaudeToolAnalyzer] Discovered tools:', validTools);
        return validTools;
      }

      // Fallback: try to parse the entire response as JSON
      try {
        const tools = JSON.parse(response.trim());
        if (Array.isArray(tools)) {
          return tools.filter(tool => availableTools.some(t => t.name === tool));
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
}