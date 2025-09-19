/**
 * MCP Parameter Extractor Service
 *
 * Extracts and validates parameters from natural language queries
 * for MCP tool execution with smart defaults and validation.
 */

import { QueryAnalysis, EntityExtraction } from './McpQueryAnalyzer';
import { IntentClassification } from './McpIntentClassifier';

export interface ParameterExtraction {
  extractedParameters: Record<string, any>;
  validatedParameters: Record<string, any>;
  missingRequired: string[];
  suggestedValues: Record<string, any>;
  parameterErrors: Record<string, string>;
  confidenceScore: number;
}

export interface ParameterRule {
  name: string;
  type: 'string' | 'number' | 'date' | 'email' | 'boolean' | 'array';
  required: boolean;
  defaultValue?: any;
  validation?: (value: any) => boolean;
  transformation?: (value: any) => any;
  aliases?: string[];
  description?: string;
}

export class McpParameterExtractor {
  private parameterRules: Record<string, ParameterRule[]> = {
    'email_send': [
      {
        name: 'to',
        type: 'email',
        required: true,
        aliases: ['recipient', 'email', 'address'],
        validation: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        description: 'Recipient email address'
      },
      {
        name: 'subject',
        type: 'string',
        required: true,
        aliases: ['title', 'topic', 'about'],
        description: 'Email subject line'
      },
      {
        name: 'body',
        type: 'string',
        required: true,
        aliases: ['message', 'content', 'text'],
        description: 'Email message content'
      }
    ],
    'email_read': [
      {
        name: 'limit',
        type: 'number',
        required: false,
        defaultValue: 10,
        aliases: ['count', 'max', 'number'],
        validation: (value: number) => value > 0 && value <= 50,
        description: 'Number of emails to retrieve'
      },
      {
        name: 'date',
        type: 'date',
        required: false,
        aliases: ['from', 'since', 'when'],
        description: 'Date to filter emails'
      },
      {
        name: 'sender',
        type: 'email',
        required: false,
        aliases: ['from', 'author'],
        description: 'Filter emails from specific sender'
      }
    ],
    'calendar_create': [
      {
        name: 'title',
        type: 'string',
        required: true,
        aliases: ['summary', 'name', 'event'],
        description: 'Event title'
      },
      {
        name: 'start_time',
        type: 'date',
        required: true,
        aliases: ['date', 'when', 'time'],
        description: 'Event start time'
      },
      {
        name: 'end_time',
        type: 'date',
        required: false,
        aliases: ['until', 'end'],
        description: 'Event end time'
      },
      {
        name: 'attendees',
        type: 'array',
        required: false,
        aliases: ['with', 'participants', 'guests'],
        description: 'Event attendees'
      },
      {
        name: 'description',
        type: 'string',
        required: false,
        aliases: ['about', 'details', 'notes'],
        description: 'Event description'
      }
    ],
    'calendar_delete': [
      {
        name: 'date',
        type: 'date',
        required: false,
        aliases: ['when', 'for'],
        description: 'Date to delete events from'
      },
      {
        name: 'event_title',
        type: 'string',
        required: false,
        aliases: ['title', 'name', 'event'],
        description: 'Specific event to delete'
      },
      {
        name: 'all',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: 'Delete all events'
      }
    ],
    'calendar_read': [
      {
        name: 'date',
        type: 'date',
        required: false,
        defaultValue: new Date(),
        aliases: ['for', 'on', 'when'],
        description: 'Date to show events for'
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        defaultValue: 10,
        aliases: ['count', 'max'],
        description: 'Maximum number of events'
      }
    ]
  };

  /**
   * Extract parameters for a specific intent
   */
  extractParameters(
    intent: string,
    analysis: QueryAnalysis,
    classification: IntentClassification
  ): ParameterExtraction {
    console.log('[McpParameterExtractor] Extracting parameters for intent:', intent);

    const rules = this.parameterRules[intent] || [];
    const extraction: ParameterExtraction = {
      extractedParameters: {},
      validatedParameters: {},
      missingRequired: [],
      suggestedValues: {},
      parameterErrors: {},
      confidenceScore: 0
    };

    // Extract parameters based on rules
    for (const rule of rules) {
      const value = this.extractParameterValue(rule, analysis, classification);
      if (value !== undefined && value !== null) {
        extraction.extractedParameters[rule.name] = value;
      }
    }

    // Validate and transform parameters
    this.validateAndTransform(extraction, rules);

    // Find missing required parameters
    extraction.missingRequired = this.findMissingRequired(extraction.validatedParameters, rules);

    // Generate suggestions for missing parameters
    extraction.suggestedValues = this.generateSuggestions(
      extraction.missingRequired,
      rules,
      analysis,
      classification
    );

    // Calculate confidence score
    extraction.confidenceScore = this.calculateParameterConfidence(extraction, rules);

    console.log('[McpParameterExtractor] Extraction result:', extraction);
    return extraction;
  }

  /**
   * Extract a single parameter value
   */
  private extractParameterValue(
    rule: ParameterRule,
    analysis: QueryAnalysis,
    classification: IntentClassification
  ): any {
    const query = analysis.originalQuery.toLowerCase();
    const entities = analysis.entities;

    // Check classification parameter mappings first
    if (classification.parameterMappings[rule.name]) {
      return classification.parameterMappings[rule.name];
    }

    // Check for aliases in parameter mappings
    for (const alias of rule.aliases || []) {
      if (classification.parameterMappings[alias]) {
        return classification.parameterMappings[alias];
      }
    }

    // Extract based on parameter type
    switch (rule.type) {
      case 'email':
        return this.extractEmail(rule, entities, query);

      case 'date':
        return this.extractDate(rule, entities, query, analysis);

      case 'number':
        return this.extractNumber(rule, entities, query);

      case 'string':
        return this.extractString(rule, entities, query, analysis);

      case 'boolean':
        return this.extractBoolean(rule, query, analysis);

      case 'array':
        return this.extractArray(rule, entities, query);

      default:
        return analysis.suggestedDefaults[rule.name];
    }
  }

  /**
   * Extract email parameter
   */
  private extractEmail(rule: ParameterRule, entities: EntityExtraction, query: string): string | undefined {
    if (entities.emails.length > 0) {
      return entities.emails[0];
    }

    // Look for email patterns in the query
    const emailMatch = query.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    return emailMatch ? emailMatch[0] : undefined;
  }

  /**
   * Extract date parameter
   */
  private extractDate(
    rule: ParameterRule,
    entities: EntityExtraction,
    query: string,
    analysis: QueryAnalysis
  ): Date | string | undefined {
    if (entities.dates.length > 0) {
      // For end_time, use the same date but add 1 hour
      if (rule.name === 'end_time' && entities.times.length === 0) {
        const startDate = new Date(entities.dates[0]);
        startDate.setHours(startDate.getHours() + 1);
        return startDate;
      }

      // Combine date and time if available
      if (entities.times.length > 0) {
        const date = new Date(entities.dates[0]);
        const timeStr = entities.times[0];
        const parsedTime = this.parseTime(timeStr);
        if (parsedTime) {
          date.setHours(parsedTime.hours, parsedTime.minutes);
          return date;
        }
      }

      return entities.dates[0];
    }

    // Handle relative dates
    if (query.includes('today')) return new Date();
    if (query.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    return rule.defaultValue;
  }

  /**
   * Extract number parameter
   */
  private extractNumber(rule: ParameterRule, entities: EntityExtraction, query: string): number | undefined {
    if (entities.numbers.length > 0) {
      return entities.numbers[0];
    }

    // Look for written numbers
    const writtenNumbers: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };

    for (const [word, num] of Object.entries(writtenNumbers)) {
      if (query.includes(word)) {
        return num;
      }
    }

    return rule.defaultValue;
  }

  /**
   * Extract string parameter
   */
  private extractString(
    rule: ParameterRule,
    entities: EntityExtraction,
    query: string,
    analysis: QueryAnalysis
  ): string | undefined {
    // Check for quoted strings first
    const quotedMatch = query.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Check entities based on parameter name
    switch (rule.name) {
      case 'subject':
      case 'title':
        if (entities.subjects.length > 0) return entities.subjects[0];
        if (analysis.suggestedDefaults[rule.name]) return analysis.suggestedDefaults[rule.name];
        break;

      case 'body':
      case 'message':
        return this.extractMessageBody(query, analysis);

      case 'event_title':
        if (entities.names.length > 0) {
          return `Meeting with ${entities.names[0]}`;
        }
        break;
    }

    // Look for text after prepositions
    const prepositionPatterns: Record<string, RegExp> = {
      'subject': /(?:subject|about|regarding|re:)\s+([^,\.]+)/i,
      'title': /(?:title|name|call it|event)\s+([^,\.]+)/i,
      'body': /(?:saying|message|tell them|body)\s+([^,\.]+)/i
    };

    const pattern = prepositionPatterns[rule.name];
    if (pattern) {
      const match = query.match(pattern);
      if (match) return match[1].trim();
    }

    return rule.defaultValue;
  }

  /**
   * Extract boolean parameter
   */
  private extractBoolean(rule: ParameterRule, query: string, analysis: QueryAnalysis): boolean | undefined {
    const positiveWords = ['all', 'every', 'everything', 'yes', 'true'];
    const negativeWords = ['no', 'not', 'false', 'none'];

    for (const word of positiveWords) {
      if (query.includes(word)) return true;
    }

    for (const word of negativeWords) {
      if (query.includes(word)) return false;
    }

    // Special case for bulk operations
    if (rule.name === 'all' && analysis.contextualInfo.isBulkOperation) {
      return true;
    }

    return rule.defaultValue;
  }

  /**
   * Extract array parameter
   */
  private extractArray(rule: ParameterRule, entities: EntityExtraction, query: string): any[] | undefined {
    switch (rule.name) {
      case 'attendees':
        const attendees = [...entities.emails];
        if (entities.names.length > 0) {
          attendees.push(...entities.names);
        }
        return attendees.length > 0 ? attendees : undefined;

      default:
        return rule.defaultValue;
    }
  }

  /**
   * Extract message body with smart detection
   */
  private extractMessageBody(query: string, analysis: QueryAnalysis): string | undefined {
    // Look for common message patterns
    const bodyPatterns = [
      /(?:saying|message|tell them|body|write):\s*["']?([^"']+)["']?/i,
      /(?:saying|message|tell them|body|write)\s+["']?([^"']+)["']?/i,
      /["']([^"']+)["']/,  // Any quoted text
    ];

    for (const pattern of bodyPatterns) {
      const match = query.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no explicit body found, suggest based on context
    if (analysis.entities.subjects.length > 0) {
      return `Regarding: ${analysis.entities.subjects[0]}`;
    }

    return undefined;
  }

  /**
   * Parse time string to hours and minutes
   */
  private parseTime(timeStr: string): { hours: number, minutes: number } | null {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      return { hours, minutes };
    }

    // Handle simple hour patterns like "2pm"
    const simpleMatch = timeStr.match(/(\d{1,2})\s*(am|pm)/i);
    if (simpleMatch) {
      let hours = parseInt(simpleMatch[1]);
      const ampm = simpleMatch[2].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      return { hours, minutes: 0 };
    }

    return null;
  }

  /**
   * Validate and transform extracted parameters
   */
  private validateAndTransform(extraction: ParameterExtraction, rules: ParameterRule[]): void {
    for (const [name, value] of Object.entries(extraction.extractedParameters)) {
      const rule = rules.find(r => r.name === name);
      if (!rule) continue;

      let validatedValue = value;
      let isValid = true;

      // Apply transformation if provided
      if (rule.transformation) {
        try {
          validatedValue = rule.transformation(value);
        } catch (error) {
          extraction.parameterErrors[name] = `Transformation failed: ${error}`;
          continue;
        }
      }

      // Apply validation if provided
      if (rule.validation && !rule.validation(validatedValue)) {
        extraction.parameterErrors[name] = `Invalid ${rule.type} value: ${validatedValue}`;
        isValid = false;
      }

      // Type-specific validation
      if (isValid) {
        switch (rule.type) {
          case 'email':
            if (typeof validatedValue === 'string' &&
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validatedValue)) {
              extraction.parameterErrors[name] = 'Invalid email format';
              isValid = false;
            }
            break;

          case 'number':
            if (typeof validatedValue !== 'number' || isNaN(validatedValue)) {
              extraction.parameterErrors[name] = 'Must be a valid number';
              isValid = false;
            }
            break;
        }
      }

      if (isValid) {
        extraction.validatedParameters[name] = validatedValue;
      }
    }
  }

  /**
   * Find missing required parameters
   */
  private findMissingRequired(validatedParameters: Record<string, any>, rules: ParameterRule[]): string[] {
    return rules
      .filter(rule => rule.required && !(rule.name in validatedParameters))
      .map(rule => rule.name);
  }

  /**
   * Generate suggestions for missing parameters
   */
  private generateSuggestions(
    missingRequired: string[],
    rules: ParameterRule[],
    analysis: QueryAnalysis,
    classification: IntentClassification
  ): Record<string, any> {
    const suggestions: Record<string, any> = {};

    for (const paramName of missingRequired) {
      const rule = rules.find(r => r.name === paramName);
      if (!rule) continue;

      switch (paramName) {
        case 'subject':
          if (analysis.entities.names.length > 0) {
            suggestions[paramName] = `Meeting with ${analysis.entities.names[0]}`;
          }
          break;

        case 'start_time':
          if (!analysis.entities.times.length) {
            suggestions[paramName] = analysis.contextualInfo.timePreference === 'morning' ? '9:00 AM' :
                                    analysis.contextualInfo.timePreference === 'afternoon' ? '2:00 PM' :
                                    analysis.contextualInfo.timePreference === 'evening' ? '6:00 PM' : '10:00 AM';
          }
          break;

        case 'body':
          suggestions[paramName] = 'Please provide the message content';
          break;
      }

      // Use default value if no specific suggestion
      if (!suggestions[paramName] && rule.defaultValue !== undefined) {
        suggestions[paramName] = rule.defaultValue;
      }
    }

    return suggestions;
  }

  /**
   * Calculate parameter extraction confidence
   */
  private calculateParameterConfidence(extraction: ParameterExtraction, rules: ParameterRule[]): number {
    const totalParams = rules.length;
    const extractedParams = Object.keys(extraction.validatedParameters).length;
    const requiredParams = rules.filter(r => r.required).length;
    const extractedRequired = rules
      .filter(r => r.required)
      .filter(r => r.name in extraction.validatedParameters).length;
    const errorCount = Object.keys(extraction.parameterErrors).length;

    let confidence = 0.5; // Base confidence

    // Boost for extracted parameters
    confidence += (extractedParams / totalParams) * 0.3;

    // Boost for required parameters
    confidence += (extractedRequired / Math.max(requiredParams, 1)) * 0.3;

    // Reduce for errors
    confidence -= (errorCount / totalParams) * 0.2;

    return Math.max(Math.min(confidence, 1.0), 0.1);
  }

  /**
   * Get human-readable parameter descriptions
   */
  getParameterDescriptions(intent: string): Record<string, string> {
    const rules = this.parameterRules[intent] || [];
    const descriptions: Record<string, string> = {};

    for (const rule of rules) {
      descriptions[rule.name] = rule.description || `${rule.name} (${rule.type})`;
    }

    return descriptions;
  }

  /**
   * Get missing parameter prompts
   */
  getMissingParameterPrompts(extraction: ParameterExtraction, intent: string): string[] {
    const rules = this.parameterRules[intent] || [];
    const prompts: string[] = [];

    for (const paramName of extraction.missingRequired) {
      const rule = rules.find(r => r.name === paramName);
      if (!rule) continue;

      const suggestion = extraction.suggestedValues[paramName];
      const prompt = suggestion
        ? `${rule.description || paramName}: ${suggestion} (or specify your own)`
        : `Please provide ${rule.description || paramName}`;

      prompts.push(prompt);
    }

    return prompts;
  }
}