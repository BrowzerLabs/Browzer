/**
 * MCP Claude Service
 *
 * Integrates Claude API for AI-enhanced message understanding in MCP routing.
 * Uses the same API key as Ask/Do modes from localStorage.
 */

export interface McpMessageAnalysis {
  intent: string;
  tools: McpToolRecommendation[];
  complexity: 'simple' | 'medium' | 'complex';
  reasoning: string;
  confidence: number;
  parameters: Record<string, any>;
}

export interface McpToolRecommendation {
  name: string;
  confidence: number;
  parameters: Record<string, any>;
  reasoning: string;
}

export class McpClaudeService {
  private apiKey: string | null = null;
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';

  constructor() {
    this.initializeApiKey();
  }

  /**
   * Initialize API key from localStorage (same as Ask/Do modes)
   */
  private initializeApiKey(): void {
    this.apiKey = localStorage.getItem('anthropic_api_key');
    if (!this.apiKey) {
      console.warn('[McpClaudeService] Claude API key not found in localStorage');
    } else {
      console.log('[McpClaudeService] Claude API key initialized for MCP message understanding');
    }
  }

  /**
   * Check if Claude API is available
   */
  public isAvailable(): boolean {
    return this.apiKey !== null && this.apiKey.trim() !== '';
  }

  /**
   * NEW: Analyze user message with dynamically discovered tools
   */
  async analyzeUserMessageWithDynamicTools(message: string, discoveredTools: any[]): Promise<McpMessageAnalysis> {
    console.log('[McpClaudeService] Analyzing message with dynamic tools:', {
      message,
      toolCount: discoveredTools.length,
      categories: [...new Set(discoveredTools.map(t => t.category))]
    });

    if (!this.isAvailable()) {
      throw new Error('Claude API key not available. Please configure API key in settings.');
    }

    const prompt = this.buildDynamicToolAnalysisPrompt(message, discoveredTools);

    try {
      const response = await this.callClaudeAPI(prompt);
      const analysis = this.parseClaudeResponse(response);

      console.log('[McpClaudeService] Dynamic tool analysis completed:', analysis);
      return analysis;

    } catch (error) {
      console.error('[McpClaudeService] Dynamic tool analysis failed:', error);
      throw new Error(`Claude API analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * LEGACY: Analyze user message using Claude API for MCP tool selection
   */
  async analyzeUserMessage(message: string, availableTools: string[] = []): Promise<McpMessageAnalysis> {
    console.log('[McpClaudeService] Analyzing message:', message);

    if (!this.isAvailable()) {
      throw new Error('Claude API key not available. Please configure API key in settings.');
    }

    const prompt = this.buildAnalysisPrompt(message, availableTools);

    try {
      const response = await this.callClaudeAPI(prompt);
      const analysis = this.parseClaudeResponse(response);

      console.log('[McpClaudeService] Analysis completed:', analysis);
      return analysis;

    } catch (error) {
      console.error('[McpClaudeService] Claude API call failed:', error);
      throw new Error(`Claude API analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * NEW: Build dynamic prompt with all discovered tools
   */
  private buildDynamicToolAnalysisPrompt(message: string, discoveredTools: any[]): string {
    // Organize tools by category for better Claude analysis
    const toolsByCategory = this.organizeToolsByCategory(discoveredTools);
    const toolDescriptions = this.formatToolsForClaude(toolsByCategory);

    return `You are an expert MCP (Model Context Protocol) tool router with access to ALL available tools across multiple platforms. Analyze this user message and recommend the best tools for execution.

User Message: "${message}"

AVAILABLE TOOLS (dynamically discovered):
${toolDescriptions}

ANALYSIS REQUIREMENTS:
1. Understand the user's intent and what they want to accomplish
2. Select the most appropriate tool(s) from the available options
3. Extract exact parameters from the user's natural language
4. For multi-step workflows, provide tools in execution order
5. Handle ANY tool type - not just hardcoded ones

RESPONSE FORMAT (JSON only):
{
  "intent": "what the user wants to accomplish",
  "tools": [
    {
      "name": "exact_tool_name_from_list",
      "confidence": 0.95,
      "parameters": {"parameter_name": "exact_value_from_user_message"},
      "reasoning": "why this specific tool was chosen"
    }
  ],
  "complexity": "simple|medium|complex",
  "reasoning": "overall analysis and execution plan",
  "confidence": 0.90,
  "executionOrder": "sequential|parallel",
  "parameters": {"global_parameters": "extracted_from_message"}
}

CRITICAL RULES:
1. EXACT parameter extraction: "get 1 email" → {"limit": 1}, "get 5 emails" → {"limit": 5}
2. Use ONLY tools from the available list above
3. If user specifies quantity, USE THAT EXACT NUMBER
4. For multi-step: list tools in execution order
5. Choose tools that best match user intent, not just first match

Respond with valid JSON only.`;
  }

  /**
   * LEGACY: Build prompt for Claude API to analyze MCP routing needs
   */
  private buildAnalysisPrompt(message: string, availableTools: string[]): string {
    return `You are an expert MCP (Model Context Protocol) tool router. Analyze this user message and recommend the best MCP tools for execution.

User Message: "${message}"

Available MCP Tools: ${availableTools.length > 0 ? availableTools.join(', ') : 'gmail_find_email, gmail_send_email, gmail_reply_to_email, google_calendar_find_events, google_calendar_quick_add_event, google_calendar_update_event'}

Please analyze the message and respond with a JSON object containing:

{
  "intent": "primary action the user wants to perform",
  "tools": [
    {
      "name": "exact_mcp_tool_name",
      "confidence": 0.95,
      "parameters": {"limit": 1, "query": ""},
      "reasoning": "why this tool is recommended"
    }
  ],
  "complexity": "simple|medium|complex",
  "reasoning": "overall analysis of the request",
  "confidence": 0.90,
  "parameters": {"extracted parameters from user message"}
}

CRITICAL PARAMETER EXTRACTION RULES:
1. "get 1 email" → gmail_find_email with parameters: {"limit": 1}
2. "get 3 emails" → gmail_find_email with parameters: {"limit": 3}
3. "get 5 emails" → gmail_find_email with parameters: {"limit": 5}
4. "get emails from john" → gmail_find_email with parameters: {"query": "from:john", "limit": 10}
5. "get latest email" → gmail_find_email with parameters: {"limit": 1}

IMPORTANT:
- ALWAYS extract the exact number when user specifies it
- If user says "1 email", set limit to 1, not 3 or 10
- For calendar: use google_calendar_find_events or google_calendar_quick_add_event
- complexity: "simple" = 1 tool, "medium" = 2-3 tools, "complex" = 4+ tools

The limit parameter MUST match what the user requested exactly.

Respond only with valid JSON.`;
  }

  /**
   * Call Claude API with the analysis prompt
   */
  private async callClaudeAPI(prompt: string): Promise<string> {
    console.log('[McpClaudeService] Calling Claude API...');

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Parse Claude's response into structured analysis
   */
  private parseClaudeResponse(response: string): McpMessageAnalysis {
    console.log('[McpClaudeService] Parsing Claude response:', response);

    try {
      // Extract JSON from response (Claude sometimes adds explanation text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      const analysis: McpMessageAnalysis = {
        intent: parsed.intent || 'unknown',
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        complexity: parsed.complexity || 'simple',
        reasoning: parsed.reasoning || 'Analysis completed',
        confidence: parsed.confidence || 0.5,
        parameters: parsed.parameters || {}
      };

      // Ensure tools have required fields
      analysis.tools = analysis.tools.map(tool => ({
        name: tool.name || 'unknown',
        confidence: tool.confidence || 0.5,
        parameters: tool.parameters || {},
        reasoning: tool.reasoning || 'Recommended by AI'
      }));

      return analysis;

    } catch (error) {
      console.error('[McpClaudeService] Failed to parse Claude response:', error);

      // Fallback analysis for unparseable responses
      return {
        intent: 'unknown',
        tools: [],
        complexity: 'simple',
        reasoning: 'Failed to parse AI response, using fallback',
        confidence: 0.1,
        parameters: {}
      };
    }
  }

  /**
   * Organize discovered tools by category for Claude analysis
   */
  private organizeToolsByCategory(discoveredTools: any[]): Map<string, any[]> {
    const categories = new Map<string, any[]>();

    for (const tool of discoveredTools) {
      const category = tool.category || 'general';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(tool);
    }

    return categories;
  }

  /**
   * Format tools for Claude API prompt
   */
  private formatToolsForClaude(toolsByCategory: Map<string, any[]>): string {
    let formatted = '';

    for (const [category, tools] of toolsByCategory.entries()) {
      formatted += `\n=== ${category.toUpperCase()} TOOLS ===\n`;

      for (const tool of tools) {
        formatted += `\nTool: ${tool.name}\n`;
        formatted += `Server: ${tool.serverName}\n`;
        formatted += `Description: ${tool.description}\n`;
        formatted += `Capabilities: ${tool.capabilities.join(', ')}\n`;

        // Add parameters if available
        if (tool.parameters && tool.parameters.length > 0) {
          formatted += `Parameters:\n`;
          for (const param of tool.parameters) {
            const required = param.required ? ' (REQUIRED)' : ' (optional)';
            formatted += `  - ${param.name}: ${param.type}${required} - ${param.description}\n`;
          }
        }
        formatted += '---\n';
      }
    }

    return formatted;
  }

  /**
   * Refresh API key if it changed in localStorage
   */
  public refreshApiKey(): void {
    this.initializeApiKey();
  }
}