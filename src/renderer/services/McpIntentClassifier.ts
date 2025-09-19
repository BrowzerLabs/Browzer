/**
 * MCP Intent Classifier Service
 *
 * Advanced intent classification with domain-specific knowledge
 * and confidence scoring for better MCP tool routing.
 */

import { QueryAnalysis, EntityExtraction } from './McpQueryAnalyzer';

export interface IntentClassification {
  primaryIntent: string;
  secondaryIntents: string[];
  confidence: number;
  domain: string;
  actionType: string;
  toolSuggestions: string[];
  parameterMappings: Record<string, string>;
}

export interface IntentPattern {
  intent: string;
  patterns: RegExp[];
  keywords: string[];
  entities: string[];
  confidence: number;
  domain: string;
  actionType: string;
}

export class McpIntentClassifier {
  private intentPatterns: IntentPattern[] = [
    // Email Intents
    {
      intent: 'email_send',
      patterns: [
        /send\s+(?:an?\s+)?email\s+to/i,
        /compose\s+(?:an?\s+)?email/i,
        /email\s+[^@\s]+@[^@\s]+/i,
        /write\s+(?:an?\s+)?email/i
      ],
      keywords: ['send', 'compose', 'write', 'email', 'message', 'mail to'],
      entities: ['emails'],
      confidence: 0.9,
      domain: 'email',
      actionType: 'create'
    },
    {
      intent: 'email_read',
      patterns: [
        /(?:get|show|find|read)\s+(?:\d+\s+)?emails?\b/i,
        /(?:my\s+)?(?:latest|recent|new)\s+emails?\b/i,
        /emails?\s+(?:from|received)\s+(?:today|yesterday|this\s+week)/i,
        /check\s+(?:my\s+)?(?:email|inbox)/i
      ],
      keywords: ['get', 'show', 'find', 'read', 'emails', 'inbox', 'latest', 'recent'],
      entities: ['numbers', 'dates'],
      confidence: 0.85,
      domain: 'email',
      actionType: 'read'
    },
    {
      intent: 'email_reply',
      patterns: [
        /reply\s+to\s+(?:the\s+)?(?:latest|last|recent)/i,
        /respond\s+to\s+email/i,
        /answer\s+(?:the\s+)?email/i
      ],
      keywords: ['reply', 'respond', 'answer'],
      entities: ['emails'],
      confidence: 0.8,
      domain: 'email',
      actionType: 'update'
    },

    // Calendar Intents
    {
      intent: 'calendar_create',
      patterns: [
        /(?:schedule|book|set\s+up?|create|add)\s+(?:a\s+)?(?:meeting|appointment|event)/i,
        /(?:set\s+)?meet(?:ing)?\s+with\s+[^@\s]+@[^@\s]+/i,
        /(?:schedule|book)\s+(?:a\s+)?call/i,
        /add\s+(?:to\s+)?(?:my\s+)?calendar/i
      ],
      keywords: ['schedule', 'book', 'set', 'create', 'add', 'meeting', 'appointment', 'event', 'meet'],
      entities: ['emails', 'dates', 'times', 'names'],
      confidence: 0.9,
      domain: 'calendar',
      actionType: 'create'
    },
    {
      intent: 'calendar_delete',
      patterns: [
        /(?:delete|remove|cancel|clear)\s+(?:all\s+)?(?:events?|meetings?)/i,
        /(?:delete|cancel)\s+(?:my\s+)?(?:meeting|appointment|event)/i,
        /(?:remove|clear)\s+(?:from\s+)?(?:my\s+)?calendar/i
      ],
      keywords: ['delete', 'remove', 'cancel', 'clear', 'events', 'meetings', 'calendar'],
      entities: ['dates', 'names'],
      confidence: 0.85,
      domain: 'calendar',
      actionType: 'delete'
    },
    {
      intent: 'calendar_read',
      patterns: [
        /(?:show|get|list|check)\s+(?:my\s+)?(?:calendar|schedule|events?|meetings?)/i,
        /(?:what's|what\s+is)\s+(?:on\s+)?(?:my\s+)?(?:calendar|schedule)/i,
        /(?:today's|tomorrow's)\s+(?:events?|meetings?|schedule)/i
      ],
      keywords: ['show', 'get', 'list', 'check', 'calendar', 'schedule', 'events', 'meetings', 'today', 'latest'],
      entities: ['dates'],
      confidence: 0.8,
      domain: 'calendar',
      actionType: 'read'
    },
    {
      intent: 'calendar_update',
      patterns: [
        /(?:update|modify|change|reschedule|move)\s+(?:the\s+)?(?:meeting|event|appointment)/i,
        /reschedule\s+(?:my\s+)?(?:meeting|call)/i
      ],
      keywords: ['update', 'modify', 'change', 'reschedule', 'move'],
      entities: ['dates', 'times', 'names'],
      confidence: 0.75,
      domain: 'calendar',
      actionType: 'update'
    }
  ];

  private domainTools: Record<string, string[]> = {
    email: ['gmail_find_email', 'gmail_send_email', 'gmail_reply_email', 'outlook_send', 'outlook_read'],
    calendar: ['gcal_create_event', 'gcal_delete_event', 'gcal_list_events', 'gcal_update_event', 'outlook_calendar']
  };

  /**
   * Classify intent with advanced pattern matching and confidence scoring
   */
  classifyIntent(analysis: QueryAnalysis): IntentClassification {
    console.log('[McpIntentClassifier] Classifying intent for:', analysis.originalQuery);

    const query = analysis.originalQuery.toLowerCase();
    const scores: Array<{ intent: string, score: number, pattern: IntentPattern }> = [];

    // Score each intent pattern
    for (const pattern of this.intentPatterns) {
      let score = 0;

      // Pattern matching score (highest weight)
      for (const regex of pattern.patterns) {
        if (regex.test(analysis.originalQuery)) {
          score += 3;
          break; // Only count one pattern match per intent
        }
      }

      // Keyword matching score
      const keywordMatches = pattern.keywords.filter(keyword => query.includes(keyword)).length;
      score += keywordMatches * 0.5;

      // Entity relevance score
      for (const entityType of pattern.entities) {
        const entityArray = analysis.entities[entityType as keyof EntityExtraction] as any[];
        if (entityArray && entityArray.length > 0) {
          score += 1;
        }
      }

      // Context boost
      score += this.getContextBoost(query, pattern, analysis);

      if (score > 0) {
        scores.push({ intent: pattern.intent, score, pattern });
      }
    }

    // Sort by score and select best match
    scores.sort((a, b) => b.score - a.score);

    const primaryMatch = scores[0];
    const classification: IntentClassification = {
      primaryIntent: primaryMatch ? primaryMatch.intent : 'general',
      secondaryIntents: scores.slice(1, 3).map(s => s.intent),
      confidence: this.calculateFinalConfidence(primaryMatch ? primaryMatch.score : 0, query, analysis),
      domain: primaryMatch ? primaryMatch.pattern.domain : 'general',
      actionType: primaryMatch ? primaryMatch.pattern.actionType : 'general',
      toolSuggestions: this.getToolSuggestions(primaryMatch ? primaryMatch.pattern : null, analysis),
      parameterMappings: this.generateParameterMappings(primaryMatch ? primaryMatch.intent : 'general', analysis)
    };

    console.log('[McpIntentClassifier] Classification result:', classification);
    return classification;
  }

  /**
   * Get context-specific score boost
   */
  private getContextBoost(query: string, pattern: IntentPattern, analysis: QueryAnalysis): number {
    let boost = 0;

    // Domain consistency boost
    if (pattern.domain === 'email' && analysis.entities.emails.length > 0) boost += 0.5;
    if (pattern.domain === 'calendar' && (analysis.entities.dates.length > 0 || analysis.entities.times.length > 0)) boost += 0.5;

    // Action type consistency
    if (pattern.actionType === 'create' && (query.includes('new') || query.includes('add'))) boost += 0.3;
    if (pattern.actionType === 'delete' && (query.includes('remove') || query.includes('clear'))) boost += 0.3;
    if (pattern.actionType === 'read' && (query.includes('show') || query.includes('get'))) boost += 0.3;

    // Bulk operation boost
    if (pattern.intent.includes('delete') && analysis.contextualInfo.isBulkOperation) boost += 0.5;

    // Urgency boost for send operations
    if (pattern.intent.includes('send') && analysis.contextualInfo.isUrgent) boost += 0.2;

    return boost;
  }

  /**
   * Calculate final confidence score
   */
  private calculateFinalConfidence(rawScore: number, query: string, analysis: QueryAnalysis): number {
    let confidence = Math.min(rawScore / 5, 0.95); // Normalize score

    // Boost for complete queries
    if (analysis.missingParameters.length === 0) confidence += 0.1;

    // Reduce for ambiguous queries
    if (analysis.isAmbiguous) confidence *= 0.8;

    // Reduce for very short queries
    if (query.split(' ').length < 3) confidence *= 0.7;

    // Boost for queries with clear entities
    if (analysis.entities.emails.length > 0 || analysis.entities.dates.length > 0) confidence += 0.05;

    return Math.max(Math.min(confidence, 1.0), 0.1);
  }

  /**
   * Get tool suggestions based on intent and domain
   */
  private getToolSuggestions(pattern: IntentPattern | null, analysis: QueryAnalysis): string[] {
    if (!pattern) return [];

    const domainTools = this.domainTools[pattern.domain] || [];
    const suggestions: string[] = [];

    // Add domain-specific tools
    for (const tool of domainTools) {
      if (this.toolMatchesIntent(tool, pattern.intent)) {
        suggestions.push(tool);
      }
    }

    // Add generic suggestions if no specific tools found
    if (suggestions.length === 0) {
      suggestions.push(`${pattern.domain}_${pattern.actionType}`);
    }

    return suggestions;
  }

  /**
   * Check if tool matches intent
   */
  private toolMatchesIntent(toolName: string, intent: string): boolean {
    const intentAction = intent.split('_')[1]; // get 'send' from 'email_send'
    return toolName.toLowerCase().includes(intentAction);
  }

  /**
   * Generate parameter mappings for MCP tools
   */
  private generateParameterMappings(intent: string, analysis: QueryAnalysis): Record<string, string> {
    const mappings: Record<string, string> = {};

    switch (intent) {
      case 'email_send':
        if (analysis.entities.emails.length > 0) mappings.to = analysis.entities.emails[0];
        if (analysis.entities.subjects.length > 0) mappings.subject = analysis.entities.subjects[0];
        break;

      case 'email_read':
        if (analysis.entities.numbers.length > 0) {
          mappings.limit = analysis.entities.numbers[0].toString();
          mappings.max_results = analysis.entities.numbers[0].toString();
        }
        if (analysis.entities.dates.length > 0) {
          mappings.date = analysis.entities.dates[0].toISOString().split('T')[0];
        }
        break;

      case 'calendar_create':
        if (analysis.entities.emails.length > 0) mappings.attendees = analysis.entities.emails[0];
        if (analysis.entities.dates.length > 0) {
          mappings.start_date = analysis.entities.dates[0].toISOString().split('T')[0];
          mappings.date = analysis.entities.dates[0].toISOString().split('T')[0];
        }
        if (analysis.entities.times.length > 0) {
          mappings.start_time = analysis.entities.times[0];
          mappings.time = analysis.entities.times[0];
        }
        if (analysis.suggestedDefaults.title) {
          mappings.title = analysis.suggestedDefaults.title;
          mappings.summary = analysis.suggestedDefaults.title;
        }
        break;

      case 'calendar_delete':
        if (analysis.entities.dates.length > 0) {
          mappings.date = analysis.entities.dates[0].toISOString().split('T')[0];
        }
        if (analysis.contextualInfo.isBulkOperation) {
          mappings.delete_all = 'true';
        }
        break;

      case 'calendar_read':
        if (analysis.entities.dates.length > 0) {
          mappings.date = analysis.entities.dates[0].toISOString().split('T')[0];
        }
        break;
    }

    return mappings;
  }

  /**
   * Refine classification with additional context
   */
  refineWithContext(classification: IntentClassification, additionalContext: Record<string, any>): IntentClassification {
    // Apply contextual refinements
    if (additionalContext.previousIntent && classification.confidence < 0.7) {
      // If confidence is low, consider previous intent for context
      if (additionalContext.previousIntent === classification.primaryIntent) {
        classification.confidence += 0.1;
      }
    }

    // Add context-specific tool suggestions
    if (additionalContext.availableTools) {
      const availableTools = additionalContext.availableTools as string[];
      classification.toolSuggestions = classification.toolSuggestions.filter(tool =>
        availableTools.some(available => available.includes(tool) || tool.includes(available))
      );
    }

    return classification;
  }

  /**
   * Get clarification questions for ambiguous intents
   */
  getClarificationQuestions(classification: IntentClassification, analysis: QueryAnalysis): string[] {
    const questions: string[] = [];

    if (classification.confidence < 0.6) {
      questions.push(`I'm not sure what you'd like me to do. Did you mean to ${classification.primaryIntent.replace('_', ' ')}?`);
    }

    if (classification.primaryIntent === 'general') {
      if (analysis.entities.emails.length > 0) {
        questions.push("Would you like me to send an email, read emails, or manage your calendar?");
      } else if (analysis.entities.dates.length > 0) {
        questions.push("Would you like me to check your calendar or schedule a meeting for that date?");
      }
    }

    return questions;
  }
}