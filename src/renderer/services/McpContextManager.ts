export interface ContextVariable {
  name: string;
  value: any;
  type: 'string' | 'number' | 'object' | 'array' | 'boolean';
  source: string; // Which step produced this
  timestamp: number;
}

export interface ContextState {
  variables: Map<string, ContextVariable>;
  stepResults: Map<string, any>;
  metadata: {
    workflowId: string;
    startTime: number;
    currentStep?: string;
  };
}

export interface DataTransformation {
  fromVariable: string;
  toParameter: string;
  transform?: (value: any) => any;
  required: boolean;
}

/**
 * Phase 2 Week 4: Multi-Tool Context Manager
 * Manages data flow and variable passing between workflow steps
 */
export class McpContextManager {
  private contexts: Map<string, ContextState> = new Map();

  /**
   * Initialize context for a new workflow
   */
  initializeContext(workflowId: string): ContextState {
    console.log('[McpContextManager] Initializing context for workflow:', workflowId);

    const context: ContextState = {
      variables: new Map(),
      stepResults: new Map(),
      metadata: {
        workflowId,
        startTime: Date.now()
      }
    };

    this.contexts.set(workflowId, context);
    return context;
  }

  /**
   * Store result from a workflow step
   */
  storeStepResult(workflowId: string, stepId: string, result: any, outputVariable?: string): void {
    const context = this.getContext(workflowId);
    if (!context) {
      console.error('[McpContextManager] Context not found for workflow:', workflowId);
      return;
    }

    console.log(`[McpContextManager] Storing result for step ${stepId}:`, result);

    // Store the raw result
    context.stepResults.set(stepId, result);

    // If step defines an output variable, create it
    if (outputVariable) {
      this.setVariable(workflowId, outputVariable, result, stepId);
    }

    // Auto-extract common data patterns
    this.autoExtractVariables(workflowId, stepId, result);
  }

  /**
   * Set a context variable
   */
  setVariable(workflowId: string, name: string, value: any, source: string): void {
    const context = this.getContext(workflowId);
    if (!context) {
      console.error('[McpContextManager] Context not found for workflow:', workflowId);
      return;
    }

    const variable: ContextVariable = {
      name,
      value,
      type: this.getValueType(value),
      source,
      timestamp: Date.now()
    };

    context.variables.set(name, variable);
    console.log(`[McpContextManager] Set variable ${name} = ${JSON.stringify(value)} (from ${source})`);
  }

  /**
   * Get a context variable
   */
  getVariable(workflowId: string, name: string): ContextVariable | undefined {
    const context = this.getContext(workflowId);
    if (!context) {
      console.error('[McpContextManager] Context not found for workflow:', workflowId);
      return undefined;
    }

    return context.variables.get(name);
  }

  /**
   * Get all variables for a workflow
   */
  getAllVariables(workflowId: string): Map<string, ContextVariable> {
    const context = this.getContext(workflowId);
    return context ? context.variables : new Map();
  }

  /**
   * Transform parameters using context variables
   */
  transformParameters(workflowId: string, stepId: string, parameters: Record<string, any>): Record<string, any> {
    const context = this.getContext(workflowId);
    if (!context) {
      console.error('[McpContextManager] Context not found for workflow:', workflowId);
      return parameters;
    }

    console.log(`[McpContextManager] Transforming parameters for step ${stepId}:`, parameters);

    let transformedParams = { ...parameters };

    // Look for variable references in parameters
    for (const [key, value] of Object.entries(transformedParams)) {
      if (typeof value === 'string') {
        transformedParams[key] = this.substituteVariables(workflowId, value);
      }
    }

    // Apply common transformations
    transformedParams = this.applyCommonTransformations(workflowId, stepId, transformedParams);

    console.log(`[McpContextManager] Transformed parameters:`, transformedParams);
    return transformedParams;
  }

  /**
   * Substitute variable references in text
   */
  private substituteVariables(workflowId: string, text: string): string {
    const context = this.getContext(workflowId);
    if (!context) return text;

    let result = text;

    // Replace ${variableName} patterns
    const variablePattern = /\$\{(\w+)\}/g;
    result = result.replace(variablePattern, (match, variableName) => {
      const variable = context.variables.get(variableName);
      if (variable) {
        console.log(`[McpContextManager] Substituted ${match} with:`, variable.value);
        return String(variable.value);
      }
      return match;
    });

    // Replace common implicit references
    result = this.substituteImplicitReferences(workflowId, result);

    return result;
  }

  /**
   * Handle implicit variable references (context-aware)
   */
  private substituteImplicitReferences(workflowId: string, text: string): string {
    const context = this.getContext(workflowId);
    if (!context) return text;

    let result = text;

    // If text mentions "board" and we have a board_id variable
    if (result.toLowerCase().includes('board') && !result.includes('${')) {
      for (const [varName, variable] of context.variables) {
        if (varName.includes('board_id') || varName.includes('board')) {
          result = result.replace(/\bboard\b/gi, String(variable.value));
          console.log(`[McpContextManager] Implicit substitution: board → ${variable.value}`);
          break;
        }
      }
    }

    // Similar for other common patterns
    const patterns = [
      { keyword: 'email', varPattern: /email|message/ },
      { keyword: 'ticket', varPattern: /ticket|issue/ },
      { keyword: 'file', varPattern: /file|document/ },
      { keyword: 'user', varPattern: /user|person|contact/ }
    ];

    for (const pattern of patterns) {
      if (result.toLowerCase().includes(pattern.keyword)) {
        for (const [varName, variable] of context.variables) {
          if (pattern.varPattern.test(varName.toLowerCase())) {
            // Only substitute if it makes sense contextually
            if (this.isReasonableSubstitution(result, pattern.keyword, variable.value)) {
              result = result.replace(new RegExp(`\\b${pattern.keyword}\\b`, 'gi'), String(variable.value));
              console.log(`[McpContextManager] Implicit substitution: ${pattern.keyword} → ${variable.value}`);
              break;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Check if a substitution makes contextual sense
   */
  private isReasonableSubstitution(text: string, keyword: string, value: any): boolean {
    // Don't substitute if the value is too long or complex
    const valueStr = String(value);
    if (valueStr.length > 50) return false;

    // Don't substitute if it would create nonsensical text
    if (typeof value === 'object' && value !== null) return false;

    return true;
  }

  /**
   * Apply common parameter transformations
   */
  private applyCommonTransformations(workflowId: string, stepId: string, parameters: Record<string, any>): Record<string, any> {
    const context = this.getContext(workflowId);
    if (!context) return parameters;

    const transformed = { ...parameters };

    // Enhanced JIRA workflow transformations
    if (!transformed.boardId && !transformed.board) {
      const boardVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('board_id') || v.name.includes('board')
      );
      if (boardVar) {
        transformed.boardId = boardVar.value;
        console.log('[McpContextManager] Auto-applied board ID:', boardVar.value);
      }
    }

    // JIRA: if we need project key and have board info
    if (!transformed.projectKey && !transformed.project) {
      const boardVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('board') && v.value && typeof v.value === 'object'
      );
      if (boardVar?.value?.projectKey) {
        transformed.projectKey = boardVar.value.projectKey;
        console.log('[McpContextManager] Auto-extracted project key:', boardVar.value.projectKey);
      }
    }

    // Enhanced email workflow transformations
    if (!transformed.emailContent && !transformed.content) {
      const emailVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('email') && Array.isArray(v.value)
      );
      if (emailVar && emailVar.value.length > 0) {
        transformed.emailContent = emailVar.value[0]; // Use first email
        console.log('[McpContextManager] Auto-applied email content');
      }
    }

    // Email: extract sender info for replies
    if (!transformed.replyTo && !transformed.to) {
      const emailVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('email') && v.value?.from
      );
      if (emailVar?.value?.from) {
        transformed.replyTo = emailVar.value.from;
        console.log('[McpContextManager] Auto-applied reply-to:', emailVar.value.from);
      }
    }

    // File workflow: if we need file path and have files
    if (!transformed.filePath && !transformed.file) {
      const fileVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('file') && typeof v.value === 'string'
      );
      if (fileVar) {
        transformed.filePath = fileVar.value;
        console.log('[McpContextManager] Auto-applied file path:', fileVar.value);
      }
    }

    // Calendar workflow: extract meeting details
    if (!transformed.eventTitle && !transformed.title) {
      const emailVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('email') && v.value?.subject
      );
      if (emailVar?.value?.subject) {
        transformed.eventTitle = `Meeting: ${emailVar.value.subject}`;
        console.log('[McpContextManager] Auto-generated event title:', transformed.eventTitle);
      }
    }

    // Generic ID extraction for any step that needs an ID
    if (!transformed.id && !transformed.itemId) {
      const idVar = Array.from(context.variables.values()).find(v =>
        v.name.includes('id') && v.value
      );
      if (idVar) {
        transformed.id = idVar.value;
        console.log('[McpContextManager] Auto-applied ID:', idVar.value);
      }
    }

    return transformed;
  }

  /**
   * Auto-extract variables from step results
   */
  private autoExtractVariables(workflowId: string, stepId: string, result: any): void {
    console.log(`[McpContextManager] Auto-extracting variables from step ${stepId} result`);

    try {
      // Handle different result formats
      if (typeof result === 'string') {
        this.extractFromText(workflowId, stepId, result);
      } else if (typeof result === 'object' && result !== null) {
        this.extractFromObject(workflowId, stepId, result);
      }
    } catch (error) {
      console.error('[McpContextManager] Error auto-extracting variables:', error);
    }
  }

  /**
   * Extract variables from text results
   */
  private extractFromText(workflowId: string, stepId: string, text: string): void {
    // Extract IDs from text
    const idMatches = text.match(/\b(id|ID):\s*([^\s,\n]+)/g);
    if (idMatches) {
      idMatches.forEach(match => {
        const [, , value] = match.match(/\b(id|ID):\s*([^\s,\n]+)/) || [];
        if (value) {
          this.setVariable(workflowId, `extracted_id_${stepId}`, value, stepId);
        }
      });
    }

    // Extract other common patterns
    const patterns = [
      { regex: /board[:\s]+([^\s,\n]+)/i, name: 'board_name' },
      { regex: /ticket[:\s]+([^\s,\n]+)/i, name: 'ticket_id' },
      { regex: /email[:\s]+([^\s,\n]+)/i, name: 'email_address' }
    ];

    patterns.forEach(pattern => {
      const match = text.match(pattern.regex);
      if (match && match[1]) {
        this.setVariable(workflowId, `${pattern.name}_${stepId}`, match[1], stepId);
      }
    });
  }

  /**
   * Extract variables from object results
   */
  private extractFromObject(workflowId: string, stepId: string, obj: any): void {
    // Handle MCP response format
    if (obj.content && Array.isArray(obj.content)) {
      // MCP tool response
      const content = obj.content[0];
      if (content && content.type === 'text') {
        this.extractFromText(workflowId, stepId, content.text);
      }
    }

    // Handle direct object data
    if (obj.id) {
      this.setVariable(workflowId, `id_${stepId}`, obj.id, stepId);
    }

    // Enhanced Gmail-specific extraction
    if (obj.threadId || obj.thread_id) {
      this.setVariable(workflowId, `thread_id_${stepId}`, obj.threadId || obj.thread_id, stepId);
    }
    if (obj.messageId || obj.message_id) {
      this.setVariable(workflowId, `message_id_${stepId}`, obj.messageId || obj.message_id, stepId);
    }
    if (obj.from) {
      this.setVariable(workflowId, `email_from_${stepId}`, obj.from, stepId);
    }
    if (obj.to) {
      this.setVariable(workflowId, `email_to_${stepId}`, obj.to, stepId);
    }
    if (obj.subject) {
      this.setVariable(workflowId, `email_subject_${stepId}`, obj.subject, stepId);
    }
    if (obj.body || obj.snippet) {
      this.setVariable(workflowId, `email_body_${stepId}`, obj.body || obj.snippet, stepId);
    }

    // Enhanced Google Calendar-specific extraction
    if (obj.eventId || obj.event_id) {
      this.setVariable(workflowId, `event_id_${stepId}`, obj.eventId || obj.event_id, stepId);
    }
    if (obj.summary || obj.title) {
      this.setVariable(workflowId, `event_title_${stepId}`, obj.summary || obj.title, stepId);
    }
    if (obj.start) {
      if (obj.start.dateTime) {
        this.setVariable(workflowId, `event_start_${stepId}`, obj.start.dateTime, stepId);
      } else if (obj.start.date) {
        this.setVariable(workflowId, `event_date_${stepId}`, obj.start.date, stepId);
      }
    }
    if (obj.end) {
      if (obj.end.dateTime) {
        this.setVariable(workflowId, `event_end_${stepId}`, obj.end.dateTime, stepId);
      }
    }
    if (obj.location) {
      this.setVariable(workflowId, `event_location_${stepId}`, obj.location, stepId);
    }
    if (obj.attendees && Array.isArray(obj.attendees)) {
      this.setVariable(workflowId, `event_attendees_${stepId}`, obj.attendees, stepId);
    }

    // Handle arrays of objects (like lists of emails, events, tickets, etc.)
    if (Array.isArray(obj)) {
      this.setVariable(workflowId, `list_${stepId}`, obj, stepId);

      // Extract IDs from array items
      const ids = obj.filter(item => item && item.id).map(item => item.id);
      if (ids.length > 0) {
        this.setVariable(workflowId, `ids_${stepId}`, ids, stepId);
      }

      // Gmail-specific array handling
      if (obj.length > 0 && obj[0].threadId) {
        const threadIds = obj.map(item => item.threadId).filter(id => id);
        if (threadIds.length > 0) {
          this.setVariable(workflowId, `thread_ids_${stepId}`, threadIds, stepId);
        }
      }

      // Calendar-specific array handling
      if (obj.length > 0 && obj[0].summary) {
        const eventTitles = obj.map(item => item.summary).filter(title => title);
        if (eventTitles.length > 0) {
          this.setVariable(workflowId, `event_titles_${stepId}`, eventTitles, stepId);
        }
      }

      // Extract first item for easy access
      if (obj.length > 0) {
        this.setVariable(workflowId, `first_${stepId}`, obj[0], stepId);
      }
    }

    // Look for common properties
    const commonProps = ['name', 'title', 'subject', 'status', 'type', 'description'];
    commonProps.forEach(prop => {
      if (obj[prop]) {
        this.setVariable(workflowId, `${prop}_${stepId}`, obj[prop], stepId);
      }
    });
  }

  /**
   * Get context for workflow
   */
  getContext(workflowId: string): ContextState | undefined {
    return this.contexts.get(workflowId);
  }

  /**
   * Determine value type
   */
  private getValueType(value: any): ContextVariable['type'] {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'object';
    if (typeof value === 'object') return 'object';
    return typeof value as ContextVariable['type'];
  }

  /**
   * Clean up context when workflow is complete
   */
  cleanupContext(workflowId: string): void {
    console.log('[McpContextManager] Cleaning up context for workflow:', workflowId);
    this.contexts.delete(workflowId);
  }

  /**
   * Get context summary for debugging
   */
  getContextSummary(workflowId: string): string {
    const context = this.getContext(workflowId);
    if (!context) return 'Context not found';

    let summary = `Context for workflow: ${workflowId}\n`;
    summary += `Variables (${context.variables.size}):\n`;

    for (const [name, variable] of context.variables) {
      const valuePreview = typeof variable.value === 'string' && variable.value.length > 50 ?
        variable.value.substring(0, 50) + '...' :
        JSON.stringify(variable.value);

      summary += `  ${name} (${variable.type}) = ${valuePreview} [from ${variable.source}]\n`;
    }

    summary += `Step Results (${context.stepResults.size}):\n`;
    for (const [stepId] of context.stepResults) {
      summary += `  ${stepId}\n`;
    }

    return summary;
  }

  /**
   * Check if context has required variables for next step
   */
  validateContextForStep(workflowId: string, requiredVariables: string[]): { valid: boolean; missing: string[] } {
    const context = this.getContext(workflowId);
    if (!context) {
      return { valid: false, missing: requiredVariables };
    }

    const missing = requiredVariables.filter(varName => !context.variables.has(varName));

    return {
      valid: missing.length === 0,
      missing
    };
  }
}