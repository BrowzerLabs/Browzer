/**
 * MCP Query Analyzer Service
 *
 * Intelligently analyzes user queries to understand intent, extract entities,
 * and prepare structured information for MCP tool execution.
 */

export interface EntityExtraction {
  dates: Date[];
  times: string[];
  emails: string[];
  names: string[];
  subjects: string[];
  actions: string[];
  numbers: number[];
}

export interface QueryAnalysis {
  originalQuery: string;
  intent: string;
  confidence: number;
  entities: EntityExtraction;
  requiredParameters: string[];
  missingParameters: string[];
  suggestedDefaults: Record<string, any>;
  isAmbiguous: boolean;
  clarificationNeeded: boolean;
  contextualInfo: Record<string, any>;
}

export class McpQueryAnalyzer {
  private datePatterns = [
    /\b(today|tomorrow|yesterday)\b/i,
    /\b(this|next|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i
  ];

  private timePatterns = [
    /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i,
    /\b(\d{1,2})\s*(am|pm)\b/i,
    /\b(morning|afternoon|evening|night)\b/i,
    /\b(noon|midnight)\b/i
  ];

  private emailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  ];

  private intentKeywords = {
    email_send: ['send', 'compose', 'write', 'email', 'message', 'mail'],
    email_read: ['get', 'show', 'read', 'find', 'search', 'emails', 'inbox'],
    email_reply: ['reply', 'respond', 'answer'],
    calendar_create: ['schedule', 'book', 'set', 'create', 'add', 'meeting', 'appointment', 'event'],
    calendar_delete: ['delete', 'remove', 'cancel', 'clear', 'events', 'meetings'],
    calendar_read: ['show', 'get', 'list', 'calendar', 'events', 'schedule', 'meetings'],
    calendar_update: ['update', 'modify', 'change', 'reschedule', 'move']
  };

  /**
   * Analyze a user query and extract structured information
   */
  async analyzeQuery(query: string, context?: Record<string, any>): Promise<QueryAnalysis> {
    console.log('[McpQueryAnalyzer] Analyzing query:', query);

    const entities = this.extractEntities(query);
    const intent = this.classifyIntent(query, entities);
    const confidence = this.calculateConfidence(query, intent, entities);

    const analysis: QueryAnalysis = {
      originalQuery: query,
      intent,
      confidence,
      entities,
      requiredParameters: this.getRequiredParameters(intent),
      missingParameters: [],
      suggestedDefaults: this.generateDefaults(query, entities, context),
      isAmbiguous: confidence < 0.7,
      clarificationNeeded: false,
      contextualInfo: this.extractContextualInfo(query, entities, context)
    };

    // Determine missing parameters
    analysis.missingParameters = this.findMissingParameters(analysis);
    analysis.clarificationNeeded = analysis.missingParameters.length > 0 || analysis.isAmbiguous;

    console.log('[McpQueryAnalyzer] Analysis result:', analysis);
    return analysis;
  }

  /**
   * Extract entities (dates, times, emails, etc.) from query
   */
  private extractEntities(query: string): EntityExtraction {
    const entities: EntityExtraction = {
      dates: [],
      times: [],
      emails: [],
      names: [],
      subjects: [],
      actions: [],
      numbers: []
    };

    // Extract dates
    entities.dates = this.extractDates(query);

    // Extract times
    entities.times = this.extractTimes(query);

    // Extract emails
    const emailMatches = query.match(this.emailPatterns[0]);
    if (emailMatches) {
      entities.emails = emailMatches;
    }

    // Extract numbers (for quantities like "1 email", "2 events")
    const numberMatches = query.match(/\b(\d+)\b/g);
    if (numberMatches) {
      entities.numbers = numberMatches.map(n => parseInt(n));
    }

    // Extract potential names (capitalized words that aren't common words)
    const nameMatches = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (nameMatches) {
      const commonWords = ['Today', 'Tomorrow', 'Yesterday', 'Morning', 'Afternoon', 'Evening', 'Meeting', 'Email', 'Calendar'];
      entities.names = nameMatches.filter(name => !commonWords.includes(name));
    }

    // Extract potential subjects (quoted text or text after "about", "regarding")
    const subjectMatches = query.match(/(?:about|regarding|subject|re:)\s+([^,\.]+)/i);
    if (subjectMatches) {
      entities.subjects = [subjectMatches[1].trim()];
    }

    return entities;
  }

  /**
   * Extract dates with smart interpretation
   */
  private extractDates(query: string): Date[] {
    const dates: Date[] = [];
    const today = new Date();

    // Handle relative dates
    if (query.match(/\btoday\b/i)) {
      dates.push(new Date(today));
    }
    if (query.match(/\btomorrow\b/i)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dates.push(tomorrow);
    }
    if (query.match(/\byesterday\b/i)) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      dates.push(yesterday);
    }

    // Handle "today and tomorrow"
    if (query.match(/\btoday\s+and\s+tomorrow\b/i)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (!dates.some(d => d.toDateString() === today.toDateString())) {
        dates.push(new Date(today));
      }
      if (!dates.some(d => d.toDateString() === tomorrow.toDateString())) {
        dates.push(tomorrow);
      }
    }

    return dates;
  }

  /**
   * Extract times from query
   */
  private extractTimes(query: string): string[] {
    const times: string[] = [];

    for (const pattern of this.timePatterns) {
      const matches = query.match(pattern);
      if (matches) {
        times.push(matches[0]);
      }
    }

    return times;
  }

  /**
   * Classify the intent of the query
   */
  private classifyIntent(query: string, entities: EntityExtraction): string {
    const lowerQuery = query.toLowerCase();
    let maxScore = 0;
    let bestIntent = 'general';

    for (const [intent, keywords] of Object.entries(this.intentKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        if (lowerQuery.includes(keyword)) {
          score += 1;
        }
      }

      // Boost score based on entities
      if (intent.startsWith('email_') && entities.emails.length > 0) score += 2;
      if (intent.startsWith('calendar_') && entities.dates.length > 0) score += 2;
      if (intent.includes('delete') && (lowerQuery.includes('all') || lowerQuery.includes('both'))) score += 1;

      if (score > maxScore) {
        maxScore = score;
        bestIntent = intent;
      }
    }

    return bestIntent;
  }

  /**
   * Calculate confidence score for the analysis
   */
  private calculateConfidence(query: string, intent: string, entities: EntityExtraction): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for clear keywords
    const lowerQuery = query.toLowerCase();
    const intentKeywords = this.intentKeywords[intent as keyof typeof this.intentKeywords] || [];
    const keywordMatches = intentKeywords.filter(kw => lowerQuery.includes(kw)).length;
    confidence += Math.min(keywordMatches * 0.15, 0.4);

    // Boost confidence for relevant entities
    if (intent.startsWith('email_') && entities.emails.length > 0) confidence += 0.2;
    if (intent.startsWith('calendar_') && entities.dates.length > 0) confidence += 0.2;
    if (entities.times.length > 0 && intent === 'calendar_create') confidence += 0.1;

    // Reduce confidence for ambiguous queries
    if (query.split(' ').length < 3) confidence -= 0.1;
    if (!entities.dates.length && !entities.emails.length && intent !== 'general') confidence -= 0.1;

    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  /**
   * Get required parameters for a specific intent
   */
  private getRequiredParameters(intent: string): string[] {
    const parameterMap: Record<string, string[]> = {
      email_send: ['to', 'subject', 'body'],
      email_read: [],
      email_reply: ['message'],
      calendar_create: ['title', 'start_time'],
      calendar_delete: [],
      calendar_read: [],
      calendar_update: ['event_id']
    };

    return parameterMap[intent] || [];
  }

  /**
   * Generate smart defaults based on query and context
   */
  private generateDefaults(query: string, entities: EntityExtraction, context?: Record<string, any>): Record<string, any> {
    const defaults: Record<string, any> = {};

    // Date defaults
    if (entities.dates.length > 0) {
      defaults.date = entities.dates[0];
      defaults.start_date = entities.dates[0];
    } else if (query.toLowerCase().includes('today')) {
      defaults.date = new Date();
    }

    // Time defaults
    if (entities.times.length > 0) {
      defaults.time = entities.times[0];
    } else if (query.toLowerCase().includes('morning')) {
      defaults.time = '9:00 AM';
    } else if (query.toLowerCase().includes('afternoon')) {
      defaults.time = '2:00 PM';
    }

    // Email defaults
    if (entities.emails.length > 0) {
      defaults.to = entities.emails[0];
      defaults.recipient = entities.emails[0];
    }

    // Subject defaults
    if (entities.subjects.length > 0) {
      defaults.subject = entities.subjects[0];
    }

    // Meeting title defaults
    if (entities.names.length > 0 && query.toLowerCase().includes('meet')) {
      defaults.title = `Meeting with ${entities.names[0]}`;
    }

    // Limit defaults
    if (entities.numbers.length > 0) {
      defaults.limit = entities.numbers[0];
    }

    return defaults;
  }

  /**
   * Extract contextual information
   */
  private extractContextualInfo(query: string, entities: EntityExtraction, context?: Record<string, any>): Record<string, any> {
    const contextInfo: Record<string, any> = {};

    // Bulk operation detection
    contextInfo.isBulkOperation = query.toLowerCase().includes('all') ||
                                  query.toLowerCase().includes('both') ||
                                  entities.dates.length > 1;

    // Urgency detection
    contextInfo.isUrgent = query.toLowerCase().includes('urgent') ||
                           query.toLowerCase().includes('asap') ||
                           query.toLowerCase().includes('immediately');

    // Time preference
    if (query.toLowerCase().includes('morning')) contextInfo.timePreference = 'morning';
    if (query.toLowerCase().includes('afternoon')) contextInfo.timePreference = 'afternoon';
    if (query.toLowerCase().includes('evening')) contextInfo.timePreference = 'evening';

    return contextInfo;
  }

  /**
   * Find missing required parameters
   */
  private findMissingParameters(analysis: QueryAnalysis): string[] {
    const missing: string[] = [];

    for (const required of analysis.requiredParameters) {
      let hasParameter = false;

      // Check if parameter exists in defaults or can be inferred
      if (analysis.suggestedDefaults[required]) {
        hasParameter = true;
      }

      // Check specific parameter types
      switch (required) {
        case 'to':
        case 'recipient':
          hasParameter = analysis.entities.emails.length > 0;
          break;
        case 'date':
        case 'start_time':
          hasParameter = analysis.entities.dates.length > 0 || analysis.entities.times.length > 0;
          break;
        case 'subject':
          hasParameter = analysis.entities.subjects.length > 0;
          break;
        case 'title':
          hasParameter = analysis.suggestedDefaults.title !== undefined;
          break;
      }

      if (!hasParameter) {
        missing.push(required);
      }
    }

    return missing;
  }

  /**
   * Enhance analysis with additional context
   */
  async enhanceWithContext(analysis: QueryAnalysis, additionalContext: Record<string, any>): Promise<QueryAnalysis> {
    // Merge additional context
    analysis.contextualInfo = { ...analysis.contextualInfo, ...additionalContext };

    // Re-evaluate missing parameters with new context
    analysis.missingParameters = this.findMissingParameters(analysis);
    analysis.clarificationNeeded = analysis.missingParameters.length > 0 || analysis.isAmbiguous;

    return analysis;
  }
}