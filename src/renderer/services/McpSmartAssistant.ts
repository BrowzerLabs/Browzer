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
      // CRITICAL FIX: For multi-step workflows, extract context from original query
      const enhancedParameters = await this.enhanceParametersWithConversationContext(
        updatedConversation,
        updatedConversation.parameterExtraction.validatedParameters,
        updatedConversation.gatheredParameters
      );

      // Update parameter extraction with enhanced context-aware parameters
      updatedConversation.parameterExtraction.validatedParameters = enhancedParameters;

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
        // Handle auto-resolved clarifications
        if (mcpClarification.type === 'auto_resolved' && mcpClarification.autoResponse !== undefined) {
          console.log('[McpSmartAssistant] Auto-resolved MCP clarification, retrying with:', mcpClarification.autoResponse);

          // Retry the tool with the auto-resolved parameter
          const retryParameters = { ...parameterExtraction.validatedParameters };
          if (mcpClarification.parameterName) {
            retryParameters[mcpClarification.parameterName] = mcpClarification.autoResponse;
          }

          // Retry the tool call with the resolved parameter
          const retryResults = await this.executeMcpTool(toolName, retryParameters, conversation.originalQuery);

          return {
            success: retryResults.length > 0 && retryResults[0].success,
            conversationId,
            responseType: 'execute',
            mcpResults: retryResults,
            formattedResponse: this.formatMcpResults(retryResults, toolName, conversation.originalQuery),
            confidence: classification.confidence,
            intent: classification.primaryIntent,
            conversationState: conversation || undefined
          };
        }

        // Regular clarification flow
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
          conversationState: conversation || undefined
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
   * Execute using Claude's tool recommendations with full dynamic multi-step workflow support
   */
  private async executeWithClaudeRecommendations(
    conversationId: string,
    claudeAnalysis: McpMessageAnalysis,
    originalQuery: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Executing with Claude recommendations:', claudeAnalysis.tools.length, 'tools');
    console.log('[McpSmartAssistant] Query complexity:', claudeAnalysis.complexity);

    try {
      this.conversationManager.updateConversation(conversationId, {
        currentStep: 'executing',
        context: {
          originalQuery,
          claudeAnalysis,
          workflowType: this.isMultiStepWorkflow(originalQuery, claudeAnalysis) ? 'multi-step' : 'single',
          pendingSteps: claudeAnalysis.tools.length > 1 ? claudeAnalysis.tools.slice(1) : []
        }
      });

      if (claudeAnalysis.tools.length === 1) {
        // Single tool execution
        const tool = claudeAnalysis.tools[0];
        const mcpResults = await this.executeMcpTool(tool.name, tool.parameters, originalQuery);

        // Check if MCP returned a clarification question
        const mcpClarification = this.conversationManager.detectMcpClarification(mcpResults[0]?.data);
        if (mcpClarification) {
          // Handle auto-resolved clarifications
          if (mcpClarification.type === 'auto_resolved' && mcpClarification.autoResponse !== undefined) {
            console.log('[McpSmartAssistant] Auto-resolved MCP clarification, retrying with:', mcpClarification.autoResponse);

            // Retry the tool with the auto-resolved parameter
            const retryParameters = { ...tool.parameters };
            if (mcpClarification.parameterName) {
              retryParameters[mcpClarification.parameterName] = mcpClarification.autoResponse;
            }

            // Retry the tool call with the resolved parameter
            const retryResults = await this.executeMcpTool(tool.name, retryParameters, originalQuery);

            return {
              success: retryResults.length > 0 && retryResults[0].success,
              conversationId,
              responseType: 'execute',
              mcpResults: retryResults,
              formattedResponse: this.formatMcpResults(retryResults, tool.name, originalQuery),
              confidence: claudeAnalysis.confidence,
              intent: claudeAnalysis.intent,
              conversationState: this.conversationManager.getConversation(conversationId) || undefined
            };
          }

          // Regular clarification flow
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
            conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined || undefined
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
          conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined || undefined
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
            // Handle auto-resolved clarifications
            if (mcpClarification.type === 'auto_resolved' && mcpClarification.autoResponse !== undefined) {
              console.log('[McpSmartAssistant] Auto-resolved MCP clarification in multi-step, retrying with:', mcpClarification.autoResponse);

              // Retry the tool with the auto-resolved parameter
              const retryParameters = { ...tool.parameters };
              if (mcpClarification.parameterName) {
                retryParameters[mcpClarification.parameterName] = mcpClarification.autoResponse;
              }

              // Retry the tool call with the resolved parameter
              const retryResults = await this.executeMcpTool(tool.name, retryParameters, originalQuery);

              // Replace the failed result with the retry result
              allResults[allResults.length - mcpResults.length] = retryResults[0];

              // Continue with the workflow instead of returning clarification
              continue;
            }

            // Return clarification for the current step
            return {
              success: true,
              conversationId,
              responseType: 'clarify',
              clarificationQuestion: mcpClarification.question,
              clarificationOptions: mcpClarification.options,
              confidence: claudeAnalysis.confidence,
              conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined || undefined
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
          formattedResponse: this.formatMultiStepResults(allResults, {
            stepResults: allResults.map((result, index) => ({
              step: index + 1,
              toolName: claudeAnalysis.tools[index]?.name || 'unknown',
              results: Array.isArray(result) ? result : [result],
              success: Array.isArray(result) ? (result.length === 0 || result[0].success !== false) : (result && result.success !== false),
              originalQuery: originalQuery
            })),
            originalQuery,
            tools: claudeAnalysis.tools
          }),
          confidence: claudeAnalysis.confidence,
          intent: claudeAnalysis.intent,
          conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined || undefined
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
        conversationState: this.conversationManager.getConversation(conversationId) || undefined || undefined
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
   * Determine if a query requires multi-step workflow orchestration using natural language analysis
   */
  private isMultiStepWorkflow(originalQuery: string, claudeAnalysis: McpMessageAnalysis): boolean {
    console.log('[McpSmartAssistant] Analyzing workflow complexity for:', originalQuery);

    // Dynamic indicators that suggest multi-step workflows (no hardcoded tool names)
    const multiStepIndicators = [
      // Sequential indicators
      'and then', 'then', 'after that', 'followed by', 'next',
      // Conditional indicators
      'if', 'when', 'unless', 'provided that', 'in case',
      // Action combinations (find + create, get + send, etc.)
      'find.*and.*create', 'get.*and.*schedule', 'read.*and.*send', 'check.*and.*create',
      'search.*and.*add', 'list.*and.*update', 'show.*and.*reply',
      // Multi-action verbs
      'schedule.*meeting', 'create.*from', 'send.*about', 'reply.*with'
    ];

    // Check for multi-step language patterns
    const hasMultiStepLanguage = multiStepIndicators.some(pattern =>
      new RegExp(pattern, 'i').test(originalQuery)
    );

    // Check Claude's analysis for complexity indicators
    const claudeIndicatesMultiStep =
      claudeAnalysis.complexity === 'complex' ||
      claudeAnalysis.tools.length > 1 ||
      (claudeAnalysis as any).executionOrder === 'sequential' ||
      claudeAnalysis.reasoning?.includes('multiple steps') ||
      claudeAnalysis.reasoning?.includes('workflow');

    // Check for common multi-step query patterns
    const hasActionChaining = /\b(and|then|after)\b.*\b(create|send|schedule|add|update|reply)\b/i.test(originalQuery);
    const hasConditionalLogic = /\b(if|when|unless)\b.*\b(then|else|otherwise)\b/i.test(originalQuery);

    const isMultiStep = hasMultiStepLanguage || claudeIndicatesMultiStep || hasActionChaining || hasConditionalLogic;

    console.log('[McpSmartAssistant] Multi-step analysis:', {
      hasMultiStepLanguage,
      claudeIndicatesMultiStep,
      hasActionChaining,
      hasConditionalLogic,
      finalDecision: isMultiStep
    });

    return isMultiStep;
  }

  /**
   * Execute dynamic multi-step workflow with full context preservation
   * This is the core fix for Test 4 and other multi-step scenarios
   */
  private async executeDynamicMultiStepWorkflow(
    conversationId: string,
    claudeAnalysis: McpMessageAnalysis,
    originalQuery: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Starting dynamic multi-step workflow execution');

    // Store workflow context for conversation continuation
    this.conversationManager.updateConversation(conversationId, {
      currentStep: 'executing',
      context: {
        originalQuery,
        claudeAnalysis,
        workflowType: 'multi-step',
        currentStepIndex: 0,
        totalSteps: claudeAnalysis.tools.length,
        stepResults: []
      }
    });

    // Execute first step
    const firstTool = claudeAnalysis.tools[0];
    console.log('[McpSmartAssistant] Executing Step 1 of', claudeAnalysis.tools.length, '- Tool:', firstTool.name);

    try {
      const stepResults = await this.executeMcpTool(firstTool.name, firstTool.parameters, originalQuery);

      // Store step results in conversation context
      const conversation = this.conversationManager.getConversation(conversationId);
      if (conversation) {
        if (!conversation.context.stepResults) {
          conversation.context.stepResults = [];
        }
        conversation.context.stepResults.push({
          stepIndex: 0,
          toolName: firstTool.name,
          parameters: firstTool.parameters,
          results: stepResults,
          success: Array.isArray(stepResults) && (stepResults.length === 0 || stepResults[0].success !== false)
        });
      }

      // Determine next action based on remaining steps
      if (claudeAnalysis.tools.length > 1) {
        // More steps remaining - check if we need clarification for next step
        const nextTool = claudeAnalysis.tools[1];
        console.log('[McpSmartAssistant] Checking Step 2 parameters for tool:', nextTool.name);

        // Check if next step needs clarification
        const missingParameters = this.identifyMissingParameters(nextTool, originalQuery, conversation?.context);

        if (missingParameters.length > 0) {
          // Need clarification before proceeding to next step
          return await this.handleMultiStepClarification(conversationId, missingParameters, conversation?.context || {});
        } else {
          // Can proceed directly to next step
          return await this.continueMultiStepWorkflow(conversationId);
        }
      } else {
        // Single step completed - format and return results
        return {
          success: stepResults.length > 0 && stepResults[0].success,
          conversationId,
          responseType: 'execute',
          mcpResults: stepResults,
          formattedResponse: this.formatMcpResults(stepResults, firstTool.name, originalQuery),
          confidence: claudeAnalysis.confidence,
          intent: claudeAnalysis.intent,
          conversationState: conversation || undefined
        };
      }

    } catch (error) {
      console.error('[McpSmartAssistant] Error in multi-step workflow execution:', error);
      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: error instanceof Error ? error.message : 'Multi-step workflow failed',
        confidence: 0.1
      };
    }
  }

  /**
   * Continue multi-step workflow execution after clarification
   */
  private async continueMultiStepWorkflow(conversationId: string): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Continuing multi-step workflow');

    const conversation = this.conversationManager.getConversation(conversationId);
    if (!conversation || !conversation.context.claudeAnalysis) {
      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: 'Workflow context lost',
        confidence: 0.1
      };
    }

    const { claudeAnalysis, currentStepIndex = 0, originalQuery } = conversation.context;
    const nextStepIndex = currentStepIndex + 1;

    if (nextStepIndex >= claudeAnalysis.tools.length) {
      // All steps completed - return final results
      const allResults = conversation.context.stepResults?.map((step: any) => step.results).flat() || [];
      return {
        success: allResults.some((r: any) => r.success),
        conversationId,
        responseType: 'execute',
        mcpResults: allResults,
        formattedResponse: this.formatMultiStepResults(allResults, conversation.context),
        confidence: claudeAnalysis.confidence,
        intent: claudeAnalysis.intent,
        conversationState: conversation
      };
    }

    // Execute next step
    const nextTool = claudeAnalysis.tools[nextStepIndex];
    console.log('[McpSmartAssistant] Executing Step', nextStepIndex + 1, 'of', claudeAnalysis.tools.length);

    try {
      // Enhance parameters with context from previous steps
      const enhancedParameters = await this.enhanceParametersWithWorkflowContext(
        nextTool.parameters,
        conversation.context,
        originalQuery
      );

      const stepResults = await this.executeMcpTool(nextTool.name, enhancedParameters, originalQuery);

      // Store results and continue
      if (!conversation.context.stepResults) {
        conversation.context.stepResults = [];
      }
      conversation.context.stepResults.push({
        stepIndex: nextStepIndex,
        toolName: nextTool.name,
        parameters: enhancedParameters,
        results: stepResults,
        success: Array.isArray(stepResults) && (stepResults.length === 0 || stepResults[0].success !== false)
      });

      conversation.context.currentStepIndex = nextStepIndex;

      // Check if more steps remain
      if (nextStepIndex + 1 < claudeAnalysis.tools.length) {
        return await this.continueMultiStepWorkflow(conversationId);
      } else {
        // Final step completed
        const allResults = conversation.context.stepResults.map((step: any) => step.results).flat();
        this.conversationManager.completeConversation(conversationId, allResults);

        return {
          success: allResults.some((r: any) => r.success),
          conversationId,
          responseType: 'execute',
          mcpResults: allResults,
          formattedResponse: this.formatMultiStepResults(allResults, conversation.context),
          confidence: claudeAnalysis.confidence,
          intent: claudeAnalysis.intent,
          conversationState: conversation || undefined
        };
      }

    } catch (error) {
      console.error('[McpSmartAssistant] Error continuing multi-step workflow:', error);
      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: error instanceof Error ? error.message : 'Workflow continuation failed',
        confidence: 0.1
      };
    }
  }

  /**
   * CRITICAL FIX: Enhance parameters with conversation context for multi-step workflows
   * This fixes the issue where calendar events are created without email context
   */
  private async enhanceParametersWithConversationContext(
    conversation: ConversationState,
    baseParameters: Record<string, any>,
    gatheredParameters: Record<string, any>
  ): Promise<Record<string, any>> {
    console.log('[McpSmartAssistant] Enhancing parameters with conversation context');

    const enhanced = {
      ...baseParameters,
      ...gatheredParameters
    };

    // For calendar/meeting creation, extract email context
    if (conversation.classification?.primaryIntent === 'calendar_create' ||
        conversation.originalQuery.toLowerCase().includes('meeting')) {

      console.log('[McpSmartAssistant] Detected meeting creation - extracting email context');

      // Extract email addresses and names from original query
      const emailContext = this.extractEmailContextFromQuery(conversation.originalQuery);
      if (emailContext) {
        console.log('[McpSmartAssistant] Found email context:', emailContext);

        // Add attendees to meeting parameters
        if (emailContext.email && !enhanced.attendees && !enhanced.participants) {
          enhanced.attendees = [emailContext.email];
          enhanced.participants = [emailContext.email];
          enhanced.invitees = [emailContext.email];

          // Enhance meeting title with context
          if (!enhanced.title && !enhanced.summary && !enhanced.subject) {
            enhanced.title = `Follow-up meeting with ${emailContext.name || emailContext.email}`;
            enhanced.summary = `Follow-up meeting with ${emailContext.name || emailContext.email}`;
            enhanced.subject = `Follow-up meeting with ${emailContext.name || emailContext.email}`;
          }

          console.log('[McpSmartAssistant] Enhanced meeting parameters with email context:', {
            attendees: enhanced.attendees,
            title: enhanced.title
          });
        }
      }
    }

    return enhanced;
  }

  /**
   * Extract email context (addresses, names) from original query
   */
  private extractEmailContextFromQuery(query: string): { email: string; name?: string } | null {
    console.log('[McpSmartAssistant] Extracting email context from:', query);

    // Look for email patterns in the original query
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const emailMatch = query.match(emailRegex);

    if (emailMatch && emailMatch.length > 0) {
      const email = emailMatch[0];
      console.log('[McpSmartAssistant] Found email in query:', email);

      // Try to extract name before the email
      const namePattern = /(?:from\s+|with\s+)([^@\s]+)@/i;
      const nameMatch = query.match(namePattern);
      const name = nameMatch ? nameMatch[1] : undefined;

      return { email, name };
    }

    return null;
  }


  /**
   * Enhance parameters with limits and instructions from original query
   */
  private enhanceParametersWithLimits(parameters: Record<string, any>, originalQuery: string): Record<string, any> {
    const enhanced = { ...parameters };

    // CRITICAL FIX: Ensure instructions parameter is present
    if (!enhanced.instructions) {
      enhanced.instructions = `Execute the requested operation: "${originalQuery}"`;
      console.log('[McpSmartAssistant] Added missing instructions parameter');
    }

    // SMART DEFAULTS: Add intelligent defaults for common query patterns
    this.applySmartDefaults(enhanced, originalQuery);

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

  /**
   * Identify missing parameters for a tool in multi-step workflow context
   */
  private identifyMissingParameters(tool: any, originalQuery: string, workflowContext: any): string[] {
    console.log('[McpSmartAssistant] Checking parameters for tool:', tool.name);

    const missingParams: string[] = [];
    const providedParams = tool.parameters || {};

    // Dynamic parameter analysis based on tool capabilities (no hardcoded tool names)
    const toolDescription = tool.description || tool.name || '';
    const isCalendarTool = /calendar|schedule|meeting|event|appointment/i.test(toolDescription);
    const isCreationTool = /create|add|new|make|schedule|quick.*add/i.test(toolDescription);

    if (isCalendarTool && isCreationTool) {
      // Calendar creation tools typically need time
      if (!providedParams.start_time && !providedParams.date && !providedParams.when && !providedParams.time) {
        missingParams.push('start_time');
      }
    }

    console.log('[McpSmartAssistant] Missing parameters identified:', missingParams);
    return missingParams;
  }

  /**
   * Handle clarification for multi-step workflows
   */
  private async handleMultiStepClarification(
    conversationId: string,
    missingParameters: string[],
    workflowContext: any
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Handling multi-step clarification for:', missingParameters);

    const question = this.generateWorkflowClarificationQuestion(missingParameters, workflowContext);

    this.conversationManager.updateConversation(conversationId, {
      currentStep: 'clarifying',
      pendingParameters: missingParameters
    });

    this.conversationManager.addClarificationToHistory(conversationId, question);

    return {
      success: true,
      conversationId,
      responseType: 'clarify',
      clarificationQuestion: question,
      confidence: 0.8,
      intent: 'multi-step-workflow-clarification',
      conversationState: this.conversationManager.getConversation(conversationId) || undefined
    };
  }

  /**
   * Generate contextual clarification questions for workflows
   */
  private generateWorkflowClarificationQuestion(missingParameters: string[], workflowContext: any): string {
    const param = missingParameters[0];
    const originalQuery = workflowContext.originalQuery || '';

    const contextInfo = this.extractContextFromPreviousSteps([], originalQuery);

    switch (param) {
      case 'start_time':
      case 'date':
      case 'when':
      case 'time':
        if (contextInfo.participantInfo) {
          return `What date and time should I schedule the ${contextInfo.meetingType || 'meeting'} with ${contextInfo.participantInfo}?`;
        }
        return `What date and time should I schedule this for?`;

      default:
        return `I need more information about the ${param}. What should I use for this?`;
    }
  }

  /**
   * Extract contextual information from previous workflow steps
   */
  private extractContextFromPreviousSteps(stepResults: any[], originalQuery: string): any {
    const contextInfo: any = {};

    const emailContext = this.extractEmailContextFromQuery(originalQuery);
    if (emailContext) {
      contextInfo.participantInfo = emailContext.email;
      contextInfo.meetingType = 'follow-up meeting';
    }

    return contextInfo;
  }

  /**
   * Extract participants from workflow context
   */
  private extractParticipantsFromContext(originalQuery: string, workflowContext: any): boolean {
    const emailMatch = originalQuery.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
    return !!emailMatch;
  }

  /**
   * Enhance parameters with workflow context from previous steps
   */
  private async enhanceParametersWithWorkflowContext(
    baseParameters: Record<string, any>,
    workflowContext: any,
    originalQuery: string
  ): Promise<Record<string, any>> {
    console.log('[McpSmartAssistant] Enhancing parameters with workflow context');

    const enhanced = { ...baseParameters };

    const emailContext = this.extractEmailContextFromQuery(originalQuery);

    if (emailContext && !enhanced.attendees && !enhanced.participants) {
      enhanced.attendees = [emailContext.email];
      enhanced.participants = [emailContext.email];
      enhanced.invitees = [emailContext.email];

      if (!enhanced.title && !enhanced.summary) {
        enhanced.title = `Follow-up meeting with ${emailContext.name || emailContext.email}`;
        enhanced.summary = enhanced.title;
      }

      console.log('[McpSmartAssistant] Enhanced parameters with email context:', {
        attendees: enhanced.attendees,
        title: enhanced.title
      });
    }

    return enhanced;
  }

  /**
   * Format results from multi-step workflows with conversational flow
   */
  private formatMultiStepResults(allResults: any[], workflowContext: any): string {
    console.log('[McpSmartAssistant] Formatting multi-step workflow results');

    const stepResults = workflowContext.stepResults || [];

    // Generate contextual header based on the tools used
    const header = this.generateConversationalHeader(stepResults, workflowContext.originalQuery);
    let formatted = header + '\n\n';

    // Format each step with conversational transitions
    stepResults.forEach((step: any, index: number) => {
      const transition = this.generateStepTransition(step, index, stepResults.length);
      const stepContent = this.formatConversationalStep(step, workflowContext.originalQuery);

      formatted += transition + '\n' + stepContent + '\n\n';
    });

    return formatted;
  }

  /**
   * Generate contextual conversational header for multi-step results
   */
  private generateConversationalHeader(steps: any[], originalQuery: string): string {
    const successfulSteps = steps.filter(step => step.success);
    const totalSteps = steps.length;

    // Identify the main actions performed
    const emailSteps = steps.filter(step => step.toolName.includes('gmail') || step.toolName.includes('email'));
    const calendarSteps = steps.filter(step => step.toolName.includes('calendar'));
    const notionSteps = steps.filter(step => step.toolName.includes('notion'));
    const trelloSteps = steps.filter(step => step.toolName.includes('trello'));
    const slackSteps = steps.filter(step => step.toolName.includes('slack'));

    if (successfulSteps.length === totalSteps) {
      // All steps successful
      if (emailSteps.length > 0 && calendarSteps.length > 0) {
        return '✅ **Email & Calendar Tasks Completed**';
      } else if (emailSteps.length > 0) {
        return '✅ **Email Task Completed Successfully**';
      } else if (calendarSteps.length > 0) {
        return '✅ **Calendar Task Completed Successfully**';
      } else if (notionSteps.length > 0) {
        return '✅ **Notion Task Completed Successfully**';
      } else if (trelloSteps.length > 0) {
        return '✅ **Trello Task Completed Successfully**';
      } else if (slackSteps.length > 0) {
        return '✅ **Slack Task Completed Successfully**';
      } else {
        return '✅ **Tasks Completed Successfully**';
      }
    } else if (successfulSteps.length > 0) {
      // Partial success with more contextual messaging
      const failedSteps = totalSteps - successfulSteps.length;
      if (emailSteps.length > 0 && calendarSteps.length > 0) {
        return failedSteps === 1
          ? '⚠️ **Email & Calendar Tasks - One Step Failed**'
          : `⚠️ **Email & Calendar Tasks - ${failedSteps} Steps Failed**`;
      } else {
        return `⚠️ **Partial Success** - ${successfulSteps.length} of ${totalSteps} tasks completed`;
      }
    } else {
      // All failed - provide more specific guidance
      if (emailSteps.length > 0 || calendarSteps.length > 0) {
        return '❌ **Email & Calendar Tasks Failed**';
      } else if (notionSteps.length > 0) {
        return '❌ **Notion Task Failed**';
      } else {
        return '❌ **All Tasks Failed**';
      }
    }
  }

  /**
   * Generate conversational transition for each step
   */
  private generateStepTransition(step: any, index: number, totalSteps: number): string {
    if (totalSteps === 1) {
      return ''; // No transition needed for single steps
    }

    const toolType = this.getToolDisplayName(step.toolName).toLowerCase();

    if (index === 0) {
      if (step.toolName.includes('gmail') || step.toolName.includes('email')) {
        return '**First,** I sent your email...';
      } else if (step.toolName.includes('calendar')) {
        return '**First,** I checked your calendar...';
      } else if (step.toolName.includes('notion')) {
        return '**First,** I accessed your Notion...';
      } else {
        return `**First,** I handled the ${toolType} request...`;
      }
    } else if (index === totalSteps - 1) {
      if (step.toolName.includes('calendar')) {
        return '**Then,** I created your calendar event...';
      } else if (step.toolName.includes('notion')) {
        return '**Then,** I retrieved the Notion page...';
      } else {
        return `**Then,** I completed the ${toolType} task...`;
      }
    } else {
      return `**Next,** I handled the ${toolType} request...`;
    }
  }

  /**
   * Format individual step with conversational language
   */
  private formatConversationalStep(step: any, originalQuery: string): string {
    if (!step.success) {
      return this.formatFailedStep(step);
    }

    // Use the enhanced formatter for the step results
    const stepFormatted = this.formatMcpResults(step.results, step.toolName, originalQuery);

    // Remove the technical headers from individual step results
    return stepFormatted
      .replace(/^📧 \*\*Your Gmail Emails\*\*/m, '📧 **Email Sent Successfully**')
      .replace(/^📅 \*\*Your Calendar Events\*\*/m, '📅 **Meeting Scheduled**')
      .replace(/^📄 \*\*Notion Page\*\*/m, '📄 **Notion Page Retrieved**')
      .replace(/^🗂️ \*\*Trello Cards\*\*/m, '🗂️ **Trello Cards Found**')
      .replace(/^💬 \*\*Slack Messages\*\*/m, '💬 **Slack Messages Retrieved**');
  }

  /**
   * Format failed step with helpful information
   */
  private formatFailedStep(step: any): string {
    const toolDisplayName = this.getToolDisplayName(step.toolName);
    let content = `❌ **${toolDisplayName} Failed**\n\n`;

    if (step.error) {
      content += `**Error:** ${step.error}\n\n`;
    } else {
      content += `Something went wrong while processing this step.\n\n`;
    }

    // Provide tool-specific troubleshooting tips
    const troubleshootingTip = this.getTroubleshootingTip(step.toolName);
    if (troubleshootingTip) {
      content += `💡 **Troubleshooting:** ${troubleshootingTip}\n\n`;
    }

    content += `🔄 **Next steps:** You can try this operation again or ask for help with "${step.toolName.replace(/[_-]/g, ' ')}"`;

    return content;
  }

  /**
   * Get specific troubleshooting tips based on tool type
   */
  private getTroubleshootingTip(toolName: string): string {
    const toolLower = toolName.toLowerCase();

    if (toolLower.includes('gmail') || toolLower.includes('email')) {
      return 'Check your email connection and permissions. Make sure Gmail is connected to the system.';
    } else if (toolLower.includes('calendar')) {
      return 'Verify your calendar permissions and connection. Try refreshing your calendar integration.';
    } else if (toolLower.includes('notion')) {
      return 'Check your Notion integration and page permissions. Make sure the page exists and you have access.';
    } else if (toolLower.includes('trello')) {
      return 'Verify your Trello board access and API connection.';
    } else if (toolLower.includes('slack')) {
      return 'Check your Slack workspace connection and channel permissions.';
    } else if (toolLower.includes('gdocs') || toolLower.includes('google')) {
      return 'Verify your Google account connection and document permissions.';
    }

    return 'Check your connection and permissions for this service.';
  }

  /**
   * Get user-friendly display name for tools
   */
  private getToolDisplayName(toolName: string): string {
    const toolLower = toolName.toLowerCase();

    if (toolLower.includes('gmail_send')) return 'Email Sending';
    if (toolLower.includes('gmail_find')) return 'Email Search';
    if (toolLower.includes('gmail')) return 'Email';
    if (toolLower.includes('calendar_quick_add')) return 'Calendar Event Creation';
    if (toolLower.includes('calendar_find')) return 'Calendar Search';
    if (toolLower.includes('calendar')) return 'Calendar';
    if (toolLower.includes('notion')) return 'Notion';
    if (toolLower.includes('trello')) return 'Trello';
    if (toolLower.includes('slack')) return 'Slack';
    if (toolLower.includes('gdocs')) return 'Google Docs';

    // Capitalize and clean up the tool name
    return toolName.replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/^.*\./, ''); // Remove server prefix like "zap2."
  }

  /**
   * Apply smart defaults for common query patterns to reduce clarification requests
   */
  private applySmartDefaults(parameters: Record<string, any>, originalQuery: string): void {
    const queryLower = originalQuery.toLowerCase();

    // Smart defaults for "list all" patterns
    if (this.isListAllQuery(queryLower)) {
      // For Notion page searches
      if (queryLower.includes('pages') && queryLower.includes('notion') && !parameters.title) {
        parameters.title = ''; // Empty title to search all pages
        console.log('[McpSmartAssistant] Applied smart default: empty title for "list all pages"');
      }

      // For Google Docs searches
      if ((queryLower.includes('documents') || queryLower.includes('docs')) && queryLower.includes('google') && !parameters.query) {
        parameters.query = ''; // Empty query to list all documents
        console.log('[McpSmartAssistant] Applied smart default: empty query for "list all documents"');
      }

      // For Trello searches
      if ((queryLower.includes('cards') || queryLower.includes('trello')) && !parameters.board) {
        parameters.board = 'all'; // Search all boards
        console.log('[McpSmartAssistant] Applied smart default: "all" for Trello board search');
      }

      // For general file/item searches
      if (!parameters.search && !parameters.query && !parameters.filter) {
        parameters.search = '*'; // Wildcard search
        console.log('[McpSmartAssistant] Applied smart default: wildcard search for "list all"');
      }
    }

    // Smart defaults for "show me" or "get" patterns
    if (this.isShowMeQuery(queryLower)) {
      // Default to recent items if no specific criteria
      if (!parameters.sort && !parameters.order_by) {
        parameters.sort = 'modified'; // Sort by last modified
        parameters.order = 'desc'; // Most recent first
        console.log('[McpSmartAssistant] Applied smart default: sort by recent for "show me" query');
      }
    }

    // Smart defaults for calendar queries
    if (this.isCalendarQuery(queryLower)) {
      if (!parameters.timeMin && !parameters.start_date) {
        // Default to today for calendar queries
        const today = new Date();
        parameters.timeMin = today.toISOString();
        console.log('[McpSmartAssistant] Applied smart default: today\'s date for calendar query');
      }

      if (!parameters.timeMax && !parameters.end_date && queryLower.includes('today')) {
        // For "today" queries, set end of day
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        parameters.timeMax = endOfDay.toISOString();
        console.log('[McpSmartAssistant] Applied smart default: end of day for "today" calendar query');
      }
    }

    // Smart defaults for email queries
    if (this.isEmailQuery(queryLower)) {
      if (!parameters.maxResults && !parameters.limit) {
        // Default to reasonable number of emails
        const defaultLimit = queryLower.includes('all') ? 50 : 10;
        parameters.maxResults = defaultLimit;
        parameters.limit = defaultLimit;
        console.log(`[McpSmartAssistant] Applied smart default: ${defaultLimit} emails for email query`);
      }
    }
  }

  /**
   * Check if query is a "list all" pattern
   */
  private isListAllQuery(queryLower: string): boolean {
    return /\b(list|show|get|find|all|every)\s+(all|my)?\s*(pages?|documents?|files?|items?|cards?|everything)\b/.test(queryLower) ||
           /\ball\s+(of\s+)?(my\s+)?(pages?|documents?|files?|items?|cards?)\b/.test(queryLower);
  }

  /**
   * Check if query is a "show me" pattern
   */
  private isShowMeQuery(queryLower: string): boolean {
    return /\b(show\s+me|give\s+me|get\s+me|find\s+me)\b/.test(queryLower);
  }

  /**
   * Check if query is calendar-related
   */
  private isCalendarQuery(queryLower: string): boolean {
    return /\b(calendar|meeting|event|appointment|schedule)\b/.test(queryLower);
  }

  /**
   * Check if query is email-related
   */
  private isEmailQuery(queryLower: string): boolean {
    return /\b(email|mail|message|inbox)\b/.test(queryLower);
  }
}