/**
 * MCP Workflow Optimizer
 *
 * AI-Enhanced MCP Routing for "Get It Done" mode:
 * - AI-driven MCP workflow path selection
 * - Performance-based MCP optimization suggestions
 * - Alternative MCP workflow generation
 * - Context-aware MCP tool selection and routing
 * - Dynamic workflow adaptation and learning
 *
 * AI-Enhanced MCP Routing - Workflow Optimizer
 */

import { McpClientManager } from './McpClientManager';
import { McpServerIntegrations, ServerIntegration } from './McpServerIntegrations';
import { McpIntelligentParser, IntelligentQueryAnalysis, ExecutionPlan } from './McpIntelligentParser';
import { ConditionalWorkflow } from './McpWorkflowOrchestrator';
import { McpToolDiscoveryService } from './McpToolDiscoveryService';

export interface OptimizationMetrics {
  executionTime: number;
  successRate: number;
  resourceUsage: number;
  userSatisfaction: number;
  errorRate: number;
  cachePerfectRate: number;
}

export interface WorkflowOptimization {
  optimizationId: string;
  originalPlan: ExecutionPlan;
  optimizedPlan: ExecutionPlan;
  optimizationType: 'performance' | 'reliability' | 'cost' | 'user-preference' | 'hybrid';
  improvements: OptimizationImprovement[];
  estimatedBenefit: OptimizationBenefit;
  confidence: number;
  timestamp: Date;
}

export interface OptimizationImprovement {
  type: 'tool-substitution' | 'step-reordering' | 'parallel-execution' | 'caching' | 'batching' | 'fallback-addition';
  description: string;
  impact: 'low' | 'medium' | 'high';
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface OptimizationBenefit {
  timeReduction: number; // percentage
  reliabilityIncrease: number; // percentage
  costReduction: number; // percentage
  userExperienceScore: number; // 0-10
}

export interface PerformanceBaseline {
  toolName: string;
  serverName: string;
  averageExecutionTime: number;
  successRate: number;
  lastUpdated: Date;
  sampleSize: number;
}

export interface AdaptiveLearning {
  learnedPatterns: Map<string, PatternLearning>;
  userBehaviorModel: UserBehaviorModel;
  contextualPreferences: Map<string, ContextualPreference>;
  performanceHistory: PerformanceHistory[];
}

export interface PatternLearning {
  pattern: string;
  frequency: number;
  successRate: number;
  averageTime: number;
  bestTools: string[];
  contexts: string[];
}

export interface UserBehaviorModel {
  preferredTools: Map<string, number>; // tool -> preference weight
  timePatterns: Map<string, number>; // time slot -> activity weight
  urgencyPatterns: Map<string, string>; // query pattern -> urgency level
  domainExpertise: Map<string, number>; // domain -> expertise level
}

export interface ContextualPreference {
  context: string;
  preferredApproach: 'fast' | 'thorough' | 'reliable' | 'cost-effective';
  weight: number;
  source: 'explicit' | 'learned' | 'inferred';
}

export interface PerformanceHistory {
  timestamp: Date;
  query: string;
  executionPlan: string;
  actualMetrics: OptimizationMetrics;
  userFeedback?: number; // 1-5 rating
  context: Record<string, any>;
}

export class McpWorkflowOptimizer {
  private mcpManager: McpClientManager;
  private serverIntegrations: McpServerIntegrations;
  private intelligentParser: McpIntelligentParser;
  private discoveryService: McpToolDiscoveryService;
  private performanceBaselines: Map<string, PerformanceBaseline> = new Map();
  private adaptiveLearning: AdaptiveLearning;
  private optimizationHistory: Map<string, WorkflowOptimization[]> = new Map();

  // Optimization algorithms
  private readonly OPTIMIZATION_STRATEGIES = {
    performance: this.optimizeForPerformance.bind(this),
    reliability: this.optimizeForReliability.bind(this),
    cost: this.optimizeForCost.bind(this),
    'user-preference': this.optimizeForUserPreference.bind(this),
    hybrid: this.optimizeHybrid.bind(this)
  };

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.serverIntegrations = new McpServerIntegrations(mcpManager);
    this.intelligentParser = new McpIntelligentParser(mcpManager);
    this.discoveryService = new McpToolDiscoveryService(mcpManager);
    this.adaptiveLearning = this.initializeAdaptiveLearning();
    this.initializePerformanceBaselines();
    this.startPerformanceMonitoring();
  }

  /**
   * Initialize adaptive learning system
   */
  private initializeAdaptiveLearning(): AdaptiveLearning {
    return {
      learnedPatterns: new Map(),
      userBehaviorModel: {
        preferredTools: new Map([
          ['@capability:email.read', 0.9],
          ['@capability:calendar.read', 0.8],
          ['@capability:communication.create', 0.7]
        ]),
        timePatterns: new Map([
          ['morning', 0.8], // high activity in morning
          ['afternoon', 0.6],
          ['evening', 0.3]
        ]),
        urgencyPatterns: new Map([
          ['urgent', 'high'],
          ['asap', 'critical'],
          ['when you can', 'low']
        ]),
        domainExpertise: new Map([
          ['email', 0.9],
          ['calendar', 0.8],
          ['project-management', 0.6]
        ])
      },
      contextualPreferences: new Map([
        ['morning-email', { context: 'morning-email', preferredApproach: 'fast', weight: 0.8, source: 'learned' }],
        ['urgent-tasks', { context: 'urgent-tasks', preferredApproach: 'reliable', weight: 0.9, source: 'learned' }]
      ]),
      performanceHistory: []
    };
  }

  /**
   * Initialize performance baselines for all tools (using dynamic discovery)
   */
  private async initializePerformanceBaselines(): Promise<void> {
    console.log('[McpWorkflowOptimizer] Initializing performance baselines...');

    try {
      // Use discovery service to get actual available tools
      const discoveredTools = await this.discoveryService.getAllDiscoveredTools();

      discoveredTools.forEach(tool => {
        const baselineKey = `${tool.serverName}-${tool.name}`;
        this.performanceBaselines.set(baselineKey, {
          toolName: tool.fullName,
          serverName: tool.serverName,
          averageExecutionTime: this.estimateBaselineTimeFromTool(tool),
          successRate: 0.85, // Initial assumption
          lastUpdated: new Date(),
          sampleSize: 0
        });
      });

      console.log(`[McpWorkflowOptimizer] Initialized ${this.performanceBaselines.size} performance baselines from discovered tools`);
    } catch (error) {
      console.error('[McpWorkflowOptimizer] Failed to initialize performance baselines:', error);

      // Fallback to capability templates
      const integrations = this.serverIntegrations.getAllIntegrations();
      integrations.forEach(integration => {
        integration.tools.forEach(tool => {
          const baselineKey = `${integration.serverId}-${tool.toolId}`;
          this.performanceBaselines.set(baselineKey, {
            toolName: tool.toolName,
            serverName: integration.serverName,
            averageExecutionTime: this.estimateBaselineTime(tool),
            successRate: 0.85, // Initial assumption
            lastUpdated: new Date(),
            sampleSize: 0
          });
        });
      });

      console.log(`[McpWorkflowOptimizer] Initialized ${this.performanceBaselines.size} fallback performance baselines`);
    }
  }

  /**
   * Start performance monitoring system
   */
  private startPerformanceMonitoring(): void {
    // Monitor performance every 5 minutes
    setInterval(() => {
      this.updatePerformanceBaselines();
      this.analyzePerformanceTrends();
      this.optimizeBasedOnLearning();
    }, 300000);

    console.log('[McpWorkflowOptimizer] Performance monitoring started');
  }

  /**
   * Main workflow optimization function
   */
  async optimizeWorkflow(
    analysis: IntelligentQueryAnalysis,
    optimizationType: WorkflowOptimization['optimizationType'] = 'hybrid',
    constraints?: Record<string, any>
  ): Promise<WorkflowOptimization> {
    console.log(`[McpWorkflowOptimizer] Optimizing workflow with strategy: ${optimizationType}`);

    const startTime = Date.now();

    try {
      // Apply the selected optimization strategy
      const optimizer = this.OPTIMIZATION_STRATEGIES[optimizationType];
      const optimizedPlan = await optimizer(analysis.executionPlan, analysis, constraints);

      // Generate improvements list
      const improvements = this.identifyImprovements(analysis.executionPlan, optimizedPlan);

      // Calculate estimated benefits
      const estimatedBenefit = this.calculateEstimatedBenefit(analysis.executionPlan, optimizedPlan);

      // Calculate confidence based on learning data
      const confidence = this.calculateOptimizationConfidence(analysis, optimizedPlan);

      const optimization: WorkflowOptimization = {
        optimizationId: `opt_${Date.now()}`,
        originalPlan: analysis.executionPlan,
        optimizedPlan,
        optimizationType,
        improvements,
        estimatedBenefit,
        confidence,
        timestamp: new Date()
      };

      // Store optimization for learning
      const queryKey = analysis.originalQuery;
      const history = this.optimizationHistory.get(queryKey) || [];
      history.push(optimization);
      this.optimizationHistory.set(queryKey, history);

      const optimizationTime = Date.now() - startTime;
      console.log(`[McpWorkflowOptimizer] Optimization completed in ${optimizationTime}ms`);

      return optimization;

    } catch (error) {
      console.error('[McpWorkflowOptimizer] Optimization failed:', error);
      throw error;
    }
  }

  /**
   * Optimize for performance (speed)
   */
  private async optimizeForPerformance(
    plan: ExecutionPlan,
    analysis: IntelligentQueryAnalysis,
    constraints?: Record<string, any>
  ): Promise<ExecutionPlan> {
    const optimizedSteps = [...plan.steps];

    // 1. Find faster alternative tools
    for (let i = 0; i < optimizedSteps.length; i++) {
      const step = optimizedSteps[i];
      const fasterAlternative = this.findFasterAlternative(step.tool);
      if (fasterAlternative) {
        optimizedSteps[i] = { ...step, tool: fasterAlternative };
      }
    }

    // 2. Identify parallel execution opportunities
    const parallelGroups = this.identifyParallelExecution(optimizedSteps);

    // 3. Add caching where applicable
    const cachedSteps = this.addCachingOptimizations(optimizedSteps);

    // 4. Reorder steps for optimal performance
    const reorderedSteps = this.reorderForPerformance(cachedSteps);

    return {
      ...plan,
      planId: `perf_${Date.now()}`,
      steps: reorderedSteps,
      estimatedDuration: this.recalculateDuration(reorderedSteps),
      complexity: this.recalculateComplexity(reorderedSteps),
      successProbability: Math.min(plan.successProbability * 0.95, 1.0) // Slight decrease for more aggressive optimization
    };
  }

  /**
   * Optimize for reliability
   */
  private async optimizeForReliability(
    plan: ExecutionPlan,
    analysis: IntelligentQueryAnalysis,
    constraints?: Record<string, any>
  ): Promise<ExecutionPlan> {
    const optimizedSteps = [...plan.steps];

    // 1. Add fallback options for each step
    for (let i = 0; i < optimizedSteps.length; i++) {
      const step = optimizedSteps[i];
      const fallbacks = this.findReliableAlternatives(step.tool);
      optimizedSteps[i] = { ...step, fallbackOptions: fallbacks };
    }

    // 2. Use most reliable tools even if slower
    for (let i = 0; i < optimizedSteps.length; i++) {
      const step = optimizedSteps[i];
      const reliableAlternative = this.findMostReliableTool(step.tool);
      if (reliableAlternative) {
        optimizedSteps[i] = { ...step, tool: reliableAlternative };
      }
    }

    // 3. Add validation steps
    const validatedSteps = this.addValidationSteps(optimizedSteps);

    // 4. Add retry mechanisms
    const retriableSteps = this.addRetryMechanisms(validatedSteps);

    return {
      ...plan,
      planId: `rel_${Date.now()}`,
      steps: retriableSteps,
      estimatedDuration: this.recalculateDuration(retriableSteps) * 1.2, // Account for validation and retries
      complexity: plan.complexity,
      riskLevel: 'low',
      successProbability: Math.min(plan.successProbability * 1.15, 0.98) // Increase success probability
    };
  }

  /**
   * Optimize for cost (resource usage)
   */
  private async optimizeForCost(
    plan: ExecutionPlan,
    analysis: IntelligentQueryAnalysis,
    constraints?: Record<string, any>
  ): Promise<ExecutionPlan> {
    const optimizedSteps = [...plan.steps];

    // 1. Use free/cheaper alternatives where available
    for (let i = 0; i < optimizedSteps.length; i++) {
      const step = optimizedSteps[i];
      const cheaperAlternative = this.findCostEffectiveAlternative(step.tool);
      if (cheaperAlternative) {
        optimizedSteps[i] = { ...step, tool: cheaperAlternative };
      }
    }

    // 2. Minimize API calls through batching
    const batchedSteps = this.optimizeForBatching(optimizedSteps);

    // 3. Maximize cache utilization
    const cachedSteps = this.maximizeCacheUsage(batchedSteps);

    // 4. Remove unnecessary steps
    const minimizedSteps = this.removeUnnecessarySteps(cachedSteps, analysis);

    return {
      ...plan,
      planId: `cost_${Date.now()}`,
      steps: minimizedSteps,
      estimatedDuration: this.recalculateDuration(minimizedSteps),
      complexity: this.recalculateComplexity(minimizedSteps),
      successProbability: plan.successProbability * 0.9 // Slight decrease for more minimal approach
    };
  }

  /**
   * Optimize based on user preferences
   */
  private async optimizeForUserPreference(
    plan: ExecutionPlan,
    analysis: IntelligentQueryAnalysis,
    constraints?: Record<string, any>
  ): Promise<ExecutionPlan> {
    const optimizedSteps = [...plan.steps];
    const userModel = this.adaptiveLearning.userBehaviorModel;

    // 1. Use user's preferred tools
    for (let i = 0; i < optimizedSteps.length; i++) {
      const step = optimizedSteps[i];
      const preferredTool = this.findPreferredTool(step.tool, userModel);
      if (preferredTool) {
        optimizedSteps[i] = { ...step, tool: preferredTool };
      }
    }

    // 2. Apply contextual preferences
    const context = this.getExecutionContext(analysis);
    const contextualPref = this.adaptiveLearning.contextualPreferences.get(context);
    if (contextualPref) {
      const strategyMap: Record<string, string> = {
        'fast': 'performance',
        'thorough': 'reliability',
        'reliable': 'reliability',
        'cost-effective': 'cost'
      };
      const strategy = strategyMap[contextualPref.preferredApproach] || 'performance';
      return await this.OPTIMIZATION_STRATEGIES[strategy as keyof typeof this.OPTIMIZATION_STRATEGIES](plan, analysis, constraints);
    }

    // 3. Adapt to user's expertise level
    const domain = analysis.intent.context.domain;
    const expertiseLevel = userModel.domainExpertise.get(domain) || 0.5;

    if (expertiseLevel > 0.8) {
      // Advanced user - prefer more powerful but complex tools
      return this.optimizeForPowerUsers(plan, optimizedSteps);
    } else {
      // Beginner user - prefer simpler, more guided approaches
      return this.optimizeForBeginners(plan, optimizedSteps);
    }
  }

  /**
   * Hybrid optimization combining multiple strategies
   */
  private async optimizeHybrid(
    plan: ExecutionPlan,
    analysis: IntelligentQueryAnalysis,
    constraints?: Record<string, any>
  ): Promise<ExecutionPlan> {
    // Analyze context to determine optimal strategy mix
    const urgency = analysis.intent.context.urgency;
    const complexity = analysis.intent.context.complexity;
    const domain = analysis.intent.context.domain;

    // Create strategy weights based on context
    const strategyWeights = {
      performance: urgency === 'high' ? 0.4 : 0.2,
      reliability: complexity === 'complex' ? 0.4 : 0.2,
      cost: 0.2,
      'user-preference': 0.2
    };

    // Apply multiple optimizations with weights
    const performanceOpt = await this.optimizeForPerformance(plan, analysis, constraints);
    const reliabilityOpt = await this.optimizeForReliability(plan, analysis, constraints);
    const costOpt = await this.optimizeForCost(plan, analysis, constraints);
    const userPrefOpt = await this.optimizeForUserPreference(plan, analysis, constraints);

    // Combine optimizations based on weights
    return this.combineOptimizations([
      { plan: performanceOpt, weight: strategyWeights.performance },
      { plan: reliabilityOpt, weight: strategyWeights.reliability },
      { plan: costOpt, weight: strategyWeights.cost },
      { plan: userPrefOpt, weight: strategyWeights['user-preference'] }
    ]);
  }

  // Helper methods for optimization

  private findFasterAlternative(currentTool: any): any | null {
    const currentBaseline = this.getToolBaseline(currentTool.tool.toolName);
    if (!currentBaseline) return null;

    const alternatives = this.findAlternativeTools(currentTool.tool);
    let fastestTool = null;
    let fastestTime = currentBaseline.averageExecutionTime;

    for (const alt of alternatives) {
      const altBaseline = this.getToolBaseline(alt.toolName);
      if (altBaseline && altBaseline.averageExecutionTime < fastestTime) {
        fastestTime = altBaseline.averageExecutionTime;
        fastestTool = { ...currentTool, tool: alt };
      }
    }

    return fastestTool;
  }

  private findMostReliableTool(currentTool: any): any | null {
    const currentBaseline = this.getToolBaseline(currentTool.tool.toolName);
    if (!currentBaseline) return null;

    const alternatives = this.findAlternativeTools(currentTool.tool);
    let mostReliable = null;
    let highestReliability = currentBaseline.successRate;

    for (const alt of alternatives) {
      const altBaseline = this.getToolBaseline(alt.toolName);
      if (altBaseline && altBaseline.successRate > highestReliability) {
        highestReliability = altBaseline.successRate;
        mostReliable = { ...currentTool, tool: alt };
      }
    }

    return mostReliable;
  }

  private findAlternativeTools(tool: any): any[] {
    // Find tools with similar functionality
    const allIntegrations = this.serverIntegrations.getAllIntegrations();
    const alternatives = [];

    for (const integration of allIntegrations) {
      for (const t of integration.tools) {
        if (t.category === tool.category && t.toolName !== tool.toolName) {
          alternatives.push(t);
        }
      }
    }

    return alternatives;
  }

  private identifyParallelExecution(steps: any[]): number[][] {
    const parallelGroups: number[][] = [];
    const dependencies = this.analyzeDependencies(steps);

    // Simple parallel identification - steps with no dependencies can run in parallel
    const independentSteps = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step, index }) => {
        return !step.dependencies || step.dependencies.length === 0;
      })
      .map(({ index }) => index);

    if (independentSteps.length > 1) {
      parallelGroups.push(independentSteps);
    }

    return parallelGroups;
  }

  private analyzeDependencies(steps: any[]): Map<string, string[]> {
    const deps = new Map<string, string[]>();

    steps.forEach(step => {
      deps.set(step.stepId, step.dependencies || []);
    });

    return deps;
  }

  private addCachingOptimizations(steps: any[]): any[] {
    return steps.map(step => {
      // Add caching hint for read operations
      if (step.tool.tool.category === 'read' || step.tool.tool.category === 'search') {
        return {
          ...step,
          cacheEnabled: true,
          cacheTTL: 300 // 5 minutes
        };
      }
      return step;
    });
  }

  private reorderForPerformance(steps: any[]): any[] {
    // Simple reordering: put fastest operations first when possible
    const orderedSteps = [...steps];

    orderedSteps.sort((a, b) => {
      const aTime = this.getEstimatedExecutionTime(a.tool);
      const bTime = this.getEstimatedExecutionTime(b.tool);

      // Consider dependencies
      if (this.hasDependency(a, b)) return 1;
      if (this.hasDependency(b, a)) return -1;

      return aTime - bTime;
    });

    return orderedSteps;
  }

  private getEstimatedExecutionTime(tool: any): number {
    const baseline = this.getToolBaseline(tool.tool.toolName);
    return baseline?.averageExecutionTime || 10; // Default 10s
  }

  private hasDependency(stepA: any, stepB: any): boolean {
    return stepA.dependencies && stepA.dependencies.includes(stepB.stepId);
  }

  private getToolBaseline(toolName: string): PerformanceBaseline | null {
    for (const [key, baseline] of this.performanceBaselines) {
      if (baseline.toolName === toolName) {
        return baseline;
      }
    }
    return null;
  }

  private findReliableAlternatives(currentTool: any): any[] {
    const alternatives = this.findAlternativeTools(currentTool.tool);
    return alternatives
      .map(alt => {
        const baseline = this.getToolBaseline(alt.toolName);
        return {
          description: `Fallback to ${alt.displayName}`,
          tool: { ...currentTool, tool: alt },
          confidence: baseline ? baseline.successRate : 0.7
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2); // Top 2 alternatives
  }

  private addValidationSteps(steps: any[]): any[] {
    // Add validation for critical operations
    const validatedSteps = [];

    for (const step of steps) {
      validatedSteps.push(step);

      // Add validation step for write operations
      if (['create', 'update', 'delete'].includes(step.tool.tool.category)) {
        validatedSteps.push({
          stepId: `${step.stepId}_validation`,
          description: `Validate ${step.description}`,
          tool: this.createValidationTool(step.tool),
          dependencies: [step.stepId],
          expectedOutput: 'Validation confirmation',
          fallbackOptions: []
        });
      }
    }

    return validatedSteps;
  }

  private createValidationTool(originalTool: any): any {
    // Create a validation tool based on the original tool
    return {
      ...originalTool,
      tool: {
        ...originalTool.tool,
        toolId: `${originalTool.tool.toolId}_validate`,
        displayName: `Validate ${originalTool.tool.displayName}`,
        category: 'read'
      }
    };
  }

  private addRetryMechanisms(steps: any[]): any[] {
    return steps.map(step => ({
      ...step,
      retryConfig: {
        maxRetries: step.tool.tool.category === 'read' ? 3 : 1,
        retryDelay: 1000, // 1 second
        exponentialBackoff: true
      }
    }));
  }

  // Additional helper methods

  private estimateBaselineTime(tool: any): number {
    // Estimate based on tool category and rate limit weight
    const baseTimes = {
      'read': 5,
      'search': 8,
      'create': 12,
      'update': 10,
      'delete': 8
    };

    const baseTime = baseTimes[tool.category as keyof typeof baseTimes] || 10;
    return baseTime * (tool.rateLimitWeight || 1);
  }

  private estimateBaselineTimeFromTool(discoveredTool: any): number {
    // Estimate based on discovered tool characteristics
    const baseTimes = {
      'read': 5,
      'search': 8,
      'create': 12,
      'update': 10,
      'delete': 8
    };

    // Infer category from tool name patterns
    const toolName = discoveredTool.name?.toLowerCase() || '';
    let category = 'read'; // default

    if (toolName.includes('find') || toolName.includes('search') || toolName.includes('get')) {
      category = 'read';
    } else if (toolName.includes('create') || toolName.includes('send') || toolName.includes('add')) {
      category = 'create';
    } else if (toolName.includes('update') || toolName.includes('edit') || toolName.includes('modify')) {
      category = 'update';
    } else if (toolName.includes('delete') || toolName.includes('remove')) {
      category = 'delete';
    }

    return baseTimes[category as keyof typeof baseTimes] || 10;
  }

  private updatePerformanceBaselines(): void {
    // Update baselines based on recent performance data
    const recentHistory = this.adaptiveLearning.performanceHistory
      .filter(h => Date.now() - h.timestamp.getTime() < 86400000) // Last 24 hours
      .slice(-100); // Last 100 executions

    // Group by tool
    const toolMetrics = new Map<string, OptimizationMetrics[]>();
    recentHistory.forEach(h => {
      const toolKey = h.executionPlan;
      const metrics = toolMetrics.get(toolKey) || [];
      metrics.push(h.actualMetrics);
      toolMetrics.set(toolKey, metrics);
    });

    // Update baselines
    toolMetrics.forEach((metrics, toolKey) => {
      const baseline = this.performanceBaselines.get(toolKey);
      if (baseline && metrics.length > 0) {
        baseline.averageExecutionTime = metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length;
        baseline.successRate = metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length;
        baseline.lastUpdated = new Date();
        baseline.sampleSize = metrics.length;
      }
    });
  }

  private analyzePerformanceTrends(): void {
    // Analyze trends and adjust optimization strategies
    const trends = this.calculatePerformanceTrends();

    // Adjust user behavior model based on trends
    if (trends.preferenceShift) {
      this.updateUserBehaviorModel(trends.preferenceShift);
    }
  }

  private calculatePerformanceTrends(): any {
    // Simplified trend analysis
    const recentHistory = this.adaptiveLearning.performanceHistory.slice(-50);

    return {
      preferenceShift: this.detectPreferenceShift(recentHistory),
      performanceDegradation: this.detectPerformanceDegradation(recentHistory)
    };
  }

  private detectPreferenceShift(history: PerformanceHistory[]): any {
    // Detect if user preferences are changing based on feedback
    const recentFeedback = history
      .filter(h => h.userFeedback !== undefined)
      .slice(-20);

    if (recentFeedback.length < 10) return null;

    const avgRecentFeedback = recentFeedback.reduce((sum, h) => sum + h.userFeedback!, 0) / recentFeedback.length;

    if (avgRecentFeedback < 3) {
      return { type: 'dissatisfaction', severity: 'medium' };
    }

    return null;
  }

  private detectPerformanceDegradation(history: PerformanceHistory[]): any {
    // Simple performance degradation detection
    if (history.length < 20) return null;

    const first10 = history.slice(0, 10);
    const last10 = history.slice(-10);

    const firstAvgTime = first10.reduce((sum, h) => sum + h.actualMetrics.executionTime, 0) / 10;
    const lastAvgTime = last10.reduce((sum, h) => sum + h.actualMetrics.executionTime, 0) / 10;

    if (lastAvgTime > firstAvgTime * 1.2) {
      return { type: 'slowdown', increase: ((lastAvgTime - firstAvgTime) / firstAvgTime) * 100 };
    }

    return null;
  }

  private updateUserBehaviorModel(shift: any): void {
    if (shift.type === 'dissatisfaction') {
      // Adjust preferences to be more conservative
      this.adaptiveLearning.userBehaviorModel.preferredTools.forEach((weight, tool) => {
        this.adaptiveLearning.userBehaviorModel.preferredTools.set(tool, weight * 0.9);
      });
    }
  }

  private optimizeBasedOnLearning(): void {
    // Apply learned optimizations automatically
    const patterns = this.adaptiveLearning.learnedPatterns;

    patterns.forEach((pattern, patternKey) => {
      if (pattern.successRate > 0.9 && pattern.frequency > 10) {
        // Pattern is proven to work well - prioritize it
        this.updateOptimizationWeights(patternKey, 'increase');
      } else if (pattern.successRate < 0.5 && pattern.frequency > 5) {
        // Pattern consistently fails - avoid it
        this.updateOptimizationWeights(patternKey, 'decrease');
      }
    });
  }

  private updateOptimizationWeights(pattern: string, direction: 'increase' | 'decrease'): void {
    // Update internal optimization weights based on learning
    const adjustment = direction === 'increase' ? 1.1 : 0.9;
    // This would update internal optimization parameters
    console.log(`[McpWorkflowOptimizer] Adjusting optimization weights for pattern: ${pattern} by ${adjustment}`);
  }

  // Additional methods for specific optimizations

  private findCostEffectiveAlternative(currentTool: any): any | null {
    // Find cheaper alternatives (simplified implementation)
    const alternatives = this.findAlternativeTools(currentTool.tool);

    // Prefer tools with lower rate limit weight (typically cheaper)
    const cheapest = alternatives.reduce((best, alt) => {
      if (!best || alt.rateLimitWeight < best.rateLimitWeight) {
        return alt;
      }
      return best;
    }, null);

    return cheapest ? { ...currentTool, tool: cheapest } : null;
  }

  private optimizeForBatching(steps: any[]): any[] {
    // Group compatible operations for batching
    const batchableSteps = steps.filter(step =>
      step.tool.server.capabilities?.supportsBatch
    );

    if (batchableSteps.length < 2) return steps;

    // Simple batching - group consecutive similar operations
    const optimizedSteps = [];
    let currentBatch = [];

    for (const step of steps) {
      if (currentBatch.length === 0) {
        currentBatch.push(step);
      } else if (this.canBatchWith(step, currentBatch[0])) {
        currentBatch.push(step);
      } else {
        if (currentBatch.length > 1) {
          optimizedSteps.push(this.createBatchedStep(currentBatch));
        } else {
          optimizedSteps.push(...currentBatch);
        }
        currentBatch = [step];
      }
    }

    // Handle remaining batch
    if (currentBatch.length > 1) {
      optimizedSteps.push(this.createBatchedStep(currentBatch));
    } else if (currentBatch.length === 1) {
      optimizedSteps.push(currentBatch[0]);
    }

    return optimizedSteps;
  }

  private canBatchWith(step: any, batchStep: any): boolean {
    return step.tool.server.serverId === batchStep.tool.server.serverId &&
           step.tool.tool.category === batchStep.tool.tool.category;
  }

  private createBatchedStep(batchSteps: any[]): any {
    return {
      stepId: `batch_${batchSteps.map(s => s.stepId).join('_')}`,
      description: `Batched execution: ${batchSteps.map(s => s.description).join(', ')}`,
      tool: batchSteps[0].tool,
      dependencies: [...new Set(batchSteps.flatMap(s => s.dependencies || []))],
      expectedOutput: 'Batched results',
      fallbackOptions: []
    };
  }

  private maximizeCacheUsage(steps: any[]): any[] {
    return steps.map(step => {
      if (step.tool.tool.category === 'read' || step.tool.tool.category === 'search') {
        return {
          ...step,
          cacheEnabled: true,
          cachePreferred: true,
          cacheTTL: 600 // 10 minutes for cost optimization
        };
      }
      return step;
    });
  }

  private removeUnnecessarySteps(steps: any[], analysis: IntelligentQueryAnalysis): any[] {
    // Remove steps that might be redundant based on query analysis
    const necessarySteps = steps.filter(step => {
      // Keep all steps that are explicitly required by the user's intent
      return this.isStepNecessary(step, analysis);
    });

    return necessarySteps;
  }

  private isStepNecessary(step: any, analysis: IntelligentQueryAnalysis): boolean {
    // Simplified necessity check
    const primaryAction = analysis.intent.primaryAction;
    const stepAction = step.tool.tool.category;

    // Always keep steps that match the primary action
    if (stepAction === primaryAction) return true;

    // Keep validation steps for write operations
    if (step.stepId.includes('validation') && ['create', 'update', 'delete'].includes(primaryAction)) {
      return true;
    }

    // Remove optional steps for cost optimization
    return !step.stepId.includes('optional');
  }

  private findPreferredTool(currentTool: any, userModel: UserBehaviorModel): any | null {
    const alternatives = this.findAlternativeTools(currentTool.tool);
    let bestTool = null;
    let highestPreference = userModel.preferredTools.get(currentTool.tool.toolName) || 0;

    for (const alt of alternatives) {
      const preference = userModel.preferredTools.get(alt.toolName) || 0;
      if (preference > highestPreference) {
        highestPreference = preference;
        bestTool = { ...currentTool, tool: alt };
      }
    }

    return bestTool;
  }

  private getExecutionContext(analysis: IntelligentQueryAnalysis): string {
    const timeOfDay = new Date().getHours() < 12 ? 'morning' : 'afternoon';
    const domain = analysis.intent.context.domain;
    return `${timeOfDay}-${domain}`;
  }

  private optimizeForPowerUsers(plan: ExecutionPlan, steps: any[]): ExecutionPlan {
    // Power users prefer comprehensive, feature-rich tools
    return {
      ...plan,
      planId: `power_${Date.now()}`,
      steps: steps.map(step => ({
        ...step,
        tool: this.findMostCapableTool(step.tool) || step.tool
      })),
      complexity: 'complex' // Power users can handle complexity
    };
  }

  private optimizeForBeginners(plan: ExecutionPlan, steps: any[]): ExecutionPlan {
    // Beginners prefer simple, guided approaches
    return {
      ...plan,
      planId: `beginner_${Date.now()}`,
      steps: steps.map(step => ({
        ...step,
        tool: this.findSimplestTool(step.tool) || step.tool,
        guidance: this.addStepGuidance(step)
      })),
      complexity: 'simple'
    };
  }

  private findMostCapableTool(currentTool: any): any | null {
    const alternatives = this.findAlternativeTools(currentTool.tool);
    // Find tool with most parameters/capabilities
    const mostCapable = alternatives.reduce((best, alt) => {
      const altParams = alt.parameters?.length || 0;
      const bestParams = best?.parameters?.length || 0;
      return altParams > bestParams ? alt : best;
    }, null);

    return mostCapable ? { ...currentTool, tool: mostCapable } : null;
  }

  private findSimplestTool(currentTool: any): any | null {
    const alternatives = this.findAlternativeTools(currentTool.tool);
    // Find tool with fewest parameters
    const simplest = alternatives.reduce((best, alt) => {
      const altParams = alt.parameters?.length || 0;
      const bestParams = best?.parameters?.length || 999;
      return altParams < bestParams ? alt : best;
    }, null);

    return simplest ? { ...currentTool, tool: simplest } : null;
  }

  private addStepGuidance(step: any): string {
    return `Step guidance: ${step.description}. This will ${step.expectedOutput.toLowerCase()}.`;
  }

  private combineOptimizations(optimizations: Array<{ plan: ExecutionPlan, weight: number }>): ExecutionPlan {
    // Simplified combination - use the highest weighted optimization as base
    const sortedOpts = optimizations.sort((a, b) => b.weight - a.weight);
    const basePlan = sortedOpts[0].plan;

    // Apply elements from other optimizations based on weights
    const combinedSteps = [...basePlan.steps];

    return {
      ...basePlan,
      planId: `hybrid_${Date.now()}`,
      steps: combinedSteps,
      complexity: this.recalculateComplexity(combinedSteps),
      estimatedDuration: this.recalculateDuration(combinedSteps)
    };
  }

  private identifyImprovements(originalPlan: ExecutionPlan, optimizedPlan: ExecutionPlan): OptimizationImprovement[] {
    const improvements: OptimizationImprovement[] = [];

    // Compare execution times
    if (optimizedPlan.estimatedDuration < originalPlan.estimatedDuration) {
      improvements.push({
        type: 'step-reordering',
        description: `Reduced execution time by ${Math.round(((originalPlan.estimatedDuration - optimizedPlan.estimatedDuration) / originalPlan.estimatedDuration) * 100)}%`,
        impact: 'high',
        reasoning: 'Optimized tool selection and execution order',
        riskLevel: 'low'
      });
    }

    // Compare success probability
    if (optimizedPlan.successProbability > originalPlan.successProbability) {
      improvements.push({
        type: 'fallback-addition',
        description: `Increased success probability by ${Math.round((optimizedPlan.successProbability - originalPlan.successProbability) * 100)}%`,
        impact: 'medium',
        reasoning: 'Added fallback options and validation steps',
        riskLevel: 'low'
      });
    }

    // Check for parallel execution
    const hasParallel = optimizedPlan.steps.some(step => step.description.includes('batch') || step.description.includes('parallel'));
    if (hasParallel) {
      improvements.push({
        type: 'parallel-execution',
        description: 'Enabled parallel execution for compatible operations',
        impact: 'medium',
        reasoning: 'Identified independent operations that can run concurrently',
        riskLevel: 'medium'
      });
    }

    return improvements;
  }

  private calculateEstimatedBenefit(originalPlan: ExecutionPlan, optimizedPlan: ExecutionPlan): OptimizationBenefit {
    const timeReduction = Math.max(0, ((originalPlan.estimatedDuration - optimizedPlan.estimatedDuration) / originalPlan.estimatedDuration) * 100);
    const reliabilityIncrease = Math.max(0, (optimizedPlan.successProbability - originalPlan.successProbability) * 100);

    return {
      timeReduction,
      reliabilityIncrease,
      costReduction: timeReduction * 0.5, // Simplified cost model
      userExperienceScore: 7 + (timeReduction / 20) + (reliabilityIncrease / 10) // Score out of 10
    };
  }

  private calculateOptimizationConfidence(analysis: IntelligentQueryAnalysis, optimizedPlan: ExecutionPlan): number {
    let confidence = 0.7; // baseline

    // Increase confidence based on data availability
    const relevantHistory = this.adaptiveLearning.performanceHistory.filter(h =>
      this.calculateQuerySimilarity(h.query, analysis.originalQuery) > 0.6
    );

    if (relevantHistory.length > 10) confidence += 0.2;
    else if (relevantHistory.length > 5) confidence += 0.1;

    // Increase confidence for simple optimizations
    if (optimizedPlan.complexity === 'simple') confidence += 0.1;

    // Decrease confidence for high-risk optimizations
    if (optimizedPlan.riskLevel === 'high') confidence -= 0.2;
    else if (optimizedPlan.riskLevel === 'medium') confidence -= 0.1;

    return Math.max(0.1, Math.min(confidence, 0.95));
  }

  private calculateQuerySimilarity(query1: string, query2: string): number {
    // Simple word overlap similarity
    const words1 = new Set(query1.toLowerCase().split(' '));
    const words2 = new Set(query2.toLowerCase().split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  private recalculateDuration(steps: any[]): number {
    return steps.reduce((total, step) => {
      return total + this.getEstimatedExecutionTime(step.tool);
    }, 0);
  }

  private recalculateComplexity(steps: any[]): ExecutionPlan['complexity'] {
    if (steps.length > 5) return 'complex';
    if (steps.length > 2) return 'medium';
    return 'simple';
  }

  /**
   * Record optimization performance for learning
   */
  async recordOptimizationPerformance(
    optimization: WorkflowOptimization,
    actualMetrics: OptimizationMetrics,
    userFeedback?: number
  ): Promise<void> {
    const performance: PerformanceHistory = {
      timestamp: new Date(),
      query: `optimization-${optimization.optimizationId}`,
      executionPlan: optimization.optimizedPlan.planId,
      actualMetrics,
      userFeedback,
      context: {
        optimizationType: optimization.optimizationType,
        originalDuration: optimization.originalPlan.estimatedDuration,
        optimizedDuration: optimization.optimizedPlan.estimatedDuration
      }
    };

    this.adaptiveLearning.performanceHistory.push(performance);

    // Learn from the results
    if (actualMetrics.successRate > 0.8) {
      this.reinforceSuccessfulOptimization(optimization);
    } else {
      this.penalizeFailedOptimization(optimization);
    }

    console.log(`[McpWorkflowOptimizer] Recorded optimization performance: ${optimization.optimizationId}`);
  }

  private reinforceSuccessfulOptimization(optimization: WorkflowOptimization): void {
    // Increase confidence in similar optimization patterns
    const patternKey = `${optimization.optimizationType}-${optimization.originalPlan.complexity}`;
    const existingPattern = this.adaptiveLearning.learnedPatterns.get(patternKey);

    if (existingPattern) {
      existingPattern.frequency += 1;
      existingPattern.successRate = (existingPattern.successRate * (existingPattern.frequency - 1) + 1) / existingPattern.frequency;
    } else {
      this.adaptiveLearning.learnedPatterns.set(patternKey, {
        pattern: patternKey,
        frequency: 1,
        successRate: 1.0,
        averageTime: optimization.optimizedPlan.estimatedDuration,
        bestTools: optimization.optimizedPlan.steps.map(s => s.tool.tool.toolName),
        contexts: [optimization.optimizedPlan.complexity]
      });
    }
  }

  private penalizeFailedOptimization(optimization: WorkflowOptimization): void {
    // Decrease confidence in similar optimization patterns
    const patternKey = `${optimization.optimizationType}-${optimization.originalPlan.complexity}`;
    const existingPattern = this.adaptiveLearning.learnedPatterns.get(patternKey);

    if (existingPattern) {
      existingPattern.frequency += 1;
      existingPattern.successRate = (existingPattern.successRate * (existingPattern.frequency - 1) + 0) / existingPattern.frequency;
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    totalOptimizations: number;
    successRate: number;
    averageImprovement: number;
    learnedPatterns: number;
    activeBaselines: number;
  } {
    const allOptimizations = Array.from(this.optimizationHistory.values()).flat();
    const recentHistory = this.adaptiveLearning.performanceHistory.slice(-100);

    const successfulOptimizations = recentHistory.filter(h => h.actualMetrics.successRate > 0.8);
    const successRate = recentHistory.length > 0 ? successfulOptimizations.length / recentHistory.length : 0;

    const improvements = allOptimizations
      .map(opt => opt.estimatedBenefit.timeReduction)
      .filter(improvement => improvement > 0);
    const averageImprovement = improvements.length > 0 ?
      improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length : 0;

    return {
      totalOptimizations: allOptimizations.length,
      successRate,
      averageImprovement,
      learnedPatterns: this.adaptiveLearning.learnedPatterns.size,
      activeBaselines: this.performanceBaselines.size
    };
  }
}