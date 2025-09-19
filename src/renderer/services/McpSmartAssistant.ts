/**
 * MCP Smart Assistant
 *
 * Main orchestrator that coordinates all modular services to provide
 * intelligent, context-aware, and conversational MCP assistance.
 */

import { McpQueryAnalyzer, QueryAnalysis } from './McpQueryAnalyzer';
import { McpIntentClassifier, IntentClassification } from './McpIntentClassifier';
import { McpParameterExtractor, ParameterExtraction } from './McpParameterExtractor';
import { McpConversationManager, ConversationState, ClarificationResponse } from './McpConversationManager';
import { McpContextManager, ContextualSuggestion } from './McpContextManager';
import { McpToolDiscoveryService, ToolRegistry } from './McpToolDiscoveryService';
import { McpClaudeService, McpMessageAnalysis } from './McpClaudeService';
import { McpResultFormatter, FormattedResult } from './McpResultFormatter';

export interface SmartAssistantResponse {
  success: boolean;
  conversationId: string;
  responseType: 'execute' | 'clarify' | 'suggest' | 'error';

  // For execution responses
  mcpResults?: any[];
  formattedResponse?: string;

  // For clarification responses
  clarificationQuestion?: string;
  clarificationOptions?: string[];
  suggestedValues?: Record<string, any>;

  // For suggestion responses
  suggestions?: ContextualSuggestion[];

  // For error responses
  error?: string;

  // Metadata
  confidence: number;
  intent?: string;
  parameters?: Record<string, any>;
  conversationState?: ConversationState;
}

export class McpSmartAssistant {
  private queryAnalyzer: McpQueryAnalyzer;
  private intentClassifier: McpIntentClassifier;
  private parameterExtractor: McpParameterExtractor;
  private conversationManager: McpConversationManager;
  private contextManager: McpContextManager;
  private toolDiscoveryService: McpToolDiscoveryService;
  private claudeService: McpClaudeService;
  private resultFormatter: McpResultFormatter;
  private mcpExecutor: any; // Will be injected
  private mcpManager: any;

  constructor(mcpExecutor: any, mcpManager?: any) {
    this.queryAnalyzer = new McpQueryAnalyzer();
    this.intentClassifier = new McpIntentClassifier();
    this.parameterExtractor = new McpParameterExtractor();
    this.conversationManager = new McpConversationManager();
    this.contextManager = new McpContextManager();
    this.mcpExecutor = mcpExecutor;
    this.mcpManager = mcpManager || mcpExecutor.mcpManager;

    // Initialize dynamic tool discovery services
    this.toolDiscoveryService = new McpToolDiscoveryService(this.mcpManager);
    this.claudeService = new McpClaudeService();
    this.resultFormatter = new McpResultFormatter();
  }

  /**
   * Process user query with full intelligence pipeline
   */
  async processQuery(query: string, conversationId?: string): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Processing query:', query);

    try {
      // Check if this is a continuation of existing conversation
      let conversation: ConversationState | null = null;
      if (conversationId) {
        conversation = this.conversationManager.getConversation(conversationId);
        if (conversation) {
          return await this.handleConversationContinuation(conversation, query);
        }
      }

      // New conversation - start intelligence pipeline
      const newConversationId = this.conversationManager.startConversation(query);
      conversation = this.conversationManager.getConversation(newConversationId)!;

      // Step 1: DYNAMIC TOOL DISCOVERY - Get all available tools from all MCP servers
      console.log('[McpSmartAssistant] Starting dynamic tool discovery...');
      const toolRegistry: ToolRegistry = await this.toolDiscoveryService.discoverAllTools();
      const availableTools = this.toolDiscoveryService.getAllToolsForClaudeAPI();
      console.log('[McpSmartAssistant] Dynamic tool discovery complete:', {
        totalTools: toolRegistry.totalTools,
        categories: Array.from(toolRegistry.categories.keys()),
        servers: availableTools.map(t => t.serverName).filter((v, i, a) => a.indexOf(v) === i)
      });

      // Step 2: Use Claude API to analyze user message with ALL discovered tools
      console.log('[McpSmartAssistant] Using Claude API for intelligent tool selection...');
      this.claudeService.refreshApiKey(); // Refresh API key from localStorage

      if (!this.claudeService.isAvailable()) {
        console.log('[McpSmartAssistant] Claude API not available, falling back to traditional analysis');
        return await this.fallbackToTraditionalAnalysis(newConversationId, query, conversation);
      }

      const claudeAnalysis: McpMessageAnalysis = await this.claudeService.analyzeUserMessageWithDynamicTools(query, availableTools);
      console.log('[McpSmartAssistant] Claude analysis completed:', claudeAnalysis);

      this.conversationManager.updateConversation(newConversationId, {
        currentStep: 'analyzing',
        context: { claudeAnalysis, availableTools: availableTools.length }
      });

      // Step 3: Check if Claude found suitable tools
      if (claudeAnalysis.tools.length === 0) {
        console.log('[McpSmartAssistant] Claude found no suitable tools, falling back to traditional analysis');
        return await this.fallbackToTraditionalAnalysis(newConversationId, query, conversation);
      }

      // Step 4: Execute using Claude's recommendations
      return await this.executeWithClaudeRecommendations(newConversationId, claudeAnalysis, query);

    } catch (error) {
      console.error('[McpSmartAssistant] Error processing query:', error);

      return {
        success: false,
        conversationId: conversationId || 'error',
        responseType: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        confidence: 0.1
      };
    }
  }

  /**
   * Handle continuation of existing conversation
   */
  private async handleConversationContinuation(
    conversation: ConversationState,
    userResponse: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Handling conversation continuation:', conversation.id);

    // Process the user's response to clarification
    const questionContext = {
      parameterName: conversation.pendingParameters[0],
      parameterType: 'string' // TODO: Get from parameter rules
    };

    const updatedConversation = this.conversationManager.handleClarificationResponse(
      conversation.id,
      userResponse,
      questionContext
    );

    if (!updatedConversation) {
      return {
        success: false,
        conversationId: conversation.id,
        responseType: 'error',
        error: 'Failed to process your response',
        confidence: 0.1
      };
    }

    // Check if we still need more clarification
    const clarification = this.conversationManager.needsClarification(updatedConversation);
    if (clarification) {
      this.conversationManager.addClarificationToHistory(conversation.id, clarification.question);

      return {
        success: true,
        conversationId: conversation.id,
        responseType: 'clarify',
        clarificationQuestion: clarification.question,
        clarificationOptions: clarification.options,
        suggestedValues: clarification.suggestions ? this.formatSuggestions(clarification.suggestions) : undefined,
        confidence: updatedConversation.classification?.confidence || 0.5,
        intent: updatedConversation.intent,
        conversationState: updatedConversation
      };
    }

    // All parameters gathered - execute with MCP
    if (updatedConversation.classification && updatedConversation.parameterExtraction) {
      // Update parameter extraction with gathered parameters
      updatedConversation.parameterExtraction.validatedParameters = {
        ...updatedConversation.parameterExtraction.validatedParameters,
        ...updatedConversation.gatheredParameters
      };

      return await this.executeWithMcp(
        conversation.id,
        updatedConversation.classification,
        updatedConversation.parameterExtraction
      );
    }

    return {
      success: false,
      conversationId: conversation.id,
      responseType: 'error',
      error: 'Invalid conversation state',
      confidence: 0.1
    };
  }

  /**
   * Execute task using MCP with intelligent parameter handling
   */
  private async executeWithMcp(
    conversationId: string,
    classification: IntentClassification,
    parameterExtraction: ParameterExtraction
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Executing with MCP:', {
      intent: classification.primaryIntent,
      parameters: parameterExtraction.validatedParameters
    });

    const conversation = this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: 'Conversation not found',
        confidence: 0.1
      };
    }

    try {
      this.conversationManager.updateConversation(conversationId, {
        currentStep: 'executing'
      });

      // Use hardcoded mapping for traditional approach
      const intentToTool: Record<string, string> = {
        'email_send': 'gmail_send_email',
        'email_read': 'gmail_find_email',
        'email_reply': 'gmail_reply_email',
        'calendar_create': 'gcal_create_event',
        'calendar_delete': 'gcal_delete_event',
        'calendar_read': 'gcal_list_events',
        'calendar_update': 'gcal_update_event'
      };
      const toolName = intentToTool[classification.primaryIntent] || 'ConditionalWorkflow';

      // Execute MCP tool
      const mcpResults = await this.executeMcpTool(
        toolName,
        parameterExtraction.validatedParameters,
        conversation.originalQuery
      );

      // Check if MCP returned a clarification question
      const mcpClarification = this.conversationManager.detectMcpClarification(mcpResults[0]?.data);
      if (mcpClarification) {
        this.conversationManager.updateConversation(conversationId, {
          currentStep: 'clarifying'
        });
        this.conversationManager.addClarificationToHistory(conversationId, mcpClarification.question);

        return {
          success: true,
          conversationId,
          responseType: 'clarify',
          clarificationQuestion: mcpClarification.question,
          clarificationOptions: mcpClarification.options,
          confidence: classification.confidence,
          intent: classification.primaryIntent,
          conversationState: conversation
        };
      }

      // Success - learn from the action and complete conversation
      const success = mcpResults.length > 0 && mcpResults[0].success;
      this.contextManager.learnFromAction(
        classification.primaryIntent,
        parameterExtraction.validatedParameters,
        success
      );

      this.conversationManager.updateConversation(conversationId, {
        currentStep: 'completed'
      });
      this.conversationManager.completeConversation(conversationId, mcpResults);

      return {
        success,
        conversationId,
        responseType: 'execute',
        mcpResults,
        formattedResponse: this.formatMcpResults(mcpResults, toolName, conversation.originalQuery),
        confidence: classification.confidence,
        intent: classification.primaryIntent,
        parameters: parameterExtraction.validatedParameters,
        conversationState: conversation
      };

    } catch (error) {
      console.error('[McpSmartAssistant] MCP execution failed:', error);

      this.conversationManager.recordMcpError(
        conversationId,
        error instanceof Error ? error.message : 'Unknown error',
        classification.toolSuggestions[0] || 'unknown'
      );

      // Learn from the failure
      this.contextManager.learnFromAction(
        classification.primaryIntent,
        parameterExtraction.validatedParameters,
        false
      );

      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: error instanceof Error ? error.message : 'MCP execution failed',
        confidence: classification.confidence,
        intent: classification.primaryIntent,
        conversationState: conversation
      };
    }
  }

  /**
   * Fallback to traditional analysis when Claude API is not available
   */
  private async fallbackToTraditionalAnalysis(
    conversationId: string,
    query: string,
    conversation: ConversationState
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Using traditional analysis pipeline...');

    // Step 1: Analyze query
    const analysis = await this.queryAnalyzer.analyzeQuery(query);
    this.conversationManager.updateConversation(conversationId, {
      analysis,
      currentStep: 'analyzing'
    });

    // Step 2: Classify intent
    const classification = this.intentClassifier.classifyIntent(analysis);
    this.conversationManager.updateConversation(conversationId, {
      classification,
      intent: classification.primaryIntent
    });

    // Step 3: Extract parameters
    const parameterExtraction = this.parameterExtractor.extractParameters(
      classification.primaryIntent,
      analysis,
      classification
    );
    this.conversationManager.updateConversation(conversationId, {
      parameterExtraction,
      gatheredParameters: parameterExtraction.validatedParameters,
      pendingParameters: parameterExtraction.missingRequired
    });

    // Step 4: Check if we need clarification
    const clarification = this.conversationManager.needsClarification(conversation);
    if (clarification) {
      this.conversationManager.updateConversation(conversationId, {
        currentStep: 'gathering_params'
      });
      this.conversationManager.addClarificationToHistory(conversationId, clarification.question);

      return {
        success: true,
        conversationId: conversationId,
        responseType: 'clarify',
        clarificationQuestion: clarification.question,
        clarificationOptions: clarification.options,
        suggestedValues: clarification.suggestions ? this.formatSuggestions(clarification.suggestions) : undefined,
        confidence: classification.confidence,
        intent: classification.primaryIntent,
        conversationState: conversation
      };
    }

    // Step 5: Execute with traditional tool mapping
    return await this.executeWithTraditionalMapping(conversationId, classification, parameterExtraction);
  }

  /**
   * Execute using Claude's tool recommendations
   */
  private async executeWithClaudeRecommendations(
    conversationId: string,
    claudeAnalysis: McpMessageAnalysis,
    originalQuery: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Executing with Claude recommendations:', claudeAnalysis.tools.length, 'tools');

    try {
      this.conversationManager.updateConversation(conversationId, {
        currentStep: 'executing'
      });

      if (claudeAnalysis.tools.length === 1) {
        // Single tool execution
        const tool = claudeAnalysis.tools[0];
        const mcpResults = await this.executeMcpTool(tool.name, tool.parameters, originalQuery);

        // Check if MCP returned a clarification question
        const mcpClarification = this.conversationManager.detectMcpClarification(mcpResults[0]?.data);
        if (mcpClarification) {
          this.conversationManager.updateConversation(conversationId, {
            currentStep: 'clarifying'
          });
          this.conversationManager.addClarificationToHistory(conversationId, mcpClarification.question);

          return {
            success: true,
            conversationId,
            responseType: 'clarify',
            clarificationQuestion: mcpClarification.question,
            clarificationOptions: mcpClarification.options,
            confidence: claudeAnalysis.confidence,
            conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined
          };
        }

        // Success - learn from the action and complete conversation
        const success = mcpResults.length > 0 && mcpResults[0].success;
        this.contextManager.learnFromAction(
          claudeAnalysis.intent,
          tool.parameters,
          success
        );

        this.conversationManager.completeConversation(conversationId, mcpResults);

        return {
          success,
          conversationId,
          responseType: 'execute',
          mcpResults,
          formattedResponse: this.formatMcpResults(mcpResults, tool.name, originalQuery),
          confidence: claudeAnalysis.confidence,
          intent: claudeAnalysis.intent,
          parameters: tool.parameters,
          conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined
        };

      } else {
        // Multi-step execution
        console.log('[McpSmartAssistant] Multi-step execution required for', claudeAnalysis.tools.length, 'tools');
        const allResults: any[] = [];

        for (const tool of claudeAnalysis.tools) {
          const mcpResults = await this.executeMcpTool(tool.name, tool.parameters, originalQuery);
          allResults.push(...mcpResults);

          // Check for clarifications in multi-step
          const mcpClarification = this.conversationManager.detectMcpClarification(mcpResults[0]?.data);
          if (mcpClarification) {
            // Return clarification for the current step
            return {
              success: true,
              conversationId,
              responseType: 'clarify',
              clarificationQuestion: mcpClarification.question,
              clarificationOptions: mcpClarification.options,
              confidence: claudeAnalysis.confidence,
              conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined
            };
          }
        }

        const success = allResults.some(r => r.success);
        this.contextManager.learnFromAction(claudeAnalysis.intent, {}, success);
        this.conversationManager.completeConversation(conversationId, allResults);

        return {
          success,
          conversationId,
          responseType: 'execute',
          mcpResults: allResults,
          formattedResponse: this.formatMultiStepResults(allResults, claudeAnalysis.tools, originalQuery),
          confidence: claudeAnalysis.confidence,
          intent: claudeAnalysis.intent,
          conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined
        };
      }

    } catch (error) {
      console.error('[McpSmartAssistant] Claude-based execution failed:', error);

      this.conversationManager.recordMcpError(
        conversationId,
        error instanceof Error ? error.message : 'Unknown error',
        claudeAnalysis.tools[0]?.name || 'unknown'
      );

      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: error instanceof Error ? error.message : 'Execution failed',
        confidence: claudeAnalysis.confidence,
        conversationState: this.conversationManager.getConversation(conversationId) || undefined
      };
    }
  }

  /**
   * Execute with traditional tool mapping (fallback)
   */
  private async executeWithTraditionalMapping(
    conversationId: string,
    classification: IntentClassification,
    parameterExtraction: ParameterExtraction
  ): Promise<SmartAssistantResponse> {
    // Use the hardcoded fallback mapping
    const intentToTool: Record<string, string> = {
      'email_send': 'gmail_send_email',
      'email_read': 'gmail_find_email',
      'email_reply': 'gmail_reply_email',
      'calendar_create': 'gcal_create_event',
      'calendar_delete': 'gcal_delete_event',
      'calendar_read': 'gcal_list_events',
      'calendar_update': 'gcal_update_event'
    };

    const toolName = intentToTool[classification.primaryIntent] || 'ConditionalWorkflow';
    return await this.executeWithMcp(conversationId, classification, parameterExtraction);
  }

  /**
   * Format multi-step results
   */
  private formatMultiStepResults(results: any[], tools: any[], originalQuery: string): string {
    let formatted = '**Multi-step execution completed:**\n\n';

    for (let i = 0; i < tools.length && i < results.length; i++) {
      const tool = tools[i];
      const result = results[i];
      formatted += `**Step ${i + 1}: ${tool.name}**\n`;
      formatted += this.formatMcpResults([result], tool.name, originalQuery);
      formatted += '\n---\n\n';
    }

    return formatted;
  }

  /**
   * Execute MCP tool (delegates to existing MCP executor)
   */
  private async executeMcpTool(
    toolName: string,
    parameters: Record<string, any>,
    originalQuery: string
  ): Promise<any[]> {
    console.log('[McpSmartAssistant] Executing MCP tool:', toolName, 'with parameters:', parameters);

    try {
      // Create tool match from Claude recommendation
      const toolMatch = {
        toolName: toolName,
        score: 1.0,
        description: 'Claude AI recommended tool'
      };

      // Use the existing McpExecutor's method for Claude parameter execution
      if (this.mcpExecutor && typeof this.mcpExecutor.executeSingleToolWithClaudeParams === 'function') {
        const queryType = this.mcpExecutor.analyzeQueryType ? this.mcpExecutor.analyzeQueryType(originalQuery) : 'general';

        // Ensure Claude's parameters include any limits from the original query
        const enhancedParameters = this.enhanceParametersWithLimits(parameters, originalQuery);

        const result = await this.mcpExecutor.executeSingleToolWithClaudeParams(
          toolMatch,
          originalQuery,
          enhancedParameters,
          queryType
        );

        // Apply result limiting if needed (post-processing approach)
        const limitedResult = this.applyResultLimiting(result, enhancedParameters, originalQuery);
        return [limitedResult];
      }

      // Fallback to existing generic execution if available
      if (this.mcpExecutor && typeof this.mcpExecutor.executeSingleTool === 'function') {
        const result = await this.mcpExecutor.executeSingleTool(toolMatch, originalQuery);
        return [result];
      }

      // Final fallback - use the executeQuery method
      if (this.mcpExecutor && typeof this.mcpExecutor.executeQuery === 'function') {
        return await this.mcpExecutor.executeQuery(originalQuery);
      }

      throw new Error('No suitable MCP execution method found');

    } catch (error) {
      console.error('[McpSmartAssistant] MCP tool execution failed:', error);
      throw error;
    }
  }

  /**
   * Format MCP results (delegates to existing formatters)
   */
  private formatMcpResults(results: any[], toolName: string, originalQuery: string): string {
    console.log('[McpSmartAssistant] Formatting results for tool:', toolName);

    if (results.length === 0) return 'No results found.';
    if (results[0].success === false) return `Error: ${results[0].error || 'Unknown error'}`;

    // Get the result data
    const resultData = results[0].data;

    // Use the global formatMcpResults function from index.ts
    // We need to call this through a different approach since we're in a module
    return this.formatResultData(resultData, toolName, originalQuery);
  }

  /**
   * Format result data for display using comprehensive templates
   */
  private formatResultData(data: any, toolName: string, originalQuery?: string): string {
    const formattedResult: FormattedResult = this.resultFormatter.formatMcpResult(data, toolName, originalQuery);
    return formattedResult.content;
  }


  /**
   * Enhance parameters with limits from original query
   */
  private enhanceParametersWithLimits(parameters: Record<string, any>, originalQuery: string): Record<string, any> {
    const enhanced = { ...parameters };

    // Extract limit from query
    const numberMatch = originalQuery.match(/\b(\d+)\b/);
    if (numberMatch) {
      const limit = parseInt(numberMatch[1]);
      enhanced.limit = limit;
      enhanced.max_results = limit;
      enhanced.count = limit;
      console.log('[McpSmartAssistant] Added limit parameters:', { limit, max_results: limit, count: limit });
    } else if (originalQuery.toLowerCase().includes('latest') ||
               originalQuery.toLowerCase().includes('recent') ||
               /\b(an?\s+)?email\b/.test(originalQuery.toLowerCase())) {
      enhanced.limit = 1;
      enhanced.max_results = 1;
      enhanced.count = 1;
      console.log('[McpSmartAssistant] Added limit for latest/single email:', { limit: 1 });
    }

    return enhanced;
  }

  /**
   * Apply result limiting (post-processing approach)
   */
  private applyResultLimiting(result: any, parameters: Record<string, any>, originalQuery: string): any {
    if (!result || !result.data) return result;

    const requestedLimit = parameters.limit || parameters.max_results || parameters.count;
    if (!requestedLimit) return result;

    console.log('[McpSmartAssistant] Applying result limiting:', requestedLimit);

    try {
      // Handle the MCP response structure: {data: {content: [{type: 'text', text: JSON}]}}
      if (result.data.content && Array.isArray(result.data.content)) {
        const textContent = result.data.content[0]?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (parsed.results && Array.isArray(parsed.results)) {
            const originalCount = parsed.results.length;
            parsed.results = parsed.results.slice(0, requestedLimit);
            console.log('[McpSmartAssistant] Limited results from', originalCount, 'to', parsed.results.length);
            result.data.content[0].text = JSON.stringify(parsed);
          }
        }
      }
    } catch (error) {
      console.warn('[McpSmartAssistant] Result limiting failed:', error);
      // Return original result if limiting fails
    }

    return result;
  }

  /**
   * Format suggestions for user display
   */
  private formatSuggestions(suggestions: any[]): Record<string, any> {
    const formatted: Record<string, any> = {};
    for (const suggestion of suggestions) {
      formatted[suggestion.type || 'suggestion'] = suggestion.value || suggestion;
    }
    return formatted;
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(conversationId: string): string {
    return this.conversationManager.getConversationSummary(conversationId);
  }

  /**
   * Get user context and statistics
   */
  getUserStats(): any {
    return this.contextManager.getSessionStats();
  }

  /**
   * Get contextual suggestions for a parameter
   */
  getContextualSuggestions(
    parameterName: string,
    intent: string,
    query: string,
    entities?: any
  ): ContextualSuggestion[] {
    return this.contextManager.getContextualSuggestions(parameterName, intent, query, entities);
  }

  /**
   * Cleanup old conversations
   */
  cleanup(): void {
    this.conversationManager.cleanupOldConversations();
  }
}