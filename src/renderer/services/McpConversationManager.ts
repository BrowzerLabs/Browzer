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
}

export interface ClarificationResponse {
  type: 'mcp_question' | 'parameter_missing' | 'validation_error' | 'ambiguous_intent' | 'auto_resolved';
  question: string;
  options?: string[];
  parameterName?: string;
  expectedFormat?: string;
  suggestions?: any[];
  autoResponse?: string; // The automatic response to use instead of asking user
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
    if (!mcpResponse) return null;

    // Check for error responses that are actually questions
    const errorPatterns = [
      /Question:\s*(.+)/i,
      /Which\s+(.+)\?/i,
      /Please\s+(?:choose|select|specify)\s+(.+)/i,
      /Your\s+options\s+are:?\s*(.+)/i
    ];

    let errorMessage = '';

    // Extract error message from various response formats
    if (mcpResponse.isError && mcpResponse.error) {
      errorMessage = mcpResponse.error;
    } else if (mcpResponse.error) {
      errorMessage = mcpResponse.error;
    } else if (mcpResponse.content && Array.isArray(mcpResponse.content)) {
      try {
        const parsed = JSON.parse(mcpResponse.content[0]?.text || '{}');
        if (parsed.isError && parsed.error) {
          errorMessage = parsed.error;
        }
      } catch {
        // Not JSON, continue
      }
    }

    if (!errorMessage) return null;

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
          question: this.cleanupQuestionText(errorMessage)
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
      parameterName
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
          parameterName
        };
      }

      // For title parameters in Notion queries
      if (parameterName.toLowerCase().includes('title') && (intent.includes('notion') || intent.includes('page'))) {
        console.log(`[McpConversationManager] Fallback: Auto-resolving title parameter for broad Notion query`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using empty title to list all pages`,
          autoResponse: '',
          parameterName
        };
      }

      // For document query parameters
      if (parameterName === 'q' && (intent.includes('docs') || intent.includes('document'))) {
        console.log(`[McpConversationManager] Fallback: Auto-resolving query parameter for broad document search`);
        return {
          type: 'auto_resolved',
          question: `Auto-resolved: Using empty query to list all documents`,
          autoResponse: '',
          parameterName
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
          parameterName
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
          parameterName
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
        ]
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
    const options: string[] = [];

    // Look for quoted options
    const quotedOptions = text.match(/'([^']+)'/g);
    if (quotedOptions) {
      options.push(...quotedOptions.map(opt => opt.slice(1, -1)));
    }

    // Look for options separated by "or"
    const orPattern = /(?:are:?\s*)?([^,]+?)(?:\s*,\s*([^,]+?))*(?:\s*or\s+([^.]+?))?[.?]/i;
    const orMatch = text.match(orPattern);
    if (orMatch && options.length === 0) {
      for (let i = 1; i < orMatch.length; i++) {
        if (orMatch[i]) {
          options.push(orMatch[i].replace(/['"]/g, '').trim());
        }
      }
    }

    return options;
  }

  /**
   * Attempt to automatically resolve common clarifications with smart defaults
   */
  private attemptAutoClarificationResolution(errorMessage: string): ClarificationResponse | null {
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
          parameterName: 'title'
        };
      }

      // Pattern: "specify if you want to search for documents containing a specific word or phrase"
      if ((messageLower.includes('documents containing') || messageLower.includes('specific word')) && messageLower.includes('search')) {
        console.log('[McpConversationManager] Auto-resolving "list all" document search with empty query');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty search to list all documents',
          autoResponse: '',
          parameterName: 'q'
        };
      }

      // Pattern: "What query/keyword would you like to search for?" for documents
      if ((messageLower.includes('query') || messageLower.includes('keyword')) && messageLower.includes('search')) {
        console.log('[McpConversationManager] Auto-resolving "list all" query search with empty string');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty search to list all items',
          autoResponse: '',
          parameterName: 'query'
        };
      }

      // Pattern: "Which [item] would you like to [action]?"
      if (messageLower.includes('which') && (messageLower.includes('would you like') || messageLower.includes('want to'))) {
        console.log('[McpConversationManager] Auto-resolving "list all" selection with "all" option');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Selecting all items',
          autoResponse: 'all',
          parameterName: 'selection'
        };
      }

      // Pattern: "Could you specify..." for list all queries
      if (messageLower.includes('could you specify') || messageLower.includes('please specify')) {
        console.log('[McpConversationManager] Auto-resolving "list all" specification with empty parameter');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using empty parameter to list all items',
          autoResponse: '',
          parameterName: 'search'
        };
      }

      // Pattern: Questions about finding "all" items
      if (messageLower.includes('find all') || messageLower.includes('every document') || messageLower.includes('if you want every')) {
        console.log('[McpConversationManager] Auto-resolving "find all" query with wildcard');
        return {
          type: 'auto_resolved',
          question: 'Auto-resolved: Using wildcard to find all items',
          autoResponse: '*',
          parameterName: 'search'
        };
      }
    }

    return null; // No auto-resolution possible
  }

  /**
   * Check if the current context suggests a "list all" pattern
   */
  private isListAllContext(errorMessage: string): boolean {
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
}