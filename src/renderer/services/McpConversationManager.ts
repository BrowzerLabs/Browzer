/**
 * MCP Conversation Manager Service
 *
 * Manages multi-step conversations, handles MCP clarification responses,
 * and maintains conversation context for seamless user experience.
 */

import { QueryAnalysis } from './McpQueryAnalyzer';
import { IntentClassification } from './McpIntentClassifier';
import { ParameterExtraction } from './McpParameterExtractor';

export interface ConversationState {
  id: string;
  originalQuery: string;
  intent: string;
  currentStep: 'analyzing' | 'gathering_params' | 'executing' | 'clarifying' | 'completed' | 'failed';
  analysis: QueryAnalysis | null;
  classification: IntentClassification | null;
  parameterExtraction: ParameterExtraction | null;
  gatheredParameters: Record<string, any>;
  pendingParameters: string[];
  clarificationHistory: Array<{ question: string; answer: string; timestamp: Date }>;
  mcpErrors: Array<{ error: string; toolName: string; timestamp: Date }>;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  lastActivity: Date;
  context: Record<string, any>;

  // NEW: Error-aware context retention
  errorContext?: {
    originalIntent: string;                    // Original user request that led to error
    errorType: 'tool_error' | 'access_error' | 'parameter_error' | 'clarification_error';
    errorMessage: string;                      // Raw error message from MCP tool
    clarificationQuestion: string;             // Formatted question shown to user
    toolName: string;                         // Which tool failed
    attemptedParameters: Record<string, any>; // Parameters that were attempted
    retryCount: number;                       // Number of retry attempts
    timestamp: Date;                          // When error occurred
    conversationalContext?: {                 // Additional context for better UX
      taskDescription: string;                // Human-readable task description
      expectedOutcome: string;                // What user was trying to accomplish
      suggestedAlternatives: string[];        // Alternative approaches if retry fails
    };
  };
}

export interface ClarificationResponse {
  type: 'mcp_question' | 'parameter_missing' | 'validation_error' | 'ambiguous_intent' | 'auto_resolved';
  question: string;
  options?: string[];
  parameterName?: string;
  expectedFormat?: string;
  suggestions?: any[];
  autoResponse?: string; // The automatic response to use instead of asking user
  needsClarification: boolean; // Whether this response requires user clarification
  suggestedAnswers?: string[]; // Alternative suggested answers for the user
  context?: string; // Context information for the clarification
}

export class McpConversationManager {
  private conversations: Map<string, ConversationState> = new Map();
  private currentConversationId: string | null = null;

  /**
   * Start a new conversation
   */
  startConversation(query: string, context?: Record<string, any>): string {
    const conversationId = this.generateConversationId();

    const state: ConversationState = {
      id: conversationId,
      originalQuery: query,
      intent: '',
      currentStep: 'analyzing',
      analysis: null,
      classification: null,
      parameterExtraction: null,
      gatheredParameters: {},
      pendingParameters: [],
      clarificationHistory: [],
      mcpErrors: [],
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      lastActivity: new Date(),
      context: context || {}
    };

    this.conversations.set(conversationId, state);
    this.currentConversationId = conversationId;

    console.log('[McpConversationManager] Started conversation:', conversationId);
    return conversationId;
  }

  /**
   * Update conversation state
   */
  updateConversation(
    conversationId: string,
    updates: Partial<ConversationState>
  ): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return false;

    Object.assign(conversation, updates);
    conversation.lastActivity = new Date();

    console.log('[McpConversationManager] Updated conversation:', conversationId, updates);
    return true;
  }

  /**
   * Get current conversation
   */
  getCurrentConversation(): ConversationState | null {
    if (!this.currentConversationId) return null;
    return this.conversations.get(this.currentConversationId) || null;
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): ConversationState | null {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * Handle user response to clarification
   */
  handleClarificationResponse(
    conversationId: string,
    response: string,
    questionContext?: any
  ): ConversationState | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return null;

    console.log('[McpConversationManager] Handling clarification response:', response);

    // Add to clarification history
    if (conversation.clarificationHistory.length > 0) {
      const lastQuestion = conversation.clarificationHistory[conversation.clarificationHistory.length - 1];
      lastQuestion.answer = response;
    }

    // Process the response based on current step
    if (conversation.currentStep === 'gathering_params') {
      this.processParameterResponse(conversation, response, questionContext);
    } else if (conversation.currentStep === 'clarifying') {
      this.processMcpClarificationResponse(conversation, response, questionContext);
    }

    conversation.lastActivity = new Date();
    return conversation;
  }

  /**
   * Process response to missing parameter question
   */
  private processParameterResponse(
    conversation: ConversationState,
    response: string,
    questionContext?: any
  ): void {
    if (!questionContext?.parameterName) return;

    const paramName = questionContext.parameterName;
    const paramType = questionContext.parameterType || 'string';

    // Parse response based on parameter type
    let parsedValue: any = response;

    switch (paramType) {
      case 'email':
        const emailMatch = response.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
        parsedValue = emailMatch ? emailMatch[0] : response;
        break;

      case 'date':
        parsedValue = this.parseUserDate(response);
        break;

      case 'number':
        const numberMatch = response.match(/\d+/);
        parsedValue = numberMatch ? parseInt(numberMatch[0]) : null;
        break;

      case 'boolean':
        parsedValue = /^(yes|y|true|1)$/i.test(response.trim());
        break;
    }

    // Store the parameter
    conversation.gatheredParameters[paramName] = parsedValue;

    // Remove from pending parameters
    conversation.pendingParameters = conversation.pendingParameters.filter(p => p !== paramName);

    console.log('[McpConversationManager] Processed parameter response:', {
      parameter: paramName,
      value: parsedValue,
      remaining: conversation.pendingParameters.length
    });
  }

  /**
   * Process response to MCP clarification question
   */
  private processMcpClarificationResponse(
    conversation: ConversationState,
    response: string,
    questionContext?: any
  ): void {
    // Store the MCP clarification response
    if (questionContext?.mcpParameter) {
      conversation.gatheredParameters[questionContext.mcpParameter] = response;
    }

    // If this was a selection from options, parse the selection
    if (questionContext?.options && Array.isArray(questionContext.options)) {
      const selectedIndex = this.parseSelection(response, questionContext.options);
      if (selectedIndex !== -1) {
        conversation.gatheredParameters[questionContext.mcpParameter] = questionContext.options[selectedIndex];
      }
    }

    console.log('[McpConversationManager] Processed MCP clarification:', {
      parameter: questionContext?.mcpParameter,
      response: response
    });
  }

  /**
   * Detect if MCP response contains clarification question
   */
  detectMcpClarification(mcpResponse: any): ClarificationResponse | null {
    try {
      if (!mcpResponse) return null;

    // Check for error responses that are actually questions
    const errorPatterns = [
      /Question:\s*(.+)/i,
      /Which\s+(.+)\?/i,
      /Please\s+(?:choose|select|specify)\s+(.+)/i,
      /Your\s+options\s+are:?\s*(.+)/i
    ];

    let errorMessage = '';

    // Helper function to safely convert any value to string
    const safeToString = (value: any): string => {
      if (typeof value === 'string') {
        return value;
      }
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        try {
          // If it's an object, try to extract a meaningful message
          if (value.message && typeof value.message === 'string') {
            return value.message;
          }
          if (value.error && typeof value.error === 'string') {
            return value.error;
          }
          if (value.text && typeof value.text === 'string') {
            return value.text;
          }
          // Fall back to JSON stringify for objects
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    };

    // Extract error message from various response formats with type safety
    if (mcpResponse.isError && mcpResponse.error) {
      errorMessage = safeToString(mcpResponse.error);
    } else if (mcpResponse.error) {
      errorMessage = safeToString(mcpResponse.error);
    } else if (mcpResponse.content && Array.isArray(mcpResponse.content)) {
      try {
        const parsed = JSON.parse(mcpResponse.content[0]?.text || '{}');
        if (parsed.isError && parsed.error) {
          errorMessage = safeToString(parsed.error);
        }
      } catch {
        // Not JSON, continue
      }
    }

    // Ensure errorMessage is a valid string
    errorMessage = safeToString(errorMessage).trim();

    if (!errorMessage) {
      console.log('[McpConversationManager] No valid error message found in response:', mcpResponse);
      return null;
    }

    console.log('[McpConversationManager] Extracted error message:', typeof errorMessage, errorMessage);

    // CRITICAL: Before showing clarification, check if we can auto-resolve with smart defaults
    const autoResolution = this.attemptAutoClarificationResolution(errorMessage);
    if (autoResolution) {
      console.log('[McpConversationManager] Auto-resolved clarification:', autoResolution);
      return autoResolution;
    }

    // Check if error message is actually a question
    for (const pattern of errorPatterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        const clarification: ClarificationResponse = {
          type: 'mcp_question',
          question: this.cleanupQuestionText(errorMessage),
          needsClarification: true,
          suggestedAnswers: [],
          context: 'MCP Error Response'
        };

        // Extract options if present
        const optionsMatch = errorMessage.match(/(?:options\s+are:?\s*)?['"]?([^'"]+)['"]?(?:,\s*['"]?([^'"]+)['"]?)*(?:\s+or\s+['"]?([^'"]+)['"]?)?/i);
        if (optionsMatch) {
          clarification.options = this.extractOptions(errorMessage);
        }

        console.log('[McpConversationManager] Detected MCP clarification:', clarification);
        return clarification;
      }
    }

    return null;

    } catch (error) {
      console.error('[McpConversationManager] Error in detectMcpClarification:', error);
      console.error('[McpConversationManager] Failed response object:', mcpResponse);

      // Return null to prevent cascading errors
      return null;
    }
  }

  /**
   * Generate clarification question for missing parameters
   */
  generateParameterQuestion(
    parameterName: string,
    parameterExtraction: ParameterExtraction,
    intent: string,
    originalQuery?: string
  ): ClarificationResponse {
    // FALLBACK RESOLUTION: Try to resolve with context-aware defaults before asking
    if (originalQuery) {
      const fallbackResult = this.tryFallbackParameterResolution(parameterName, parameterExtraction, intent, originalQuery);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    const suggestion = parameterExtraction.suggestedValues[parameterName];
    let question = `I need more information. `;

    switch (parameterName) {
      case 'to':
      case 'recipient':
        question += `What email address should I send this to?`;
        break;

      case 'subject':
        question += suggestion
          ? `What should the email subject be? (suggested: "${suggestion}")`
          : `What should the email subject be?`;
        break;

      case 'body':
      case 'message':
        question += `What should the message say?`;
        break;

      case 'start_time':
        question += suggestion
          ? `What time should the meeting be? (suggested: ${suggestion})`
          : `What time should the meeting be? Please specify a time like "2:00 PM" or "14:00"`;
        break;

      case 'title':
        question += suggestion
          ? `What should I call this event? (suggested: "${suggestion}")`
          : `What should I call this event?`;
        break;

      default:
        question += `Please provide the ${parameterName}.`;
    }

    const clarification: ClarificationResponse = {
      type: 'parameter_missing',
      question,
      parameterName,
      needsClarification: true,
      suggestedAnswers: [],
      context: 'Missing Parameter'
    };

    if (suggestion) {
      clarification.suggestions = [suggestion];
    }

    // Add helpful options for certain parameter types
    if (parameterName === 'start_time' && !suggestion) {
      clarification.options = ['9:00 AM', '10:00 AM', '2:00 PM', '3:00 PM', '4:00 PM'];
    }

    return clarification;
  }

  /**
   * Attempt to automatically resolve parameters using smart defaults before asking for clarification
   */
  private attemptParameterAutoResolution(conversation: ConversationState): void {
    if (!conversation.parameterExtraction || !conversation.intent) return;

    console.log('[McpConversationManager] Attempting parameter auto-resolution for:', conversation.intent);

    // Check if this is a "list all" context
    const userQuery = conversation.originalQuery || '';
    const isListAll = this.isListAllIntent(userQuery, conversation.intent);

    if (isListAll && conversation.pendingParameters.length > 0) {
      const resolvedParameters: { [key: string]: any } = {};

      for (const paramName of conversation.pendingParameters) {
        const smartDefault = this.getSmartDefaultForParameter(paramName, conversation.intent, userQuery);
        if (smartDefault !== null) {
          resolvedParameters[paramName] = smartDefault;
          console.log(`[McpConversationManager] Auto-resolved parameter '${paramName}' with default:`, smartDefault);
        }
      }

      // Apply resolved parameters
      if (Object.keys(resolvedParameters).length > 0) {
        conversation.parameterExtraction.validatedParameters = {
          ...conversation.parameterExtraction.validatedParameters,
          ...resolvedParameters
        };

        // Remove resolved parameters from pending list
        conversation.pendingParameters = conversation.pendingParameters.filter(
          paramName => !(paramName in resolvedParameters)
        );
      }
    }
  }

  /**
   * Check if the user intent and query indicate a "list all" request
   */
  private isListAllIntent(query: string, intent: string): boolean {
    const queryLower = query.toLowerCase();

    // Direct "list all" patterns
    if (queryLower.includes('list all') || queryLower.includes('show all') || queryLower.includes('get all')) {
      return true;
    }

    // Intent-specific patterns
    if (intent.includes('list') || intent.includes('get') || intent.includes('search')) {
      // Broad requests without specific filters
      if (queryLower.includes('my ') || queryLower.includes('all my ') ||
          queryLower.match(/^(what|show|list|get).*(are|is|on).*(my|the)/)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get smart default value for a parameter in "list all" contexts
   */
  private getSmartDefaultForParameter(paramName: string, intent: string, query: string): any {
    const paramNameLower = paramName.toLowerCase();
    const queryLower = query.toLowerCase();

    // Search-related parameters - use empty string for "list all"
    if (paramNameLower.includes('search') || paramNameLower.includes('query') ||
        paramNameLower.includes('title') || paramNameLower.includes('keyword') ||
        paramNameLower === 'q') {
      return '';
    }

    // Selection parameters - use "all" or empty
    if (paramNameLower.includes('select') || paramNameLower.includes('choice') || paramNameLower.includes('option')) {
      return 'all';
    }

    // Limit parameters for list operations
    if (paramNameLower.includes('limit') || paramNameLower.includes('count') || paramNameLower.includes('max')) {
      // If user specified a number, try to extract it
      const numberMatch = queryLower.match(/(\d+)/);
      if (numberMatch) {
        return parseInt(numberMatch[0]);
      }
      return 10; // Default reasonable limit
    }

    // Boolean parameters - default to true for inclusive listing
    // Note: We can't check param.type since we only have the parameter name
    if (paramNameLower.includes('bool') || paramNameLower.includes('flag') || paramNameLower.includes('enabled')) {
      return true;
    }

    // For other parameters in list contexts, return empty string
    if (intent.includes('list') || intent.includes('get') || intent.includes('search')) {
      return '';
    }

    return null; // No smart default available
  }

  /**
   * Try to resolve parameter with fallback values before showing clarification
   */
  private tryFallbackParameterResolution(
    parameterName: string,
    parameterExtraction: ParameterExtraction,
    intent: string,
    originalQuery: string
  ): ClarificationResponse | null {
    const queryLower = originalQuery.toLowerCase();

    console.log(`[McpConversationManager] Trying fallback resolution for parameter: ${parameterName}`);

    // Check if this looks like a "list all" or broad query
    const isBroadQuery = this.isListAllIntent(originalQuery, intent);

    if (isBroadQuery) {
      // For search/query parameters in broad contexts, auto-resolve with empty string
      if (this.isSearchParameter(parameterName)) {
        console.log(`[McpConversationManager] Fallback: Auto-resolving search parameter '${parameterName}' for broad query`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using empty search to list all items`,
          autoResponse: '',
          parameterName,
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Search'
        };
      }

      // For title parameters in Notion queries
      if (parameterName.toLowerCase().includes('title') && (intent.includes('notion') || intent.includes('page'))) {
        console.log(`[McpConversationManager] Fallback: Auto-resolving title parameter for broad Notion query`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using empty title to list all pages`,
          autoResponse: '',
          parameterName,
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Title'
        };
      }

      // For document query parameters
      if (parameterName === 'q' && (intent.includes('docs') || intent.includes('document'))) {
        console.log(`[McpConversationManager] Fallback: Auto-resolving query parameter for broad document search`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using empty query to list all documents`,
          autoResponse: '',
          parameterName,
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Document Query'
        };
      }
    }

    // Extract numbers for limit/count parameters
    if (this.isLimitParameter(parameterName)) {
      const numberMatch = queryLower.match(/(\d+)/);
      if (numberMatch) {
        const limit = parseInt(numberMatch[0]);
        console.log(`[McpConversationManager] Fallback: Auto-resolving limit parameter with extracted number: ${limit}`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using extracted limit of ${limit}`,
          autoResponse: limit.toString(),
          parameterName,
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Extracted Limit'
        };
      }
    }

    // For time-based parameters in calendar queries
    if (this.isTimeParameter(parameterName) && intent.includes('calendar')) {
      if (queryLower.includes('today')) {
        console.log(`[McpConversationManager] Fallback: Auto-resolving time parameter for 'today' query`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using today's date`,
          autoResponse: new Date().toISOString().split('T')[0],
          parameterName,
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Date'
        };
      }
    }

    return null; // No fallback resolution available
  }

  /**
   * Check if parameter name indicates a search/query parameter
   */
  private isSearchParameter(parameterName: string): boolean {
    const name = parameterName.toLowerCase();
    return name.includes('search') || name.includes('query') ||
           name.includes('keyword') || name === 'q' || name.includes('term');
  }

  /**
   * Check if parameter name indicates a limit/count parameter
   */
  private isLimitParameter(parameterName: string): boolean {
    const name = parameterName.toLowerCase();
    return name.includes('limit') || name.includes('count') ||
           name.includes('max') || name.includes('number');
  }

  /**
   * Check if parameter name indicates a time/date parameter
   */
  private isTimeParameter(parameterName: string): boolean {
    const name = parameterName.toLowerCase();
    return name.includes('time') || name.includes('date') ||
           name.includes('when') || name.includes('start') || name.includes('end');
  }

  /**
   * Check if conversation needs clarification
   */
  needsClarification(conversation: ConversationState): ClarificationResponse | null {
    if (!conversation.parameterExtraction) return null;

    // SMART DEFAULTS: Before asking for clarification, try to apply intelligent defaults
    this.attemptParameterAutoResolution(conversation);

    // Check for missing required parameters
    if (conversation.pendingParameters.length > 0) {
      const firstMissing = conversation.pendingParameters[0];
      return this.generateParameterQuestion(
        firstMissing,
        conversation.parameterExtraction,
        conversation.intent,
        conversation.originalQuery
      );
    }

    // Check for ambiguous intent
    if (conversation.classification && conversation.classification.confidence < 0.6) {
      return {
        type: 'ambiguous_intent',
        question: `I'm not sure what you'd like me to do. Did you mean to ${conversation.intent.replace('_', ' ')}?`,
        options: [
          'Yes, that\'s correct',
          'No, let me clarify'
        ],
        needsClarification: true,
        suggestedAnswers: ['Yes, that\'s correct', 'No, let me clarify'],
        context: 'Ambiguous Intent'
      };
    }

    return null;
  }

  /**
   * Add clarification to history
   */
  addClarificationToHistory(conversationId: string, question: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.clarificationHistory.push({
      question,
      answer: '', // Will be filled when user responds
      timestamp: new Date()
    });
  }

  /**
   * Record MCP error
   */
  recordMcpError(conversationId: string, error: string, toolName: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.mcpErrors.push({
      error,
      toolName,
      timestamp: new Date()
    });

    conversation.attempts += 1;
  }

  /**
   * Check if conversation should be terminated
   */
  shouldTerminate(conversation: ConversationState): boolean {
    return conversation.attempts >= conversation.maxAttempts ||
           conversation.currentStep === 'failed' ||
           (Date.now() - conversation.lastActivity.getTime()) > 300000; // 5 minutes timeout
  }

  /**
   * Complete conversation
   */
  completeConversation(conversationId: string, result?: any): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.currentStep = 'completed';
    conversation.lastActivity = new Date();

    if (result) {
      conversation.context.result = result;
    }

    console.log('[McpConversationManager] Completed conversation:', conversationId);
  }

  /**
   * Clean up old conversations
   */
  cleanupOldConversations(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [id, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActivity.getTime() > maxAge) {
        this.conversations.delete(id);
        console.log('[McpConversationManager] Cleaned up conversation:', id);
      }
    }
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(conversationId: string): string {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return 'Conversation not found';

    const lines: string[] = [];
    lines.push(`**Query:** ${conversation.originalQuery}`);
    lines.push(`**Intent:** ${conversation.intent || 'Unknown'}`);
    lines.push(`**Status:** ${conversation.currentStep}`);

    if (Object.keys(conversation.gatheredParameters).length > 0) {
      lines.push(`**Parameters:** ${JSON.stringify(conversation.gatheredParameters, null, 2)}`);
    }

    if (conversation.clarificationHistory.length > 0) {
      lines.push(`**Clarifications:** ${conversation.clarificationHistory.length}`);
    }

    if (conversation.mcpErrors.length > 0) {
      lines.push(`**Errors:** ${conversation.mcpErrors.length}`);
    }

    return lines.join('\n');
  }

  /**
   * CONTEXT RETENTION: Capture error context when MCP tool fails
   */
  captureErrorContext(
    conversationId: string,
    originalIntent: string,
    errorMessage: string,
    toolName: string,
    attemptedParameters: Record<string, any>,
    errorType: 'tool_error' | 'access_error' | 'parameter_error' | 'clarification_error' = 'tool_error'
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    console.log('[McpConversationManager] Capturing error context for conversation:', conversationId);
    console.log('[McpConversationManager] Original intent:', originalIntent);
    console.log('[McpConversationManager] Tool:', toolName, 'Error:', errorMessage);

    // Create conversational context for better UX
    const conversationalContext = this.generateConversationalContext(originalIntent, toolName, errorType);

    conversation.errorContext = {
      originalIntent,
      errorType,
      errorMessage,
      clarificationQuestion: '', // Will be filled when clarification is generated
      toolName,
      attemptedParameters,
      retryCount: (conversation.errorContext?.retryCount || 0),
      timestamp: new Date(),
      conversationalContext
    };

    // Update conversation step to clarifying
    conversation.currentStep = 'clarifying';
    conversation.lastActivity = new Date();

    console.log('[McpConversationManager] Error context captured:', conversation.errorContext);
  }

  /**
   * Update error context with the clarification question that will be shown to user
   */
  updateErrorContextWithClarification(conversationId: string, clarificationQuestion: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !conversation.errorContext) return;

    conversation.errorContext.clarificationQuestion = clarificationQuestion;
    console.log('[McpConversationManager] Updated error context with clarification:', clarificationQuestion);
  }

  /**
   * Check if conversation has error context that needs merging with user response
   */
  hasErrorContext(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    return !!(conversation?.errorContext);
  }

  /**
   * Get error context for conversation
   */
  getErrorContext(conversationId: string): ConversationState['errorContext'] | null {
    const conversation = this.conversations.get(conversationId);
    return conversation?.errorContext || null;
  }

  /**
   * Increment retry count for error context
   */
  incrementErrorRetryCount(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation?.errorContext) {
      conversation.errorContext.retryCount += 1;
      console.log('[McpConversationManager] Incremented retry count to:', conversation.errorContext.retryCount);
    }
  }

  /**
   * Clear error context after successful resolution
   */
  clearErrorContext(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.errorContext = undefined;
      console.log('[McpConversationManager] Cleared error context for conversation:', conversationId);
    }
  }

  /**
   * Generate conversational context for better error UX
   */
  private generateConversationalContext(
    originalIntent: string,
    toolName: string,
    errorType: string
  ): NonNullable<ConversationState['errorContext']>['conversationalContext'] {
    const intentLower = originalIntent.toLowerCase();
    const toolLower = toolName.toLowerCase();

    let taskDescription = '';
    let expectedOutcome = '';
    let suggestedAlternatives: string[] = [];

    // Tool-specific context generation
    if (toolLower.includes('google_docs') || toolLower.includes('docs')) {
      if (intentLower.includes('create')) {
        taskDescription = 'Creating a Google document';
        expectedOutcome = 'Document created and accessible in Google Drive';
        suggestedAlternatives = [
          'Create local text file preview',
          'Try different Google account',
          'Create with simplified content'
        ];
      } else if (intentLower.includes('find') || intentLower.includes('search')) {
        taskDescription = 'Searching Google documents';
        expectedOutcome = 'List of matching documents';
        suggestedAlternatives = [
          'Search in specific folder',
          'Try broader search terms',
          'Check document permissions'
        ];
      }
    } else if (toolLower.includes('gmail') || toolLower.includes('email')) {
      if (intentLower.includes('send')) {
        taskDescription = 'Sending an email';
        expectedOutcome = 'Email sent successfully';
        suggestedAlternatives = [
          'Save as draft',
          'Send with simplified content',
          'Try different recipient format'
        ];
      } else {
        taskDescription = 'Finding emails';
        expectedOutcome = 'List of matching emails';
        suggestedAlternatives = [
          'Search in different folder',
          'Broaden search criteria',
          'Check email connection'
        ];
      }
    } else if (toolLower.includes('calendar')) {
      if (intentLower.includes('create') || intentLower.includes('add')) {
        taskDescription = 'Creating calendar event';
        expectedOutcome = 'Event added to calendar';
        suggestedAlternatives = [
          'Create with basic details only',
          'Try different time slot',
          'Use default calendar'
        ];
      } else if (intentLower.includes('delete')) {
        taskDescription = 'Deleting calendar events';
        expectedOutcome = 'Events removed from calendar';
        suggestedAlternatives = [
          'Delete from primary calendar only',
          'Confirm event exists first',
          'Try specific date range'
        ];
      }
    } else if (toolLower.includes('slack')) {
      if (intentLower.includes('create') && intentLower.includes('channel')) {
        taskDescription = 'Creating Slack channel';
        expectedOutcome = 'Channel created and accessible';
        suggestedAlternatives = [
          'Create public channel instead',
          'Try different channel name',
          'Check Slack permissions'
        ];
      } else if (intentLower.includes('find') && intentLower.includes('channel')) {
        taskDescription = 'Finding Slack channels';
        expectedOutcome = 'List of matching channels';
        suggestedAlternatives = [
          'Search public channels only',
          'Try partial channel name',
          'Check Slack workspace access'
        ];
      }
    } else if (toolLower.includes('notion')) {
      if (intentLower.includes('create')) {
        taskDescription = 'Creating Notion page';
        expectedOutcome = 'Page created in Notion workspace';
        suggestedAlternatives = [
          'Create in default workspace',
          'Use template page',
          'Try simplified page structure'
        ];
      } else {
        taskDescription = 'Finding Notion pages';
        expectedOutcome = 'List of matching pages';
        suggestedAlternatives = [
          'Search in specific database',
          'Try partial title match',
          'Check page permissions'
        ];
      }
    }

    // Fallback for unknown tools
    if (!taskDescription) {
      taskDescription = `Using ${toolName}`;
      expectedOutcome = 'Task completed successfully';
      suggestedAlternatives = [
        'Try with simplified parameters',
        'Check service connection',
        'Use alternative approach'
      ];
    }

    return {
      taskDescription,
      expectedOutcome,
      suggestedAlternatives
    };
  }

  // Private helper methods

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseUserDate(input: string): Date | null {
    const today = new Date();

    // Handle relative dates
    if (input.toLowerCase().includes('today')) return new Date(today);
    if (input.toLowerCase().includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    // Try to parse as standard date
    const parsed = new Date(input);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseSelection(response: string, options: string[]): number {
    const lowerResponse = response.toLowerCase().trim();

    // Try to match by number (1, 2, 3...)
    const numberMatch = lowerResponse.match(/^\d+/);
    if (numberMatch) {
      const index = parseInt(numberMatch[0]) - 1;
      if (index >= 0 && index < options.length) return index;
    }

    // Try to match by content
    for (let i = 0; i < options.length; i++) {
      if (options[i].toLowerCase().includes(lowerResponse) ||
          lowerResponse.includes(options[i].toLowerCase())) {
        return i;
      }
    }

    return -1; // No match found
  }

  private cleanupQuestionText(text: string): string {
    // Remove "Question:" prefix and clean up formatting
    return text
      .replace(/^Question:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractOptions(text: string): string[] {
    try {
      // Type guard and sanitization
      if (typeof text !== 'string' || !text.trim()) {
        console.warn('[McpConversationManager] extractOptions: Invalid text input, returning empty array');
        return [];
      }

      const options: string[] = [];

      // Look for quoted options
      const quotedOptions = text.match(/'([^']+)'/g);
      if (quotedOptions && Array.isArray(quotedOptions)) {
        options.push(...quotedOptions.map(opt => opt.slice(1, -1)).filter(opt => opt && opt.trim()));
      }

      // Look for options separated by "or"
      const orPattern = /(?:are:?\s*)?([^,]+?)(?:\s*,\s*([^,]+?))*(?:\s*or\s+([^.]+?))?[.?]/i;
      const orMatch = text.match(orPattern);
      if (orMatch && Array.isArray(orMatch) && options.length === 0) {
        for (let i = 1; i < orMatch.length; i++) {
          if (orMatch[i] && typeof orMatch[i] === 'string') {
            const cleanOption = orMatch[i].replace(/['"]/g, '').trim();
            if (cleanOption) {
              options.push(cleanOption);
            }
          }
        }
      }

      return options;
    } catch (error) {
      console.error('[McpConversationManager] extractOptions: Error extracting options:', error);
      return [];
    }
  }

  /**
   * Attempt to automatically resolve common clarifications with smart defaults
   */
  private attemptAutoClarificationResolution(errorMessage: string): ClarificationResponse | null {
    // Defensive programming: ensure errorMessage is a string
    if (typeof errorMessage !== 'string') {
      console.warn('[McpConversationManager] attemptAutoClarificationResolution received non-string input:', typeof errorMessage, errorMessage);

      // Convert to string safely
      try {
        if (errorMessage === null || errorMessage === undefined) {
          return null;
        }
        errorMessage = String(errorMessage);
      } catch (error) {
        console.error('[McpConversationManager] Failed to convert errorMessage to string:', error);
        return null;
      }
    }

    // Additional safety check for empty strings
    if (!errorMessage || errorMessage.trim().length === 0) {
      console.log('[McpConversationManager] Empty or invalid error message, skipping auto-resolution');
      return null;
    }

    const messageLower = errorMessage.toLowerCase();

    console.log('[McpConversationManager] Attempting auto-resolution for:', errorMessage);

    // Auto-resolve "list all" patterns that are asking for search terms
    if (this.isListAllContext(errorMessage)) {

      // Pattern: "What title would you like to search for?" for Notion pages
      if (messageLower.includes('title') && (messageLower.includes('search') || messageLower.includes('find'))) {
        console.log('[McpConversationManager] Auto-resolving "list all" title search with empty string');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty search to list all pages',
          autoResponse: '',
          parameterName: 'title',
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Title Search'
        };
      }

      // Pattern: "specify if you want to search for documents containing a specific word or phrase"
      if ((messageLower.includes('documents containing') || messageLower.includes('specific word')) && messageLower.includes('search')) {
        console.log('[McpConversationManager] Auto-resolving "list all" document search with empty query');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty search to list all documents',
          autoResponse: '',
          parameterName: 'q',
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Document Search'
        };
      }

      // Pattern: "What query/keyword would you like to search for?" for documents
      if ((messageLower.includes('query') || messageLower.includes('keyword')) && messageLower.includes('search')) {
        console.log('[McpConversationManager] Auto-resolving "list all" query search with empty string');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty search to list all items',
          autoResponse: '',
          parameterName: 'query',
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Query Search'
        };
      }

      // Pattern: "Which [item] would you like to [action]?"
      if (messageLower.includes('which') && (messageLower.includes('would you like') || messageLower.includes('want to'))) {
        console.log('[McpConversationManager] Auto-resolving "list all" selection with "all" option');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Selecting all items',
          autoResponse: 'all',
          parameterName: 'selection',
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Selection'
        };
      }

      // Pattern: "Could you specify..." for list all queries
      if (messageLower.includes('could you specify') || messageLower.includes('please specify')) {
        console.log('[McpConversationManager] Auto-resolving "list all" specification with empty parameter');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty parameter to list all items',
          autoResponse: '',
          parameterName: 'search',
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Search'
        };
      }

      // Pattern: Questions about finding "all" items
      if (messageLower.includes('find all') || messageLower.includes('every document') || messageLower.includes('if you want every')) {
        console.log('[McpConversationManager] Auto-resolving "find all" query with wildcard');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using wildcard to find all items',
          autoResponse: '*',
          parameterName: 'search',
          needsClarification: false,
          suggestedAnswers: [],
          context: 'Auto-resolved Wildcard Search'
        };
      }
    }

    return null; // No auto-resolution possible
  }

  /**
   * Check if the current context suggests a "list all" pattern
   */
  private isListAllContext(errorMessage: string): boolean {
    // Defensive programming: ensure errorMessage is a string
    if (typeof errorMessage !== 'string' || !errorMessage || errorMessage.trim().length === 0) {
      console.warn('[McpConversationManager] isListAllContext received invalid input:', typeof errorMessage, errorMessage);
      return false;
    }

    // Check the clarification message for indicators that this was a "list all" request

    const listAllIndicators = [
      /find\s+all/i,
      /list\s+all/i,
      /show\s+all/i,
      /get\s+all/i,
      /every\s+\w+/i,
      /all\s+\w+/i,
      /retrieve\s+all/i,
      /if\s+you\s+want\s+(.+)?all\s+/i,
      /to\s+find\s+all/i,
      /list\s+everything/i,
      /empty.*find.*all/i,
      /if\s+you\s+want\s+every/i,
      /wildcard.*supported/i
    ];

    const messageMatches = listAllIndicators.some(pattern => pattern.test(errorMessage));

    // Also check if this is a generic "search for items" question which usually indicates list-all intent
    const genericSearchPatterns = [
      /what\s+.*\s+search\s+for/i,
      /specify.*word.*phrase/i,
      /containing.*specific/i
    ];

    const isGenericSearch = genericSearchPatterns.some(pattern => pattern.test(errorMessage));

    console.log('[McpConversationManager] List all context check:', {
      message: errorMessage.substring(0, 100),
      messageMatches,
      isGenericSearch,
      result: messageMatches || isGenericSearch
    });

    return messageMatches || isGenericSearch;
  }

  /* ---------- Error Parsing & Missing Parameter Extraction ---------- */

  /**
   * Parse MCP error message to extract missing parameter information
   */
  parseErrorForMissingParameters(mcpError: any): {
    hasMissingParameters: boolean;
    missingParameters: string[];
    errorType: 'missing_param' | 'invalid_param' | 'auth_error' | 'generic';
    originalError: string;
  } {
    const result = {
      hasMissingParameters: false,
      missingParameters: [] as string[],
      errorType: 'generic' as 'missing_param' | 'invalid_param' | 'auth_error' | 'generic',
      originalError: ''
    };

    try {
      // Convert error to string safely
      let errorMessage = '';
      if (typeof mcpError === 'string') {
        errorMessage = mcpError;
      } else if (mcpError && typeof mcpError === 'object') {
        if (mcpError.content && Array.isArray(mcpError.content)) {
          const textContent = mcpError.content.find((c: any) => c.type === 'text');
          if (textContent && textContent.text) {
            try {
              const parsed = JSON.parse(textContent.text);
              if (parsed.error && Array.isArray(parsed.error)) {
                errorMessage = parsed.error.join(' ');
              } else if (parsed.error) {
                errorMessage = String(parsed.error);
              }
            } catch {
              errorMessage = String(textContent.text);
            }
          }
        } else if (mcpError.error) {
          if (Array.isArray(mcpError.error)) {
            errorMessage = mcpError.error.join(' ');
          } else {
            errorMessage = String(mcpError.error);
          }
        } else {
          errorMessage = JSON.stringify(mcpError);
        }
      }

      result.originalError = errorMessage;

      // Missing parameter patterns - more comprehensive
      const missingParamPatterns = [
        /Required field\s*["']([^"']+)["']\s*\(([^)]+)\)\s*is missing/gi,
        /Missing required parameter[:\s]+["']?([^"'\s,]+)["']?/gi,
        /Parameter\s*["']([^"']+)["']\s*is required/gi,
        /Missing required field[:\s]+["']?([^"'\s,]+)["']?/gi,
        /Required\s+["']?([^"'\s,]+)["']?\s+parameter\s+not\s+provided/gi,
        /Field\s*["']([^"']+)["']\s*is required/gi
      ];

      console.log(`[McpConversationManager] Parsing error message: "${errorMessage}"`);

      // ENHANCED: Handle empty, minimal, or generic error messages
      if (!errorMessage || errorMessage.trim() === '' || errorMessage === '{}' || errorMessage === 'null' || errorMessage === 'undefined') {
        console.log(`[McpConversationManager] ⚠️  Empty/minimal error detected - treating as generic validation failure`);
        result.errorType = 'generic';
        result.originalError = errorMessage || '(empty error)';
        return result; // Don't try to extract parameters from empty errors
      }

      // Try to extract missing parameters from error message
      for (const pattern of missingParamPatterns) {
        let match;
        while ((match = pattern.exec(errorMessage)) !== null) {
          const paramName = match[2] || match[1]; // Use the parameter name from parentheses if available, otherwise the field name
          if (paramName && !result.missingParameters.includes(paramName)) {
            result.missingParameters.push(paramName);
            result.hasMissingParameters = true;
            result.errorType = 'missing_param' as 'missing_param';
            console.log(`[McpConversationManager] Found missing parameter: "${paramName}"`);
          }
        }
      }

      // ENHANCED: Check for specific error types
      const errorLower = errorMessage.toLowerCase();

      // Check for authentication errors
      if (errorLower.includes('auth') || errorLower.includes('permission') || errorLower.includes('unauthorized')) {
        result.errorType = 'auth_error' as 'auth_error';
      }

      // Check for invalid parameter errors
      else if (errorLower.includes('invalid') && errorLower.includes('parameter')) {
        result.errorType = 'invalid_param' as 'invalid_param';
      }

      // Check for schema validation errors (these are often empty/generic)
      else if (errorLower.includes('validation') || errorLower.includes('schema')) {
        result.errorType = 'generic'; // These are often not recoverable through parameter changes
        console.log(`[McpConversationManager] Schema/validation error detected - likely not recoverable through parameters`);
      }

      // ENHANCED: Provide more context for empty results
      if (!result.hasMissingParameters && result.errorType === 'generic') {
        if (errorMessage.length > 0) {
          console.log(`[McpConversationManager] ℹ️  Generic error with message: "${errorMessage}" - not recoverable through parameter changes`);
        } else {
          console.log(`[McpConversationManager] ℹ️  Empty error - tool may have failed silently or have internal issues`);
        }
      }

      console.log(`[McpConversationManager] Error parsing result:`, result);
      return result;

    } catch (error) {
      console.error('[McpConversationManager] Error parsing MCP error:', error);
      return result; // Return default empty result
    }
  }

  /**
   * Generate clarification request for missing parameters
   */
  generateMissingParameterClarification(
    missingParams: string[],
    toolName: string,
    originalIntent: string
  ): ClarificationResponse {
    try {
      if (missingParams.length === 0) {
        return {
          type: 'auto_resolved',
          needsClarification: false,
          question: '',
          suggestedAnswers: [],
          context: 'no_missing_params',
          autoResponse: '',
          parameterName: ''
        };
      }

      const toolNameClean = toolName.split('.').pop() || toolName;
      let question = '';
      let suggestedAnswers: string[] = [];
      let context = 'missing_parameters';

      if (missingParams.length === 1) {
        const param = missingParams[0];
        question = this.generateSingleParameterQuestion(param, toolNameClean, originalIntent);
        suggestedAnswers = this.generateParameterSuggestions(param, toolNameClean, originalIntent);
      } else {
        question = this.generateMultiParameterQuestion(missingParams, toolNameClean, originalIntent);
        context = 'multiple_missing_parameters';
      }

      console.log(`[McpConversationManager] Generated missing parameter clarification:`, {
        question,
        suggestedAnswers,
        context,
        missingParams
      });

      return {
        type: 'parameter_missing',
        needsClarification: true,
        question,
        suggestedAnswers,
        context,
        parameterName: missingParams[0] || ''
      };

    } catch (error) {
      console.error('[McpConversationManager] Error generating missing parameter clarification:', error);
      return {
        type: 'validation_error',
        needsClarification: true,
        question: `I need more information to use the ${toolName} tool. Could you provide the missing details?`,
        suggestedAnswers: [],
        context: 'error_fallback'
      };
    }
  }

  /**
   * Generate question for single missing parameter
   */
  private generateSingleParameterQuestion(param: string, toolName: string, intent: string): string {
    const paramLower = param.toLowerCase();

    // Board parameter
    if (paramLower.includes('board')) {
      return `Which board would you like me to search? Please specify the board name or say "all" to search all boards.`;
    }

    // Query/Search parameter
    if (paramLower.includes('query') || paramLower.includes('search')) {
      return `What would you like me to search for? Please provide search terms or keywords.`;
    }

    // Email recipient
    if (paramLower.includes('to') || paramLower.includes('recipient')) {
      return `Who should I send this email to? Please provide the email address.`;
    }

    // Subject
    if (paramLower.includes('subject')) {
      return `What should be the subject of the email?`;
    }

    // Date/Time
    if (paramLower.includes('date') || paramLower.includes('time')) {
      return `What date or time are you referring to? (e.g., "today", "tomorrow", "2024-01-15")`;
    }

    // Generic fallback
    return `The ${toolName} tool needs a "${param}" parameter. Could you provide this information?`;
  }

  /**
   * Generate question for multiple missing parameters
   */
  private generateMultiParameterQuestion(params: string[], toolName: string, intent: string): string {
    const paramList = params.map(p => `"${p}"`).join(', ');
    return `To use the ${toolName} tool, I need the following information: ${paramList}. Could you provide these details?`;
  }

  /**
   * Generate parameter suggestions based on parameter type and context
   */
  private generateParameterSuggestions(param: string, toolName: string, intent: string): string[] {
    const paramLower = param.toLowerCase();
    const suggestions: string[] = [];

    // Board parameter suggestions
    if (paramLower.includes('board')) {
      suggestions.push('all', 'main', 'project', 'todo', 'work');
    }

    // Date parameter suggestions
    if (paramLower.includes('date') || paramLower.includes('time')) {
      suggestions.push('today', 'tomorrow', 'this week', 'next week');
    }

    // Query parameter suggestions
    if (paramLower.includes('query') || paramLower.includes('search')) {
      // Try to extract potential search terms from the original intent
      const words = intent.split(' ').filter(w => w.length > 3);
      suggestions.push(...words.slice(0, 3));
    }

    return suggestions;
  }

  /**
   * Check if error is recoverable through parameter collection
   */
  isRecoverableParameterError(errorAnalysis: ReturnType<typeof this.parseErrorForMissingParameters>): boolean {
    return errorAnalysis.errorType === 'missing_param' &&
           errorAnalysis.hasMissingParameters &&
           errorAnalysis.missingParameters.length > 0 &&
           errorAnalysis.missingParameters.length <= 3; // Don't try to recover if too many missing params
  }
}