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
  type: 'mcp_question' | 'parameter_missing' | 'validation_error' | 'ambiguous_intent';
  question: string;
  options?: string[];
  parameterName?: string;
  expectedFormat?: string;
  suggestions?: any[];
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
    intent: string
  ): ClarificationResponse {
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
   * Check if conversation needs clarification
   */
  needsClarification(conversation: ConversationState): ClarificationResponse | null {
    if (!conversation.parameterExtraction) return null;

    // Check for missing required parameters
    if (conversation.pendingParameters.length > 0) {
      const firstMissing = conversation.pendingParameters[0];
      return this.generateParameterQuestion(
        firstMissing,
        conversation.parameterExtraction,
        conversation.intent
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
}