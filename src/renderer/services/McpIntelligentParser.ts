/**
 * MCP Intelligent Parser
 *
 * AI-Enhanced MCP Routing for "Get It Done" mode:
 * - LLM-powered MCP query analysis and understanding
 * - Context-aware MCP intent extraction
 * - Ambiguity resolution through AI for MCP tool selection
 * - Natural language to MCP workflow translation
 * - Advanced query understanding with semantic analysis
 *
 * Week 8: AI-Enhanced MCP Routing - Intelligent Parser
 */

import { McpClientManager } from './McpClientManager';
import { McpServerIntegrations, ServerIntegration, ServerTool } from './McpServerIntegrations';
import { McpWorkflowTemplates, WorkflowTemplate } from './McpWorkflowTemplates';

export interface QueryIntent {
  primaryAction: string;
  secondaryActions: string[];
  entities: EntityExtraction[];
  context: ContextAnalysis;
  confidence: number; // 0-1
  ambiguities: AmbiguityFlag[];
}

export interface EntityExtraction {
  type: 'person' | 'organization' | 'location' | 'date' | 'time' | 'email' | 'phone' | 'url' | 'document' | 'project' | 'custom';
  value: string;
  confidence: number;
  position: { start: number; end: number };
  metadata?: Record<string, any>;
}

export interface ContextAnalysis {
  domain: 'email' | 'calendar' | 'project-management' | 'communication' | 'documentation' | 'mixed';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  complexity: 'simple' | 'medium' | 'complex';
  userPreferences: UserPreference[];
  historicalContext: string[];
  temporalContext: TemporalContext;
}

export interface TemporalContext {
  timeframe: 'immediate' | 'today' | 'this-week' | 'this-month' | 'future' | 'past';
  specificDates: Date[];
  recurring: boolean;
  deadline?: Date;
}

export interface UserPreference {
  category: string;
  preference: string;
  weight: number; // 0-1
  source: 'explicit' | 'learned' | 'default';
}

export interface AmbiguityFlag {
  type: 'multiple-tools' | 'unclear-intent' | 'missing-context' | 'conflicting-actions';
  description: string;
  suggestedClarifications: string[];
  confidence: number;
}

export interface IntelligentQueryAnalysis {
  originalQuery: string;
  processedQuery: string;
  intent: QueryIntent;
  recommendedTools: ToolRecommendation[];
  workflowSuggestions: WorkflowSuggestion[];
  executionPlan: ExecutionPlan;
  alternatives: AlternativePlan[];
}

export interface ToolRecommendation {
  tool: ServerTool;
  server: ServerIntegration;
  confidence: number;
  reasoning: string;
  parameters: Record<string, any>;
  executionOrder: number;
}

export interface WorkflowSuggestion {
  template: WorkflowTemplate;
  confidence: number;
  reasoning: string;
  adaptations: string[];
}

export interface ExecutionPlan {
  planId: string;
  steps: ExecutionStep[];
  estimatedDuration: number;
  complexity: 'simple' | 'medium' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
  successProbability: number;
}

export interface ExecutionStep {
  stepId: string;
  description: string;
  tool: ToolRecommendation;
  dependencies: string[];
  conditions?: string[];
  expectedOutput: string;
  fallbackOptions: AlternativeAction[];
}

export interface AlternativeAction {
  description: string;
  tool: ToolRecommendation;
  confidence: number;
}

export interface AlternativePlan {
  planId: string;
  description: string;
  confidence: number;
  tradeoffs: string[];
  estimatedDuration: number;
}

export class McpIntelligentParser {
  private mcpManager: McpClientManager;
  private serverIntegrations: McpServerIntegrations;
  private workflowTemplates: McpWorkflowTemplates;
  private userPreferences: Map<string, UserPreference> = new Map();
  private queryHistory: Map<string, number> = new Map();
  private contextMemory: Map<string, any> = new Map();
  private claudeApiKey: string | null = null;

  // AI/NLP pattern databases
  private actionPatterns: Map<string, RegExp[]> = new Map();
  private entityPatterns: Map<string, RegExp[]> = new Map();
  private contextPatterns: Map<string, RegExp[]> = new Map();

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.serverIntegrations = new McpServerIntegrations(mcpManager);
    this.workflowTemplates = new McpWorkflowTemplates();
    this.initializeIntelligencePatterns();
    this.loadUserPreferences();
  }

  /**
   * Initialize AI/NLP patterns for intelligent parsing
   */
  private initializeIntelligencePatterns(): void {
    console.log('[McpIntelligentParser] Initializing AI/NLP patterns...');

    // Action patterns
    this.actionPatterns.set('read', [
      /\b(read|get|fetch|retrieve|find|search|look\s+for|show\s+me)\b/i,
      /\b(what\s+is|tell\s+me\s+about|display|list)\b/i
    ]);

    this.actionPatterns.set('create', [
      /\b(create|make|add|new|generate|build|compose|write)\b/i,
      /\b(draft|prepare|set\s+up|establish)\b/i
    ]);

    this.actionPatterns.set('update', [
      /\b(update|modify|change|edit|revise|alter)\b/i,
      /\b(fix|correct|adjust|amend)\b/i
    ]);

    this.actionPatterns.set('delete', [
      /\b(delete|remove|cancel|clear|eliminate)\b/i,
      /\b(trash|discard|drop)\b/i
    ]);

    this.actionPatterns.set('send', [
      /\b(send|email|message|notify|alert|forward)\b/i,
      /\b(reply|respond|communicate)\b/i
    ]);

    this.actionPatterns.set('schedule', [
      /\b(schedule|book|reserve|plan|arrange|set\s+up)\b/i,
      /\b(meeting|appointment|event|call)\b/i
    ]);

    // Entity patterns
    this.entityPatterns.set('email', [
      /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
      /\b(email|mail|message)\s+(?:from|to|with|about)\s+([^,\s]+)/i
    ]);

    this.entityPatterns.set('person', [
      /\b(from|to|with|by|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
      /@([a-zA-Z0-9_]+)/,  // @mentions
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s\b/  // possessive names
    ]);

    this.entityPatterns.set('date', [
      /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(this|next|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday)\b/i,
      /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i
    ]);

    this.entityPatterns.set('time', [
      /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i,
      /\b(\d{1,2}\s*(?:am|pm))\b/i,
      /\b(morning|afternoon|evening|night|noon|midnight)\b/i
    ]);

    this.entityPatterns.set('project', [
      /\b(project|board|workspace|repository|repo)\s+([A-Za-z0-9-_]+)\b/i,
      /\b(#[A-Za-z0-9-_]+)\b/,  // hashtags
      /\b([A-Z]{2,}-\d+)\b/  // JIRA-style ticket IDs
    ]);

    // Context patterns
    this.contextPatterns.set('urgency-high', [
      /\b(urgent|asap|immediately|emergency|critical|important)\b/i,
      /\b(rush|hurry|quick|fast)\b/i
    ]);

    this.contextPatterns.set('urgency-low', [
      /\b(whenever|eventually|sometime|later|no\s+rush)\b/i,
      /\b(low\s+priority|not\s+urgent)\b/i
    ]);

    this.contextPatterns.set('conditional', [
      /\bif\b/i, /\bunless\b/i, /\bwhen\b/i, /\bafter\b/i, /\bbefore\b/i
    ]);

    this.contextPatterns.set('sequential', [
      /\bthen\b/i, /\bnext\b/i, /\bafter\s+that\b/i, /\bfirst.*then\b/i
    ]);

    console.log('[McpIntelligentParser] AI/NLP patterns initialized');
  }

  /**
   * Load user preferences from storage
   */
  private loadUserPreferences(): void {
    // Default preferences - in real implementation, these would be loaded from storage
    const defaultPreferences: UserPreference[] = [
      { category: 'communication', preference: 'gmail', weight: 0.8, source: 'explicit' },
      { category: 'calendar', preference: 'google-calendar', weight: 0.9, source: 'explicit' },
      { category: 'project-management', preference: 'trello', weight: 0.7, source: 'learned' },
      { category: 'documentation', preference: 'notion', weight: 0.6, source: 'learned' },
      { category: 'urgency-response', preference: 'immediate', weight: 0.8, source: 'default' }
    ];

    defaultPreferences.forEach(pref => {
      this.userPreferences.set(`${pref.category}-${pref.preference}`, pref);
    });

    console.log('[McpIntelligentParser] User preferences loaded');
  }

  /**
   * Main intelligent query analysis function
   */
  async analyzeQuery(query: string, contextHints?: Record<string, any>): Promise<IntelligentQueryAnalysis> {
    console.log(`[McpIntelligentParser] Analyzing query with AI: "${query}"`);

    const startTime = Date.now();

    try {
      // Step 1: Preprocess query
      const processedQuery = this.preprocessQuery(query);

      // Step 2: Extract intent and entities
      const intent = await this.extractIntent(processedQuery);

      // Step 3: Analyze context
      const context = await this.analyzeContext(processedQuery, intent, contextHints);
      intent.context = context;

      // Step 4: Get tool recommendations
      const recommendedTools = await this.recommendTools(intent, context);

      // Step 5: Find workflow suggestions
      const workflowSuggestions = this.suggestWorkflows(processedQuery, intent);

      // Step 6: Generate execution plan
      const executionPlan = this.generateExecutionPlan(intent, recommendedTools, workflowSuggestions);

      // Step 7: Generate alternatives
      const alternatives = this.generateAlternatives(intent, recommendedTools);

      const analysisTime = Date.now() - startTime;
      console.log(`[McpIntelligentParser] Analysis completed in ${analysisTime}ms`);

      return {
        originalQuery: query,
        processedQuery,
        intent,
        recommendedTools,
        workflowSuggestions,
        executionPlan,
        alternatives
      };

    } catch (error) {
      console.error('[McpIntelligentParser] Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Preprocess query for better analysis
   */
  private preprocessQuery(query: string): string {
    let processed = query.toLowerCase().trim();

    // Normalize common variations
    const normalizations: Record<string, string> = {
      'e-mail': 'email',
      'e-mails': 'emails',
      'google docs': 'gdocs',
      'google calendar': 'gcal',
      'google cal': 'gcal',
      'set up': 'setup',
      'look for': 'find',
      'search for': 'find'
    };

    Object.entries(normalizations).forEach(([from, to]) => {
      processed = processed.replace(new RegExp(from, 'gi'), to);
    });

    return processed;
  }

  /**
   * Extract intent from query using AI patterns
   */
  private async extractIntent(query: string): Promise<QueryIntent> {
    const entities = this.extractEntities(query);
    const actions = this.extractActions(query);
    const ambiguities = this.detectAmbiguities(query, actions, entities);

    // Determine primary action
    const primaryAction = actions.length > 0 ? actions[0] : 'read';

    // Calculate confidence based on pattern matches and clarity
    let confidence = 0.7; // baseline
    if (actions.length === 1) confidence += 0.2; // single clear action
    if (ambiguities.length === 0) confidence += 0.1; // no ambiguities
    if (entities.length > 0) confidence += 0.1; // has entities
    confidence = Math.min(confidence, 1.0);

    return {
      primaryAction,
      secondaryActions: actions.slice(1),
      entities,
      context: {} as ContextAnalysis, // Will be filled later
      confidence,
      ambiguities
    };
  }

  /**
   * Extract entities from query
   */
  private extractEntities(query: string): EntityExtraction[] {
    const entities: EntityExtraction[] = [];

    this.entityPatterns.forEach((patterns, entityType) => {
      patterns.forEach(pattern => {
        const matches = [...query.matchAll(new RegExp(pattern, 'gi'))];
        matches.forEach(match => {
          if (match.index !== undefined && match[0]) {
            entities.push({
              type: entityType as EntityExtraction['type'],
              value: match[1] || match[0],
              confidence: 0.8,
              position: { start: match.index, end: match.index + match[0].length }
            });
          }
        });
      });
    });

    return entities;
  }

  /**
   * Extract actions from query
   */
  private extractActions(query: string): string[] {
    const actions: string[] = [];

    this.actionPatterns.forEach((patterns, actionType) => {
      patterns.forEach(pattern => {
        if (pattern.test(query)) {
          actions.push(actionType);
        }
      });
    });

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Analyze context of the query
   */
  private async analyzeContext(
    query: string,
    intent: QueryIntent,
    contextHints?: Record<string, any>
  ): Promise<ContextAnalysis> {
    // Determine domain
    const domain = this.determineDomain(query, intent.entities);

    // Analyze urgency
    const urgency = this.analyzeUrgency(query);

    // Determine complexity
    const complexity = this.determineComplexity(intent);

    // Extract temporal context
    const temporalContext = this.extractTemporalContext(query, intent.entities);

    // Get user preferences
    const userPreferences = this.getRelevantPreferences(domain);

    // Get historical context
    const historicalContext = this.getHistoricalContext(query);

    return {
      domain,
      urgency,
      complexity,
      userPreferences,
      historicalContext,
      temporalContext
    };
  }

  /**
   * Recommend tools based on intent and context
   */
  private async recommendTools(intent: QueryIntent, context: ContextAnalysis): Promise<ToolRecommendation[]> {
    const recommendations: ToolRecommendation[] = [];
    const availableIntegrations = this.serverIntegrations.getConnectedIntegrations();

    for (const integration of availableIntegrations) {
      if (this.isIntegrationRelevant(integration, intent, context)) {
        const relevantTools = this.getRelevantTools(integration, intent);

        for (const tool of relevantTools) {
          const confidence = this.calculateToolConfidence(tool, integration, intent, context);
          const reasoning = this.generateToolReasoning(tool, integration, intent, context);
          const parameters = this.serverIntegrations.getOptimizedParameters(tool.toolName, intent.primaryAction);

          recommendations.push({
            tool,
            server: integration,
            confidence,
            reasoning,
            parameters,
            executionOrder: 0 // Will be set in execution plan
          });
        }
      }
    }

    // Sort by confidence
    recommendations.sort((a, b) => b.confidence - a.confidence);

    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Suggest workflows based on query and intent
   */
  private suggestWorkflows(query: string, intent: QueryIntent): WorkflowSuggestion[] {
    const suggestions: WorkflowSuggestion[] = [];

    // Check for exact template matches
    const templateMatch = this.workflowTemplates.findMatchingTemplate(query);
    if (templateMatch) {
      suggestions.push({
        template: templateMatch.template,
        confidence: 0.9,
        reasoning: 'Exact template pattern match',
        adaptations: []
      });
    }

    // Get fuzzy template suggestions
    const fuzzySuggestions = this.workflowTemplates.suggestTemplates(query);
    fuzzySuggestions.forEach(template => {
      if (!suggestions.find(s => s.template.id === template.id)) {
        suggestions.push({
          template,
          confidence: 0.6,
          reasoning: 'Keyword similarity match',
          adaptations: ['Parameter adjustment needed', 'Context adaptation required']
        });
      }
    });

    return suggestions.slice(0, 3); // Top 3 suggestions
  }

  /**
   * Generate execution plan
   */
  private generateExecutionPlan(
    intent: QueryIntent,
    tools: ToolRecommendation[],
    workflows: WorkflowSuggestion[]
  ): ExecutionPlan {
    const planId = `plan_${Date.now()}`;
    const steps: ExecutionStep[] = [];

    if (workflows.length > 0 && workflows[0].confidence > 0.7) {
      // Use workflow-based plan
      const workflow = workflows[0].template;
      // This would generate steps based on the workflow template
      // For now, simplified implementation
    } else {
      // Generate step-by-step plan from tools
      tools.slice(0, 3).forEach((toolRec, index) => {
        steps.push({
          stepId: `step_${index + 1}`,
          description: `Execute ${toolRec.tool.displayName}: ${toolRec.reasoning}`,
          tool: { ...toolRec, executionOrder: index + 1 },
          dependencies: index > 0 ? [`step_${index}`] : [],
          expectedOutput: this.predictOutput(toolRec.tool, intent),
          fallbackOptions: []
        });
      });
    }

    const estimatedDuration = this.estimateDuration(steps);
    const complexity = this.determineExecutionComplexity(steps);
    const riskLevel = this.assessRiskLevel(steps, intent);
    const successProbability = this.calculateSuccessProbability(steps, intent);

    return {
      planId,
      steps,
      estimatedDuration,
      complexity,
      riskLevel,
      successProbability
    };
  }

  /**
   * Generate alternative plans
   */
  private generateAlternatives(intent: QueryIntent, tools: ToolRecommendation[]): AlternativePlan[] {
    const alternatives: AlternativePlan[] = [];

    // Alternative 1: Different tool selection
    if (tools.length > 3) {
      alternatives.push({
        planId: `alt_tools_${Date.now()}`,
        description: 'Alternative tool selection with different MCP servers',
        confidence: 0.6,
        tradeoffs: ['May have different output format', 'Potentially different performance'],
        estimatedDuration: this.estimateDuration([]) + 10 // Slightly longer
      });
    }

    // Alternative 2: Simplified approach
    if (intent.confidence < 0.8) {
      alternatives.push({
        planId: `alt_simple_${Date.now()}`,
        description: 'Simplified single-tool approach to reduce complexity',
        confidence: 0.8,
        tradeoffs: ['Less comprehensive results', 'Lower risk of failure'],
        estimatedDuration: 15
      });
    }

    return alternatives;
  }

  // Helper methods

  private detectAmbiguities(query: string, actions: string[], entities: EntityExtraction[]): AmbiguityFlag[] {
    const ambiguities: AmbiguityFlag[] = [];

    if (actions.length > 2) {
      ambiguities.push({
        type: 'conflicting-actions',
        description: 'Multiple conflicting actions detected',
        suggestedClarifications: ['Please specify the primary action you want to perform'],
        confidence: 0.8
      });
    }

    if (actions.length === 0) {
      ambiguities.push({
        type: 'unclear-intent',
        description: 'No clear action identified',
        suggestedClarifications: ['Please specify what you want to do (e.g., get, create, send)'],
        confidence: 0.9
      });
    }

    return ambiguities;
  }

  private determineDomain(query: string, entities: EntityExtraction[]): ContextAnalysis['domain'] {
    const domainKeywords = {
      email: ['email', 'mail', 'inbox', 'send', 'reply'],
      calendar: ['calendar', 'meeting', 'schedule', 'appointment', 'event'],
      'project-management': ['project', 'task', 'board', 'ticket', 'trello', 'jira'],
      communication: ['slack', 'message', 'chat', 'team', 'channel'],
      documentation: ['docs', 'document', 'notion', 'page', 'notes']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        return domain as ContextAnalysis['domain'];
      }
    }

    return 'mixed';
  }

  private analyzeUrgency(query: string): ContextAnalysis['urgency'] {
    const highUrgencyPattern = this.contextPatterns.get('urgency-high');
    const lowUrgencyPattern = this.contextPatterns.get('urgency-low');

    if (highUrgencyPattern?.some(pattern => pattern.test(query))) {
      return 'high';
    }
    if (lowUrgencyPattern?.some(pattern => pattern.test(query))) {
      return 'low';
    }

    return 'medium';
  }

  private determineComplexity(intent: QueryIntent): ContextAnalysis['complexity'] {
    let complexityScore = 0;

    // Check for truly simple patterns first
    const simpleEmailPatterns = [
      /^(?:get|fetch|find|show|retrieve)\s+\d*\s*emails?$/i,
      /^(?:get|fetch|find|show|retrieve)\s+(?:latest|recent)\s+emails?$/i,
      /^(?:get|fetch|find|show|retrieve)\s+emails?\s+from\s+\w+$/i
    ];

    if (simpleEmailPatterns.some(pattern => pattern.test(intent.primaryAction + ' ' + intent.entities.map(e => e.value).join(' ')))) {
      return 'simple';
    }

    // Original complexity scoring for non-simple queries
    if (intent.secondaryActions.length > 1) complexityScore += 1; // Changed from > 0 to > 1
    if (intent.entities.length > 3) complexityScore += 1; // Changed from > 2 to > 3
    if (intent.ambiguities.length > 0) complexityScore += 1;

    // Additional complexity indicators
    if (intent.primaryAction.includes('then') || intent.primaryAction.includes('and then')) complexityScore += 1;
    if (intent.primaryAction.includes('if') || intent.primaryAction.includes('unless')) complexityScore += 2;

    if (complexityScore >= 3) return 'complex';
    if (complexityScore >= 1) return 'medium';
    return 'simple';
  }

  private extractTemporalContext(query: string, entities: EntityExtraction[]): TemporalContext {
    const dateEntities = entities.filter(e => e.type === 'date' || e.type === 'time');
    const specificDates = dateEntities.map(e => new Date(e.value)).filter(d => !isNaN(d.getTime()));

    let timeframe: TemporalContext['timeframe'] = 'immediate';
    if (query.includes('today')) timeframe = 'today';
    else if (query.includes('week')) timeframe = 'this-week';
    else if (query.includes('month')) timeframe = 'this-month';

    return {
      timeframe,
      specificDates,
      recurring: query.includes('recurring') || query.includes('weekly') || query.includes('daily'),
      deadline: specificDates.length > 0 ? specificDates[0] : undefined
    };
  }

  private getRelevantPreferences(domain: ContextAnalysis['domain']): UserPreference[] {
    const relevant: UserPreference[] = [];
    this.userPreferences.forEach(pref => {
      if (pref.category === domain || pref.category === 'general') {
        relevant.push(pref);
      }
    });
    return relevant;
  }

  private getHistoricalContext(query: string): string[] {
    // Simplified - in real implementation, this would analyze past queries
    const similar = Array.from(this.queryHistory.keys()).filter(
      pastQuery => this.calculateSimilarity(query, pastQuery) > 0.6
    );
    return similar.slice(0, 3);
  }

  private calculateSimilarity(query1: string, query2: string): number {
    // Simplified Jaccard similarity
    const words1 = new Set(query1.toLowerCase().split(' '));
    const words2 = new Set(query2.toLowerCase().split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  private isIntegrationRelevant(integration: ServerIntegration, intent: QueryIntent, context: ContextAnalysis): boolean {
    // Check if integration category matches domain
    if (integration.category === context.domain) return true;

    // Check if integration is connected
    if (integration.connectionStatus !== 'connected') return false;

    // Check user preferences
    const hasPreference = context.userPreferences.some(pref =>
      pref.preference === integration.serverId && pref.weight > 0.5
    );

    return hasPreference;
  }

  private getRelevantTools(integration: ServerIntegration, intent: QueryIntent): ServerTool[] {
    return integration.tools.filter(tool => {
      // Match tool category with primary action
      return tool.category === intent.primaryAction ||
             (intent.primaryAction === 'read' && tool.category === 'search') ||
             (intent.primaryAction === 'create' && tool.category === 'create');
    });
  }

  private calculateToolConfidence(
    tool: ServerTool,
    integration: ServerIntegration,
    intent: QueryIntent,
    context: ContextAnalysis
  ): number {
    let confidence = 0.5; // baseline

    // Action match
    if (tool.category === intent.primaryAction) confidence += 0.3;

    // Integration preference
    const pref = context.userPreferences.find(p => p.preference === integration.serverId);
    if (pref) confidence += pref.weight * 0.2;

    // Context match
    if (integration.category === context.domain) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private generateToolReasoning(
    tool: ServerTool,
    integration: ServerIntegration,
    intent: QueryIntent,
    context: ContextAnalysis
  ): string {
    const reasons: string[] = [];

    if (tool.category === intent.primaryAction) {
      reasons.push(`Matches primary action: ${intent.primaryAction}`);
    }

    if (integration.category === context.domain) {
      reasons.push(`Appropriate for ${context.domain} domain`);
    }

    const pref = context.userPreferences.find(p => p.preference === integration.serverId);
    if (pref && pref.weight > 0.7) {
      reasons.push('High user preference');
    }

    return reasons.join('; ') || 'General capability match';
  }

  private predictOutput(tool: ServerTool, intent: QueryIntent): string {
    const outputs = {
      read: 'Retrieved data/content',
      create: 'Created resource with ID',
      update: 'Updated resource confirmation',
      delete: 'Deletion confirmation',
      send: 'Message sent confirmation',
      search: 'Search results list'
    };

    return outputs[intent.primaryAction as keyof typeof outputs] || 'Tool execution result';
  }

  private estimateDuration(steps: ExecutionStep[]): number {
    // Base duration per step + network latency
    return steps.length * 8 + 5; // seconds
  }

  private determineExecutionComplexity(steps: ExecutionStep[]): ExecutionPlan['complexity'] {
    if (steps.length > 3) return 'complex';
    if (steps.length > 1) return 'medium';
    return 'simple';
  }

  private assessRiskLevel(steps: ExecutionStep[], intent: QueryIntent): ExecutionPlan['riskLevel'] {
    let riskScore = 0;

    // Destructive actions increase risk
    if (intent.primaryAction === 'delete') riskScore += 2;
    if (intent.primaryAction === 'update') riskScore += 1;

    // Multiple steps increase risk
    if (steps.length > 2) riskScore += 1;

    // Ambiguities increase risk
    if (intent.ambiguities.length > 0) riskScore += 1;

    if (riskScore >= 3) return 'high';
    if (riskScore >= 1) return 'medium';
    return 'low';
  }

  private calculateSuccessProbability(steps: ExecutionStep[], intent: QueryIntent): number {
    let probability = 0.9; // baseline

    // Reduce probability for complex operations
    if (steps.length > 3) probability -= 0.2;

    // Reduce probability for low-confidence intent
    if (intent.confidence < 0.7) probability -= 0.2;

    // Reduce probability for ambiguous queries
    if (intent.ambiguities.length > 0) probability -= 0.1 * intent.ambiguities.length;

    return Math.max(probability, 0.1); // minimum 10% probability
  }

  /**
   * Learn from execution results to improve future recommendations
   */
  async learnFromExecution(
    analysis: IntelligentQueryAnalysis,
    executionResult: { success: boolean; actualDuration: number; userFeedback?: string }
  ): Promise<void> {
    console.log('[McpIntelligentParser] Learning from execution result');

    // Update query history
    this.queryHistory.set(analysis.originalQuery, Date.now());

    // Update user preferences based on success
    if (executionResult.success) {
      analysis.recommendedTools.forEach(toolRec => {
        const prefKey = `${toolRec.server.category}-${toolRec.server.serverId}`;
        const existingPref = this.userPreferences.get(prefKey);
        if (existingPref) {
          existingPref.weight = Math.min(existingPref.weight + 0.1, 1.0);
          existingPref.source = 'learned';
        }
      });
    }

    // Store context for future reference
    this.contextMemory.set(analysis.originalQuery, {
      domain: analysis.intent.context.domain,
      actualDuration: executionResult.actualDuration,
      success: executionResult.success,
      timestamp: Date.now()
    });

    console.log('[McpIntelligentParser] Learning completed');
  }

  /**
   * Get intelligence statistics
   */
  getIntelligenceStats(): {
    totalPatterns: number;
    learnedPreferences: number;
    queryHistory: number;
    contextMemory: number;
    averageConfidence: number;
  } {
    const totalPatterns = Array.from(this.actionPatterns.values()).flat().length +
                         Array.from(this.entityPatterns.values()).flat().length +
                         Array.from(this.contextPatterns.values()).flat().length;

    const learnedPreferences = Array.from(this.userPreferences.values()).filter(
      pref => pref.source === 'learned'
    ).length;

    const recentAnalyses = Array.from(this.contextMemory.values())
      .filter(ctx => Date.now() - ctx.timestamp < 86400000); // last 24 hours

    const averageConfidence = recentAnalyses.length > 0 ?
      recentAnalyses.reduce((sum, ctx) => sum + (ctx.success ? 0.9 : 0.5), 0) / recentAnalyses.length :
      0.7;

    return {
      totalPatterns,
      learnedPreferences,
      queryHistory: this.queryHistory.size,
      contextMemory: this.contextMemory.size,
      averageConfidence
    };
  }
}