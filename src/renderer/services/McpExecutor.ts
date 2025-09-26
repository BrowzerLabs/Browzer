import { McpClientManager } from './McpClientManager';
import { McpRouter, ToolMatch } from './McpRouter';
import { McpErrorHandler } from './McpErrorHandler';
import { McpQueryParser, ParsedWorkflow } from './McpQueryParser';
import { McpWorkflowPlanner, ExecutionPlan } from './McpWorkflowPlanner';
import { McpContextManager } from './McpContextManager';
import { McpWorkflowErrorHandler } from './McpWorkflowErrorHandler';
import { McpWorkflowOrchestrator, ConditionalWorkflow } from './McpWorkflowOrchestrator';
import { McpIntelligentParser } from './McpIntelligentParser';
import { McpWorkflowOptimizer } from './McpWorkflowOptimizer';
import { McpSelfHealingSystem } from './McpSelfHealingSystem';
import { McpClaudeService, McpMessageAnalysis } from './McpClaudeService';
import { McpToolDiscoveryService, ToolRegistry } from './McpToolDiscoveryService';
import { McpToolResolver } from './McpToolResolver';

export interface McpExecutionResult {
  success: boolean;
  data: any;
  error?: string;
  toolName: string;
  executionTime: number;
  stepId?: string;
  stepDescription?: string;
}

export interface CacheEntry {
  result: McpExecutionResult[];
  timestamp: number;
  query: string;
}

/**
 * Enhanced MCP tool executor for ool orchestration.
 * Handles real tool execution with performance optimization, caching, and circuit breakers.
 * Now includes multi-tool workflow orchestration for complex queries.
 */
export class McpExecutor {
  private errorHandler: McpErrorHandler;
  private queryCache: Map<string, CacheEntry> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private queryParser: McpQueryParser;
  private workflowPlanner: McpWorkflowPlanner;
  private contextManager: McpContextManager;
  private workflowErrorHandler: McpWorkflowErrorHandler;
  private workflowOrchestrator: McpWorkflowOrchestrator;
  private intelligentParser: McpIntelligentParser;
  private workflowOptimizer: McpWorkflowOptimizer;
  private selfHealingSystem: McpSelfHealingSystem;
  private claudeService: McpClaudeService;
  private toolDiscoveryService: McpToolDiscoveryService;
  private toolResolver: McpToolResolver;

  // Cache configuration
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  constructor(private mcpManager: McpClientManager) {
    const router = new McpRouter(this.mcpManager);
    this.errorHandler = new McpErrorHandler(this.mcpManager, router);
    this.queryParser = new McpQueryParser();
    this.workflowPlanner = new McpWorkflowPlanner(this.mcpManager, router);
    this.contextManager = new McpContextManager();
    this.workflowErrorHandler = new McpWorkflowErrorHandler(this.contextManager, this.errorHandler);
    this.workflowOrchestrator = new McpWorkflowOrchestrator(this, this.contextManager, this.workflowErrorHandler);

    // Initialize AI-enhanced components
    this.intelligentParser = new McpIntelligentParser(this.mcpManager);
    this.workflowOptimizer = new McpWorkflowOptimizer(this.mcpManager);
    this.selfHealingSystem = new McpSelfHealingSystem(this.mcpManager);
    this.claudeService = new McpClaudeService();
    this.toolDiscoveryService = new McpToolDiscoveryService(this.mcpManager);
    this.toolResolver = new McpToolResolver(this.mcpManager);

    this.startPerformanceMonitoring();

    // Initialize Universal MCP System - clear any corrupted preferences
    this.initializeUniversalSystem();
  }

  /**
   * NEW: AI-Enhanced entry point using Claude API for message understanding
   */
  async executeQueryWithClaudeAPI(query: string): Promise<McpExecutionResult[]> {
    const startTime = Date.now();
    console.log('[McpExecutor] Starting Claude API-enhanced execution for:', query);

    try {
      // Step 1: Check if Claude API is available
      console.log('[McpExecutor] Checking Claude API availability...');
      this.claudeService.refreshApiKey(); // Refresh API key from localStorage
      const isClaudeAvailable = this.claudeService.isAvailable();
      console.log('[McpExecutor] Claude API available:', isClaudeAvailable);

      if (!isClaudeAvailable) {
        console.log('[McpExecutor] Claude API not available, falling back to traditional execution');
        console.log('[McpExecutor] Check that anthropic_api_key is set in localStorage');
        return await this.executeQuery(query);
      }

      console.log('[McpExecutor] Using Claude API for dynamic tool selection');

      // Step 2: DYNAMIC TOOL DISCOVERY - Get all available tools from all MCP servers
      console.log('[McpExecutor] Starting dynamic tool discovery...');
      const toolRegistry: ToolRegistry = await this.toolDiscoveryService.discoverAllTools();
      const availableTools = await this.toolDiscoveryService.getAllToolsForClaudeAPI();
      console.log('[McpExecutor] Dynamic tool discovery complete:', {
        totalTools: toolRegistry.totalTools,
        categories: Array.from(toolRegistry.categories.keys()),
        servers: availableTools.map((t: any) => t.serverName).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i)
      });

      // Step 3: Use Claude API to analyze user message with ALL discovered tools
      const claudeAnalysis: McpMessageAnalysis = await this.claudeService.analyzeUserMessageWithDynamicTools(query, availableTools);
      console.log('[McpExecutor] Claude analysis completed:', claudeAnalysis);

      // Step 4: Route based on Claude's analysis
      if (claudeAnalysis.tools.length === 0) {
        console.log('[McpExecutor] Claude found no suitable tools, falling back to traditional routing');
        return await this.executeQuery(query);
      }

      // Step 5: Execute using Claude's recommendations (single or multi-step)
      if (claudeAnalysis.tools.length === 1) {
        return await this.executeWithClaudeRecommendations(claudeAnalysis, startTime);
      } else {
        // Multi-step execution
        console.log('[McpExecutor] Multi-step execution required for', claudeAnalysis.tools.length, 'tools');
        return await this.executeMultiStepWorkflow(claudeAnalysis, startTime);
      }

    } catch (error) {
      console.error('[McpExecutor] Claude API-enhanced execution failed:', error);

      // Fallback to traditional execution on any Claude API error
      console.log('[McpExecutor] Falling back to traditional execution');
      return await this.executeQuery(query);
    }
  }

  /**
   * Execute MCP tools based on Claude's recommendations
   */
  private async executeWithClaudeRecommendations(
    analysis: McpMessageAnalysis,
    startTime: number
  ): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Executing with Claude recommendations');

    const results: McpExecutionResult[] = [];

    // Execute the top recommended tool
    const topTool = analysis.tools[0];
    console.log('[McpExecutor] Executing top Claude recommendation:', topTool.name);

    try {
      // Create tool match from Claude recommendation
      const toolMatch: ToolMatch = {
        toolName: topTool.name,
        score: topTool.confidence,
        description: topTool.reasoning
      };

      // Execute the tool with Claude's recommended parameters
      const queryType = this.analyzeQueryType(analysis.intent);
      console.log('[McpExecutor] Executing tool with Claude parameters:', topTool.parameters);

      // Use Claude's parameters for the MCP tool execution
      const result = await this.executeSingleToolWithClaudeParams(
        toolMatch,
        analysis.intent,
        topTool.parameters,
        queryType
      );

      // Enhanced result with Claude insights
      result.stepDescription = `Claude AI: ${topTool.reasoning}`;
      results.push(result);

      // Record performance metrics
      const executionTime = Date.now() - startTime;
      this.recordPerformanceMetric('claude_enhanced', executionTime);

      console.log(`[McpExecutor] Claude-enhanced execution completed in ${executionTime}ms`);
      return results;

    } catch (error) {
      console.error('[McpExecutor] Claude recommendation execution failed:', error);

      // Create error result
      results.push({
        success: false,
        data: null,
        error: `Claude recommendation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        toolName: topTool.name,
        executionTime: Date.now() - startTime,
        stepDescription: `Failed to execute Claude recommendation: ${topTool.name}`
      });

      return results;
    }
  }

  async executeQuery(query: string): Promise<McpExecutionResult[]> {
    // Universal query execution - works for any type of query
    return this.executeUniversalQuery(query);
  }

  async executeEmailQuery(query: string): Promise<McpExecutionResult[]> {
    // Legacy method - redirect to universal implementation
    return this.executeQuery(query);
  }

  private async executeUniversalQuery(query: string): Promise<McpExecutionResult[]> {
    const startTime = Date.now();
    console.log('[McpExecutor] Executing universal query with AI enhancement:', query);

    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult) {
      console.log('[McpExecutor] Returning cached result for query:', query);
      return cachedResult;
    }

    try {
      // Use AI-enhanced query understanding
      const intelligentAnalysis = await this.intelligentParser.analyzeQuery(query);
      console.log('[McpExecutor] AI analysis completed, confidence:', intelligentAnalysis.intent.confidence);

      // Optimize workflow based on AI analysis
      const optimization = await this.workflowOptimizer.optimizeWorkflow(
        intelligentAnalysis,
        'hybrid', // Use hybrid optimization for best balance
        { context: intelligentAnalysis.intent.context }
      );
      console.log('[McpExecutor] Workflow optimized with', optimization.optimizationType, 'strategy');

      // Execute the optimized workflow with improved simple query detection
      const isDefinitelySimple = this.isDefinitelySimpleQuery(query);

      if (isDefinitelySimple) {
        console.log('[McpExecutor] Detected simple query pattern, using direct execution');
        return await this.executeFallbackQuery(query, startTime);
      } else if (intelligentAnalysis.intent.context.complexity === 'complex' ||
        this.detectConditionalQuery(query)) {
        return await this.executeOptimizedConditionalWorkflow(intelligentAnalysis, optimization, startTime);
      } else if (intelligentAnalysis.intent.context.complexity === 'medium' ||
        this.detectComplexQuery(query)) {
        return await this.executeOptimizedWorkflowQuery(intelligentAnalysis, optimization, startTime);
      } else {
        // Simple query - execute with AI-enhanced tool selection
        return await this.executeOptimizedSimpleQuery(intelligentAnalysis, optimization, startTime);
      }

    } catch (aiError) {
      console.error('[McpExecutor] AI enhancement failed, falling back to traditional execution:', aiError);

      // Fallback to traditional execution flow
      return await this.executeFallbackQuery(query, startTime);
    }
  }

  private async executeFallbackQuery(query: string, startTime: number): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Executing fallback query logic');

    // Generate cache key for this query
    const cacheKey = this.generateCacheKey(query);

    //  Check if this is a conditional workflow query
    const isConditional = this.detectConditionalQuery(query);
    console.log('[McpExecutor] Conditional query detected:', isConditional);

    if (isConditional) {
      return await this.executeConditionalWorkflow(query, startTime);
    }

    // Check if this is a complex multi-tool query
    const isComplex = this.detectComplexQuery(query);
    console.log('[McpExecutor] Complex query detected:', isComplex);

    if (isComplex) {
      return await this.executeWorkflowQuery(query, startTime);
    }

    const results: McpExecutionResult[] = [];

    // Analyze query type to understand user intent
    const queryType = this.analyzeQueryType(query);
    console.log('[McpExecutor] Detected query type:', queryType);

    // Pre-flight server health check
    const healthStatus = await this.errorHandler.validateServerHealth();
    console.log('[McpExecutor] Server health status:', healthStatus);

    if (healthStatus.healthy.length === 0 && healthStatus.unhealthy.length > 0) {
      console.error('[McpExecutor] All MCP servers are unhealthy');
      const failureResult = [{
        success: false,
        data: null,
        error: `All MCP servers are unavailable: ${healthStatus.unhealthy.join(', ')}`,
        toolName: 'MCP System',
        executionTime: Date.now() - startTime
      }];

      // Don't cache failures
      return failureResult;
    }

    // DIAGNOSTIC: Check what tools are actually available
    const allAvailableTools = await this.mcpManager.listAllTools();
    console.log('[DEBUG] Available tools from listAllTools():', allAvailableTools);

    // Step 1: Route query to appropriate tools based on query type
    const router = new McpRouter(this.mcpManager);
    const matches = await router.routeQuery(query, 3); // Try top 3 tools for better coverage

    // DIAGNOSTIC: Enhanced tool matching information
    console.log('[DEBUG] Tool matches found:', matches.map(m => ({
      name: m.toolName,
      score: m.score,
      description: m.description,
      queryType: queryType
    })));

    if (matches.length === 0) {
      console.error('[DEBUG] No tools matched - Available tools:', allAvailableTools);
      throw new Error(`No suitable MCP tools found for ${queryType} query: "${query}". Available tools: ${allAvailableTools.join(', ')}`);
    }

    console.log('[McpExecutor] Found tool matches:', matches.map(m => `${m.toolName} (score: ${m.score})`));

    // Step 2: Execute the best match with query-type-specific logic
    const topMatch = matches[0];
    const result = await this.executeSingleToolWithType(topMatch, query, queryType);
    results.push(result);

    // Step 3: Enhanced error handling - try intelligent recovery first
    if (!result.success) {
      console.log('[McpExecutor] First tool failed, attempting intelligent recovery');

      // Try intelligent error recovery
      const recoveryResult = await this.errorHandler.handleToolFailure(
        query,
        topMatch.toolName,
        result.error || 'Unknown error',
        1
      );

      if (recoveryResult && recoveryResult.success) {
        console.log('[McpExecutor] Recovery successful');
        results.push(recoveryResult);
      } else if (matches.length > 1) {
        // Fallback to next best tool if recovery failed
        console.log('[McpExecutor] Recovery failed, trying fallback tool:', matches[1].toolName);
        const fallbackResult = await this.executeSingleToolWithType(matches[1], query, queryType);
        results.push(fallbackResult);

        // Try third tool if available and second tool also failed
        if (!fallbackResult.success && matches.length > 2) {
          console.log('[McpExecutor] Second tool failed, trying third tool:', matches[2].toolName);
          const thirdResult = await this.executeSingleToolWithType(matches[2], query, queryType);
          results.push(thirdResult);
        }
      } else {
        // No recovery possible, add the original failed result
        results.push(result);
      }
    }

    // Cache successful results (only if at least one result is successful)
    if (results.some(r => r.success)) {
      this.addToCache(cacheKey, results, query);
    }

    // Track performance metrics
    const totalTime = Date.now() - startTime;
    this.recordPerformanceMetric(queryType, totalTime);

    console.log(`[McpExecutor] Query execution completed in ${totalTime}ms`);
    return results;
  }

  private async executeSingleTool(toolMatch: ToolMatch, query: string): Promise<McpExecutionResult> {
    const startTime = Date.now();
    const toolName = toolMatch.toolName;

    try {
      console.log(`[McpExecutor] Executing tool: ${toolName}`);

      let result;

      // Universal MCP tool execution - no hardcoded tool-specific logic
      result = await this.executeGenericTool(toolName, query);

      console.log(`[McpExecutor] Tool ${toolName} succeeded`);
      return {
        success: true,
        data: result,
        toolName: toolName,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error(`[McpExecutor] Tool ${toolName} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        data: null,
        error: errorMessage,
        toolName: toolName,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executeSingleToolWithType(toolMatch: ToolMatch, query: string, queryType: string): Promise<McpExecutionResult> {
    const startTime = Date.now();
    const toolName = toolMatch.toolName;
    const [serverName] = toolName.split('.');

    // Check circuit breaker first
    if (!this.errorHandler.canCallServer(serverName)) {
      console.log(`[McpExecutor] Tool ${toolName} blocked by circuit breaker`);
      return {
        success: false,
        data: null,
        error: `Server ${serverName} is temporarily unavailable (circuit breaker OPEN)`,
        toolName: toolName,
        executionTime: Date.now() - startTime
      };
    }

    // Check tool compatibility
    const isCompatible = await this.errorHandler.isToolCompatible(toolName);
    if (!isCompatible) {
      console.log(`[McpExecutor] Tool ${toolName} is not compatible`);
      return {
        success: false,
        data: null,
        error: `Tool ${toolName} is not compatible with current server configuration`,
        toolName: toolName,
        executionTime: Date.now() - startTime
      };
    }

    try {
      console.log(`[McpExecutor] Executing ${queryType} tool: ${toolName}`);

      let result;

      // Route to appropriate execution method based on query type and tool name
      // Universal MCP tool execution regardless of query type
      result = await this.executeGenericTool(toolName, query);

      const executionTime = Date.now() - startTime;
      console.log(`[McpExecutor] ${queryType} tool ${toolName} succeeded`);

      // Record success for circuit breaker
      this.errorHandler.recordSuccess(serverName, executionTime);

      return {
        success: true,
        data: result,
        toolName: toolName,
        executionTime: executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`[McpExecutor] ${queryType} tool ${toolName} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Record failure for circuit breaker
      this.errorHandler.recordFailure(serverName, errorMessage);

      return {
        success: false,
        data: null,
        error: errorMessage,
        toolName: toolName,
        executionTime: executionTime
      };
    }
  }




  private async executeGenericTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing generic tool ${toolName} for query:`, query);

    // Generic tool execution with basic parameters
    return await this.mcpManager.callTool(toolName, {
      query: query,
      limit: this.extractNumberFromQuery(query) || 10
    });
  }




  private extractNumberFromQuery(query: string): number | null {
    const numberMatch = query.match(/(\d+)/);
    return numberMatch ? parseInt(numberMatch[1]) : null;
  }

  /**
   * Check if a query is requesting multiple tools or complex workflow
   */
  isComplexQuery(query: string): boolean {
    return this.detectComplexQuery(query);
  }

  /**
   *  Detect if query requires conditional workflow execution
   */
  private detectConditionalQuery(query: string): boolean {
    const queryLower = query.toLowerCase();

    // Look for conditional patterns
    const conditionalPatterns = [
      /if\s+.+\s*,?\s*then\s+.+/i,
      /if\s+.+\s*,?\s*else\s+.+/i,
      /if\s+.+\s*,?\s*otherwise\s+.+/i,
      /.+\.\s*if\s+.+,?\s*.+/i
    ];

    return conditionalPatterns.some(pattern => pattern.test(queryLower));
  }

  /**
   *  Execute conditional workflow
   */
  private async executeConditionalWorkflow(query: string, startTime: number): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Executing conditional workflow for query:', query);

    try {
      // Parse conditional workflow
      const conditionalWorkflow = this.workflowOrchestrator.parseConditionalQuery(query);
      console.log('[McpExecutor] Parsed conditional workflow:', conditionalWorkflow);

      // Execute the workflow
      const workflowResult = await this.workflowOrchestrator.executeConditionalWorkflow(conditionalWorkflow);

      // Cache the result
      const cacheKey = this.generateCacheKey(query);
      const executionTime = Date.now() - startTime;
      const result: McpExecutionResult = {
        success: workflowResult.status === 'completed',
        data: workflowResult,
        toolName: 'ConditionalWorkflow',
        error: workflowResult.error || undefined,
        executionTime: executionTime
      };
      this.addToCache(cacheKey, [result], query);

      // Record performance metrics
      this.recordPerformanceMetric('conditional', executionTime);

      return [result];

    } catch (error) {
      console.error('[McpExecutor] Conditional workflow execution failed:', error);

      const executionTime = Date.now() - startTime;
      return [{
        success: false,
        data: null,
        toolName: 'ConditionalWorkflow',
        error: (error as Error).message,
        executionTime: executionTime
      }];
    }
  }

  /**
   * Enhanced complex query detection
   */
  private detectComplexQuery(query: string): boolean {
    const queryLower = query.toLowerCase();

    // Sequential workflow indicators
    const sequentialIndicators = [
      'then', 'and then', 'after that', 'next', 'afterwards',
      'first.*then', 'step 1.*step 2', '1\\).*2\\)'
    ];

    // Conditional workflow indicators
    const conditionalIndicators = [
      'if', 'when', 'unless', 'else', 'otherwise',
      'if.*then', 'when.*then', 'if.*else'
    ];

    // Multi-action indicators
    const multiActionIndicators = [
      'summarize', 'reply to', 'forward to',
      'create.*send', 'get.*then.*', 'read.*then.*',
      'find.*and.*', 'search.*then.*'
    ];

    const allIndicators = [...sequentialIndicators, ...conditionalIndicators, ...multiActionIndicators];

    for (const indicator of allIndicators) {
      if (new RegExp(indicator, 'i').test(queryLower)) {
        console.log('[McpExecutor] Complex query indicator found:', indicator);
        return true;
      }
    }

    // Check for multiple action verbs
    const actionVerbs = ['get', 'read', 'send', 'create', 'update', 'delete', 'find', 'search', 'list', 'show'];
    let actionCount = 0;

    for (const verb of actionVerbs) {
      const matches = queryLower.match(new RegExp(`\\b${verb}\\b`, 'g'));
      if (matches) {
        actionCount += matches.length;
      }
    }

    console.log('[McpExecutor] Action verb count:', actionCount);
    return actionCount >= 2;
  }

  /**
   * Execute complex multi-tool workflows
   */
  async executeComplexQuery(query: string): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Complex query detected, executing workflow:', query);
    return await this.executeWorkflowQuery(query, Date.now());
  }

  /**
   * Execute multi-tool workflow queries
   */
  private async executeWorkflowQuery(query: string, startTime: number): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Starting workflow execution for:', query);

    try {
      // Step 1: Parse the query into workflow steps
      const parsedWorkflow: ParsedWorkflow = this.queryParser.parseQuery(query);
      console.log('[McpExecutor] Parsed workflow:', parsedWorkflow.steps.length, 'steps');

      // Step 2: Create execution plan
      const executionPlan: ExecutionPlan = await this.workflowPlanner.createExecutionPlan(parsedWorkflow);
      console.log('[McpExecutor] Created execution plan with', executionPlan.executionSteps.length, 'steps');

      // Step 3: Validate the plan
      const validation = await this.workflowPlanner.validatePlan(executionPlan);
      if (!validation.isValid) {
        console.error('[McpExecutor] Workflow plan validation failed:', validation.issues);
        return [{
          success: false,
          data: null,
          error: `Workflow validation failed: ${validation.issues.join(', ')}`,
          toolName: 'Workflow Planner',
          executionTime: Date.now() - startTime
        }];
      }

      // Log warnings and suggestions
      if (validation.warnings.length > 0) {
        console.warn('[McpExecutor] Workflow warnings:', validation.warnings);
      }
      if (validation.suggestions.length > 0) {
        console.log('[McpExecutor] Workflow suggestions:', validation.suggestions);
      }

      // Step 4: Initialize context for this workflow
      const context = this.contextManager.initializeContext(executionPlan.workflowId);
      console.log('[McpExecutor] Initialized context for workflow:', executionPlan.workflowId);

      // Step 5: Execute workflow steps
      const workflowResults = await this.executeWorkflowSteps(executionPlan, context);

      // Step 6: Clean up context
      this.contextManager.cleanupContext(executionPlan.workflowId);

      const totalTime = Date.now() - startTime;
      console.log(`[McpExecutor] Workflow execution completed in ${totalTime}ms`);

      // Track performance for complex queries
      this.recordPerformanceMetric('workflow', totalTime);

      return workflowResults;

    } catch (error) {
      console.error('[McpExecutor] Workflow execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';

      return [{
        success: false,
        data: null,
        error: errorMessage,
        toolName: 'Workflow Executor',
        executionTime: Date.now() - startTime
      }];
    }
  }

  /**
   * Execute individual workflow steps
   */
  private async executeWorkflowSteps(plan: ExecutionPlan, context: any): Promise<McpExecutionResult[]> {
    const results: McpExecutionResult[] = [];

    // Convert between ExecutionPlan formats if needed
    const workflowPlan = this.convertToWorkflowPlan(plan);

    // Get execution order (handles dependencies)
    const executionOrder = this.workflowPlanner.getExecutionOrder(workflowPlan);
    console.log('[McpExecutor] Executing', executionOrder.length, 'groups of steps');

    // Execute each group (steps in same group can run in parallel)
    for (let groupIndex = 0; groupIndex < executionOrder.length; groupIndex++) {
      const stepGroup = executionOrder[groupIndex];
      console.log(`[McpExecutor] Executing group ${groupIndex + 1} with ${stepGroup.length} steps`);

      // Execute steps in group (sequential for now, parallel in future)
      for (const step of stepGroup) {
        console.log(`[McpExecutor] Executing step: ${step.stepId} - ${step.description}`);

        // Transform parameters using context and previous step results
        const transformedParams = this.contextManager.transformParameters(
          plan.workflowId,
          step.stepId,
          step.parameters
        );

        console.log(`[McpExecutor] Step ${step.stepId} transformed params:`, transformedParams);

        // Execute the step with enhanced error handling
        let stepResult: McpExecutionResult;

        if (step.selectedTool) {
          try {
            // Create enhanced query with context-aware parameters
            const enhancedQuery = this.buildContextAwareQuery(step, transformedParams);
            console.log(`[McpExecutor] Enhanced query for ${step.stepId}:`, enhancedQuery);

            // Use selected tool with enhanced query
            const toolMatch: ToolMatch = {
              toolName: step.selectedTool,
              score: 1.0,
              description: step.description
            };

            // Determine query type for this step
            const queryType = this.analyzeQueryType(step.description);

            // Execute with context-aware query
            stepResult = await this.executeSingleToolWithType(toolMatch, enhancedQuery, queryType);

            // Enhance result with step metadata
            stepResult.stepId = step.stepId;
            stepResult.stepDescription = step.description;

          } catch (error) {
            console.error(`[McpExecutor] Step ${step.stepId} execution failed:`, error);
            stepResult = {
              success: false,
              data: null,
              error: error instanceof Error ? error.message : 'Step execution failed',
              toolName: step.selectedTool,
              executionTime: 0,
              stepId: step.stepId,
              stepDescription: step.description
            };
          }
        } else {
          // No tool selected - this shouldn't happen if validation passed
          stepResult = {
            success: false,
            data: null,
            error: `No tool available for step: ${step.description}`,
            toolName: 'None',
            executionTime: 0,
            stepId: step.stepId,
            stepDescription: step.description
          };
        }

        // Store step result in context
        this.contextManager.storeStepResult(
          plan.workflowId,
          step.stepId,
          stepResult.data,
          step.outputVariable
        );

        results.push(stepResult);

        // Enhanced error handling for workflow steps
        if (!stepResult.success) {
          console.error(`[McpExecutor] Step ${step.stepId} failed:`, stepResult.error);

          // Analyze failure and attempt recovery
          const failureInfo = this.workflowErrorHandler.analyzeWorkflowFailure(
            plan,
            step,
            stepResult.error || 'Unknown error',
            results.filter(r => r.success)
          );

          console.log('[McpExecutor] Failure analysis completed, attempting recovery');

          // Attempt recovery
          const recoveryResult = await this.workflowErrorHandler.attemptWorkflowRecovery(
            failureInfo,
            plan,
            async (recoveryStep) => {
              // Create a wrapper for step execution
              const toolMatch: ToolMatch = {
                toolName: recoveryStep.selectedTool!,
                score: 1.0,
                description: recoveryStep.description
              };
              const queryType = this.analyzeQueryType(recoveryStep.description);
              const enhancedQuery = this.buildContextAwareQuery(recoveryStep, this.contextManager.transformParameters(
                plan.workflowId,
                recoveryStep.stepId,
                recoveryStep.parameters
              ));
              return await this.executeSingleToolWithType(toolMatch, enhancedQuery, queryType);
            }
          );

          if (recoveryResult.recovered) {
            console.log(`[McpExecutor] Recovery successful using strategy: ${recoveryResult.strategy.strategyType}`);
            // Add recovery results
            results.push(...recoveryResult.newResults);

            // Continue with workflow if recovery succeeded
            if (recoveryResult.newResults.some(r => r.success)) {
              continue;
            }
          } else {
            console.error(`[McpExecutor] Recovery failed: ${recoveryResult.userMessage}`);

            // Stop execution if step failed and is critical
            if (step.validationRequired) {
              console.error('[McpExecutor] Critical step failed and recovery unsuccessful, stopping workflow');
              break;
            } else {
              console.log('[McpExecutor] Non-critical step failed, continuing workflow');
              continue;
            }
          }
        }
      }
    }

    // Log context summary for debugging
    console.log('[McpExecutor] Final context state:');
    console.log(this.contextManager.getContextSummary(plan.workflowId));

    return results;
  }

  /**
   *  Build context-aware query for workflow steps
   */
  private buildContextAwareQuery(step: any, transformedParams: Record<string, any>): string {
    let enhancedQuery = step.description;

    // Apply parameter substitutions to the query
    for (const [key, value] of Object.entries(transformedParams)) {
      if (typeof value === 'string' || typeof value === 'number') {
        // Replace parameter placeholders in the query
        const placeholder = new RegExp(`\\b${key}\\b`, 'gi');
        enhancedQuery = enhancedQuery.replace(placeholder, String(value));
      }
    }

    // Add specific parameters based on tool type and query
    const queryLower = enhancedQuery.toLowerCase();

    // JIRA-specific enhancements
    if (queryLower.includes('jira') || queryLower.includes('board') || queryLower.includes('ticket')) {
      if (transformedParams.boardId && !enhancedQuery.includes(transformedParams.boardId)) {
        enhancedQuery += ` from board ${transformedParams.boardId}`;
      }
      if (transformedParams.limit) {
        enhancedQuery += ` limit ${transformedParams.limit}`;
      }
    }

    // Email-specific enhancements
    if (queryLower.includes('email') || queryLower.includes('gmail')) {
      if (transformedParams.from) {
        enhancedQuery += ` from ${transformedParams.from}`;
      }
      if (transformedParams.subject) {
        enhancedQuery += ` subject: ${transformedParams.subject}`;
      }
      if (transformedParams.limit) {
        enhancedQuery += ` limit ${transformedParams.limit}`;
      }
    }

    // Calendar-specific enhancements
    if (queryLower.includes('calendar') || queryLower.includes('meeting') || queryLower.includes('event')) {
      if (transformedParams.date) {
        enhancedQuery += ` on ${transformedParams.date}`;
      }
      if (transformedParams.time) {
        enhancedQuery += ` at ${transformedParams.time}`;
      }
    }

    console.log(`[McpExecutor] Built context-aware query: "${step.description}" → "${enhancedQuery}"`);
    return enhancedQuery;
  }

  /**
   * Analyze query type to understand user intent
   */
  private analyzeQueryType(query: string): 'email' | 'file' | 'slack' | 'web' | 'calendar' | 'generic' {
    const queryLower = query.toLowerCase();
    console.log('[DEBUG] analyzeQueryType input:', queryLower);

    // Email queries (include plurals and common variations)
    if (queryLower.match(/\b(emails?|mails?|inbox|messages?|send|reply|gmail|outlook)\b/)) {
      console.log('[DEBUG] Matched email pattern');
      return 'email';
    }

    // File/filesystem queries
    if (queryLower.match(/\b(file|folder|directory|list|read|write|create|delete|path)\b/)) {
      return 'file';
    }

    // Slack queries
    if (queryLower.match(/\b(slack|channel|dm|message|team|workspace)\b/)) {
      return 'slack';
    }

    // Web/search queries
    if (queryLower.match(/\b(search|web|google|find|lookup|browse|url|website)\b/)) {
      return 'web';
    }

    // Calendar queries
    if (queryLower.match(/\b(calendar|event|meeting|schedule|appointment|book|time)\b/)) {
      return 'calendar';
    }

    return 'generic';
  }











  /**
   * Caching and Performance Optimization Methods
   */

  /**
   * Generate cache key for query
   */
  private generateCacheKey(query: string): string {
    // Normalize query for consistent caching
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `query:${normalizedQuery}`;
  }

  /**
   * Get result from cache if available and not expired
   */
  private getFromCache(cacheKey: string): McpExecutionResult[] | null {
    const entry = this.queryCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    // Check if cache entry is expired
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      console.log('[McpExecutor] Cache entry expired, removing:', cacheKey);
      this.queryCache.delete(cacheKey);
      return null;
    }

    console.log('[McpExecutor] Cache hit for:', entry.query);
    return entry.result;
  }

  /**
   * Add result to cache
   */
  private addToCache(cacheKey: string, result: McpExecutionResult[], query: string): void {
    // Check cache size limit
    if (this.queryCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const oldestKey = this.queryCache.keys().next().value;
      if (oldestKey) {
        this.queryCache.delete(oldestKey);
        console.log('[McpExecutor] Cache size limit reached, removed oldest entry');
      }
    }

    const entry: CacheEntry = {
      result: result,
      timestamp: Date.now(),
      query: query
    };

    this.queryCache.set(cacheKey, entry);
    console.log('[McpExecutor] Cached result for:', query);
  }

  /**
   * Clear cache (useful for testing or manual cache invalidation)
   */
  clearCache(): void {
    this.queryCache.clear();
    console.log('[McpExecutor] Cache cleared');
  }

  /**
   * Enhanced hybrid tool resolution with semantic matching, keywords, and fuzzy matching
   * Implements Option 7: Comprehensive resolution strategy with confidence scoring
   */
  private async resolveFullToolName(toolName: string): Promise<{
    toolName: string;
    confidence: number;
    matchType: 'exact' | 'semantic' | 'keyword' | 'fuzzy';
    alternatives?: string[];
  }> {
    // If already in full format (server.toolName), return as-is with high confidence
    if (toolName.includes('.')) {
      return {
        toolName: toolName,
        confidence: 1.0,
        matchType: 'exact'
      };
    }

    console.log(`[McpExecutor] Starting hybrid resolution for tool: ${toolName}`);

    try {
      // Strategy 1: Exact semantic matching using existing tool resolver
      const semanticMatch = await this.performSemanticMatching(toolName);
      if (semanticMatch.toolName && semanticMatch.confidence >= 0.8) {
        console.log(`[McpExecutor] Semantic match found: ${semanticMatch.toolName} (confidence: ${semanticMatch.confidence})`);
        return semanticMatch;
      }

      // Strategy 2: Keyword-based matching with scoring
      const keywordMatch = await this.performKeywordMatching(toolName);
      if (keywordMatch.toolName && keywordMatch.confidence >= 0.7) {
        console.log(`[McpExecutor] Keyword match found: ${keywordMatch.toolName} (confidence: ${keywordMatch.confidence})`);
        return keywordMatch;
      }

      // Strategy 3: Fuzzy string matching as final fallback
      const fuzzyMatch = await this.performFuzzyMatching(toolName);
      if (fuzzyMatch.toolName && fuzzyMatch.confidence >= 0.6) {
        console.log(`[McpExecutor] Fuzzy match found: ${fuzzyMatch.toolName} (confidence: ${fuzzyMatch.confidence})`);
        return fuzzyMatch;
      }

      // REMOVED: Strategy 4 (User preference-based matching) - No hardcoded tool mappings in universal system

      // If no matches found, return the best available alternative with low confidence
      const bestAlternative = semanticMatch.toolName || keywordMatch.toolName || fuzzyMatch.toolName;
      if (bestAlternative) {
        const alternatives = [semanticMatch.toolName, keywordMatch.toolName, fuzzyMatch.toolName]
          .filter(Boolean)
          .filter(name => name !== bestAlternative);

        return {
          toolName: bestAlternative,
          confidence: Math.max(semanticMatch.confidence, keywordMatch.confidence, fuzzyMatch.confidence),
          matchType: semanticMatch.confidence >= keywordMatch.confidence ? 'semantic' :
                    keywordMatch.confidence >= fuzzyMatch.confidence ? 'keyword' : 'fuzzy',
          alternatives: alternatives
        };
      }

    } catch (error) {
      console.warn(`[McpExecutor] Hybrid resolution failed for ${toolName}:`, error);
    }

    // Ultimate fallback: throw error with helpful message and available tools
    const allTools = await this.mcpManager.listAllTools();
    const toolSuggestions = allTools.slice(0, 3).join(', ');

    throw new Error(`Tool "${toolName}" could not be resolved to any available MCP tool. Available tools include: ${toolSuggestions}. Please check your MCP server configuration.`);
  }

  /**
   * Strategy 1: Semantic matching using existing tool resolver with capability mapping
   */
  private async performSemanticMatching(toolName: string): Promise<{
    toolName: string;
    confidence: number;
    matchType: 'semantic';
  }> {
    try {
      // Use existing dynamic tool resolver for semantic matching
      const tool = await this.toolResolver.resolveByName(toolName);

      if (tool) {
        return {
          toolName: tool.fullName,
          confidence: 0.9, // High confidence for semantic matches
          matchType: 'semantic'
        };
      }

      // Try capability-based matching for common Claude tool names
      const capabilityMatch = await this.resolveByCapability(toolName);
      if (capabilityMatch) {
        return {
          toolName: capabilityMatch,
          confidence: 0.8,
          matchType: 'semantic'
        };
      }

    } catch (error) {
      console.warn(`[McpExecutor] Semantic matching failed for ${toolName}:`, error);
    }

    return { toolName: '', confidence: 0, matchType: 'semantic' };
  }

  /**
   * Strategy 2: Keyword matching with weighted scoring
   */
  private async performKeywordMatching(toolName: string): Promise<{
    toolName: string;
    confidence: number;
    matchType: 'keyword';
  }> {
    try {
      const allTools = await this.mcpManager.listAllTools();
      const keywords = toolName.toLowerCase().split('_');

      let bestMatch = '';
      let bestScore = 0;

      for (const fullToolName of allTools) {
        const score = this.calculateKeywordScore(keywords, fullToolName);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = fullToolName;
        }
      }

      // Convert score to confidence (normalize between 0.3 and 0.8)
      const confidence = bestScore > 0 ? Math.min(0.3 + (bestScore / keywords.length) * 0.5, 0.8) : 0;

      return {
        toolName: confidence >= 0.5 ? bestMatch : '',
        confidence,
        matchType: 'keyword'
      };

    } catch (error) {
      console.warn(`[McpExecutor] Keyword matching failed for ${toolName}:`, error);
    }

    return { toolName: '', confidence: 0, matchType: 'keyword' };
  }

  /**
   * Strategy 3: Fuzzy string matching using Levenshtein distance
   */
  private async performFuzzyMatching(toolName: string): Promise<{
    toolName: string;
    confidence: number;
    matchType: 'fuzzy';
  }> {
    try {
      const allTools = await this.mcpManager.listAllTools();

      let bestMatch = '';
      let bestSimilarity = 0;

      for (const fullToolName of allTools) {
        const shortName = fullToolName.split('.').pop() || fullToolName;
        const similarity = this.calculateStringSimilarity(toolName, shortName);

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = fullToolName;
        }
      }

      // Convert similarity to confidence (scale 0.1 to 0.7)
      const confidence = bestSimilarity > 0.3 ? 0.1 + (bestSimilarity * 0.6) : 0;

      return {
        toolName: confidence >= 0.4 ? bestMatch : '',
        confidence,
        matchType: 'fuzzy'
      };

    } catch (error) {
      console.warn(`[McpExecutor] Fuzzy matching failed for ${toolName}:`, error);
    }

    return { toolName: '', confidence: 0, matchType: 'fuzzy' };
  }

  // REMOVED: Strategy 4 (User preference-based matching) - Universal MCP system uses no hardcoded tool mappings

  /**
   * Map Claude's generic tool names to MCP capabilities
   */
  private async resolveByCapability(toolName: string): Promise<string | null> {
    const capabilityMappings: Record<string, { category: string; action: string; provider?: string }> = {
      'send_email': { category: 'email', action: 'create', provider: 'gmail' },
      'find_email': { category: 'email', action: 'read', provider: 'gmail' },
      'reply_to_email': { category: 'email', action: 'create', provider: 'gmail' },
      'get_events': { category: 'calendar', action: 'read', provider: 'google' },
      'create_event': { category: 'calendar', action: 'create', provider: 'google' },
      'quick_add_event': { category: 'calendar', action: 'create', provider: 'google' },
      'update_event': { category: 'calendar', action: 'update', provider: 'google' },
      'list_emails': { category: 'email', action: 'read', provider: 'gmail' },
      'search_emails': { category: 'email', action: 'read', provider: 'gmail' }
    };

    const capability = capabilityMappings[toolName];
    if (!capability) return null;

    try {
      // Use tool discovery service to find matching tools
      const toolRegistry = await this.toolDiscoveryService.discoverAllTools();
      const capabilityKey = `${capability.category}.${capability.action}${capability.provider ? '.' + capability.provider : ''}`;
      const matchingTools = toolRegistry.capabilityIndex.get(capabilityKey);

      if (matchingTools && matchingTools.length > 0) {
        // Return the highest priority tool
        const bestTool = matchingTools.sort((a, b) => b.priority - a.priority)[0];
        return bestTool.fullName;
      }
    } catch (error) {
      console.warn(`[McpExecutor] Capability resolution failed for ${toolName}:`, error);
    }

    return null;
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordScore(keywords: string[], toolName: string): number {
    const toolNameLower = toolName.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (toolNameLower.includes(keyword)) {
        // Exact match gets full score
        score += 1;
      } else {
        // Check for synonyms
        const synonyms = this.getKeywordSynonyms(keyword);
        for (const synonym of synonyms) {
          if (toolNameLower.includes(synonym)) {
            score += 0.8; // Partial score for synonym match
            break;
          }
        }
      }
    }

    return score;
  }

  /**
   * Get synonyms for common action keywords
   */
  private getKeywordSynonyms(keyword: string): string[] {
    const synonymMap: Record<string, string[]> = {
      'send': ['create', 'compose', 'write'],
      'find': ['get', 'search', 'list', 'read', 'fetch', 'retrieve'],
      'create': ['add', 'new', 'make', 'compose'],
      'update': ['edit', 'modify', 'change'],
      'delete': ['remove', 'trash'],
      'email': ['mail', 'message'],
      'event': ['appointment', 'meeting'],
      'calendar': ['cal', 'schedule']
    };

    return synonymMap[keyword] || [];
  }

  /**
   * Calculate string similarity using simplified Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Create matrix
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // Calculate distances
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1].toLowerCase() === str2[j - 1].toLowerCase() ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    // Convert distance to similarity (0-1)
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : 1 - (distance / maxLen);
  }

  // REMOVED: All preference storage methods - Universal MCP system uses no hardcoded tool mappings

  /**
   * Apply result limiting if MCP tool ignored the limit parameter
   */
  private applyResultLimiting(result: any, claudeParams: Record<string, any>, intent: string, toolName: string): any {
    // Extract the requested limit from the intent or parameters
    const requestedLimit = this.extractRequestedLimit(intent, claudeParams);

    if (!requestedLimit) {
      console.log('[McpExecutor] No limit specified, returning all results');
      return result;
    }

    console.log(`[McpExecutor] Applying limit of ${requestedLimit} to ${toolName} results`);

    // Handle different result formats
    if (result && typeof result === 'object') {
      // Gmail/email results format: {content: [{type: 'text', text: JSON}]}
      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const textContent = result.content[0]?.text;
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent);
            if (parsed.results && Array.isArray(parsed.results)) {
              parsed.results = parsed.results.slice(0, requestedLimit);
              result.content[0].text = JSON.stringify(parsed);
              console.log(`[McpExecutor] Limited results from ${this.getResultCount(result)} to ${requestedLimit}`);
            }
          } catch (e) {
            console.warn('[McpExecutor] Could not parse MCP result for limiting:', e);
          }
        }
      }
      // Direct results array format
      else if (Array.isArray(result)) {
        return result.slice(0, requestedLimit);
      }
      // Results object with results array
      else if (result.results && Array.isArray(result.results)) {
        result.results = result.results.slice(0, requestedLimit);
      }
    }

    return result;
  }

  /**
   * Extract requested limit from user intent or Claude parameters
   */
  private extractRequestedLimit(intent: string, claudeParams: Record<string, any>): number | null {
    // Check Claude parameters first
    if (claudeParams.limit && typeof claudeParams.limit === 'number') {
      return claudeParams.limit;
    }
    if (claudeParams.count && typeof claudeParams.count === 'number') {
      return claudeParams.count;
    }

    // Extract from intent text
    const numbers = intent.match(/\b(\d+)\b/g);
    if (numbers) {
      const num = parseInt(numbers[0]);
      if (num > 0 && num <= 100) { // Reasonable limit
        return num;
      }
    }

    // Check for specific phrases
    if (intent.includes('single') || intent.includes('one')) {
      return 1;
    }

    return null;
  }

  /**
   * Get count of results in various result formats
   */
  private getResultCount(result: any): number {
    if (!result) return 0;

    // Gmail/email results format: {content: [{type: 'text', text: JSON}]}
    if (result.content && Array.isArray(result.content) && result.content.length > 0) {
      const textContent = result.content[0]?.text;
      if (textContent) {
        try {
          const parsed = JSON.parse(textContent);
          if (parsed.results && Array.isArray(parsed.results)) {
            return parsed.results.length;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Direct results array
    if (Array.isArray(result)) {
      return result.length;
    }

    // Results object with results array
    if (result.results && Array.isArray(result.results)) {
      return result.results.length;
    }

    return 1; // Assume single result
  }

  /**
   * Record performance metric for query type
   */
  /**
   * Execute MCP tool with Claude's recommended parameters
   */
  private async executeSingleToolWithClaudeParams(
    toolMatch: ToolMatch,
    intent: string,
    claudeParams: Record<string, any>,
    queryType: string
  ): Promise<McpExecutionResult> {
    console.log('[McpExecutor] Executing tool with Claude parameters:', {
      tool: toolMatch.toolName,
      intent,
      claudeParams,
      queryType
    });

    try {
      // PHASE 1: Enhanced logging for parameter building diagnostics
      console.log('🔧 [McpExecutor] UNIVERSAL PARAMETER BUILDING - Starting comprehensive process');
      console.log('📊 [McpExecutor] Input Analysis:', {
        toolName: toolMatch.toolName,
        claudeParamsCount: Object.keys(claudeParams).length,
        claudeParamsKeys: Object.keys(claudeParams),
        intentLength: intent.length,
        intentSnippet: intent.substring(0, 100) + (intent.length > 100 ? '...' : '')
      });

      // Build parameters for MCP tool using Claude's analysis
      const mcpParameters = this.buildMcpParameters(toolMatch.toolName, claudeParams, intent);

      // PHASE 2: Comprehensive parameter building diagnostics
      console.log('🎯 [McpExecutor] PARAMETER BUILD RESULT:', {
        success: true,
        finalParameterCount: Object.keys(mcpParameters).length,
        finalParameterKeys: Object.keys(mcpParameters),
        hasInstructions: 'instructions' in mcpParameters,
        hasLimitParams: this.hasAnyLimitParameter(mcpParameters),
        parameterSizes: Object.fromEntries(
          Object.entries(mcpParameters).map(([key, value]) => [
            key,
            typeof value === 'string' ? `${value.length} chars` : typeof value
          ])
        )
      });

      // Resolve the tool name using hybrid strategy
      const toolResolution = await this.resolveFullToolName(toolMatch.toolName);
      console.log('[McpExecutor] Hybrid resolution result:', {
        originalTool: toolMatch.toolName,
        resolvedTool: toolResolution.toolName,
        matchType: toolResolution.matchType,
        confidence: toolResolution.confidence,
        alternatives: toolResolution.alternatives
      });

      // Enhanced user feedback for low confidence matches
      if (toolResolution.confidence < 0.7) {
        console.warn(`[McpExecutor] Low confidence match (${toolResolution.confidence}) for ${toolMatch.toolName} → ${toolResolution.toolName}`);
        if (toolResolution.alternatives && toolResolution.alternatives.length > 0) {
          console.log(`[McpExecutor] Alternative tools available: ${toolResolution.alternatives.join(', ')}`);
        }
      }

      // PHASE 3: Pre-execution diagnostics
      console.log('🚀 [McpExecutor] PRE-EXECUTION ANALYSIS:', {
        toolName: toolResolution.toolName,
        confidence: toolResolution.confidence,
        parametersReady: Object.keys(mcpParameters).length > 0,
        timeToExecution: Date.now()
      });

      // Execute the tool with proper parameters
      const executionStartTime = Date.now();
      const result = await this.mcpManager.callTool(toolResolution.toolName, mcpParameters);
      const executionTime = Date.now() - executionStartTime;

      // PHASE 4: Post-execution diagnostics
      console.log('✅ [McpExecutor] EXECUTION COMPLETED:', {
        success: true,
        executionTimeMs: executionTime,
        resultType: typeof result,
        hasContent: result && (result.content || result.result || result.data),
        resultSize: result ? JSON.stringify(result).length : 0
      });

      // REMOVED: User preferences learning system - No hardcoded tool mappings in universal system

      // Post-process result to apply limit if MCP tool ignored it
      const processedResult = this.applyResultLimiting(result, claudeParams, intent, toolMatch.toolName);
      console.log('[McpExecutor] Applied result limiting:', {
        originalCount: this.getResultCount(result),
        processedCount: this.getResultCount(processedResult)
      });

      const executionResult: McpExecutionResult = {
        success: true,
        data: processedResult,
        toolName: toolMatch.toolName,
        executionTime: 0,
        stepDescription: `${toolResolution.matchType.toUpperCase()} match (${Math.round(toolResolution.confidence * 100)}%): ${toolMatch.toolName} → ${toolResolution.toolName}. ${toolMatch.description}`
      };

      console.log('[McpExecutor] Hybrid tool resolution successful');
      return executionResult;

    } catch (error) {
      // PHASE 5: Comprehensive error diagnostics
      const errorDetails = {
        errorType: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        hasStack: error instanceof Error && error.stack,
        toolName: toolMatch.toolName,
        parameterCount: Object.keys(claudeParams).length,
        intentLength: intent.length,
        timestamp: new Date().toISOString()
      };

      console.error('❌ [McpExecutor] EXECUTION FAILED - Comprehensive error analysis:', errorDetails);

      // Additional diagnostics for schema validation errors
      if (error instanceof Error && (
        error.message.includes('parameter') ||
        error.message.includes('schema') ||
        error.message.includes('validation')
      )) {
        console.error('🔍 [McpExecutor] SCHEMA VALIDATION ERROR - Additional context:', {
          providedParameters: Object.keys(claudeParams),
          parameterValues: Object.fromEntries(
            Object.entries(claudeParams).map(([key, value]) => [
              key,
              typeof value === 'string' ? `"${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"` : typeof value
            ])
          ),
          toolSchemaAvailable: !!this.mcpManager.getCachedToolSchema(toolMatch.toolName),
          errorStack: error.stack?.split('\n').slice(0, 3).join('\n')
        });
      }

      console.error('[McpExecutor] Hybrid tool execution failed:', error);

      // REMOVED: User preferences learning system - No hardcoded tool mappings in universal system

      // Provide enhanced error message with resolution context
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof Error && error.message.includes('Available tools include:')) {
        errorMessage = `Tool resolution failed: ${errorMessage}`;
      } else {
        errorMessage = `Tool execution failed: ${errorMessage}`;
      }

      return {
        success: false,
        data: null,
        error: errorMessage,
        toolName: toolMatch.toolName,
        executionTime: 0,
        stepDescription: `FAILED: ${toolMatch.toolName} resolution/execution failed`
      };
    }
  }

  /**
   * Execute multi-step workflow with Claude's tool recommendations
   */
  private async executeMultiStepWorkflow(
    analysis: McpMessageAnalysis,
    startTime: number
  ): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Starting multi-step workflow execution');
    const results: McpExecutionResult[] = [];
    const executionContext = new Map<string, any>();

    // Store original query in context
    executionContext.set('originalQuery', analysis.intent);
    executionContext.set('startTime', startTime);

    for (let i = 0; i < analysis.tools.length; i++) {
      const tool = analysis.tools[i];
      console.log(`[McpExecutor] Executing step ${i + 1}/${analysis.tools.length}: ${tool.name}`);

      try {
        // Execute the tool with context from previous steps
        const stepResult = await this.executeToolWithContext(tool, i, executionContext, analysis);
        results.push(stepResult);

        // If this step failed and it's critical, stop execution
        if (!stepResult.success && this.isStepCritical(tool, analysis)) {
          console.error(`[McpExecutor] Critical step ${i + 1} failed, stopping workflow`);
          break;
        }

        // Store result in context for next steps
        executionContext.set(`step_${i}_result`, stepResult.data);
        executionContext.set(`step_${i}_success`, stepResult.success);

      } catch (error) {
        console.error(`[McpExecutor] Step ${i + 1} failed:`, error);

        // Create error result
        const errorResult: McpExecutionResult = {
          success: false,
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          toolName: tool.name,
          executionTime: Date.now() - startTime,
          stepDescription: `Step ${i + 1} failed: ${tool.name}`
        };

        results.push(errorResult);

        // Attempt self-healing if available
        if (this.selfHealingSystem) {
          try {
            console.log('[McpExecutor] Attempting self-healing for failed step');

            // Create IntelligentQueryAnalysis for healing system
            const healingAnalysis = {
              originalQuery: analysis.intent,
              processedQuery: analysis.intent,
              intent: {
                action: analysis.intent,
                context: {
                  domain: 'general',
                  complexity: analysis.complexity
                }
              },
              recommendedTools: [{
                tool: {
                  toolName: tool.name,
                  displayName: tool.name,
                  category: 'general'
                },
                server: {
                  serverId: 'unknown',
                  displayName: 'Unknown Server'
                },
                parameters: tool.parameters,
                confidence: tool.confidence,
                reasoning: tool.reasoning || 'Step recovery attempt'
              }],
              workflowSuggestions: [],
              executionPlan: {
                steps: [{
                  tool: {
                    toolName: tool.name,
                    displayName: tool.name,
                    category: 'general'
                  },
                  server: {
                    serverId: 'unknown',
                    displayName: 'Unknown Server'
                  },
                  parameters: tool.parameters,
                  confidence: tool.confidence
                }],
                totalSteps: 1,
                estimatedTime: 30
              },
              alternatives: []
            };

            const healingResult = await this.selfHealingSystem.healWorkflow(
              healingAnalysis as any, // Type assertion for self-healing context
              error as Error,
              {
                toolName: tool.name,
                serverName: 'unknown',
                query: analysis.intent,
                stepIndex: i,
                context: Object.fromEntries(executionContext.entries())
              }
            );

            if (healingResult.recovered && healingResult.result) {
              console.log('[McpExecutor] Self-healing succeeded, updating step result');
              errorResult.success = true;
              errorResult.data = healingResult.result;
              errorResult.error = undefined;
              errorResult.stepDescription = `Step ${i + 1} recovered: ${tool.name}`;
            }
          } catch (healingError) {
            console.error('[McpExecutor] Self-healing failed:', healingError);
          }
        }

        // Log the error and continue with next step
        console.error('[McpExecutor] Step failed, continuing with next step');
      }
    }

    // Record performance metrics
    const totalExecutionTime = Date.now() - startTime;
    this.recordPerformanceMetric('multi_step_claude', totalExecutionTime);

    console.log(`[McpExecutor] Multi-step workflow completed in ${totalExecutionTime}ms`);
    return results;
  }

  /**
   * Execute individual tool with context from previous steps
   */
  private async executeToolWithContext(
    tool: any,
    stepIndex: number,
    context: Map<string, any>,
    analysis: McpMessageAnalysis
  ): Promise<McpExecutionResult> {
    console.log(`[McpExecutor] Executing tool ${tool.name} with context:`, {
      stepIndex,
      contextKeys: Array.from(context.keys()),
      toolParams: tool.parameters
    });

    // Enhance tool parameters with context data if needed
    const enhancedParams = this.enhanceParametersWithContext(tool.parameters, context, stepIndex);

    // Create tool match
    const toolMatch: ToolMatch = {
      toolName: tool.name,
      score: tool.confidence,
      description: `Step ${stepIndex + 1}: ${tool.reasoning}`
    };

    // Execute the tool
    const result = await this.executeSingleToolWithClaudeParams(
      toolMatch,
      analysis.intent,
      enhancedParams,
      'dynamic'
    );

    return result;
  }

  /**
   * Enhance tool parameters with data from previous execution steps
   */
  private enhanceParametersWithContext(
    toolParams: Record<string, any>,
    context: Map<string, any>,
    stepIndex: number
  ): Record<string, any> {
    const enhanced = { ...toolParams };

    // For steps after the first, check if we can use previous step data
    if (stepIndex > 0) {
      const previousResult = context.get(`step_${stepIndex - 1}_result`);
      if (previousResult) {
        // Try to extract useful data from previous step
        if (typeof previousResult === 'object' && previousResult.id) {
          enhanced.contextId = previousResult.id;
        }
        if (typeof previousResult === 'string' && previousResult.includes('@')) {
          // Previous step might have returned an email address
          enhanced.contextEmail = previousResult.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
        }
      }
    }

    console.log('[McpExecutor] Enhanced parameters with context:', enhanced);
    return enhanced;
  }

  /**
   * Check if a step is critical for workflow continuation
   */
  private isStepCritical(tool: any, analysis: McpMessageAnalysis): boolean {
    // If there's only one tool or this is the last tool, it's critical
    if (analysis.tools.length === 1) {
      return true;
    }

    // Tools with high confidence are usually critical
    return tool.confidence > 0.8;
  }

  // TODO: Implement step healing with proper interface integration

  /**
   * NEW: Build MCP tool parameters dynamically (no hardcoded tool logic)
   */
  private buildMcpParameters(toolName: string, claudeParams: Record<string, any>, intent: string): Record<string, any> {
    console.log('[McpExecutor] 🔧 Building universal MCP parameters for tool:', toolName, 'with Claude params:', claudeParams);

    // PHASE 1: Schema Discovery and Pre-filtering
    const toolSchema = this.mcpManager.getCachedToolSchema(toolName);
    let mcpParams: Record<string, any> = {};

    if (toolSchema) {
      console.log(`[McpExecutor] 📋 Schema found for ${toolName} - using schema-aware parameter building`);

      // UNIVERSAL PHASE 1A: Schema-Aware Parameter Pre-filtering
      // Only include parameters that exist in the tool's schema to prevent validation failures
      mcpParams = this.buildSchemaAwareParameters(toolName, claudeParams, toolSchema);
      console.log(`[McpExecutor] ✅ Schema-aware parameters built:`, Object.keys(mcpParams));

      // UNIVERSAL PHASE 1B: Infer missing required parameters before validation
      const requiredParams = this.extractRequiredParametersFromSchema(toolSchema);
      console.log(`[McpExecutor] 📝 Required parameters for ${toolName}:`, requiredParams);

      for (const requiredParam of requiredParams) {
        if (!(requiredParam in mcpParams)) {
          console.log(`[McpExecutor] 🔍 Missing required parameter "${requiredParam}" - attempting inference`);
          const inferredValue = this.inferParameterFromIntent(requiredParam, intent, toolName);
          if (inferredValue !== null && inferredValue !== undefined) {
            mcpParams[requiredParam] = inferredValue;
            console.log(`[McpExecutor] ✨ Inferred required parameter ${requiredParam}:`, inferredValue);
          }
        }
      }

      // UNIVERSAL PHASE 1C: Apply smart type coercion before validation
      mcpParams = this.applySchemaBasedTypeCoercion(mcpParams, toolSchema);

    } else {
      console.log(`[McpExecutor] ⚠️  No schema found for ${toolName} - using universal fallback parameter building`);

      // UNIVERSAL FALLBACK: Copy all parameters for tools without schemas
      Object.assign(mcpParams, claudeParams);
    }

    // PHASE 2: Universal Parameter Validation (now with pre-filtered & coerced parameters)
    if (toolSchema) {
      const validation = this.mcpManager.validateToolParameters(toolName, mcpParams);

      if (!validation.valid) {
        console.log(`[McpExecutor] ⚠️  Parameter validation failed after schema-aware building:`, validation);

        // This should rarely happen now due to pre-filtering, but handle edge cases
        if (validation.missingRequired.length > 0) {
          console.log(`[McpExecutor] 🚨 Still missing required after inference:`, validation.missingRequired);
          // Store for error handling but continue with available parameters
          (mcpParams as any)._missingRequired = validation.missingRequired;
        }

        // Use filtered parameters (removing invalid ones)
        if (validation.filteredParams && Object.keys(validation.filteredParams).length > 0) {
          console.log(`[McpExecutor] 🔄 Using filtered parameters:`, Object.keys(validation.filteredParams));
          mcpParams = validation.filteredParams;
        }
      } else {
        console.log(`[McpExecutor] ✅ All parameters validated successfully for ${toolName}`);
      }
    }

    // PHASE 3: Universal Parameter Enhancements (apply to all tools)
    mcpParams = this.applyUniversalParameterEnhancements(mcpParams, toolName, intent, claudeParams);

    // Final validation log
    console.log('[McpExecutor] 🎯 Final universal parameter mapping:', mcpParams);

    return mcpParams;
  }

  /**
   * Infer missing parameter values from user intent using semantic analysis
   */
  private inferParameterFromIntent(parameterName: string, intent: string, _toolName?: string): any {
    const intentLower = intent.toLowerCase();
    const paramLower = parameterName.toLowerCase();

    console.log(`[McpExecutor] Attempting to infer parameter "${parameterName}" from intent: "${intent}"`);

    // Common parameter inference patterns
    try {
      // Board/Board ID parameter inference
      if (paramLower.includes('board') || parameterName === 'board') {
        // Look for board names in the intent
        const boardPatterns = [
          /(?:board|in|from|on)\s+["']?([^"'\s,]+)["']?/i,
          /["']([^"']+)["']\s+board/i,
          /board\s*:\s*["']?([^"'\s,]+)["']?/i
        ];

        for (const pattern of boardPatterns) {
          const match = intentLower.match(pattern);
          if (match && match[1]) {
            console.log(`[McpExecutor] Inferred board parameter: "${match[1]}"`);
            return match[1];
          }
        }

        // For project management tools, use common default patterns
        if (paramLower === 'board') {
          // Check if this is a search/find operation
          const isSearchOperation = intent.toLowerCase().includes('find') ||
                                  intent.toLowerCase().includes('search') ||
                                  intent.toLowerCase().includes('get');
          if (isSearchOperation) {
            console.log(`[McpExecutor] Using default "all" for board search parameter`);
            return 'all';
          }
        }
      }

      // Query/Search parameter inference
      if (paramLower.includes('query') || paramLower.includes('search') || parameterName === 'q') {
        // Extract search terms from intent
        const searchPatterns = [
          /(?:find|search for|looking for|get|show)\s+["']?([^"']+)["']?/i,
          /["']([^"']+)["']\s+(?:card|ticket|item|task)/i,
          /(?:card|ticket|item|task)\s+["']?([^"']+)["']?/i
        ];

        for (const pattern of searchPatterns) {
          const match = intent.match(pattern);
          if (match && match[1]) {
            console.log(`[McpExecutor] Inferred query parameter: "${match[1]}"`);
            return match[1].trim();
          }
        }

        // Fallback: use the entire intent as the query
        console.log(`[McpExecutor] Using full intent as query parameter`);
        return intent;
      }

      // Subject parameter for emails
      if (paramLower.includes('subject')) {
        const subjectMatch = intent.match(/(?:subject|title)\s*["']([^"']+)["']/i);
        if (subjectMatch) {
          console.log(`[McpExecutor] Inferred subject parameter: "${subjectMatch[1]}"`);
          return subjectMatch[1];
        }
      }

      // To/Recipient parameter for emails
      if (paramLower.includes('to') || paramLower.includes('recipient')) {
        const emailMatch = intent.match(/(?:to|send to)\s+([^\s,]+@[^\s,]+)/i);
        if (emailMatch) {
          console.log(`[McpExecutor] Inferred recipient parameter: "${emailMatch[1]}"`);
          return emailMatch[1];
        }
      }

      // Date parameter inference
      if (paramLower.includes('date') || paramLower.includes('when')) {
        const datePatterns = [
          /\b(today|tomorrow|yesterday)\b/i,
          /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/,
          /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
          /\b(next week|this week|last week)\b/i
        ];

        for (const pattern of datePatterns) {
          const match = intent.match(pattern);
          if (match && match[1]) {
            console.log(`[McpExecutor] Inferred date parameter: "${match[1]}"`);
            return match[1];
          }
        }
      }

      // Limit/Count parameter inference
      if (paramLower.includes('limit') || paramLower.includes('count') || paramLower.includes('max')) {
        const limitMatch = intent.match(/(?:first|last|top|show|limit|max)\s+(\d+)/i);
        if (limitMatch) {
          console.log(`[McpExecutor] Inferred limit parameter: ${limitMatch[1]}`);
          return parseInt(limitMatch[1]);
        }
      }

      console.log(`[McpExecutor] Could not infer parameter "${parameterName}" from intent`);
      return null;

    } catch (error) {
      console.error(`[McpExecutor] Error inferring parameter "${parameterName}":`, error);
      return null;
    }
  }

  /**
   * UNIVERSAL: Build schema-aware parameters - only include parameters that exist in tool schema
   */
  private buildSchemaAwareParameters(toolName: string, inputParams: Record<string, any>, toolSchema: any): Record<string, any> {
    console.log(`[McpExecutor] 🔍 Building schema-aware parameters for ${toolName}`);

    const schemaAwareParams: Record<string, any> = {};

    if (!toolSchema || !toolSchema.inputSchema || !toolSchema.inputSchema.properties) {
      console.log(`[McpExecutor] ⚠️  No input schema properties found for ${toolName}, copying all parameters`);
      return { ...inputParams };
    }

    const schemaProperties = toolSchema.inputSchema.properties;
    console.log(`[McpExecutor] 📋 Schema properties for ${toolName}:`, Object.keys(schemaProperties));

    // Only include parameters that exist in the schema
    for (const [paramName, paramValue] of Object.entries(inputParams)) {
      if (paramName in schemaProperties) {
        schemaAwareParams[paramName] = paramValue;
        console.log(`[McpExecutor] ✅ Included schema-valid parameter: ${paramName}`);
      } else {
        console.log(`[McpExecutor] ❌ Filtered out invalid parameter: ${paramName} (not in schema)`);
      }
    }

    return schemaAwareParams;
  }

  /**
   * UNIVERSAL: Extract required parameters from tool schema
   */
  private extractRequiredParametersFromSchema(toolSchema: any): string[] {
    if (!toolSchema || !toolSchema.inputSchema) {
      console.log(`[McpExecutor] ⚠️  No input schema available, no required parameters`);
      return [];
    }

    const required = toolSchema.inputSchema.required || [];
    console.log(`[McpExecutor] 📝 Found ${required.length} required parameters:`, required);
    return required;
  }

  /**
   * UNIVERSAL: Apply smart type coercion based on schema types
   */
  private applySchemaBasedTypeCoercion(params: Record<string, any>, toolSchema: any): Record<string, any> {
    console.log(`[McpExecutor] 🔄 Applying schema-based type coercion`);

    if (!toolSchema || !toolSchema.inputSchema || !toolSchema.inputSchema.properties) {
      return params;
    }

    const coercedParams = { ...params };
    const schemaProperties = toolSchema.inputSchema.properties;

    for (const [paramName, paramValue] of Object.entries(params)) {
      const schemaProperty = schemaProperties[paramName];
      if (!schemaProperty) continue;

      const expectedType = schemaProperty.type;
      const currentValue = paramValue;

      try {
        switch (expectedType) {
          case 'boolean':
            if (typeof currentValue === 'string') {
              if (currentValue.toLowerCase() === 'true' || currentValue === '1') {
                coercedParams[paramName] = true;
                console.log(`[McpExecutor] 🔄 Coerced ${paramName}: "${currentValue}" -> true`);
              } else if (currentValue.toLowerCase() === 'false' || currentValue === '0') {
                coercedParams[paramName] = false;
                console.log(`[McpExecutor] 🔄 Coerced ${paramName}: "${currentValue}" -> false`);
              }
            }
            break;

          case 'integer':
          case 'number':
            if (typeof currentValue === 'string' && !isNaN(Number(currentValue))) {
              const numValue = expectedType === 'integer' ? parseInt(currentValue) : parseFloat(currentValue);
              coercedParams[paramName] = numValue;
              console.log(`[McpExecutor] 🔄 Coerced ${paramName}: "${currentValue}" -> ${numValue}`);
            }
            break;

          case 'string':
            if (Array.isArray(currentValue)) {
              // Convert arrays to comma-separated strings
              coercedParams[paramName] = currentValue.join(', ');
              console.log(`[McpExecutor] 🔄 Coerced ${paramName}: array -> "${coercedParams[paramName]}"`);
            } else if (typeof currentValue !== 'string') {
              // Convert other types to string
              coercedParams[paramName] = String(currentValue);
              console.log(`[McpExecutor] 🔄 Coerced ${paramName}: ${typeof currentValue} -> "${coercedParams[paramName]}"`);
            }
            break;

          case 'array':
            if (typeof currentValue === 'string' && currentValue.includes(',')) {
              // Convert comma-separated strings to arrays
              coercedParams[paramName] = currentValue.split(',').map(item => item.trim());
              console.log(`[McpExecutor] 🔄 Coerced ${paramName}: "${currentValue}" -> array`);
            }
            break;
        }
      } catch (error) {
        console.warn(`[McpExecutor] ⚠️  Failed to coerce ${paramName}:`, error);
        // Keep original value if coercion fails
      }
    }

    return coercedParams;
  }

  /**
   * UNIVERSAL: Apply universal parameter enhancements that work for all tools
   */
  private applyUniversalParameterEnhancements(params: Record<string, any>, toolName: string, intent: string, originalParams: Record<string, any>): Record<string, any> {
    console.log(`[McpExecutor] 🚀 Applying universal parameter enhancements for ${toolName}`);

    const enhancedParams = { ...params };

    // UNIVERSAL ENHANCEMENT 1: Always ensure instructions parameter
    if (!enhancedParams.instructions) {
      enhancedParams.instructions = this.generateInstructionsFromIntent(toolName, intent, originalParams);
      console.log(`[McpExecutor] 📝 Added instructions parameter`);
    }

    // UNIVERSAL ENHANCEMENT 2: Apply limit parameters for any tool that might need them
    const requestedLimit = this.extractRequestedLimit(intent, originalParams);
    if (requestedLimit && !this.hasAnyLimitParameter(enhancedParams)) {
      // Add multiple limit parameter variations - tools use different names
      const limitVariations = ['limit', 'max_results', 'count', 'maxResults', 'size'];

      // Only add if none of these exist and they're not filtered out by schema
      for (const limitParam of limitVariations) {
        if (!(limitParam in enhancedParams)) {
          enhancedParams[limitParam] = requestedLimit;
        }
      }
      console.log(`[McpExecutor] 📊 Added limit parameter variations: ${requestedLimit}`);
    }

    // UNIVERSAL ENHANCEMENT 3: Apply semantic defaults based on tool type
    this.applySemanticDefaults(enhancedParams, toolName, intent);

    return enhancedParams;
  }

  /**
   * Check if parameters already contain any limit-related parameter
   */
  private hasAnyLimitParameter(params: Record<string, any>): boolean {
    const limitParams = ['limit', 'max_results', 'count', 'maxResults', 'size', 'per_page', 'page_size'];
    return limitParams.some(param => param in params);
  }

  /**
   * Apply semantic defaults based on tool type and intent
   */
  private applySemanticDefaults(params: Record<string, any>, toolName: string, intent: string): void {
    const toolNameLower = toolName.toLowerCase();
    const intentLower = intent.toLowerCase();

    // For search/find operations, apply smart defaults
    if (intentLower.includes('find') || intentLower.includes('search') || intentLower.includes('get')) {

      // For Trello and similar project tools
      if (toolNameLower.includes('trello') || toolNameLower.includes('board')) {
        if (!params.board && !params.board_id) {
          // Default to searching all accessible boards for find operations
          params.board = 'all';
          console.log(`[McpExecutor] 🎯 Applied semantic default: board = "all" for search operation`);
        }
      }

      // For email tools, apply common search defaults
      if (toolNameLower.includes('gmail') || toolNameLower.includes('email')) {
        if (!params.maxResults && !params.limit) {
          params.maxResults = 10; // Reasonable default for email searches
          console.log(`[McpExecutor] 📧 Applied semantic default: maxResults = 10 for email search`);
        }
      }
    }
  }

  /**
   * Generate instructions parameter from user intent and tool context
   */
  private generateInstructionsFromIntent(toolName: string, intent: string, params: Record<string, any>): string {
    const toolNameLower = toolName.toLowerCase();

    // Email tools
    if (toolNameLower.includes('gmail_send_email')) {
      if (params.to) {
        return `Send an email to ${params.to}${params.subject ? ` with subject "${params.subject}"` : ''}${params.body ? ` saying: "${params.body}"` : ''}. Original request: "${intent}"`;
      }
      return `Send an email as requested: "${intent}"`;
    }

    if (toolNameLower.includes('gmail_find_email') || toolNameLower.includes('gmail_search')) {
      return `Find emails in Gmail. Original request: "${intent}"`;
    }

    if (toolNameLower.includes('gmail_reply_to_email')) {
      return `Reply to an email as requested: "${intent}"`;
    }

    // Calendar tools
    if (toolNameLower.includes('google_calendar_quick_add_event')) {
      if (params.text) {
        return `Create a calendar event from the text: "${params.text}". Original request: "${intent}"`;
      }
      return `Create a calendar event as requested: "${intent}"`;
    }

    if (toolNameLower.includes('google_calendar_find_events')) {
      return `Find calendar events as requested: "${intent}"`;
    }

    if (toolNameLower.includes('google_calendar_update_event')) {
      return `Update calendar event as requested: "${intent}"`;
    }

    // Slack tools
    if (toolNameLower.includes('slack')) {
      return `Perform Slack operation as requested: "${intent}"`;
    }

    // Generic fallback
    return `Execute the requested operation: "${intent}"`;
  }

  /**
   * Detect definitively simple queries that should bypass AI complexity analysis
   */
  private isDefinitelySimpleQuery(query: string): boolean {
    const simplePatterns = [
      // Simple email queries
      /^(?:get|fetch|find|show|retrieve)\s+\d*\s*emails?$/i,
      /^(?:get|fetch|find|show|retrieve)\s+(?:latest|recent|new)\s+emails?$/i,
      /^(?:get|fetch|find|show|retrieve)\s+(?:my\s+)?emails?$/i,
      /^(?:list|show)\s+(?:my\s+)?emails?$/i,

      // Simple file queries
      /^(?:list|show)\s+files?$/i,
      /^(?:get|find)\s+file\s+\w+$/i,

      // Simple calendar queries
      /^(?:check|show)\s+(?:my\s+)?calendar$/i,
      /^(?:what|show)\s+(?:meetings?|events?)$/i,

      // Simple status queries
      /^(?:status|health)\s+check$/i,
      /^(?:list|show)\s+(?:tools?|servers?)$/i
    ];

    return simplePatterns.some(pattern => pattern.test(query.trim()));
  }

  /**
   * Convert between different ExecutionPlan interface formats
   */
  private convertToWorkflowPlan(plan: any): import('./McpWorkflowPlanner').ExecutionPlan {
    // If it already has executionSteps, return as-is
    if (plan.executionSteps) {
      return plan as import('./McpWorkflowPlanner').ExecutionPlan;
    }

    // Convert from AI-enhanced format (steps[]) to workflow format (executionSteps[])
    return {
      workflowId: plan.planId || `workflow_${Date.now()}`,
      originalQuery: plan.originalQuery || '',
      executionSteps: plan.steps || [],
      estimatedDuration: plan.estimatedDuration || 5000,
      requiresUserInput: false,
      riskLevel: plan.riskLevel || 'low'
    } as import('./McpWorkflowPlanner').ExecutionPlan;
  }

  private recordPerformanceMetric(queryType: string, executionTime: number): void {
    if (!this.performanceMetrics.has(queryType)) {
      this.performanceMetrics.set(queryType, []);
    }

    const metrics = this.performanceMetrics.get(queryType)!;
    metrics.push(executionTime);

    // Keep only last 100 measurements per query type
    if (metrics.length > 100) {
      metrics.shift();
    }

    console.log(`[McpExecutor] Recorded performance: ${queryType} took ${executionTime}ms`);
  }

  /**
   * Get performance statistics for query types
   */
  getPerformanceStats(): Map<string, { average: number; min: number; max: number; count: number }> {
    const stats = new Map();

    for (const [queryType, metrics] of this.performanceMetrics) {
      if (metrics.length > 0) {
        const average = metrics.reduce((sum, time) => sum + time, 0) / metrics.length;
        const min = Math.min(...metrics);
        const max = Math.max(...metrics);

        stats.set(queryType, {
          average: Math.round(average),
          min: min,
          max: max,
          count: metrics.length
        });
      }
    }

    return stats;
  }

  /**
   * Start periodic performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Log performance stats every 5 minutes
    setInterval(() => {
      const stats = this.getPerformanceStats();
      if (stats.size > 0) {
        console.log('[McpExecutor] Performance Statistics:');
        for (const [queryType, stat] of stats) {
          console.log(`  ${queryType}: avg=${stat.average}ms, min=${stat.min}ms, max=${stat.max}ms, count=${stat.count}`);
        }
      }
    }, 300000); // 5 minutes
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; hitRate: number; totalQueries: number } {
    // This is a simplified version - in production you'd track hits/misses more precisely
    return {
      size: this.queryCache.size,
      hitRate: 0, // Would need to track this separately
      totalQueries: this.queryCache.size
    };
  }

  /**
   * Get MCP server statistics
   */
  getServerStats(): Map<string, any> {
    return this.errorHandler.getAllServerStats();
  }

  /**
   * Get circuit breaker status for debugging
   */
  getCircuitBreakerStatus(): Map<string, any> {
    return this.errorHandler.getCircuitBreakerStatus();
  }

  // AI-Enhanced Execution Methods (Week 8)

  /**
   * Execute optimized conditional workflow using AI analysis
   */
  private async executeOptimizedConditionalWorkflow(
    analysis: any,
    optimization: any,
    startTime: number
  ): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Executing AI-optimized conditional workflow');

    try {
      // Use the optimized execution plan
      const conditionalWorkflow = this.workflowOrchestrator.parseConditionalQuery(analysis.originalQuery);
      const workflowResult = await this.workflowOrchestrator.executeConditionalWorkflow(conditionalWorkflow);

      // Record optimization performance
      const executionTime = Date.now() - startTime;
      await this.workflowOptimizer.recordOptimizationPerformance(
        optimization,
        {
          executionTime,
          successRate: workflowResult.status === 'completed' ? 1 : 0,
          resourceUsage: 0.5, // Simplified
          userSatisfaction: 0.8, // Simplified
          errorRate: workflowResult.status === 'completed' ? 0 : 1,
          cachePerfectRate: 0.7 // Simplified
        }
      );

      const result: McpExecutionResult = {
        success: workflowResult.status === 'completed',
        data: workflowResult,
        toolName: 'AI-Enhanced-ConditionalWorkflow',
        error: workflowResult.error || undefined,
        executionTime: executionTime
      };

      // Cache successful results
      if (result.success) {
        const cacheKey = this.generateCacheKey(analysis.originalQuery);
        this.addToCache(cacheKey, [result], analysis.originalQuery);
      }

      return [result];

    } catch (error) {
      console.error('[McpExecutor] AI-optimized conditional workflow failed:', error);

      // Attempt self-healing
      const healingResult = await this.selfHealingSystem.healWorkflow(
        analysis,
        error as Error,
        { optimization, executionType: 'conditional' }
      );

      if (healingResult.recovered) {
        return [healingResult.result];
      }

      // Return error result
      return [{
        success: false,
        data: null,
        toolName: 'AI-Enhanced-ConditionalWorkflow',
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      }];
    }
  }

  /**
   * Execute optimized multi-step workflow using AI analysis
   */
  private async executeOptimizedWorkflowQuery(
    analysis: any,
    optimization: any,
    startTime: number
  ): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Executing AI-optimized multi-step workflow');

    try {
      // Use AI-enhanced workflow execution
      const workflow = this.queryParser.parseQuery(analysis.originalQuery);
      const plan = await this.workflowPlanner.createExecutionPlan(workflow);

      // Apply optimization to the plan
      const optimizedPlan = optimization.optimizedPlan;
      const context = { query: analysis.originalQuery, optimization };
      const results = await this.executeWorkflowSteps(optimizedPlan, context);

      // Record optimization performance
      const executionTime = Date.now() - startTime;
      await this.workflowOptimizer.recordOptimizationPerformance(
        optimization,
        {
          executionTime,
          successRate: results.some(r => r.success) ? 1 : 0,
          resourceUsage: 0.6, // Simplified
          userSatisfaction: 0.8, // Simplified
          errorRate: results.some(r => !r.success) ? 0.2 : 0,
          cachePerfectRate: 0.8 // Simplified
        }
      );

      return results;

    } catch (error) {
      console.error('[McpExecutor] AI-optimized workflow failed:', error);

      // Attempt self-healing
      const healingResult = await this.selfHealingSystem.healWorkflow(
        analysis,
        error as Error,
        { optimization, executionType: 'multi-step' }
      );

      if (healingResult.recovered) {
        return [healingResult.result];
      }

      // Fall back to traditional execution
      return await this.executeWorkflowQuery(analysis.originalQuery, startTime);
    }
  }

  /**
   * Execute optimized simple query using AI analysis
   */
  private async executeOptimizedSimpleQuery(
    analysis: any,
    optimization: any,
    startTime: number
  ): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Executing AI-optimized simple query');

    try {
      // Use AI-recommended tools with fallback to traditional routing
      const bestTool = analysis.recommendedTools?.[0];
      if (!bestTool) {
        console.log('[McpExecutor] No AI recommendations, falling back to traditional tool routing');
        return await this.executeFallbackQuery(analysis.originalQuery, startTime);
      }

      // Execute with optimized parameters
      const toolMatch: ToolMatch = {
        toolName: bestTool.tool.toolName,
        score: bestTool.confidence,
        description: bestTool.reasoning
      };

      const queryType = this.analyzeQueryType(analysis.originalQuery);
      const result = await this.executeSingleToolWithType(toolMatch, analysis.originalQuery, queryType);

      // Record optimization performance
      const executionTime = Date.now() - startTime;
      await this.workflowOptimizer.recordOptimizationPerformance(
        optimization,
        {
          executionTime,
          successRate: result.success ? 1 : 0,
          resourceUsage: 0.3, // Simple queries use fewer resources
          userSatisfaction: 0.9, // Simple queries typically have high satisfaction
          errorRate: result.success ? 0 : 1,
          cachePerfectRate: 0.9 // Simple queries cache well
        }
      );

      // Learn from the execution
      await this.intelligentParser.learnFromExecution(analysis, {
        success: result.success,
        actualDuration: executionTime / 1000,
        userFeedback: result.success ? 'successful execution' : 'execution failed'
      });

      return [result];

    } catch (error) {
      console.error('[McpExecutor] AI-optimized simple query failed:', error);

      // Attempt self-healing
      const healingResult = await this.selfHealingSystem.healWorkflow(
        analysis,
        error as Error,
        { optimization, executionType: 'simple' }
      );

      if (healingResult.recovered) {
        return [healingResult.result];
      }

      // Fall back to traditional execution
      const results: McpExecutionResult[] = [];
      const router = new McpRouter(this.mcpManager);
      const matches = await router.routeQuery(analysis.originalQuery, 1);

      if (matches.length > 0) {
        const queryType = this.analyzeQueryType(analysis.originalQuery);
        const result = await this.executeSingleToolWithType(matches[0], analysis.originalQuery, queryType);
        results.push(result);
      }

      return results;
    }
  }

  /**
   * Get AI system statistics
   */
  getAISystemStats(): {
    intelligentParser: any;
    workflowOptimizer: any;
    selfHealingSystem: any;
  } {
    return {
      intelligentParser: this.intelligentParser.getIntelligenceStats(),
      workflowOptimizer: this.workflowOptimizer.getOptimizationStats(),
      selfHealingSystem: this.selfHealingSystem.getSystemState()
    };
  }

  /**
   * Get universal tool resolution statistics for monitoring
   */
  getToolResolutionStats(): {
    systemType: string;
    availableStrategies: string[];
  } {
    return {
      systemType: 'Universal MCP - No hardcoded tool mappings',
      availableStrategies: ['semantic', 'keyword', 'fuzzy'] // Removed 'preference'
    };
  }

  /**
   * Test the hybrid resolution system with a specific tool name
   * Useful for debugging and monitoring
   */
  async testToolResolution(toolName: string): Promise<{
    originalTool: string;
    semantic: { toolName: string; confidence: number };
    keyword: { toolName: string; confidence: number };
    fuzzy: { toolName: string; confidence: number };
    // REMOVED: preference - Universal system uses no hardcoded tool mappings
    finalResolution: {
      toolName: string;
      confidence: number;
      matchType: string;
      alternatives?: string[];
    };
  }> {
    console.log(`[McpExecutor] Testing hybrid resolution for: ${toolName}`);

    // Test all strategies individually
    const semanticResult = await this.performSemanticMatching(toolName);
    const keywordResult = await this.performKeywordMatching(toolName);
    const fuzzyResult = await this.performFuzzyMatching(toolName);
    // REMOVED: Preference matching - Universal system uses no hardcoded tool mappings
    const finalResult = await this.resolveFullToolName(toolName);

    return {
      originalTool: toolName,
      semantic: {
        toolName: semanticResult.toolName || 'none',
        confidence: semanticResult.confidence
      },
      keyword: {
        toolName: keywordResult.toolName || 'none',
        confidence: keywordResult.confidence
      },
      fuzzy: {
        toolName: fuzzyResult.toolName || 'none',
        confidence: fuzzyResult.confidence
      },
      // REMOVED: Preference results - Universal system uses no hardcoded tool mappings
      finalResolution: {
        toolName: finalResult.toolName,
        confidence: finalResult.confidence,
        matchType: finalResult.matchType,
        alternatives: finalResult.alternatives
      }
    };
  }

  /**
   * Clear corrupted MCP tool preferences from localStorage
   * Universal MCP system should not store any tool mappings
   */
  clearCorruptedPreferences(): void {
    try {
      const existingPrefs = localStorage.getItem('mcp_tool_preferences');
      if (existingPrefs) {
        console.log('🧹 [McpExecutor] Clearing corrupted MCP preferences:', existingPrefs.substring(0, 200) + '...');
        localStorage.removeItem('mcp_tool_preferences');
        console.log('✅ [McpExecutor] Successfully cleared corrupted MCP tool preferences - Universal system uses no hardcoded mappings');
      } else {
        console.log('✅ [McpExecutor] No corrupted preferences found - system is clean');
      }
    } catch (error) {
      console.warn('⚠️ [McpExecutor] Failed to clear corrupted preferences:', error);
    }
  }

  /**
   * Initialize universal MCP executor - clear any corrupted preferences on startup
   */
  initializeUniversalSystem(): void {
    console.log('🚀 [McpExecutor] Initializing Universal MCP System - No hardcoded tool mappings');
    this.clearCorruptedPreferences();
  }

  /**
   * Get comprehensive system diagnostics
   */
  async getSystemDiagnostics(): Promise<{
    toolResolution: any;
    performance: any;
    cacheStats: any;
    serverStats: any;
    aiStats: any;
    availableTools: string[];
  }> {
    const allTools = await this.mcpManager.listAllTools();

    return {
      toolResolution: this.getToolResolutionStats(),
      performance: Object.fromEntries(this.getPerformanceStats()),
      cacheStats: this.getCacheStats(),
      serverStats: Object.fromEntries(this.getServerStats()),
      aiStats: this.getAISystemStats(),
      availableTools: allTools
    };
  }
}