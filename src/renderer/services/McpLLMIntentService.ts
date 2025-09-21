/**
 * MCP LLM Intent Service
 *
 * Uses LLM (Claude) for comprehensive intent understanding, parameter extraction,
 * and clarification resolution. Replaces rule-based parameter extraction with
 * intelligent LLM-driven understanding of user intent and context.
 */

export interface LLMIntentAnalysis {
  intent: string;
  intentCategory: 'list_all' | 'search_specific' | 'create' | 'update' | 'delete' | 'action';
  confidence: number;
  tools: LLMToolRecommendation[];
  parameters: Record<string, any>;
  reasoning: string;
  contextualDefaults: Record<string, any>;
  clarificationResolution?: {
    canAutoResolve: boolean;
    autoResponse?: string;
    reasoning: string;
  };
}

export interface LLMToolRecommendation {
  name: string;
  confidence: number;
  parameters: Record<string, any>;
  reasoning: string;
  parameterSources: Record<string, 'user_explicit' | 'inferred' | 'default'>;
}

export interface ConversationContext {
  previousQueries: string[];
  previousIntents: string[];
  userPreferences: Record<string, any>;
  clarificationHistory: Array<{
    question: string;
    answer: string;
    context: string;
  }>;
  toolExecutionHistory: Array<{
    tool: string;
    parameters: Record<string, any>;
    success: boolean;
    result: any;
  }>;
}

export class McpLLMIntentService {
  private apiKey: string | null = null;
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';
  private conversationContexts: Map<string, ConversationContext> = new Map();

  constructor() {
    this.initializeApiKey();
  }

  /**
   * Initialize API key from localStorage
   */
  private initializeApiKey(): void {
    this.apiKey = localStorage.getItem('anthropic_api_key');
    if (!this.apiKey) {
      console.warn('[McpLLMIntentService] Claude API key not found in localStorage');
    } else {
      console.log('[McpLLMIntentService] Claude API key initialized for comprehensive intent understanding');
    }
  }

  /**
   * Refresh API key from localStorage
   */
  public refreshApiKey(): void {
    this.initializeApiKey();
  }

  /**
   * Check if LLM service is available
   */
  public isAvailable(): boolean {
    return this.apiKey !== null && this.apiKey.trim() !== '';
  }

  /**
   * MAIN METHOD: Comprehensive intent understanding with context
   */
  async analyzeUserIntent(
    message: string,
    availableTools: any[],
    conversationId?: string,
    mcpClarificationContext?: {
      question: string;
      originalQuery: string;
      toolName: string;
      parameterName: string;
    }
  ): Promise<LLMIntentAnalysis> {
    console.log('[McpLLMIntentService] Analyzing user intent:', {
      message,
      toolCount: availableTools.length,
      hasContext: !!conversationId,
      isClarificationResolution: !!mcpClarificationContext
    });

    if (!this.isAvailable()) {
      throw new Error('Claude API key not available. Please configure API key in settings.');
    }

    // Get conversation context if available
    const context = conversationId ? this.getConversationContext(conversationId) : null;

    let prompt: string;
    if (mcpClarificationContext) {
      // This is clarification resolution
      prompt = this.buildClarificationResolutionPrompt(message, mcpClarificationContext, availableTools, context);
    } else {
      // This is initial intent analysis
      prompt = this.buildComprehensiveIntentPrompt(message, availableTools, context);
    }

    try {
      const response = await this.callClaudeAPI(prompt);
      const analysis = this.parseIntentAnalysisResponse(response);

      // Update conversation context
      if (conversationId) {
        this.updateConversationContext(conversationId, message, analysis);
      }

      console.log('[McpLLMIntentService] Intent analysis completed:', {
        intent: analysis.intent,
        category: analysis.intentCategory,
        toolCount: analysis.tools.length,
        confidence: analysis.confidence
      });

      return analysis;

    } catch (error) {
      console.error('[McpLLMIntentService] Intent analysis failed:', error);
      throw new Error(`LLM intent analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build comprehensive intent understanding prompt
   */
  private buildComprehensiveIntentPrompt(
    message: string,
    availableTools: any[],
    context: ConversationContext | null
  ): string {
    const toolDescriptions = this.formatToolsForLLM(availableTools);
    const contextStr = context ? this.formatContextForLLM(context) : '';

    return `You are an expert AI assistant that understands user intent with exceptional accuracy. Your job is to analyze user messages and provide comprehensive intent understanding including tool selection and parameter extraction.

USER MESSAGE: "${message}"

${contextStr}

AVAILABLE TOOLS:
${toolDescriptions}

INTENT ANALYSIS REQUIREMENTS:
1. **Intent Category Classification**: Determine if this is:
   - "list_all": User wants to see all items (e.g., "list all my notion pages", "show all emails")
   - "search_specific": User wants specific items (e.g., "find emails from john", "get the kiki document")
   - "create": User wants to create something (e.g., "create document", "send email")
   - "update": User wants to modify existing items
   - "delete": User wants to remove items
   - "action": User wants to perform an action (e.g., "archive", "share")

2. **Smart Parameter Inference**: For each tool parameter:
   - If user specifies explicit values, use EXACTLY those values
   - For "list_all" patterns, use appropriate defaults (empty strings, wildcards, etc.)
   - For missing parameters, infer from context or use smart defaults
   - Mark parameter sources as: "user_explicit", "inferred", or "default"

3. **List All Pattern Handling**: When user says "list all", "show all", "get all", etc.:
   - Use empty strings for search/query parameters
   - Use reasonable limits (10-50 items) unless user specifies
   - Don't ask for clarification - provide the full list

RESPONSE FORMAT (JSON only):
{
  "intent": "clear description of what user wants to accomplish",
  "intentCategory": "list_all|search_specific|create|update|delete|action",
  "confidence": 0.95,
  "tools": [
    {
      "name": "exact_tool_name_from_available_list",
      "confidence": 0.95,
      "parameters": {
        "param1": "value_from_user_or_smart_default",
        "param2": "inferred_or_default_value"
      },
      "reasoning": "why this tool and these parameters",
      "parameterSources": {
        "param1": "user_explicit|inferred|default",
        "param2": "user_explicit|inferred|default"
      }
    }
  ],
  "parameters": {
    "global_extracted_params": "any_global_context"
  },
  "reasoning": "comprehensive analysis of user intent and execution plan",
  "contextualDefaults": {
    "applied_defaults": "explanation_of_smart_defaults_used"
  }
}

CRITICAL EXAMPLES:
- "list all my notion pages" → notion_find_page_by_title with {"title": ""} (empty string to list all)
- "list all docs from google docs" → google_docs_find_a_document with {"query": ""} (empty to list all)
- "get 3 latest emails" → gmail_find_email with {"limit": 3} (exact user number)
- "find kiki document" → google_docs_find_a_document with {"query": "kiki"} (specific search)
- "create blank document titled environment" → google_docs_create_document_from_text with {"title": "environment", "content": ""} (blank content for blank doc)

IMPORTANT:
- Never ask for clarification on "list all" patterns - use appropriate defaults
- Extract exact numbers when user specifies them
- For "blank" or "empty" creation, use empty strings for content
- Use context from previous interactions when available

Respond with valid JSON only.`;
  }

  /**
   * Build clarification resolution prompt for MCP tool questions
   */
  private buildClarificationResolutionPrompt(
    userResponse: string,
    clarificationContext: {
      question: string;
      originalQuery: string;
      toolName: string;
      parameterName: string;
    },
    availableTools: any[],
    context: ConversationContext | null
  ): string {
    const contextStr = context ? this.formatContextForLLM(context) : '';

    return `You are resolving a clarification question from an MCP tool. The user's original intent was clear, but the tool asked for clarification. Your job is to auto-resolve this based on the user's original intent.

ORIGINAL USER QUERY: "${clarificationContext.originalQuery}"
MCP TOOL QUESTION: "${clarificationContext.question}"
USER RESPONSE: "${userResponse}"
TOOL NAME: ${clarificationContext.toolName}
PARAMETER NEEDED: ${clarificationContext.parameterName}

${contextStr}

CLARIFICATION RESOLUTION ANALYSIS:
1. **Original Intent Analysis**: What did the user originally want to do?
2. **Question Context**: Why is the tool asking this question?
3. **Auto-Resolution**: Can this be resolved automatically based on user intent?

For "list all" patterns:
- If tool asks "What title to search for?" and user wanted "list all" → auto-resolve with ""
- If tool asks "What query?" and user wanted "list all docs" → auto-resolve with ""
- If tool asks "Which document?" and user wanted "list all" → auto-resolve with appropriate list parameter

RESPONSE FORMAT (JSON only):
{
  "intent": "refined understanding of what user wants",
  "intentCategory": "list_all|search_specific|create|update|delete|action",
  "confidence": 0.95,
  "tools": [
    {
      "name": "${clarificationContext.toolName}",
      "confidence": 0.95,
      "parameters": {
        "${clarificationContext.parameterName}": "auto_resolved_value",
        "other_params": "if_needed"
      },
      "reasoning": "how this resolves the original user intent",
      "parameterSources": {
        "${clarificationContext.parameterName}": "inferred"
      }
    }
  ],
  "parameters": {},
  "reasoning": "why this auto-resolution fulfills the user's original intent",
  "contextualDefaults": {},
  "clarificationResolution": {
    "canAutoResolve": true,
    "autoResponse": "the_auto_resolved_value",
    "reasoning": "why this resolves the user's original intent without asking"
  }
}

CRITICAL: If user originally wanted "list all" but tool asks for specific search terms, auto-resolve with empty string or appropriate "list all" parameter.

Respond with valid JSON only.`;
  }

  /**
   * Format tools for LLM understanding
   */
  private formatToolsForLLM(tools: any[]): string {
    const categories = new Map<string, any[]>();

    // Group tools by category for better LLM understanding
    for (const tool of tools) {
      const category = tool.category || 'general';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(tool);
    }

    let formatted = '';
    for (const [category, categoryTools] of categories) {
      formatted += `\n${category.toUpperCase()} TOOLS:\n`;
      for (const tool of categoryTools) {
        formatted += `- ${tool.name}: ${tool.description || 'No description'}\n`;
        if (tool.inputSchema?.properties) {
          const params = Object.keys(tool.inputSchema.properties).join(', ');
          formatted += `  Parameters: ${params}\n`;
        }
      }
    }

    return formatted;
  }

  /**
   * Format conversation context for LLM
   */
  private formatContextForLLM(context: ConversationContext): string {
    let contextStr = 'CONVERSATION CONTEXT:\n';

    if (context.previousQueries.length > 0) {
      contextStr += `Previous queries: ${context.previousQueries.slice(-3).join(', ')}\n`;
    }

    if (context.clarificationHistory.length > 0) {
      contextStr += 'Recent clarifications:\n';
      for (const clarification of context.clarificationHistory.slice(-2)) {
        contextStr += `  Q: ${clarification.question}\n  A: ${clarification.answer}\n`;
      }
    }

    return contextStr + '\n';
  }

  /**
   * Parse LLM response into structured analysis
   */
  private parseIntentAnalysisResponse(response: string): LLMIntentAnalysis {
    try {
      // Clean up response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.intent || !parsed.intentCategory || !parsed.tools) {
        throw new Error('Missing required fields in LLM response');
      }

      return {
        intent: parsed.intent,
        intentCategory: parsed.intentCategory,
        confidence: parsed.confidence || 0.8,
        tools: parsed.tools || [],
        parameters: parsed.parameters || {},
        reasoning: parsed.reasoning || '',
        contextualDefaults: parsed.contextualDefaults || {},
        clarificationResolution: parsed.clarificationResolution
      };

    } catch (error) {
      console.error('[McpLLMIntentService] Failed to parse LLM response:', error);
      console.error('[McpLLMIntentService] Raw response:', response);
      throw new Error('Failed to parse LLM intent analysis response');
    }
  }

  /**
   * Call Claude API with prompt
   */
  private async callClaudeAPI(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Claude API key not available');
    }

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Get conversation context for a conversation ID
   */
  private getConversationContext(conversationId: string): ConversationContext | null {
    return this.conversationContexts.get(conversationId) || null;
  }

  /**
   * Update conversation context with new interaction
   */
  private updateConversationContext(
    conversationId: string,
    query: string,
    analysis: LLMIntentAnalysis
  ): void {
    let context = this.conversationContexts.get(conversationId);

    if (!context) {
      context = {
        previousQueries: [],
        previousIntents: [],
        userPreferences: {},
        clarificationHistory: [],
        toolExecutionHistory: []
      };
    }

    // Update with new interaction
    context.previousQueries.push(query);
    context.previousIntents.push(analysis.intent);

    // Keep only recent history (last 10 items)
    context.previousQueries = context.previousQueries.slice(-10);
    context.previousIntents = context.previousIntents.slice(-10);

    this.conversationContexts.set(conversationId, context);
  }

  /**
   * Add clarification to conversation context
   */
  public addClarificationToContext(
    conversationId: string,
    question: string,
    answer: string,
    context: string
  ): void {
    let convContext = this.conversationContexts.get(conversationId);

    if (!convContext) {
      convContext = {
        previousQueries: [],
        previousIntents: [],
        userPreferences: {},
        clarificationHistory: [],
        toolExecutionHistory: []
      };
    }

    convContext.clarificationHistory.push({ question, answer, context });
    convContext.clarificationHistory = convContext.clarificationHistory.slice(-5); // Keep last 5

    this.conversationContexts.set(conversationId, convContext);
  }

  /**
   * Add tool execution result to context
   */
  public addToolExecutionToContext(
    conversationId: string,
    tool: string,
    parameters: Record<string, any>,
    success: boolean,
    result: any
  ): void {
    let context = this.conversationContexts.get(conversationId);

    if (!context) {
      context = {
        previousQueries: [],
        previousIntents: [],
        userPreferences: {},
        clarificationHistory: [],
        toolExecutionHistory: []
      };
    }

    context.toolExecutionHistory.push({ tool, parameters, success, result });
    context.toolExecutionHistory = context.toolExecutionHistory.slice(-5); // Keep last 5

    this.conversationContexts.set(conversationId, context);
  }

  /**
   * ERROR-AWARE CONTEXT MERGING: Merge user clarification response with original intent
   */
  async mergeErrorResponseWithOriginalIntent(
    userClarification: string,
    originalIntent: string,
    errorContext: {
      errorMessage: string;
      toolName: string;
      clarificationQuestion: string;
      attemptedParameters: Record<string, any>;
      conversationalContext?: {
        taskDescription: string;
        expectedOutcome: string;
      };
    },
    availableTools: any[] = [],
    conversationId?: string
  ): Promise<LLMIntentAnalysis> {
    console.log('[McpLLMIntentService] Merging error response with original intent:', {
      userClarification,
      originalIntent,
      toolName: errorContext.toolName
    });

    if (!this.isAvailable()) {
      throw new Error('Claude API key not available for intent merging.');
    }

    const context = conversationId ? this.getConversationContext(conversationId) : null;
    const prompt = this.buildIntentMergingPrompt(userClarification, originalIntent, errorContext, availableTools, context);

    try {
      const response = await this.callClaudeAPI(prompt);
      const mergedAnalysis = this.parseIntentAnalysisResponse(response);

      console.log('[McpLLMIntentService] Intent merging completed:', {
        mergedIntent: mergedAnalysis.intent,
        category: mergedAnalysis.intentCategory,
        toolCount: mergedAnalysis.tools.length,
        confidence: mergedAnalysis.confidence
      });

      // Update conversation context with merged intent
      if (conversationId) {
        this.updateConversationContext(conversationId, mergedAnalysis.intent, mergedAnalysis);
      }

      return mergedAnalysis;

    } catch (error) {
      console.error('[McpLLMIntentService] Intent merging failed:', error);
      throw new Error(`LLM intent merging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build prompt for merging user clarification with original intent
   */
  private buildIntentMergingPrompt(
    userClarification: string,
    originalIntent: string,
    errorContext: {
      errorMessage: string;
      toolName: string;
      clarificationQuestion: string;
      attemptedParameters: Record<string, any>;
      conversationalContext?: {
        taskDescription: string;
        expectedOutcome: string;
      };
    },
    availableTools: any[],
    context: ConversationContext | null
  ): string {
    const toolDescriptions = this.formatToolsForLLM(availableTools);
    const contextStr = context ? this.formatContextForLLM(context) : '';

    return `You are an expert AI assistant specializing in merging user clarification responses with their original intent to create a complete, actionable request.

CONTEXT SITUATION:
- **Original User Intent:** "${originalIntent}"
- **Tool That Failed:** ${errorContext.toolName}
- **Error/Question:** "${errorContext.errorMessage}"
- **Clarification Question Shown:** "${errorContext.clarificationQuestion}"
- **User's Clarification Response:** "${userClarification}"
- **Task Description:** ${errorContext.conversationalContext?.taskDescription || 'Task execution'}
- **Expected Outcome:** ${errorContext.conversationalContext?.expectedOutcome || 'Successful completion'}

${contextStr}

AVAILABLE TOOLS:
${toolDescriptions}

YOUR TASK:
Merge the user's clarification response with their original intent to create a complete, actionable request that preserves the original goal while incorporating the user's clarification.

MERGING EXAMPLES:
1. Original: "Create document named Harsh with description about Harsh's journey"
   Clarification: "generic description"
   Merged: "Create document named Harsh with a generic description about Harsh's journey"

2. Original: "Send email to john about meeting tomorrow"
   Clarification: "informal tone"
   Merged: "Send informal email to john about meeting tomorrow"

3. Original: "Create private channel for team updates"
   Clarification: "team-updates-2024"
   Merged: "Create private channel named 'team-updates-2024' for team updates"

RESPONSE FORMAT (JSON only):
{
  "intent": "merged intent combining original request with user clarification",
  "intentCategory": "list_all|search_specific|create|update|delete|action",
  "confidence": 0.95,
  "tools": [
    {
      "name": "${errorContext.toolName}",
      "confidence": 0.95,
      "parameters": {
        "param1": "value_incorporating_clarification",
        "param2": "value_from_original_or_inferred"
      },
      "reasoning": "how the clarification enhances the original request",
      "parameterSources": {
        "param1": "user_explicit|inferred|merged",
        "param2": "user_explicit|inferred|merged"
      }
    }
  ],
  "parameters": {
    "merged_context": "explanation_of_how_clarification_was_integrated"
  },
  "reasoning": "detailed explanation of how the clarification was merged with the original intent to create the complete request",
  "contextualDefaults": {
    "applied_merging": "explanation_of_merging_strategy_used"
  },
  "mergingMetadata": {
    "originalPreserved": true,
    "clarificationIntegrated": true,
    "conflictResolution": "how_any_conflicts_between_original_and_clarification_were_resolved"
  }
}

CRITICAL MERGING PRINCIPLES:
1. **Preserve Original Intent**: Never lose the core goal from the original request
2. **Integrate Clarification**: Seamlessly incorporate user's clarification response
3. **Resolve Conflicts**: If clarification conflicts with original, prioritize user's clarification but explain the resolution
4. **Complete Parameters**: Fill all necessary parameters using both original intent and clarification
5. **Maintain Context**: Keep the conversational flow natural and coherent

The merged intent should feel like a single, coherent request that the user could have made initially.

Respond with valid JSON only.`;
  }
}