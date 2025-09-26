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
import { McpLLMIntentService, LLMIntentAnalysis, LLMToolRecommendation } from './McpLLMIntentService';

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
  private llmIntentService: McpLLMIntentService;
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
    this.llmIntentService = new McpLLMIntentService();
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
      const availableTools = await this.toolDiscoveryService.getAllToolsForClaudeAPI();
      console.log('[McpSmartAssistant] Dynamic tool discovery complete:', {
        totalTools: toolRegistry.totalTools,
        categories: Array.from(toolRegistry.categories.keys()),
        servers: availableTools.map(t => t.serverName).filter((v, i, a) => a.indexOf(v) === i)
      });

      // Step 2: Use LLM Intent Service for comprehensive intent understanding
      console.log('[McpSmartAssistant] Using LLM Intent Service for comprehensive intent understanding...');
      this.llmIntentService.refreshApiKey(); // Refresh API key from localStorage

      if (!this.llmIntentService.isAvailable()) {
        console.log('[McpSmartAssistant] LLM Intent Service not available, falling back to traditional analysis');
        return await this.fallbackToTraditionalAnalysis(newConversationId, query, conversation);
      }

      const llmAnalysis: LLMIntentAnalysis = await this.llmIntentService.analyzeUserIntent(query, availableTools, newConversationId);
      console.log('[McpSmartAssistant] LLM Intent analysis completed:', {
        intent: llmAnalysis.intent,
        category: llmAnalysis.intentCategory,
        toolCount: llmAnalysis.tools.length,
        confidence: llmAnalysis.confidence
      });

      this.conversationManager.updateConversation(newConversationId, {
        currentStep: 'analyzing',
        context: { llmAnalysis, availableTools: availableTools.length }
      });

      // Step 3: Check if LLM found suitable tools
      if (llmAnalysis.tools.length === 0) {
        console.log('[McpSmartAssistant] LLM found no suitable tools, falling back to traditional analysis');
        return await this.fallbackToTraditionalAnalysis(newConversationId, query, conversation);
      }

      // Step 4: Execute using LLM's recommendations
      return await this.executeWithLLMRecommendations(newConversationId, llmAnalysis, query);

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
   * Handle continuation of existing conversation with error-aware context merging
   */
  private async handleConversationContinuation(
    conversation: ConversationState,
    userResponse: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Handling conversation continuation:', conversation.id);

    // NEW: Check if this conversation has error context that needs merging
    const hasErrorContext = this.conversationManager.hasErrorContext(conversation.id);

    if (hasErrorContext) {
      console.log('[McpSmartAssistant] Detected error context - performing intent merging...');
      return await this.handleErrorContextMerging(conversation, userResponse);
    }

    // TRADITIONAL PATH: Regular clarification handling (for backward compatibility)
    console.log('[McpSmartAssistant] Using traditional clarification handling');

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
   * ERROR-AWARE HANDLING: Handle conversation continuation when error context exists
   */
  private async handleErrorContextMerging(
    conversation: ConversationState,
    userResponse: string
  ): Promise<SmartAssistantResponse> {
    const errorContext = this.conversationManager.getErrorContext(conversation.id);
    if (!errorContext) {
      console.error('[McpSmartAssistant] Error context missing despite hasErrorContext check');
      return await this.handleConversationContinuation(conversation, userResponse);
    }

    console.log('[McpSmartAssistant] Merging user response with original intent:', {
      originalIntent: errorContext.originalIntent,
      userResponse,
      toolName: errorContext.toolName
    });

    try {
      // Get available tools for merging
      const toolRegistry = await this.toolDiscoveryService.discoverAllTools();
      const availableTools = await this.toolDiscoveryService.getAllToolsForClaudeAPI();

      // Use LLM to merge user response with original intent
      const mergedAnalysis = await this.llmIntentService.mergeErrorResponseWithOriginalIntent(
        userResponse,
        errorContext.originalIntent,
        {
          errorMessage: errorContext.errorMessage,
          toolName: errorContext.toolName,
          clarificationQuestion: errorContext.clarificationQuestion,
          attemptedParameters: errorContext.attemptedParameters,
          conversationalContext: errorContext.conversationalContext
        },
        availableTools,
        conversation.id
      );

      console.log('[McpSmartAssistant] Intent merging successful, retrying with merged intent:', mergedAnalysis.intent);

      // Update conversation context with successful merge
      this.llmIntentService.addClarificationToContext(
        conversation.id,
        errorContext.clarificationQuestion,
        userResponse,
        errorContext.originalIntent
      );

      // Increment retry count
      this.conversationManager.incrementErrorRetryCount(conversation.id);

      // Execute with merged intent - includes progressive fallback logic
      return await this.executeWithProgressiveFallback(conversation.id, mergedAnalysis, mergedAnalysis.intent);

    } catch (error) {
      console.error('[McpSmartAssistant] Error context merging failed:', error);

      // Fallback to traditional handling if LLM merging fails
      this.conversationManager.clearErrorContext(conversation.id);
      return await this.handleConversationContinuation(conversation, userResponse);
    }
  }

  /**
   * PROGRESSIVE FALLBACK: Execute with multiple retry strategies
   */
  private async executeWithProgressiveFallback(
    conversationId: string,
    analysis: LLMIntentAnalysis,
    originalQuery: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Executing with progressive fallback capabilities');

    const errorContext = this.conversationManager.getErrorContext(conversationId);
    const retryCount = errorContext?.retryCount || 0;
    const maxRetries = 3;

    // First attempt: Try with merged analysis
    console.log(`[McpSmartAssistant] Attempt ${retryCount + 1} of ${maxRetries}: Standard execution`);
    const result = await this.executeWithLLMRecommendations(conversationId, analysis, originalQuery);

    // If successful, clear error context and return
    if (result.success) {
      console.log('[McpSmartAssistant] Progressive fallback succeeded on standard execution');
      return result;
    }

    // If failed and we have retries left, try progressive fallbacks
    if (retryCount < maxRetries - 1) {
      console.log('[McpSmartAssistant] Standard execution failed, trying progressive fallbacks...');

      try {
        return await this.attemptProgressiveFallbacks(conversationId, analysis, originalQuery, retryCount + 1);
      } catch (fallbackError) {
        console.error('[McpSmartAssistant] Progressive fallbacks exhausted:', fallbackError);
      }
    }

    // All retries exhausted - provide helpful fallback response
    console.log('[McpSmartAssistant] All retry attempts exhausted, providing fallback response');
    return await this.generateFallbackResponse(conversationId, analysis, originalQuery);
  }

  /**
   * Attempt various fallback strategies based on error context
   */
  private async attemptProgressiveFallbacks(
    conversationId: string,
    analysis: LLMIntentAnalysis,
    originalQuery: string,
    attemptNumber: number
  ): Promise<SmartAssistantResponse> {
    const errorContext = this.conversationManager.getErrorContext(conversationId);
    if (!errorContext) {
      throw new Error('No error context for fallback attempts');
    }

    console.log(`[McpSmartAssistant] Progressive fallback attempt ${attemptNumber}:`, errorContext.toolName);

    // Update retry count
    this.conversationManager.incrementErrorRetryCount(conversationId);

    // Strategy 1: Simplified Parameters
    if (attemptNumber === 2) {
      console.log('[McpSmartAssistant] Fallback Strategy 1: Simplified parameters');
      const simplifiedAnalysis = await this.createSimplifiedParameterAnalysis(analysis, errorContext);
      const result = await this.executeWithLLMRecommendations(conversationId, simplifiedAnalysis, originalQuery);

      if (result.success) {
        console.log('[McpSmartAssistant] Simplified parameter strategy succeeded');
        return result;
      }
    }

    // Strategy 2: Alternative Tool Selection
    if (attemptNumber === 3) {
      console.log('[McpSmartAssistant] Fallback Strategy 2: Alternative approach');
      const alternativeAnalysis = await this.createAlternativeToolAnalysis(analysis, errorContext);
      const result = await this.executeWithLLMRecommendations(conversationId, alternativeAnalysis, originalQuery);

      if (result.success) {
        console.log('[McpSmartAssistant] Alternative tool strategy succeeded');
        return result;
      }
    }

    // If all strategies fail, throw to trigger final fallback
    throw new Error('All progressive fallback strategies failed');
  }

  /**
   * Create analysis with simplified parameters for retry
   */
  private async createSimplifiedParameterAnalysis(
    originalAnalysis: LLMIntentAnalysis,
    errorContext: NonNullable<ConversationState['errorContext']>
  ): Promise<LLMIntentAnalysis> {
    const tool = originalAnalysis.tools[0];
    if (!tool) return originalAnalysis;

    // Create simplified parameters based on tool type
    const simplifiedParameters: Record<string, any> = {};
    const toolLower = tool.name.toLowerCase();

    if (toolLower.includes('google_docs') || toolLower.includes('docs')) {
      if (originalAnalysis.intentCategory === 'create') {
        simplifiedParameters.title = tool.parameters.title || 'Document';
        simplifiedParameters.content = ''; // Always use empty content for retry
      } else if (originalAnalysis.intentCategory === 'list_all' || originalAnalysis.intentCategory === 'search_specific') {
        simplifiedParameters.query = ''; // Empty query to list all
      }
    } else if (toolLower.includes('gmail') || toolLower.includes('email')) {
      if (originalAnalysis.intentCategory === 'create') {
        simplifiedParameters.to = tool.parameters.to;
        simplifiedParameters.subject = tool.parameters.subject || 'Message';
        simplifiedParameters.body = tool.parameters.body || 'Hello';
      } else {
        simplifiedParameters.limit = 5; // Smaller limit for retry
        simplifiedParameters.query = ''; // Broad search
      }
    } else if (toolLower.includes('slack')) {
      if (originalAnalysis.intentCategory === 'create') {
        simplifiedParameters.channelName = tool.parameters.channelName?.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        simplifiedParameters.instructions = `create channel ${simplifiedParameters.channelName}`;
      } else {
        simplifiedParameters.instructions = 'find channels';
      }
    } else if (toolLower.includes('calendar')) {
      if (originalAnalysis.intentCategory === 'delete') {
        simplifiedParameters.instructions = 'delete events from primary calendar today';
      } else {
        simplifiedParameters.title = tool.parameters.title || 'Event';
        simplifiedParameters.start_time = new Date(Date.now() + 60*60*1000).toISOString(); // 1 hour from now
      }
    } else if (toolLower.includes('notion')) {
      if (originalAnalysis.intentCategory === 'create') {
        simplifiedParameters.title = tool.parameters.title || 'Page';
        simplifiedParameters.content = ''; // Basic page
      } else {
        simplifiedParameters.title = ''; // List all
      }
    } else {
      // Generic simplification
      for (const [key, value] of Object.entries(tool.parameters)) {
        if (typeof value === 'string' && value.length > 20) {
          simplifiedParameters[key] = value.substring(0, 20); // Truncate long strings
        } else if (typeof value === 'string' && value === '') {
          simplifiedParameters[key] = ''; // Keep empty strings
        } else {
          simplifiedParameters[key] = value;
        }
      }
    }

    console.log('[McpSmartAssistant] Created simplified parameters:', simplifiedParameters);

    return {
      ...originalAnalysis,
      intent: `${originalAnalysis.intent} (simplified retry)`,
      tools: [{
        ...tool,
        parameters: simplifiedParameters,
        reasoning: `Simplified retry: ${tool.reasoning}`
      }],
      reasoning: `Simplified parameter retry: ${originalAnalysis.reasoning}`
    };
  }

  /**
   * Create analysis with alternative tool approach for retry
   */
  private async createAlternativeToolAnalysis(
    originalAnalysis: LLMIntentAnalysis,
    errorContext: NonNullable<ConversationState['errorContext']>
  ): Promise<LLMIntentAnalysis> {
    // For now, return the original analysis with modified approach
    // In a real implementation, this could try completely different tools or approaches
    const tool = originalAnalysis.tools[0];
    if (!tool) return originalAnalysis;

    console.log('[McpSmartAssistant] Creating alternative tool analysis for:', tool.name);

    return {
      ...originalAnalysis,
      intent: `${originalAnalysis.intent} (alternative approach)`,
      tools: [{
        ...tool,
        reasoning: `Alternative approach retry: ${tool.reasoning}`,
        confidence: Math.max(0.7, tool.confidence - 0.1) // Slightly lower confidence
      }],
      reasoning: `Alternative approach retry: ${originalAnalysis.reasoning}`
    };
  }

  /**
   * Generate helpful fallback response when all retries fail
   */
  private async generateFallbackResponse(
    conversationId: string,
    analysis: LLMIntentAnalysis,
    originalQuery: string
  ): Promise<SmartAssistantResponse> {
    const errorContext = this.conversationManager.getErrorContext(conversationId);
    console.log('[McpSmartAssistant] Generating fallback response after retry exhaustion');

    // Clear error context since we're providing final response
    this.conversationManager.clearErrorContext(conversationId);

    // Create helpful fallback message using the result formatter
    let fallbackMessage = '';

    if (errorContext?.conversationalContext) {
      fallbackMessage = this.resultFormatter.formatContextualError(
        originalQuery,
        analysis.tools[0]?.name || 'unknown',
        errorContext.errorMessage,
        errorContext.conversationalContext
      );
    } else {
      fallbackMessage = `❌ I tried multiple approaches but couldn't complete your request: "${originalQuery}"\n\n`;
      fallbackMessage += `**What I attempted:**\n`;
      fallbackMessage += `• Standard execution with your requirements\n`;
      fallbackMessage += `• Simplified parameter approach\n`;
      fallbackMessage += `• Alternative method\n\n`;
      fallbackMessage += `**What you can try:**\n`;
      fallbackMessage += `• Break the request into smaller steps\n`;
      fallbackMessage += `• Check service connections\n`;
      fallbackMessage += `• Try with different parameters\n`;
      fallbackMessage += `• Contact support if the issue persists`;
    }

    return {
      success: false,
      conversationId,
      responseType: 'error',
      error: 'Multiple retry attempts failed',
      formattedResponse: fallbackMessage,
      confidence: analysis.confidence,
      intent: analysis.intent,
      conversationState: this.conversationManager.getConversation(conversationId) || undefined
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

      // Use semantic mapping for dynamic tool resolution
      const intentToCapability: Record<string, string> = {
        'email_send': '@capability:email.create',
        'email_read': '@capability:email.read',
        'email_reply': '@capability:email.create',
        'calendar_create': '@capability:calendar.create',
        'calendar_delete': '@capability:calendar.delete',
        'calendar_read': '@capability:calendar.read',
        'calendar_update': '@capability:calendar.update'
      };

      // Get semantic capability identifier
      const capability = intentToCapability[classification.primaryIntent];
      const toolName = capability || 'ConditionalWorkflow';

      console.log(`[McpSmartAssistant] Resolved intent "${classification.primaryIntent}" to capability "${capability}"`);

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
   * Execute using LLM's intelligent tool recommendations with enhanced clarification handling
   */
  private async executeWithLLMRecommendations(
    conversationId: string,
    llmAnalysis: LLMIntentAnalysis,
    originalQuery: string
  ): Promise<SmartAssistantResponse> {
    console.log('[McpSmartAssistant] Executing with LLM recommendations:', llmAnalysis.tools.length, 'tools');
    console.log('[McpSmartAssistant] Intent category:', llmAnalysis.intentCategory);
    console.log('[McpSmartAssistant] Contextual defaults applied:', Object.keys(llmAnalysis.contextualDefaults).length);

    try {
      this.conversationManager.updateConversation(conversationId, {
        currentStep: 'executing',
        context: {
          originalQuery,
          llmAnalysis,
          workflowType: llmAnalysis.tools.length > 1 ? 'multi-step' : 'single',
          pendingSteps: llmAnalysis.tools.length > 1 ? llmAnalysis.tools.slice(1) : []
        }
      });

      if (llmAnalysis.tools.length === 1) {
        // Single tool execution with enhanced clarification handling
        const tool = llmAnalysis.tools[0];
        console.log('[McpSmartAssistant] Executing single tool:', tool.name, 'with parameters:', tool.parameters);

        const mcpResults = await this.executeMcpTool(tool.name, tool.parameters, originalQuery);

        // ENHANCED: Check if MCP returned a clarification question and use LLM to resolve it
        const mcpClarification = this.conversationManager.detectMcpClarification(mcpResults[0]?.data);
        if (mcpClarification) {
          console.log('[McpSmartAssistant] MCP tool asked for clarification:', mcpClarification.question);
          console.log('[McpSmartAssistant] Attempting LLM-based clarification resolution...');

          try {
            // Use LLM to resolve the clarification based on original intent
            const clarificationResolution = await this.llmIntentService.analyzeUserIntent(
              originalQuery,
              [], // Empty tools array for clarification resolution
              conversationId,
              {
                question: mcpClarification.question,
                originalQuery: originalQuery,
                toolName: tool.name,
                parameterName: mcpClarification.parameterName || 'unknown'
              }
            );

            console.log('[McpSmartAssistant] LLM clarification resolution:', clarificationResolution.clarificationResolution);

            // If LLM can auto-resolve, retry with the resolved parameter
            if (clarificationResolution.clarificationResolution?.canAutoResolve &&
                clarificationResolution.clarificationResolution.autoResponse !== undefined) {

              console.log('[McpSmartAssistant] Auto-resolving with LLM suggestion:', clarificationResolution.clarificationResolution.autoResponse);

              // Update conversation context with the clarification resolution
              this.llmIntentService.addClarificationToContext(
                conversationId,
                mcpClarification.question,
                clarificationResolution.clarificationResolution.autoResponse,
                originalQuery
              );

              // Retry the tool with the auto-resolved parameter
              const retryParameters = { ...tool.parameters };
              if (mcpClarification.parameterName) {
                retryParameters[mcpClarification.parameterName] = clarificationResolution.clarificationResolution.autoResponse;
              }

              const retryResults = await this.executeMcpTool(tool.name, retryParameters, originalQuery);

              // Add successful tool execution to context
              this.llmIntentService.addToolExecutionToContext(
                conversationId,
                tool.name,
                retryParameters,
                retryResults.length > 0 && retryResults[0].success,
                retryResults
              );

              return {
                success: retryResults.length > 0 && retryResults[0].success,
                conversationId,
                responseType: 'execute',
                mcpResults: retryResults,
                formattedResponse: this.formatMcpResults(retryResults, tool.name, originalQuery),
                confidence: llmAnalysis.confidence,
                intent: llmAnalysis.intent,
                conversationState: this.conversationManager.getConversation(conversationId) || undefined
              };
            }
          } catch (llmError) {
            console.warn('[McpSmartAssistant] LLM clarification resolution failed, falling back to traditional:', llmError);
          }

          // Handle auto-resolved clarifications from traditional pipeline (backward compatibility)
          if (mcpClarification.type === 'auto_resolved' && mcpClarification.autoResponse !== undefined) {
            console.log('[McpSmartAssistant] Using traditional auto-resolution:', mcpClarification.autoResponse);

            const retryParameters = { ...tool.parameters };
            if (mcpClarification.parameterName) {
              retryParameters[mcpClarification.parameterName] = mcpClarification.autoResponse;
            }

            const retryResults = await this.executeMcpTool(tool.name, retryParameters, originalQuery);

            return {
              success: retryResults.length > 0 && retryResults[0].success,
              conversationId,
              responseType: 'execute',
              mcpResults: retryResults,
              formattedResponse: this.formatMcpResults(retryResults, tool.name, originalQuery),
              confidence: llmAnalysis.confidence,
              intent: llmAnalysis.intent,
              conversationState: this.conversationManager.getConversation(conversationId) || undefined
            };
          }

          // ENHANCED: Capture error context before asking user for clarification
          console.log('[McpSmartAssistant] Capturing error context for clarification:', {
            originalIntent: originalQuery,
            toolName: tool.name,
            errorMessage: mcpClarification.question
          });

          this.conversationManager.captureErrorContext(
            conversationId,
            originalQuery,                    // Original user intent
            mcpClarification.question,        // Error message from MCP tool
            tool.name,                       // Tool that failed
            tool.parameters,                 // Parameters that were attempted
            'clarification_error'            // Error type
          );

          // Update error context with the formatted clarification question
          this.conversationManager.updateErrorContextWithClarification(conversationId, mcpClarification.question);

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
            confidence: llmAnalysis.confidence,
            conversationState: this.conversationManager.getConversation(conversationId) || undefined
          };
        }

        // Success - learn from the action and complete conversation
        const success = mcpResults.length > 0 && mcpResults[0].success;

        // ENHANCED: Clear error context on successful execution
        if (success) {
          this.conversationManager.clearErrorContext(conversationId);
          console.log('[McpSmartAssistant] Cleared error context after successful execution');
        }

        // Add to LLM context for learning
        this.llmIntentService.addToolExecutionToContext(
          conversationId,
          tool.name,
          tool.parameters,
          success,
          mcpResults
        );

        this.contextManager.learnFromAction(llmAnalysis.intent, tool.parameters, success);
        this.conversationManager.completeConversation(conversationId, mcpResults);

        return {
          success,
          conversationId,
          responseType: 'execute',
          mcpResults,
          formattedResponse: this.formatMcpResults(mcpResults, tool.name, originalQuery),
          confidence: llmAnalysis.confidence,
          intent: llmAnalysis.intent,
          parameters: tool.parameters,
          conversationState: this.conversationManager.getConversation(conversationId) || undefined
        };

      } else {
        // Multi-step execution with LLM guidance
        console.log('[McpSmartAssistant] Multi-step LLM-guided execution for', llmAnalysis.tools.length, 'tools');
        const allResults: any[] = [];

        for (const [index, tool] of llmAnalysis.tools.entries()) {
          console.log(`[McpSmartAssistant] Executing step ${index + 1}:`, tool.name);
          const mcpResults = await this.executeMcpTool(tool.name, tool.parameters, originalQuery);
          allResults.push(...mcpResults);

          // Add each tool execution to LLM context
          this.llmIntentService.addToolExecutionToContext(
            conversationId,
            tool.name,
            tool.parameters,
            mcpResults.length > 0 && mcpResults[0].success,
            mcpResults
          );
        }

        const success = allResults.some(r => r.success);
        this.contextManager.learnFromAction(llmAnalysis.intent, {}, success);
        this.conversationManager.completeConversation(conversationId, allResults);

        return {
          success,
          conversationId,
          responseType: 'execute',
          mcpResults: allResults,
          formattedResponse: this.formatMultiStepResults(allResults, {
            stepResults: allResults.map((result, index) => ({
              step: index + 1,
              toolName: llmAnalysis.tools[index]?.name || 'unknown',
              results: Array.isArray(result) ? result : [result],
              success: Array.isArray(result) ? (result.length === 0 || result[0].success !== false) : (result && result.success !== false),
              originalQuery: originalQuery
            })),
            originalQuery,
            tools: llmAnalysis.tools
          }),
          confidence: llmAnalysis.confidence,
          intent: llmAnalysis.intent,
          conversationState: this.conversationManager.getConversation(conversationId) || undefined
        };
      }

    } catch (error) {
      console.error('[McpSmartAssistant] LLM-based execution failed:', error);

      this.conversationManager.recordMcpError(
        conversationId,
        error instanceof Error ? error.message : 'Unknown error',
        llmAnalysis.tools[0]?.name || 'unknown'
      );

      return {
        success: false,
        conversationId,
        responseType: 'error',
        error: error instanceof Error ? error.message : 'Execution failed',
        confidence: llmAnalysis.confidence,
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
    // Use semantic capability mapping for dynamic tool resolution
    const intentToCapability: Record<string, string> = {
      'email_send': '@capability:email.create',
      'email_read': '@capability:email.read',
      'email_reply': '@capability:email.create',
      'calendar_create': '@capability:calendar.create',
      'calendar_delete': '@capability:calendar.delete',
      'calendar_read': '@capability:calendar.read',
      'calendar_update': '@capability:calendar.update'
    };

    const capability = intentToCapability[classification.primaryIntent];
    const toolName = capability || 'ConditionalWorkflow';

    console.log(`[McpSmartAssistant] Traditional mapping resolved intent "${classification.primaryIntent}" to capability "${capability}"`);
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

      // PHASE 1: Multi-layer robust schema validation (always succeeds with best available parameters)
      console.log('[McpSmartAssistant] Phase 1: Multi-layer robust validation');
      const schemaValidation = await this.performPreExecutionValidation(toolName, parameters, originalQuery);

      // With robust validation, we ALWAYS proceed - just with the best parameters we can manage
      const validatedParameters = schemaValidation.parameters;
      const usedFallback = schemaValidation.fallbackLayer || 'unknown';

      console.log(`[McpSmartAssistant] ✅ Robust validation complete - using ${usedFallback}:`, {
        fallbackLayer: usedFallback,
        parametersCount: Object.keys(validatedParameters).length,
        parameters: validatedParameters
      });

      // Use the existing McpExecutor's method for Claude parameter execution
      if (this.mcpExecutor && typeof this.mcpExecutor.executeSingleToolWithClaudeParams === 'function') {
        const queryType = this.mcpExecutor.analyzeQueryType ? this.mcpExecutor.analyzeQueryType(originalQuery) : 'general';

        // Ensure Claude's parameters include any limits from the original query
        const enhancedParameters = this.enhanceParametersWithLimits(validatedParameters, originalQuery);

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

      // PHASE 2: Error-driven parameter discovery (reactive)
      console.log('[McpSmartAssistant] Phase 2: Error-driven parameter discovery');
      const errorRecoveryAttempt = await this.attemptErrorRecovery(toolName, parameters, originalQuery, error);

      if (errorRecoveryAttempt.canRecover) {
        console.log('[McpSmartAssistant] Error recovery possible, creating clarification request');
        // Don't throw - let the calling method handle the clarification request
        throw new Error(`PARAMETER_CLARIFICATION_NEEDED: ${errorRecoveryAttempt.clarificationMessage}`);
      }

      // If error recovery is not possible, throw the original error
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
      .replace(/^.*\./, '');
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

  /* ---------- Two-Layer Validation System Methods ---------- */

  /**
   * Phase 1: Pre-execution schema validation (proactive)
   */
  private async performPreExecutionValidation(
    toolName: string,
    parameters: Record<string, any>,
    originalQuery: string
  ): Promise<{
    canProceed: boolean;
    parameters: Record<string, any>;
    reason?: string;
    missingParameters?: string[];
    fallbackLayer?: string;
  }> {
    console.log(`[McpSmartAssistant] Starting robust multi-layer validation for ${toolName}`);

    try {
      // Get tool schema from MCP manager
      if (!this.mcpManager || typeof this.mcpManager.getCachedToolSchema !== 'function') {
        console.log('[McpSmartAssistant] Schema validation not available, proceeding with all parameters');
        return {
          canProceed: true,
          parameters,
          fallbackLayer: 'no-validation'
        };
      }

      // Try to resolve the full tool name first
      let resolvedToolName = toolName;
      if (this.mcpExecutor && typeof this.mcpExecutor.resolveFullToolName === 'function') {
        try {
          const resolution = await this.mcpExecutor.resolveFullToolName(toolName);
          resolvedToolName = resolution.toolName;
          console.log(`[McpSmartAssistant] Resolved tool name: ${toolName} -> ${resolvedToolName}`);
        } catch (error) {
          console.warn(`[McpSmartAssistant] Could not resolve tool name ${toolName}, using as-is`);
        }
      }

      // Get schema for validation
      const schema = this.mcpManager.getCachedToolSchema(resolvedToolName);
      if (!schema) {
        console.log(`[McpSmartAssistant] No schema found for ${resolvedToolName}, proceeding with all parameters`);
        return {
          canProceed: true,
          parameters,
          fallbackLayer: 'no-schema'
        };
      }

      // LAYER 1: Try with all provided parameters (smart filtering & coercion)
      console.log('\n[McpSmartAssistant] 🔄 LAYER 1: Full parameter validation with smart filtering');
      const validation = this.mcpManager.validateToolParameters(resolvedToolName, parameters);

      if (validation.valid) {
        console.log('✅ [McpSmartAssistant] Layer 1 SUCCESS: Using filtered & coerced parameters');
        return {
          canProceed: true,
          parameters: validation.filteredParams,
          fallbackLayer: 'layer-1-filtered'
        };
      }

      // LAYER 2: Try with required parameters + instructions only
      console.log('\n[McpSmartAssistant] 🔄 LAYER 2: Required parameters + instructions only');
      const requiredParams: Record<string, any> = {};

      // Always include instructions for natural language fallback
      if (originalQuery) {
        requiredParams.instructions = `${originalQuery}. Please extract and use the necessary parameters from this request.`;
      }

      // Add required parameters if we have them
      for (const requiredParam of schema.required) {
        if (requiredParam in parameters) {
          requiredParams[requiredParam] = parameters[requiredParam];
        } else {
          // Try to infer missing required parameters
          const inferredValue = this.inferParameterFromQuery(requiredParam, originalQuery);
          if (inferredValue !== null) {
            requiredParams[requiredParam] = inferredValue;
            console.log(`[McpSmartAssistant] Inferred required parameter ${requiredParam}: ${inferredValue}`);
          }
        }
      }

      const layer2Validation = this.mcpManager.validateToolParameters(resolvedToolName, requiredParams);
      if (layer2Validation.valid) {
        console.log('✅ [McpSmartAssistant] Layer 2 SUCCESS: Using required parameters + instructions');
        return {
          canProceed: true,
          parameters: layer2Validation.filteredParams,
          fallbackLayer: 'layer-2-required'
        };
      }

      // LAYER 3: Instructions-only mode (universal fallback)
      console.log('\n[McpSmartAssistant] 🔄 LAYER 3: Instructions-only mode');
      const instructionsOnly = {
        instructions: `${originalQuery}. Please handle this request and extract any needed parameters from this natural language instruction.`
      };

      const layer3Validation = this.mcpManager.validateToolParameters(resolvedToolName, instructionsOnly);
      if (layer3Validation.valid || layer3Validation.missingRequired.length === 0 || layer3Validation.missingRequired.every((p: string) => p !== 'instructions')) {
        console.log('✅ [McpSmartAssistant] Layer 3 SUCCESS: Using instructions-only mode');
        return {
          canProceed: true,
          parameters: instructionsOnly,
          fallbackLayer: 'layer-3-instructions'
        };
      }

      // LAYER 4: Schema-less execution (last resort)
      console.log('\n[McpSmartAssistant] 🔄 LAYER 4: Schema-less execution (last resort)');
      console.log('✅ [McpSmartAssistant] Layer 4 SUCCESS: Using schema-less execution with original parameters');
      return {
        canProceed: true,
        parameters: {
          instructions: `${originalQuery}. Tool: ${resolvedToolName}. Please handle this request with any available functionality.`,
          ...parameters
        },
        fallbackLayer: 'layer-4-schemaless',
        reason: 'Using schema-less fallback - validation bypassed'
      };

    } catch (error) {
      console.error('[McpSmartAssistant] Error in multi-layer validation:', error);
      console.log('✅ [McpSmartAssistant] ERROR FALLBACK: Proceeding with original parameters');
      return {
        canProceed: true,
        parameters: {
          instructions: `${originalQuery}. Please handle this request.`,
          ...parameters
        },
        fallbackLayer: 'error-fallback'
      };
    }
  }

  /**
   * Phase 2: Error-driven parameter discovery (reactive)
   */
  private async attemptErrorRecovery(
    toolName: string,
    parameters: Record<string, any>,
    originalQuery: string,
    error: any
  ): Promise<{
    canRecover: boolean;
    clarificationMessage?: string;
    missingParameters?: string[];
    recoveryStrategy?: string;
  }> {
    console.log(`[McpSmartAssistant] Attempting error recovery for ${toolName}`);

    try {
      // Parse the error using ConversationManager's error parsing
      const errorAnalysis = this.conversationManager.parseErrorForMissingParameters(error);
      console.log('[McpSmartAssistant] Error analysis:', errorAnalysis);

      // Check if this is a recoverable parameter error
      if (this.conversationManager.isRecoverableParameterError(errorAnalysis)) {
        console.log('[McpSmartAssistant] Error is recoverable through parameter collection');

        // Generate clarification request
        const clarification = this.conversationManager.generateMissingParameterClarification(
          errorAnalysis.missingParameters,
          toolName,
          originalQuery
        );

        return {
          canRecover: true,
          clarificationMessage: clarification.question,
          missingParameters: errorAnalysis.missingParameters
        };
      }

      // Check for other recoverable error types
      if (errorAnalysis.errorType === 'auth_error') {
        return {
          canRecover: true,
          clarificationMessage: `Authentication required for ${toolName}. Please check your credentials and permissions.`,
          missingParameters: ['authentication']
        };
      }

      if (errorAnalysis.errorType === 'invalid_param') {
        return {
          canRecover: true,
          clarificationMessage: `The ${toolName} tool received invalid parameters. Please provide correct values.`,
          missingParameters: ['parameter_values']
        };
      }

      // ENHANCED: For generic/empty errors, try additional fallback strategies
      if (errorAnalysis.errorType === 'generic') {
        console.log('[McpSmartAssistant] ♻️  Generic/empty error detected - trying enhanced recovery strategies');

        // Strategy 1: Try with minimal parameter set (instructions only)
        console.log('[McpSmartAssistant] Recovery Strategy 1: Minimal parameter retry');
        return {
          canRecover: true,
          clarificationMessage: `The ${toolName} tool had an execution issue. Trying with simplified parameters...`,
          missingParameters: [], // No specific missing parameters, just generic retry
          recoveryStrategy: 'minimal-retry'
        };
      }

      console.log('[McpSmartAssistant] Error is not recoverable through parameter collection');
      return {
        canRecover: false
      };

    } catch (recoveryError) {
      console.error('[McpSmartAssistant] Error during error recovery attempt:', recoveryError);

      // ENHANCED: Even if error parsing fails, try minimal recovery
      console.log('[McpSmartAssistant] ♻️  Error parsing failed - attempting minimal recovery anyway');
      return {
        canRecover: true,
        clarificationMessage: `Execution failed for ${toolName}. Attempting simplified approach...`,
        missingParameters: [],
        recoveryStrategy: 'error-fallback'
      };
    }
  }

  /**
   * Infer parameter values from user query using semantic patterns
   */
  private inferParameterFromQuery(parameterName: string, query: string, _toolName?: string): any {
    const queryLower = query.toLowerCase();
    const paramLower = parameterName.toLowerCase();

    console.log(`[McpSmartAssistant] Inferring parameter "${parameterName}" from query: "${query}"`);

    try {
      // Board parameter inference for project management tools
      if (paramLower.includes('board') || parameterName === 'board') {
        const boardPatterns = [
          /(?:board|in|from|on)\s+["']?([^"'\s,]+)["']?/i,
          /["']([^"']+)["']\s+board/i
        ];

        for (const pattern of boardPatterns) {
          const match = queryLower.match(pattern);
          if (match && match[1]) {
            console.log(`[McpSmartAssistant] Inferred board parameter: "${match[1]}"`);
            return match[1];
          }
        }

        // For project management tools, use semantic defaults based on query intent
        if (paramLower === 'board') {
          // Check if this is a search/list operation (common pattern across project tools)
          const isSearchOperation = query.toLowerCase().includes('find') ||
                                  query.toLowerCase().includes('search') ||
                                  query.toLowerCase().includes('get') ||
                                  query.toLowerCase().includes('list') ||
                                  query.toLowerCase().includes('show');
          if (isSearchOperation) {
            console.log('[McpSmartAssistant] Using default "all" for board search parameter');
            return 'all';
          }
        }
      }

      // Query/Search parameter inference
      if (paramLower.includes('query') || paramLower.includes('search') || parameterName === 'q') {
        const searchPatterns = [
          /(?:find|search for|looking for|get|show)\s+["']?([^"']+)["']?/i,
          /["']([^"']+)["']\s+(?:card|ticket|item|task)/i
        ];

        for (const pattern of searchPatterns) {
          const match = query.match(pattern);
          if (match && match[1]) {
            console.log(`[McpSmartAssistant] Inferred query parameter: "${match[1].trim()}"`);
            return match[1].trim();
          }
        }

        // Fallback: use entire query
        return query;
      }

      // Date parameter inference
      if (paramLower.includes('date') || paramLower.includes('when')) {
        const datePatterns = [
          /\b(today|tomorrow|yesterday)\b/i,
          /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/,
          /\b(this week|next week|last week)\b/i
        ];

        for (const pattern of datePatterns) {
          const match = query.match(pattern);
          if (match && match[1]) {
            console.log(`[McpSmartAssistant] Inferred date parameter: "${match[1]}"`);
            return match[1];
          }
        }
      }

      // Limit parameter inference
      if (paramLower.includes('limit') || paramLower.includes('count') || paramLower.includes('max')) {
        const limitMatch = query.match(/(?:first|last|top|show|limit|max)\s+(\d+)/i);
        if (limitMatch) {
          const limit = parseInt(limitMatch[1]);
          console.log(`[McpSmartAssistant] Inferred limit parameter: ${limit}`);
          return limit;
        }
      }

      console.log(`[McpSmartAssistant] Could not infer parameter "${parameterName}" from query`);
      return null;

    } catch (error) {
      console.error(`[McpSmartAssistant] Error inferring parameter "${parameterName}":`, error);
      return null;
    }
  }
}