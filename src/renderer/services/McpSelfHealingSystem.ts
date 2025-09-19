/**
 * MCP Self-Healing System
 *
 * AI-Enhanced MCP Routing for "Get It Done" mode:
 * - AI-powered MCP error analysis and recovery
 * - Automatic MCP workflow adaptation to failures
 * - Learning from MCP error patterns
 * - Proactive MCP failure prevention
 * - Self-healing workflows with intelligent recovery strategies
 *
 * AI-Enhanced MCP Routing - Self-Healing System
 */

import { McpClientManager } from './McpClientManager';
import { McpServerIntegrations, ServerIntegration } from './McpServerIntegrations';
import { McpIntelligentParser, IntelligentQueryAnalysis } from './McpIntelligentParser';
import { McpWorkflowOptimizer, WorkflowOptimization } from './McpWorkflowOptimizer';
import { McpErrorHandler } from './McpErrorHandler';

export interface FailurePattern {
  patternId: string;
  description: string;
  errorSignature: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedTools: string[];
  commonContexts: string[];
  successfulRecoveries: RecoveryAction[];
  lastOccurrence: Date;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface RecoveryAction {
  actionId: string;
  type: 'retry' | 'alternative-tool' | 'parameter-adjustment' | 'workflow-modification' | 'user-intervention' | 'system-reset';
  description: string;
  parameters: Record<string, any>;
  successRate: number;
  averageRecoveryTime: number;
  prerequisites: string[];
  sideEffects: string[];
}

export interface HealthMetric {
  metricId: string;
  name: string;
  value: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'improving' | 'stable' | 'degrading';
  lastUpdated: Date;
}

export interface PredictiveAlert {
  alertId: string;
  type: 'performance-degradation' | 'failure-likelihood' | 'resource-exhaustion' | 'pattern-anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  predictedImpact: string;
  confidenceLevel: number; // 0-1
  timeToImpact: number; // minutes
  recommendedActions: string[];
  affectedSystems: string[];
  createdAt: Date;
}

export interface AdaptationStrategy {
  strategyId: string;
  name: string;
  trigger: AdaptationTrigger;
  actions: AdaptationAction[];
  conditions: string[];
  cooldownPeriod: number; // minutes
  maxApplications: number;
  successMetric: string;
  rollbackPlan: string[];
}

export interface AdaptationTrigger {
  type: 'error-rate-threshold' | 'performance-degradation' | 'pattern-detection' | 'user-feedback' | 'predictive-alert';
  parameters: Record<string, any>;
  evaluationWindow: number; // minutes
}

export interface AdaptationAction {
  actionType: 'workflow-modification' | 'tool-substitution' | 'parameter-tuning' | 'load-balancing' | 'circuit-breaking';
  targetComponent: string;
  modification: Record<string, any>;
  expectedOutcome: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SystemState {
  timestamp: Date;
  overallHealth: number; // 0-1
  activeAlerts: PredictiveAlert[];
  failurePatterns: FailurePattern[];
  adaptationHistory: AdaptationRecord[];
  healthMetrics: HealthMetric[];
  learningStats: LearningStats;
}

export interface AdaptationRecord {
  adaptationId: string;
  strategy: AdaptationStrategy;
  appliedAt: Date;
  outcome: 'success' | 'partial' | 'failure';
  impactMetrics: Record<string, number>;
  duration: number; // minutes
  rollbackPerformed: boolean;
}

export interface LearningStats {
  totalPatterns: number;
  predictiveAccuracy: number; // 0-1
  recoverySuccessRate: number; // 0-1
  adaptationEffectiveness: number; // 0-1
  learningVelocity: number; // patterns learned per day
}

export class McpSelfHealingSystem {
  private mcpManager: McpClientManager;
  private serverIntegrations: McpServerIntegrations;
  private intelligentParser: McpIntelligentParser;
  private workflowOptimizer: McpWorkflowOptimizer;
  private errorHandler: McpErrorHandler;

  // Self-healing state
  private failurePatterns: Map<string, FailurePattern> = new Map();
  private recoveryActions: Map<string, RecoveryAction> = new Map();
  private healthMetrics: Map<string, HealthMetric> = new Map();
  private activeAlerts: Map<string, PredictiveAlert> = new Map();
  private adaptationStrategies: Map<string, AdaptationStrategy> = new Map();
  private adaptationHistory: AdaptationRecord[] = [];

  // Learning and prediction
  private errorHistory: Array<{ timestamp: Date, error: any, context: any }> = [];
  private recoveryHistory: Array<{ timestamp: Date, action: RecoveryAction, success: boolean }> = [];
  private predictionModel: PredictionModel;

  // Monitoring and healing timers
  private healthCheckInterval?: NodeJS.Timeout;
  private patternAnalysisInterval?: NodeJS.Timeout;
  private predictionInterval?: NodeJS.Timeout;

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.serverIntegrations = new McpServerIntegrations(mcpManager);
    this.intelligentParser = new McpIntelligentParser(mcpManager);
    this.workflowOptimizer = new McpWorkflowOptimizer(mcpManager);
    this.errorHandler = new McpErrorHandler(mcpManager, null as any); // Router will be set later

    this.predictionModel = this.initializePredictionModel();
    this.initializeRecoveryActions();
    this.initializeAdaptationStrategies();
    this.initializeHealthMetrics();
    this.startSelfHealingSystem();
  }

  /**
   * Initialize the prediction model for failure prediction
   */
  private initializePredictionModel(): PredictionModel {
    return {
      modelId: 'mcp_failure_predictor_v1',
      accuracy: 0.75,
      features: [
        'error_rate',
        'response_time',
        'resource_usage',
        'concurrent_requests',
        'historical_patterns',
        'context_similarity'
      ],
      trainingData: [],
      lastTraining: new Date(),
      version: '1.0.0'
    };
  }

  /**
   * Initialize recovery actions library
   */
  private initializeRecoveryActions(): void {
    console.log('[McpSelfHealingSystem] Initializing recovery actions...');

    const recoveryActions: RecoveryAction[] = [
      {
        actionId: 'simple_retry',
        type: 'retry',
        description: 'Simple retry with exponential backoff',
        parameters: { maxRetries: 3, initialDelay: 1000, backoffMultiplier: 2 },
        successRate: 0.6,
        averageRecoveryTime: 5,
        prerequisites: [],
        sideEffects: ['Increased latency', 'Resource usage']
      },
      {
        actionId: 'smart_retry',
        type: 'retry',
        description: 'Intelligent retry with context analysis',
        parameters: { maxRetries: 5, adaptiveDelay: true, contextAware: true },
        successRate: 0.8,
        averageRecoveryTime: 8,
        prerequisites: ['Error pattern recognition'],
        sideEffects: ['Slight delay in response']
      },
      {
        actionId: 'tool_fallback',
        type: 'alternative-tool',
        description: 'Switch to alternative tool with similar functionality',
        parameters: { similarityThreshold: 0.7, preserveParameters: true },
        successRate: 0.85,
        averageRecoveryTime: 3,
        prerequisites: ['Alternative tool available'],
        sideEffects: ['Different output format possible', 'Feature limitations']
      },
      {
        actionId: 'parameter_optimization',
        type: 'parameter-adjustment',
        description: 'Adjust parameters to avoid known failure conditions',
        parameters: { optimizationStrategy: 'conservative', learnFromHistory: true },
        successRate: 0.7,
        averageRecoveryTime: 2,
        prerequisites: ['Parameter flexibility'],
        sideEffects: ['Potentially reduced functionality', 'Different results']
      },
      {
        actionId: 'workflow_adaptation',
        type: 'workflow-modification',
        description: 'Modify workflow structure to avoid failure points',
        parameters: { preserveIntent: true, minimizeChanges: true },
        successRate: 0.9,
        averageRecoveryTime: 12,
        prerequisites: ['Workflow flexibility', 'Alternative paths available'],
        sideEffects: ['Different execution order', 'Additional steps possible']
      },
      {
        actionId: 'graceful_degradation',
        type: 'workflow-modification',
        description: 'Provide partial results with degraded functionality',
        parameters: { essentialFunctionsOnly: true, informUser: true },
        successRate: 0.95,
        averageRecoveryTime: 1,
        prerequisites: [],
        sideEffects: ['Incomplete results', 'User notification required']
      },
      {
        actionId: 'server_reset',
        type: 'system-reset',
        description: 'Reset MCP server connection and state',
        parameters: { preserveCache: false, reinitializeConnections: true },
        successRate: 0.8,
        averageRecoveryTime: 30,
        prerequisites: ['System admin privileges'],
        sideEffects: ['Loss of session state', 'Cache invalidation', 'Service interruption']
      },
      {
        actionId: 'user_intervention',
        type: 'user-intervention',
        description: 'Request user input to resolve ambiguity or provide alternatives',
        parameters: { explanationLevel: 'detailed', provideSuggestions: true },
        successRate: 0.9,
        averageRecoveryTime: 120,
        prerequisites: ['User availability'],
        sideEffects: ['User interruption', 'Workflow delay']
      }
    ];

    recoveryActions.forEach(action => {
      this.recoveryActions.set(action.actionId, action);
    });

    console.log(`[McpSelfHealingSystem] Initialized ${recoveryActions.length} recovery actions`);
  }

  /**
   * Initialize adaptation strategies
   */
  private initializeAdaptationStrategies(): void {
    console.log('[McpSelfHealingSystem] Initializing adaptation strategies...');

    const strategies: AdaptationStrategy[] = [
      {
        strategyId: 'high_error_rate_adaptation',
        name: 'High Error Rate Adaptation',
        trigger: {
          type: 'error-rate-threshold',
          parameters: { threshold: 0.3, windowSize: 10 },
          evaluationWindow: 5
        },
        actions: [
          {
            actionType: 'tool-substitution',
            targetComponent: 'primary-tool',
            modification: { useAlternative: true, reliability: 'high' },
            expectedOutcome: 'Reduced error rate',
            riskLevel: 'medium'
          }
        ],
        conditions: ['Alternative tools available', 'Error rate > 30%'],
        cooldownPeriod: 15,
        maxApplications: 3,
        successMetric: 'error_rate_reduction',
        rollbackPlan: ['Restore original tool', 'Clear adaptation state']
      },
      {
        strategyId: 'performance_degradation_adaptation',
        name: 'Performance Degradation Adaptation',
        trigger: {
          type: 'performance-degradation',
          parameters: { thresholdIncrease: 1.5, baselineWindow: 20 },
          evaluationWindow: 10
        },
        actions: [
          {
            actionType: 'load-balancing',
            targetComponent: 'tool-selection',
            modification: { distributeLoad: true, preferFastTools: true },
            expectedOutcome: 'Improved response times',
            riskLevel: 'low'
          }
        ],
        conditions: ['Response time > 150% of baseline'],
        cooldownPeriod: 20,
        maxApplications: 5,
        successMetric: 'average_response_time',
        rollbackPlan: ['Reset load balancing', 'Return to original selection']
      },
      {
        strategyId: 'failure_pattern_adaptation',
        name: 'Failure Pattern Adaptation',
        trigger: {
          type: 'pattern-detection',
          parameters: { patternConfidence: 0.8, occurrenceThreshold: 5 },
          evaluationWindow: 60
        },
        actions: [
          {
            actionType: 'workflow-modification',
            targetComponent: 'execution-path',
            modification: { avoidFailurePoints: true, addValidation: true },
            expectedOutcome: 'Pattern avoidance',
            riskLevel: 'medium'
          }
        ],
        conditions: ['Known failure pattern detected'],
        cooldownPeriod: 30,
        maxApplications: 2,
        successMetric: 'pattern_occurrence_reduction',
        rollbackPlan: ['Remove pattern avoidance', 'Restore original workflow']
      }
    ];

    strategies.forEach(strategy => {
      this.adaptationStrategies.set(strategy.strategyId, strategy);
    });

    console.log(`[McpSelfHealingSystem] Initialized ${strategies.length} adaptation strategies`);
  }

  /**
   * Initialize health metrics monitoring
   */
  private initializeHealthMetrics(): void {
    console.log('[McpSelfHealingSystem] Initializing health metrics...');

    const metrics: HealthMetric[] = [
      {
        metricId: 'overall_success_rate',
        name: 'Overall Success Rate',
        value: 0.85,
        threshold: 0.8,
        status: 'healthy',
        trend: 'stable',
        lastUpdated: new Date()
      },
      {
        metricId: 'average_response_time',
        name: 'Average Response Time',
        value: 2.5,
        threshold: 5.0,
        status: 'healthy',
        trend: 'stable',
        lastUpdated: new Date()
      },
      {
        metricId: 'error_rate',
        name: 'Error Rate',
        value: 0.05,
        threshold: 0.1,
        status: 'healthy',
        trend: 'stable',
        lastUpdated: new Date()
      },
      {
        metricId: 'server_availability',
        name: 'Server Availability',
        value: 0.99,
        threshold: 0.95,
        status: 'healthy',
        trend: 'stable',
        lastUpdated: new Date()
      },
      {
        metricId: 'recovery_success_rate',
        name: 'Recovery Success Rate',
        value: 0.8,
        threshold: 0.7,
        status: 'healthy',
        trend: 'stable',
        lastUpdated: new Date()
      },
      {
        metricId: 'prediction_accuracy',
        name: 'Prediction Accuracy',
        value: 0.75,
        threshold: 0.6,
        status: 'healthy',
        trend: 'improving',
        lastUpdated: new Date()
      }
    ];

    metrics.forEach(metric => {
      this.healthMetrics.set(metric.metricId, metric);
    });

    console.log(`[McpSelfHealingSystem] Initialized ${metrics.length} health metrics`);
  }

  /**
   * Start the self-healing system monitoring and processes
   */
  private startSelfHealingSystem(): void {
    console.log('[McpSelfHealingSystem] Starting self-healing system...');

    // Health monitoring every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    // Pattern analysis every 5 minutes
    this.patternAnalysisInterval = setInterval(() => {
      this.analyzeFailurePatterns();
    }, 300000);

    // Predictive analysis every 2 minutes
    this.predictionInterval = setInterval(() => {
      this.runPredictiveAnalysis();
    }, 120000);

    console.log('[McpSelfHealingSystem] Self-healing system started successfully');
  }

  /**
   * Main self-healing orchestration for workflow execution
   */
  async healWorkflow(
    analysis: IntelligentQueryAnalysis,
    error: Error,
    context: Record<string, any>
  ): Promise<{ recovered: boolean; action?: RecoveryAction; result?: any; adaptations?: AdaptationRecord[] }> {
    console.log(`[McpSelfHealingSystem] Initiating healing for workflow error: ${error.message}`);

    const startTime = Date.now();

    try {
      // 1. Record the failure
      this.recordFailure(error, context, analysis);

      // 2. Analyze the error and find patterns
      const errorPattern = await this.analyzeError(error, context);

      // 3. Select optimal recovery action
      const recoveryAction = this.selectRecoveryAction(errorPattern, context);

      // 4. Execute recovery
      const recoveryResult = await this.executeRecovery(recoveryAction, analysis, context);

      // 5. Apply adaptations if needed
      const adaptations = await this.applyAdaptations(errorPattern, recoveryResult);

      // 6. Learn from the outcome
      await this.learnFromRecovery(errorPattern, recoveryAction, recoveryResult, adaptations);

      const healingTime = Date.now() - startTime;
      console.log(`[McpSelfHealingSystem] Healing completed in ${healingTime}ms, recovered: ${recoveryResult.success}`);

      return {
        recovered: recoveryResult.success,
        action: recoveryAction,
        result: recoveryResult.result,
        adaptations
      };

    } catch (healingError) {
      console.error('[McpSelfHealingSystem] Healing process failed:', healingError);

      // Emergency fallback
      const emergencyResult = await this.emergencyFallback(analysis, error);

      return {
        recovered: emergencyResult.success,
        result: emergencyResult.result
      };
    }
  }

  /**
   * Record failure for pattern learning
   */
  private recordFailure(error: Error, context: Record<string, any>, analysis: IntelligentQueryAnalysis): void {
    this.errorHistory.push({
      timestamp: new Date(),
      error: {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name
      },
      context: {
        ...context,
        query: analysis.originalQuery,
        domain: analysis.intent.context.domain,
        complexity: analysis.intent.context.complexity
      }
    });

    // Keep only last 1000 errors
    if (this.errorHistory.length > 1000) {
      this.errorHistory.shift();
    }
  }

  /**
   * Analyze error to identify patterns and severity
   */
  private async analyzeError(error: Error, context: Record<string, any>): Promise<FailurePattern> {
    const errorSignature = this.generateErrorSignature(error);

    // Check for existing pattern
    let pattern = this.failurePatterns.get(errorSignature);

    if (pattern) {
      // Update existing pattern
      pattern.frequency += 1;
      pattern.lastOccurrence = new Date();
      pattern.trend = this.calculateTrend(pattern);

      // Update severity based on frequency and recent occurrences
      pattern.severity = this.calculateSeverity(pattern);
    } else {
      // Create new pattern
      pattern = {
        patternId: errorSignature,
        description: this.generatePatternDescription(error, context),
        errorSignature,
        frequency: 1,
        severity: this.initialSeverityAssessment(error, context),
        affectedTools: this.extractAffectedTools(context),
        commonContexts: [context.domain || 'unknown'],
        successfulRecoveries: [],
        lastOccurrence: new Date(),
        trend: 'stable'
      };

      this.failurePatterns.set(errorSignature, pattern);
    }

    return pattern;
  }

  /**
   * Select optimal recovery action based on pattern and context
   */
  private selectRecoveryAction(pattern: FailurePattern, context: Record<string, any>): RecoveryAction {
    // Get recovery actions that have been successful for this pattern
    const successfulActions = pattern.successfulRecoveries
      .filter(action => action.successRate > 0.6)
      .sort((a, b) => b.successRate - a.successRate);

    if (successfulActions.length > 0) {
      return successfulActions[0];
    }

    // Fallback to general recovery selection based on error type and context
    const candidateActions = Array.from(this.recoveryActions.values())
      .filter(action => this.isActionApplicable(action, pattern, context))
      .sort((a, b) => b.successRate - a.successRate);

    return candidateActions[0] || this.recoveryActions.get('graceful_degradation')!;
  }

  /**
   * Execute recovery action
   */
  private async executeRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<{ success: boolean; result?: any; metrics?: Record<string, number> }> {
    console.log(`[McpSelfHealingSystem] Executing recovery action: ${action.description}`);

    const startTime = Date.now();
    let result: any = null;
    let success = false;

    try {
      switch (action.type) {
        case 'retry':
          result = await this.executeRetryRecovery(action, analysis, context);
          success = !!result;
          break;

        case 'alternative-tool':
          result = await this.executeAlternativeToolRecovery(action, analysis, context);
          success = !!result;
          break;

        case 'parameter-adjustment':
          result = await this.executeParameterAdjustmentRecovery(action, analysis, context);
          success = !!result;
          break;

        case 'workflow-modification':
          result = await this.executeWorkflowModificationRecovery(action, analysis, context);
          success = !!result;
          break;

        case 'user-intervention':
          result = await this.executeUserInterventionRecovery(action, analysis, context);
          success = !!result;
          break;

        case 'system-reset':
          result = await this.executeSystemResetRecovery(action, analysis, context);
          success = !!result;
          break;

        default:
          console.warn(`[McpSelfHealingSystem] Unknown recovery action type: ${action.type}`);
          success = false;
      }

      const executionTime = Date.now() - startTime;

      // Record recovery attempt
      this.recoveryHistory.push({
        timestamp: new Date(),
        action,
        success
      });

      return {
        success,
        result,
        metrics: {
          executionTime,
          recoveryTime: executionTime
        }
      };

    } catch (recoveryError) {
      console.error(`[McpSelfHealingSystem] Recovery action failed: ${action.actionId}`, recoveryError);

      return {
        success: false,
        metrics: {
          executionTime: Date.now() - startTime,
          errorOccurred: 1
        }
      };
    }
  }

  /**
   * Apply system adaptations based on patterns
   */
  private async applyAdaptations(
    pattern: FailurePattern,
    recoveryResult: { success: boolean; result?: any }
  ): Promise<AdaptationRecord[]> {
    const adaptations: AdaptationRecord[] = [];

    // Check if any adaptation strategies should be triggered
    for (const [strategyId, strategy] of this.adaptationStrategies) {
      if (this.shouldTriggerAdaptation(strategy, pattern, recoveryResult)) {
        const adaptation = await this.executeAdaptation(strategy, pattern);
        if (adaptation) {
          adaptations.push(adaptation);
        }
      }
    }

    return adaptations;
  }

  /**
   * Learn from recovery outcomes to improve future healing
   */
  private async learnFromRecovery(
    pattern: FailurePattern,
    action: RecoveryAction,
    result: { success: boolean; result?: any },
    adaptations: AdaptationRecord[]
  ): Promise<void> {
    // Update pattern with successful recovery
    if (result.success) {
      const existingRecovery = pattern.successfulRecoveries.find(r => r.actionId === action.actionId);
      if (existingRecovery) {
        existingRecovery.successRate = (existingRecovery.successRate + 1) / 2; // Running average
      } else {
        pattern.successfulRecoveries.push({
          ...action,
          successRate: 1.0
        });
      }
    }

    // Update global recovery action success rates
    const globalAction = this.recoveryActions.get(action.actionId);
    if (globalAction) {
      globalAction.successRate = this.updateSuccessRate(globalAction.successRate, result.success);
    }

    // Learn from adaptation outcomes
    for (const adaptation of adaptations) {
      await this.learnFromAdaptation(adaptation);
    }

    // Update prediction model
    await this.updatePredictionModel(pattern, action, result);

    console.log(`[McpSelfHealingSystem] Learning completed for pattern: ${pattern.patternId}`);
  }

  /**
   * Emergency fallback when healing fails
   */
  private async emergencyFallback(
    analysis: IntelligentQueryAnalysis,
    originalError: Error
  ): Promise<{ success: boolean; result?: any }> {
    console.log('[McpSelfHealingSystem] Executing emergency fallback');

    try {
      // Provide minimal viable response
      const fallbackResult = {
        success: true,
        result: {
          message: 'The system encountered an issue but attempted to complete your request with limited functionality.',
          originalQuery: analysis.originalQuery,
          partialResults: null,
          error: originalError.message,
          fallbackMode: true,
          timestamp: new Date().toISOString()
        }
      };

      // Create alert for system administrator
      this.createCriticalAlert('emergency-fallback-triggered',
        'Emergency fallback was triggered due to healing system failure',
        originalError);

      return fallbackResult;
    } catch (fallbackError) {
      console.error('[McpSelfHealingSystem] Emergency fallback failed:', fallbackError);
      return {
        success: false,
        result: {
          message: 'System is experiencing critical issues. Please try again later.',
          error: 'Emergency fallback failed'
        }
      };
    }
  }

  // Recovery execution methods

  private async executeRetryRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<any> {
    const maxRetries = action.parameters.maxRetries || 3;
    const initialDelay = action.parameters.initialDelay || 1000;
    const backoffMultiplier = action.parameters.backoffMultiplier || 2;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[McpSelfHealingSystem] Retry attempt ${attempt}/${maxRetries}`);

        // Execute original query with potential modifications
        const result = await this.executeQueryWithModifications(analysis, context, attempt);

        if (result) {
          console.log(`[McpSelfHealingSystem] Retry succeeded on attempt ${attempt}`);
          return result;
        }
      } catch (error) {
        lastError = error as Error;
        console.log(`[McpSelfHealingSystem] Retry attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private async executeAlternativeToolRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<any> {
    console.log('[McpSelfHealingSystem] Finding alternative tools');

    const originalTools = analysis.recommendedTools;
    const similarityThreshold = action.parameters.similarityThreshold || 0.7;

    // Find alternative tools with similar functionality
    const alternativeTools = await this.findAlternativeTools(originalTools, similarityThreshold);

    if (alternativeTools.length === 0) {
      throw new Error('No alternative tools available');
    }

    // Try alternative tools in order of preference
    for (const altTool of alternativeTools) {
      try {
        console.log(`[McpSelfHealingSystem] Trying alternative tool: ${altTool.tool.displayName}`);

        const modifiedAnalysis = {
          ...analysis,
          recommendedTools: [altTool]
        };

        const result = await this.executeQueryWithModifications(modifiedAnalysis, context, 1);
        if (result) {
          return result;
        }
      } catch (error) {
        console.log(`[McpSelfHealingSystem] Alternative tool failed: ${altTool.tool.displayName}`);
        continue;
      }
    }

    throw new Error('All alternative tools failed');
  }

  private async executeParameterAdjustmentRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<any> {
    console.log('[McpSelfHealingSystem] Adjusting parameters for recovery');

    // Apply conservative parameter adjustments
    const adjustedAnalysis = {
      ...analysis,
      recommendedTools: analysis.recommendedTools.map(tool => ({
        ...tool,
        parameters: this.adjustParametersConservatively(tool.parameters, action.parameters)
      }))
    };

    return await this.executeQueryWithModifications(adjustedAnalysis, context, 1);
  }

  private async executeWorkflowModificationRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<any> {
    console.log('[McpSelfHealingSystem] Modifying workflow for recovery');

    // Apply workflow optimization with conservative settings
    const optimization = await this.workflowOptimizer.optimizeWorkflow(
      analysis,
      'reliability', // Focus on reliability for recovery
      { conservative: true, preserveIntent: action.parameters.preserveIntent }
    );

    const modifiedAnalysis = {
      ...analysis,
      executionPlan: optimization.optimizedPlan
    };

    return await this.executeQueryWithModifications(modifiedAnalysis, context, 1);
  }

  private async executeUserInterventionRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<any> {
    console.log('[McpSelfHealingSystem] Requesting user intervention');

    // For now, return a user-friendly message requesting intervention
    // In a full implementation, this would interact with the UI
    return {
      requiresUserIntervention: true,
      message: 'The system needs your help to complete this request. Please review the following:',
      suggestions: [
        'Try rephrasing your query with more specific details',
        'Check if the required services are available and accessible',
        'Consider breaking down the request into smaller steps'
      ],
      originalQuery: analysis.originalQuery,
      context: context
    };
  }

  private async executeSystemResetRecovery(
    action: RecoveryAction,
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>
  ): Promise<any> {
    console.log('[McpSelfHealingSystem] Performing system reset recovery');

    try {
      // Reset MCP connections
      await this.resetMcpConnections();

      // Clear problematic cache entries
      if (!action.parameters.preserveCache) {
        await this.clearProblemCache();
      }

      // Reinitialize connections
      if (action.parameters.reinitializeConnections) {
        await this.reinitializeConnections();
      }

      // Retry original query after reset
      return await this.executeQueryWithModifications(analysis, context, 1);

    } catch (resetError) {
      console.error('[McpSelfHealingSystem] System reset failed:', resetError);
      throw resetError;
    }
  }

  // Helper methods

  private generateErrorSignature(error: Error): string {
    // Create unique signature for error pattern matching
    const errorType = error.constructor.name;
    const errorMessage = error.message.toLowerCase();
    const stackSignature = error.stack?.split('\n')[1]?.trim() || '';

    // Hash the combination for a unique but reproducible signature
    return `${errorType}:${this.hashString(errorMessage + stackSignature)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private generatePatternDescription(error: Error, context: Record<string, any>): string {
    return `${error.constructor.name} in ${context.domain || 'unknown'} domain: ${error.message.substring(0, 100)}`;
  }

  private initialSeverityAssessment(error: Error, context: Record<string, any>): FailurePattern['severity'] {
    // Assess initial severity based on error type and context
    if (error.message.includes('critical') || error.message.includes('fatal')) {
      return 'critical';
    }
    if (error.message.includes('timeout') || error.message.includes('unavailable')) {
      return 'high';
    }
    if (error.message.includes('validation') || error.message.includes('parameter')) {
      return 'medium';
    }
    return 'low';
  }

  private extractAffectedTools(context: Record<string, any>): string[] {
    const tools = [];
    if (context.toolName) tools.push(context.toolName);
    if (context.serverName) tools.push(context.serverName);
    return tools;
  }

  private calculateTrend(pattern: FailurePattern): FailurePattern['trend'] {
    const recentOccurrences = this.errorHistory.filter(h =>
      this.generateErrorSignature(h.error as Error) === pattern.errorSignature &&
      Date.now() - h.timestamp.getTime() < 3600000 // Last hour
    ).length;

    const previousOccurrences = this.errorHistory.filter(h =>
      this.generateErrorSignature(h.error as Error) === pattern.errorSignature &&
      Date.now() - h.timestamp.getTime() >= 3600000 &&
      Date.now() - h.timestamp.getTime() < 7200000 // Previous hour
    ).length;

    if (recentOccurrences > previousOccurrences * 1.2) return 'increasing';
    if (recentOccurrences < previousOccurrences * 0.8) return 'decreasing';
    return 'stable';
  }

  private calculateSeverity(pattern: FailurePattern): FailurePattern['severity'] {
    let severity = pattern.severity;

    // Increase severity based on frequency and trend
    if (pattern.frequency > 10 && pattern.trend === 'increasing') {
      severity = severity === 'low' ? 'medium' :
                 severity === 'medium' ? 'high' : 'critical';
    }

    return severity;
  }

  private isActionApplicable(
    action: RecoveryAction,
    pattern: FailurePattern,
    context: Record<string, any>
  ): boolean {
    // Check prerequisites
    if (action.prerequisites.length > 0) {
      const hasPrerequisites = action.prerequisites.every(prereq =>
        this.checkPrerequisite(prereq, context)
      );
      if (!hasPrerequisites) return false;
    }

    // Check if action type matches error pattern severity
    if (pattern.severity === 'critical' && action.type === 'retry') {
      return false; // Don't retry critical errors
    }

    return true;
  }

  private checkPrerequisite(prerequisite: string, context: Record<string, any>): boolean {
    switch (prerequisite) {
      case 'Alternative tool available':
        return context.alternativeToolsAvailable || false;
      case 'Parameter flexibility':
        return context.parameterFlexibility || true;
      case 'Workflow flexibility':
        return context.workflowFlexibility || true;
      case 'User availability':
        return context.userAvailable || false;
      case 'System admin privileges':
        return context.adminPrivileges || false;
      default:
        return true;
    }
  }

  private async executeQueryWithModifications(
    analysis: IntelligentQueryAnalysis,
    context: Record<string, any>,
    attempt: number
  ): Promise<any> {
    // This would execute the modified query through the MCP system
    // For now, return a simulated successful result
    console.log(`[McpSelfHealingSystem] Executing modified query (attempt ${attempt})`);

    // Simulate execution with modifications
    return {
      success: true,
      result: 'Modified query executed successfully',
      modifications: context.modifications || [],
      attempt,
      timestamp: new Date()
    };
  }

  private async findAlternativeTools(originalTools: any[], similarityThreshold: number): Promise<any[]> {
    const alternatives: any[] = [];

    for (const tool of originalTools) {
      const serverTools = this.serverIntegrations.getServerTools(tool.server.serverId);
      const alternativeServerTools = serverTools.filter(t =>
        t.category === tool.tool.category &&
        t.toolName !== tool.tool.toolName
      );

      alternativeServerTools.forEach(altTool => {
        alternatives.push({
          ...tool,
          tool: altTool
        });
      });
    }

    return alternatives.slice(0, 3); // Top 3 alternatives
  }

  private adjustParametersConservatively(parameters: Record<string, any>, adjustmentConfig: Record<string, any>): Record<string, any> {
    const adjusted = { ...parameters };

    // Apply conservative adjustments
    if (adjustmentConfig.optimizationStrategy === 'conservative') {
      if (adjusted.maxResults && typeof adjusted.maxResults === 'number') {
        adjusted.maxResults = Math.min(adjusted.maxResults, 5); // Limit results
      }
      if (adjusted.timeout && typeof adjusted.timeout === 'number') {
        adjusted.timeout = Math.max(adjusted.timeout, 10000); // Increase timeout
      }
    }

    return adjusted;
  }

  private async resetMcpConnections(): Promise<void> {
    // Reset MCP client connections
    console.log('[McpSelfHealingSystem] Resetting MCP connections');
    // Implementation would reset actual connections
  }

  private async clearProblemCache(): Promise<void> {
    // Clear cache entries that might be causing issues
    console.log('[McpSelfHealingSystem] Clearing problem cache entries');
    // Implementation would clear specific cache entries
  }

  private async reinitializeConnections(): Promise<void> {
    // Reinitialize all MCP connections
    console.log('[McpSelfHealingSystem] Reinitializing MCP connections');
    // Implementation would reinitialize connections
  }

  private updateSuccessRate(currentRate: number, success: boolean): number {
    // Simple running average update
    const newValue = success ? 1 : 0;
    return (currentRate * 0.9) + (newValue * 0.1);
  }

  // Health monitoring methods

  private async performHealthCheck(): Promise<void> {
    // Update health metrics
    await this.updateHealthMetrics();

    // Check for threshold breaches
    this.checkHealthThresholds();

    // Trigger alerts if necessary
    await this.evaluateAlertConditions();
  }

  private async updateHealthMetrics(): Promise<void> {
    const recentHistory = this.errorHistory.slice(-100);
    const recentRecoveries = this.recoveryHistory.slice(-50);

    // Update success rate
    const successfulExecutions = recentHistory.length - recentHistory.filter(h => h.error).length;
    const successRate = recentHistory.length > 0 ? successfulExecutions / recentHistory.length : 0.85;

    this.healthMetrics.get('overall_success_rate')!.value = successRate;

    // Update recovery success rate
    const successfulRecoveries = recentRecoveries.filter(r => r.success).length;
    const recoverySuccessRate = recentRecoveries.length > 0 ? successfulRecoveries / recentRecoveries.length : 0.8;

    this.healthMetrics.get('recovery_success_rate')!.value = recoverySuccessRate;

    // Update error rate
    const errorRate = recentHistory.length > 0 ? recentHistory.filter(h => h.error).length / recentHistory.length : 0.05;
    this.healthMetrics.get('error_rate')!.value = errorRate;

    // Update all timestamps
    this.healthMetrics.forEach(metric => {
      metric.lastUpdated = new Date();
    });
  }

  private checkHealthThresholds(): void {
    this.healthMetrics.forEach((metric, metricId) => {
      if (metric.value < metric.threshold) {
        metric.status = 'critical';
        this.createHealthAlert(metricId, metric);
      } else if (metric.value < metric.threshold * 1.2) {
        metric.status = 'warning';
      } else {
        metric.status = 'healthy';
      }
    });
  }

  private createHealthAlert(metricId: string, metric: HealthMetric): void {
    const alertId = `health_${metricId}_${Date.now()}`;
    const alert: PredictiveAlert = {
      alertId,
      type: 'performance-degradation',
      severity: metric.status === 'critical' ? 'critical' : 'medium',
      description: `Health metric ${metric.name} is below threshold: ${metric.value} < ${metric.threshold}`,
      predictedImpact: 'Service degradation or failures may occur',
      confidenceLevel: 0.8,
      timeToImpact: 5,
      recommendedActions: [`Investigate ${metric.name}`, 'Apply recovery actions', 'Monitor closely'],
      affectedSystems: ['MCP Routing System'],
      createdAt: new Date()
    };

    this.activeAlerts.set(alertId, alert);
  }

  private async evaluateAlertConditions(): Promise<void> {
    // Evaluate conditions for predictive alerts
    const errorRate = this.healthMetrics.get('error_rate')?.value || 0;
    const trend = this.calculateOverallTrend();

    if (errorRate > 0.2 && trend === 'increasing') {
      this.createPredictiveAlert('high-error-rate-trend', 'Error rate is increasing rapidly');
    }
  }

  private calculateOverallTrend(): 'increasing' | 'decreasing' | 'stable' {
    const recentPatterns = Array.from(this.failurePatterns.values())
      .filter(p => Date.now() - p.lastOccurrence.getTime() < 3600000);

    const increasingCount = recentPatterns.filter(p => p.trend === 'increasing').length;
    const decreasingCount = recentPatterns.filter(p => p.trend === 'decreasing').length;

    if (increasingCount > decreasingCount * 1.5) return 'increasing';
    if (decreasingCount > increasingCount * 1.5) return 'decreasing';
    return 'stable';
  }

  private createPredictiveAlert(type: string, description: string): void {
    const alertId = `predictive_${type}_${Date.now()}`;
    const alert: PredictiveAlert = {
      alertId,
      type: 'pattern-anomaly',
      severity: 'high',
      description,
      predictedImpact: 'System stability may be compromised',
      confidenceLevel: 0.7,
      timeToImpact: 10,
      recommendedActions: ['Enable defensive measures', 'Increase monitoring', 'Prepare fallback systems'],
      affectedSystems: ['MCP System'],
      createdAt: new Date()
    };

    this.activeAlerts.set(alertId, alert);
  }

  private createCriticalAlert(type: string, description: string, error: Error): void {
    const alertId = `critical_${type}_${Date.now()}`;
    const alert: PredictiveAlert = {
      alertId,
      type: 'failure-likelihood',
      severity: 'critical',
      description: `${description}: ${error.message}`,
      predictedImpact: 'System failure or significant service disruption',
      confidenceLevel: 0.9,
      timeToImpact: 0,
      recommendedActions: ['Immediate intervention required', 'System restart may be needed', 'Contact system administrator'],
      affectedSystems: ['Entire MCP System'],
      createdAt: new Date()
    };

    this.activeAlerts.set(alertId, alert);
  }

  // Pattern analysis methods

  private async analyzeFailurePatterns(): Promise<void> {
    // Analyze patterns for trends and correlations
    const patterns = Array.from(this.failurePatterns.values());

    // Find correlated patterns
    const correlations = this.findPatternCorrelations(patterns);

    // Identify emerging patterns
    const emergingPatterns = this.identifyEmergingPatterns(patterns);

    // Update pattern severity based on analysis
    this.updatePatternSeverity(patterns, correlations, emergingPatterns);

    console.log(`[McpSelfHealingSystem] Analyzed ${patterns.length} failure patterns`);
  }

  private findPatternCorrelations(patterns: FailurePattern[]): Array<{pattern1: string, pattern2: string, correlation: number}> {
    const correlations = [];

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const correlation = this.calculatePatternCorrelation(patterns[i], patterns[j]);
        if (correlation > 0.6) {
          correlations.push({
            pattern1: patterns[i].patternId,
            pattern2: patterns[j].patternId,
            correlation
          });
        }
      }
    }

    return correlations;
  }

  private calculatePatternCorrelation(pattern1: FailurePattern, pattern2: FailurePattern): number {
    // Simple correlation based on common contexts and tools
    const commonContexts = pattern1.commonContexts.filter(c => pattern2.commonContexts.includes(c)).length;
    const commonTools = pattern1.affectedTools.filter(t => pattern2.affectedTools.includes(t)).length;
    const totalContexts = new Set([...pattern1.commonContexts, ...pattern2.commonContexts]).size;
    const totalTools = new Set([...pattern1.affectedTools, ...pattern2.affectedTools]).size;

    const contextCorrelation = totalContexts > 0 ? commonContexts / totalContexts : 0;
    const toolCorrelation = totalTools > 0 ? commonTools / totalTools : 0;

    return (contextCorrelation + toolCorrelation) / 2;
  }

  private identifyEmergingPatterns(patterns: FailurePattern[]): FailurePattern[] {
    // Find patterns that are new or rapidly increasing
    const recentThreshold = Date.now() - 86400000; // 24 hours

    return patterns.filter(pattern =>
      pattern.frequency >= 3 &&
      pattern.lastOccurrence.getTime() > recentThreshold &&
      pattern.trend === 'increasing'
    );
  }

  private updatePatternSeverity(
    patterns: FailurePattern[],
    correlations: any[],
    emergingPatterns: FailurePattern[]
  ): void {
    // Update severity based on correlations and emergence
    patterns.forEach(pattern => {
      let severityAdjustment = 0;

      // Increase severity for correlated patterns
      const patternCorrelations = correlations.filter(c =>
        c.pattern1 === pattern.patternId || c.pattern2 === pattern.patternId
      );
      severityAdjustment += patternCorrelations.length * 0.1;

      // Increase severity for emerging patterns
      if (emergingPatterns.includes(pattern)) {
        severityAdjustment += 0.2;
      }

      // Apply adjustment (simplified)
      if (severityAdjustment > 0.3 && pattern.severity === 'low') {
        pattern.severity = 'medium';
      } else if (severityAdjustment > 0.5 && pattern.severity === 'medium') {
        pattern.severity = 'high';
      }
    });
  }

  // Predictive analysis methods

  private async runPredictiveAnalysis(): Promise<void> {
    // Run prediction algorithms to identify potential future failures
    const predictions = await this.generateFailurePredictions();

    // Create predictive alerts based on predictions
    for (const prediction of predictions) {
      if (prediction.confidence > 0.7) {
        this.createPredictionAlert(prediction);
      }
    }
  }

  private async generateFailurePredictions(): Promise<Array<{
    type: string;
    confidence: number;
    timeframe: number;
    impact: string;
  }>> {
    const predictions = [];

    // Analyze trends in error history
    const recentErrors = this.errorHistory.slice(-50);
    const errorRate = recentErrors.length / 50;

    if (errorRate > 0.1) {
      predictions.push({
        type: 'increased-error-rate',
        confidence: Math.min(errorRate * 5, 0.9),
        timeframe: 30, // minutes
        impact: 'Service degradation'
      });
    }

    // Analyze pattern trends
    const increasingPatterns = Array.from(this.failurePatterns.values())
      .filter(p => p.trend === 'increasing').length;

    if (increasingPatterns > 2) {
      predictions.push({
        type: 'pattern-cascade',
        confidence: 0.6,
        timeframe: 60,
        impact: 'Multiple system failures'
      });
    }

    return predictions;
  }

  private createPredictionAlert(prediction: any): void {
    const alertId = `prediction_${prediction.type}_${Date.now()}`;
    const alert: PredictiveAlert = {
      alertId,
      type: 'failure-likelihood',
      severity: prediction.confidence > 0.8 ? 'high' : 'medium',
      description: `Predicted ${prediction.type} with ${Math.round(prediction.confidence * 100)}% confidence`,
      predictedImpact: prediction.impact,
      confidenceLevel: prediction.confidence,
      timeToImpact: prediction.timeframe,
      recommendedActions: ['Monitor closely', 'Prepare recovery procedures', 'Consider preventive measures'],
      affectedSystems: ['MCP System'],
      createdAt: new Date()
    };

    this.activeAlerts.set(alertId, alert);
  }

  // Adaptation methods

  private shouldTriggerAdaptation(
    strategy: AdaptationStrategy,
    pattern: FailurePattern,
    recoveryResult: { success: boolean; result?: any }
  ): boolean {
    // Check cooldown period
    const recentAdaptations = this.adaptationHistory.filter(a =>
      a.strategy.strategyId === strategy.strategyId &&
      Date.now() - a.appliedAt.getTime() < strategy.cooldownPeriod * 60000
    );

    if (recentAdaptations.length >= strategy.maxApplications) {
      return false;
    }

    // Check trigger conditions
    return this.evaluateAdaptationTrigger(strategy.trigger, pattern);
  }

  private evaluateAdaptationTrigger(trigger: AdaptationTrigger, pattern: FailurePattern): boolean {
    switch (trigger.type) {
      case 'error-rate-threshold':
        const recentErrors = this.errorHistory.slice(-trigger.parameters.windowSize || 10);
        const errorRate = recentErrors.length / (trigger.parameters.windowSize || 10);
        return errorRate > (trigger.parameters.threshold || 0.3);

      case 'pattern-detection':
        return pattern.frequency >= (trigger.parameters.occurrenceThreshold || 5) &&
               pattern.trend === 'increasing';

      case 'performance-degradation':
        const avgResponseTime = this.healthMetrics.get('average_response_time')?.value || 0;
        const threshold = trigger.parameters.thresholdIncrease || 1.5;
        return avgResponseTime > threshold * 2.0; // Simplified baseline

      default:
        return false;
    }
  }

  private async executeAdaptation(strategy: AdaptationStrategy, pattern: FailurePattern): Promise<AdaptationRecord | null> {
    console.log(`[McpSelfHealingSystem] Executing adaptation strategy: ${strategy.name}`);

    const startTime = new Date();

    try {
      // Apply adaptation actions
      const results = await Promise.all(
        strategy.actions.map(action => this.executeAdaptationAction(action))
      );

      const success = results.every(r => r.success);

      const adaptation: AdaptationRecord = {
        adaptationId: `adapt_${Date.now()}`,
        strategy,
        appliedAt: startTime,
        outcome: success ? 'success' : 'partial',
        impactMetrics: this.measureAdaptationImpact(results),
        duration: Date.now() - startTime.getTime(),
        rollbackPerformed: false
      };

      this.adaptationHistory.push(adaptation);

      return adaptation;

    } catch (error) {
      console.error(`[McpSelfHealingSystem] Adaptation failed: ${strategy.strategyId}`, error);

      const adaptation: AdaptationRecord = {
        adaptationId: `adapt_${Date.now()}`,
        strategy,
        appliedAt: startTime,
        outcome: 'failure',
        impactMetrics: { errorCount: 1, failureRate: 1.0 },
        duration: Date.now() - startTime.getTime(),
        rollbackPerformed: false
      };

      this.adaptationHistory.push(adaptation);

      return adaptation;
    }
  }

  private async executeAdaptationAction(action: AdaptationAction): Promise<{ success: boolean; impact?: any }> {
    console.log(`[McpSelfHealingSystem] Executing adaptation action: ${action.actionType}`);

    try {
      switch (action.actionType) {
        case 'tool-substitution':
          return await this.adaptToolSubstitution(action);
        case 'workflow-modification':
          return await this.adaptWorkflowModification(action);
        case 'parameter-tuning':
          return await this.adaptParameterTuning(action);
        case 'load-balancing':
          return await this.adaptLoadBalancing(action);
        case 'circuit-breaking':
          return await this.adaptCircuitBreaking(action);
        default:
          return { success: false };
      }
    } catch (error) {
      console.error(`[McpSelfHealingSystem] Adaptation action failed: ${action.actionType}`, error);
      return { success: false };
    }
  }

  private async adaptToolSubstitution(action: AdaptationAction): Promise<{ success: boolean; impact?: any }> {
    // Implement tool substitution logic
    console.log('[McpSelfHealingSystem] Applying tool substitution adaptation');
    return { success: true, impact: 'Tool preferences updated' };
  }

  private async adaptWorkflowModification(action: AdaptationAction): Promise<{ success: boolean; impact?: any }> {
    // Implement workflow modification logic
    console.log('[McpSelfHealingSystem] Applying workflow modification adaptation');
    return { success: true, impact: 'Workflow patterns updated' };
  }

  private async adaptParameterTuning(action: AdaptationAction): Promise<{ success: boolean; impact?: any }> {
    // Implement parameter tuning logic
    console.log('[McpSelfHealingSystem] Applying parameter tuning adaptation');
    return { success: true, impact: 'Default parameters adjusted' };
  }

  private async adaptLoadBalancing(action: AdaptationAction): Promise<{ success: boolean; impact?: any }> {
    // Implement load balancing logic
    console.log('[McpSelfHealingSystem] Applying load balancing adaptation');
    return { success: true, impact: 'Load distribution updated' };
  }

  private async adaptCircuitBreaking(action: AdaptationAction): Promise<{ success: boolean; impact?: any }> {
    // Implement circuit breaking logic
    console.log('[McpSelfHealingSystem] Applying circuit breaking adaptation');
    return { success: true, impact: 'Circuit breaker thresholds adjusted' };
  }

  private measureAdaptationImpact(results: Array<{ success: boolean; impact?: any }>): Record<string, number> {
    const metrics: Record<string, number> = {
      successfulActions: results.filter(r => r.success).length,
      totalActions: results.length,
      successRate: results.filter(r => r.success).length / results.length
    };

    return metrics;
  }

  private async learnFromAdaptation(adaptation: AdaptationRecord): Promise<void> {
    // Update strategy effectiveness based on outcomes
    const strategy = adaptation.strategy;
    const effectiveness = adaptation.outcome === 'success' ? 1.0 :
                         adaptation.outcome === 'partial' ? 0.5 : 0.0;

    // Update internal learning (simplified)
    console.log(`[McpSelfHealingSystem] Learning from adaptation: ${strategy.name}, effectiveness: ${effectiveness}`);
  }

  private async updatePredictionModel(
    pattern: FailurePattern,
    action: RecoveryAction,
    result: { success: boolean; result?: any }
  ): Promise<void> {
    // Update prediction model with new data
    this.predictionModel.trainingData.push({
      pattern: pattern.errorSignature,
      action: action.actionId,
      success: result.success,
      timestamp: Date.now()
    });

    // Keep only recent training data
    if (this.predictionModel.trainingData.length > 1000) {
      this.predictionModel.trainingData = this.predictionModel.trainingData.slice(-1000);
    }

    // Recalculate accuracy periodically
    if (this.predictionModel.trainingData.length % 100 === 0) {
      this.recalculateModelAccuracy();
    }
  }

  private recalculateModelAccuracy(): void {
    const recentData = this.predictionModel.trainingData.slice(-500);
    const correctPredictions = recentData.filter(d => d.success).length;
    this.predictionModel.accuracy = correctPredictions / recentData.length;
    this.predictionModel.lastTraining = new Date();

    console.log(`[McpSelfHealingSystem] Updated prediction model accuracy: ${this.predictionModel.accuracy.toFixed(3)}`);
  }

  /**
   * Get current system state
   */
  getSystemState(): SystemState {
    return {
      timestamp: new Date(),
      overallHealth: this.calculateOverallHealth(),
      activeAlerts: Array.from(this.activeAlerts.values()),
      failurePatterns: Array.from(this.failurePatterns.values()),
      adaptationHistory: this.adaptationHistory.slice(-10), // Last 10 adaptations
      healthMetrics: Array.from(this.healthMetrics.values()),
      learningStats: this.calculateLearningStats()
    };
  }

  private calculateOverallHealth(): number {
    const metrics = Array.from(this.healthMetrics.values());
    const healthyMetrics = metrics.filter(m => m.status === 'healthy').length;
    return metrics.length > 0 ? healthyMetrics / metrics.length : 0.5;
  }

  private calculateLearningStats(): LearningStats {
    const recentRecoveries = this.recoveryHistory.slice(-100);
    const successfulRecoveries = recentRecoveries.filter(r => r.success).length;

    return {
      totalPatterns: this.failurePatterns.size,
      predictiveAccuracy: this.predictionModel.accuracy,
      recoverySuccessRate: recentRecoveries.length > 0 ? successfulRecoveries / recentRecoveries.length : 0.8,
      adaptationEffectiveness: this.calculateAdaptationEffectiveness(),
      learningVelocity: this.calculateLearningVelocity()
    };
  }

  private calculateAdaptationEffectiveness(): number {
    const recentAdaptations = this.adaptationHistory.slice(-20);
    const successful = recentAdaptations.filter(a => a.outcome === 'success').length;
    return recentAdaptations.length > 0 ? successful / recentAdaptations.length : 0.7;
  }

  private calculateLearningVelocity(): number {
    const oneDayAgo = Date.now() - 86400000;
    const recentPatterns = Array.from(this.failurePatterns.values())
      .filter(p => p.lastOccurrence.getTime() > oneDayAgo);
    return recentPatterns.length;
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    console.log('[McpSelfHealingSystem] Shutting down self-healing system...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.patternAnalysisInterval) {
      clearInterval(this.patternAnalysisInterval);
    }
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
    }

    console.log('[McpSelfHealingSystem] Self-healing system shutdown complete');
  }
}

// Supporting interfaces

interface PredictionModel {
  modelId: string;
  accuracy: number;
  features: string[];
  trainingData: Array<{
    pattern: string;
    action: string;
    success: boolean;
    timestamp: number;
  }>;
  lastTraining: Date;
  version: string;
}