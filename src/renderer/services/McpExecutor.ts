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
 * Enhanced MCP tool executor for Phase 2 multi-tool orchestration.
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

    this.startPerformanceMonitoring();
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
      const availableTools = this.toolDiscoveryService.getAllToolsForClaudeAPI();
      console.log('[McpExecutor] Dynamic tool discovery complete:', {
        totalTools: toolRegistry.totalTools,
        categories: Array.from(toolRegistry.categories.keys()),
        servers: availableTools.map(t => t.serverName).filter((v, i, a) => a.indexOf(v) === i)
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
      // Phase 3 Week 8: Use AI-enhanced query understanding
      const intelligentAnalysis = await this.intelligentParser.analyzeQuery(query);
      console.log('[McpExecutor] AI analysis completed, confidence:', intelligentAnalysis.intent.confidence);

      // Phase 3 Week 8: Optimize workflow based on AI analysis
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

    // Phase 2 Week 6: Check if this is a conditional workflow query
    const isConditional = this.detectConditionalQuery(query);
    console.log('[McpExecutor] Conditional query detected:', isConditional);

    if (isConditional) {
      return await this.executeConditionalWorkflow(query, startTime);
    }

    // Phase 2 Week 4: Check if this is a complex multi-tool query
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

      if (toolName.includes('gmail_find_email')) {
        result = await this.executeGmailFind(query);
      } else if (toolName.includes('gmail_send_email')) {
        result = await this.executeGmailSend(query);
      } else if (toolName.includes('gmail_reply_to_email')) {
        result = await this.executeGmailReply(query);
      } else {
        // Generic MCP tool execution
        result = await this.executeGenericTool(toolName, query);
      }

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
      switch (queryType) {
        case 'email':
          result = await this.executeEmailTool(toolName, query);
          break;
        case 'file':
          result = await this.executeFileTool(toolName, query);
          break;
        case 'slack':
          result = await this.executeSlackTool(toolName, query);
          break;
        case 'web':
          result = await this.executeWebTool(toolName, query);
          break;
        case 'calendar':
          result = await this.executeCalendarTool(toolName, query);
          break;
        default:
          // Generic tool execution for unrecognized types
          result = await this.executeGenericTool(toolName, query);
          break;
      }

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

  private async executeGmailFind(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Gmail find for query:', query);

    // Parse Gmail-specific requirements from query
    const params = this.parseGmailQuery(query);
    console.log('[McpExecutor] Parsed Gmail params:', params);

    // Generate natural language instructions for Gmail tool
    let instructions = `Find emails from Gmail`;

    // Add limit information
    if (params.limit && params.limit !== 10) {
      instructions = `Find the first ${params.limit} emails from Gmail`;
    }

    // Add search criteria to instructions
    if (query.includes('recent') || query.includes('latest')) {
      instructions += ' (most recent first)';
    }
    if (query.includes('unread')) {
      instructions += ' that are unread';
    }
    if (query.includes('from')) {
      const fromMatch = query.match(/from\s+([^\s]+)/i);
      if (fromMatch) instructions += ` from ${fromMatch[1]}`;
    }
    if (query.includes('subject')) {
      const subjectMatch = query.match(/subject[:\s]+([^,]+)/i);
      if (subjectMatch) instructions += ` with subject containing "${subjectMatch[1].trim()}"`;
    }

    // Add query context to instructions
    instructions += `. Original request: "${query}". Include email content/body in the results.`;

    // Use Gmail search query syntax
    const searchQuery = params.searchQuery.trim() || 'in:inbox';

    const toolParams = {
      instructions: instructions,
      query: searchQuery
    };

    console.log('[McpExecutor] Calling gmail_find_email with params:', toolParams);

    try {
      const result = await this.mcpManager.callTool('zap2.gmail_find_email', toolParams);
      console.log('[McpExecutor] Gmail find successful, result type:', typeof result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[McpExecutor] Gmail find failed:', errorMessage);
      throw error;
    }
  }

  private async executeGmailSend(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Gmail send for query:', query);

    // Extract email details from query
    const emailDetails = this.parseEmailSendQuery(query);

    // Generate instructions for Gmail send
    const instructions = `Send email as requested: "${query}". ${emailDetails.to ? `Send to: ${emailDetails.to}` : 'Recipient needs to be specified'}`;

    const toolParams: any = {
      instructions: instructions
    };

    // Add other parameters if available
    if (emailDetails.to) toolParams.to = emailDetails.to;
    if (emailDetails.subject) toolParams.subject = emailDetails.subject;
    if (emailDetails.body) toolParams.body = emailDetails.body;

    console.log('[McpExecutor] Calling gmail_send_email with params:', toolParams);

    return await this.mcpManager.callTool('zap2.gmail_send_email', toolParams);
  }

  private async executeGmailReply(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Gmail reply for query:', query);

    // Extract reply details from query
    const replyDetails = this.parseEmailReplyQuery(query);

    // Generate instructions for Gmail reply
    const instructions = `Reply to email as requested: "${query}". Reply message: ${replyDetails.body}`;

    const toolParams: any = {
      instructions: instructions
    };

    // Add other parameters if available
    if (replyDetails.messageId && replyDetails.messageId !== 'latest') {
      toolParams.thread_id = replyDetails.messageId;
    }
    if (replyDetails.body) toolParams.body = replyDetails.body;

    console.log('[McpExecutor] Calling gmail_reply_to_email with params:', toolParams);

    return await this.mcpManager.callTool('zap2.gmail_reply_to_email', toolParams);
  }

  private async executeGenericTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing generic tool ${toolName} for query:`, query);

    // Generic tool execution with basic parameters
    return await this.mcpManager.callTool(toolName, {
      query: query,
      limit: this.extractNumberFromQuery(query) || 10
    });
  }

  private parseGmailQuery(query: string): { searchQuery: string; limit: number } {
    let limit = 10; // default
    let searchQuery = '';

    console.log('[DEBUG] parseGmailQuery input:', query);

    // Extract number from query (e.g., "first 3 emails" -> 3)
    const numberMatch = query.match(/(\d+)/);
    if (numberMatch) {
      limit = parseInt(numberMatch[1]);
      console.log('[DEBUG] Extracted limit:', limit);
    }

    // Extract search terms
    if (query.includes('from')) {
      const fromMatch = query.match(/from\s+([^\s]+)/i);
      if (fromMatch) {
        searchQuery += `from:${fromMatch[1]} `;
      }
    }

    if (query.includes('subject')) {
      const subjectMatch = query.match(/subject[:\s]+([^,]+)/i);
      if (subjectMatch) {
        searchQuery += `subject:"${subjectMatch[1].trim()}" `;
      }
    }

    // Handle temporal queries (removed 'first' as it's too generic)
    if (query.includes('recent') || query.includes('latest')) {
      searchQuery += 'newer_than:7d ';
      console.log('[DEBUG] Added temporal filter: newer_than:7d');
    }

    if (query.includes('today')) {
      searchQuery += 'newer_than:1d ';
    }

    if (query.includes('unread')) {
      searchQuery += 'is:unread ';
    }

    // Default search if nothing specific
    if (!searchQuery.trim()) {
      searchQuery = 'in:inbox';
      console.log('[DEBUG] Applied default search query: in:inbox');
    }

    const result = {
      searchQuery: searchQuery.trim(),
      limit: Math.min(limit, 20) // Cap at 20 emails max
    };

    console.log('[DEBUG] parseGmailQuery result:', result);
    return result;
  }

  private parseEmailSendQuery(query: string): { to: string; subject: string; body: string } {
    console.log('[DEBUG] parseEmailSendQuery input:', query);

    // First check for "send [message] to [email]" pattern
    const sendMessageToPattern = query.match(/^send\s+(.+?)\s+to\s+([^\s@]+@[^\s]+)/i);

    if (sendMessageToPattern) {
      const message = sendMessageToPattern[1].trim();
      const email = sendMessageToPattern[2].trim();

      const result = {
        to: email,
        subject: 'Message from Browzer',
        body: message
      };

      console.log('[DEBUG] parseEmailSendQuery result (send-message-to pattern):', result);
      return result;
    }

    // Extract recipient - improved patterns
    const toMatch = query.match(/(?:send|email)\s+(?:to\s+)?([^\s@]+@[^\s]+)/i) ||
                   query.match(/to\s+([^\s@]+@[^\s]+)/i) ||
                   query.match(/([^\s@]+@[^\s]+)/i);

    const recipientEmail = toMatch?.[1] || '';

    // Extract subject - look for explicit "subject:" or infer from "about"
    let subject = '';
    const subjectMatch = query.match(/(?:subject|title)[:\s]+([^,\n]+)/i);
    const aboutMatch = query.match(/about\s+(.+?)(?:\s+saying|\s+with\s+message|\s*$)/i);

    if (subjectMatch) {
      subject = subjectMatch[1].trim();
    } else if (aboutMatch) {
      subject = aboutMatch[1].trim();
    } else {
      subject = 'Message from Browzer';
    }

    // Extract body/message - improved patterns
    let body = '';
    const sayingMatch = query.match(/saying\s+(.+)$/i);
    const messageMatch = query.match(/(?:with\s+message|message)[:\s]+(.+)$/i);
    const bodyMatch = query.match(/(?:body)[:\s]+(.+)$/i);

    if (sayingMatch) {
      body = sayingMatch[1].trim();
    } else if (messageMatch) {
      body = messageMatch[1].trim();
    } else if (bodyMatch) {
      body = bodyMatch[1].trim();
    } else {
      // For "about X" queries, use the subject as body if no explicit body found
      if (aboutMatch) {
        body = aboutMatch[1].trim();
      } else {
        // Last resort - extract everything after email address
        const afterEmailMatch = query.match(new RegExp(`${recipientEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.+)$`, 'i'));
        body = afterEmailMatch?.[1]?.trim() || 'Hello!';
      }
    }

    const result = {
      to: recipientEmail,
      subject: subject,
      body: body
    };

    console.log('[DEBUG] parseEmailSendQuery result:', result);
    return result;
  }

  private parseEmailReplyQuery(query: string): { messageId: string; body: string } {
    // Extract message ID if provided
    const messageIdMatch = query.match(/message[:\s]+([^\s]+)/i);

    // Extract reply body
    const bodyMatch = query.match(/(?:reply|saying|message)[:\s]+(.+)/i);

    return {
      messageId: messageIdMatch?.[1] || 'latest', // Default to latest email
      body: bodyMatch?.[1]?.trim() || 'Reply from Browzer'
    };
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
   * Phase 2 Week 6: Detect if query requires conditional workflow execution
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
   * Phase 2 Week 6: Execute conditional workflow
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
   * Phase 2 Week 4: Enhanced complex query detection
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
   * Phase 2 Week 4: Execute complex multi-tool workflows
   */
  async executeComplexQuery(query: string): Promise<McpExecutionResult[]> {
    console.log('[McpExecutor] Complex query detected, executing workflow:', query);
    return await this.executeWorkflowQuery(query, Date.now());
  }

  /**
   * Phase 2 Week 4: Execute multi-tool workflow queries
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
   * Phase 2 Week 4: Execute individual workflow steps
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
   * Phase 2 Week 5: Build context-aware query for workflow steps
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
   * Execute email-related tools (Gmail, Outlook, etc.)
   */
  private async executeEmailTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing email tool: ${toolName} with query: ${query}`);

    if (toolName.includes('gmail_find_email')) {
      return await this.executeGmailFind(query);
    } else if (toolName.includes('gmail_send_email')) {
      return await this.executeGmailSend(query);
    } else if (toolName.includes('gmail_reply_to_email')) {
      return await this.executeGmailReply(query);
    } else {
      // Generic email tool execution with instructions
      const instructions = this.generateEmailInstructions(toolName, query);
      return await this.mcpManager.callTool(toolName, {
        instructions: instructions,
        query: query
      });
    }
  }

  /**
   * Generate instructions for email tools
   */
  private generateEmailInstructions(toolName: string, query: string): string {
    const queryLower = query.toLowerCase();

    if (toolName.includes('find') || toolName.includes('gmail_find_email')) {
      if (queryLower.includes('latest') || queryLower.includes('recent')) {
        return `Find the most recent email from Gmail inbox. ${query}`;
      } else if (queryLower.includes('unread')) {
        return `Find unread emails from Gmail. ${query}`;
      } else {
        return `Search Gmail for emails matching: ${query}`;
      }
    } else if (toolName.includes('send') || toolName.includes('gmail_send_email')) {
      return `Send a new email as requested: ${query}`;
    } else if (toolName.includes('reply') || toolName.includes('gmail_reply_to_email')) {
      return `Reply to an email as requested: ${query}`;
    }

    return `Execute email operation: ${query}`;
  }

  /**
   * Execute file system tools
   */
  private async executeFileTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing file tool: ${toolName}`);

    // Parse file-specific parameters from query
    const params = this.parseFileQuery(query);
    console.log('[McpExecutor] Parsed file params:', params);

    return await this.mcpManager.callTool(toolName, params);
  }

  /**
   * Execute Slack tools
   */
  private async executeSlackTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing Slack tool: ${toolName}`);

    // Parse Slack-specific parameters from query
    const params = this.parseSlackQuery(query);
    console.log('[McpExecutor] Parsed Slack params:', params);

    return await this.mcpManager.callTool(toolName, params);
  }

  /**
   * Execute web/search tools
   */
  private async executeWebTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing web tool: ${toolName}`);

    // Parse web-specific parameters from query
    const params = this.parseWebQuery(query);
    console.log('[McpExecutor] Parsed web params:', params);

    return await this.mcpManager.callTool(toolName, params);
  }

  /**
   * Execute calendar tools
   */
  private async executeCalendarTool(toolName: string, query: string): Promise<any> {
    console.log(`[McpExecutor] Executing calendar tool: ${toolName} with query: ${query}`);

    if (toolName.includes('google_calendar_find_events')) {
      return await this.executeGoogleCalendarFind(query);
    } else if (toolName.includes('google_calendar_quick_add_event')) {
      return await this.executeGoogleCalendarQuickAdd(query);
    } else if (toolName.includes('google_calendar_update_event')) {
      return await this.executeGoogleCalendarUpdate(query);
    } else {
      // Generic calendar tool execution with instructions
      const instructions = this.generateCalendarInstructions(toolName, query);
      const params = this.parseCalendarQuery(query);
      return await this.mcpManager.callTool(toolName, {
        instructions: instructions,
        ...params
      });
    }
  }

  /**
   * Execute Google Calendar find events
   */
  private async executeGoogleCalendarFind(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Google Calendar find for query:', query);

    const params = this.parseCalendarQuery(query);

    // Generate instructions
    let instructions = `Find events in Google Calendar`;
    if (query.includes('today')) {
      instructions += ' for today';
    } else if (query.includes('tomorrow')) {
      instructions += ' for tomorrow';
    } else if (query.includes('this week')) {
      instructions += ' for this week';
    }
    instructions += `. Original request: "${query}"`;

    const toolParams: any = {
      instructions: instructions
    };

    // Add time parameters based on query
    if (query.includes('today')) {
      toolParams.end_time = 'today at 12:00am';
      toolParams.start_time = 'today at 11:59pm';
    } else if (query.includes('tomorrow')) {
      toolParams.end_time = 'tomorrow at 12:00am';
      toolParams.start_time = 'tomorrow at 11:59pm';
    } else if (query.includes('this week')) {
      toolParams.end_time = 'this week first day at 12:00am';
      toolParams.start_time = 'this week last day at 11:59pm';
    }

    // Add search term if looking for specific events
    if (query.includes('meeting')) {
      toolParams.search_term = 'meeting';
    }

    console.log('[McpExecutor] Calling google_calendar_find_events with params:', toolParams);

    try {
      const result = await this.mcpManager.callTool('zap2.google_calendar_find_events', toolParams);
      console.log('[McpExecutor] Google Calendar find successful');
      return result;
    } catch (error) {
      console.error('[McpExecutor] Google Calendar find failed:', error);
      throw error;
    }
  }

  /**
   * Execute Google Calendar quick add event
   */
  private async executeGoogleCalendarQuickAdd(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Google Calendar quick add for query:', query);

    // Generate instructions
    const instructions = `Create a calendar event based on the request: "${query}". Parse the text to extract date, time, and event details.`;

    const toolParams: any = {
      instructions: instructions,
      text: query
    };

    console.log('[McpExecutor] Calling google_calendar_quick_add_event with params:', toolParams);

    try {
      const result = await this.mcpManager.callTool('zap2.google_calendar_quick_add_event', toolParams);
      console.log('[McpExecutor] Google Calendar quick add successful');
      return result;
    } catch (error) {
      console.error('[McpExecutor] Google Calendar quick add failed:', error);
      throw error;
    }
  }

  /**
   * Execute Google Calendar update event
   */
  private async executeGoogleCalendarUpdate(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Google Calendar update for query:', query);

    const instructions = `Update a calendar event as requested: "${query}"`;

    const toolParams: any = {
      instructions: instructions
    };

    // Extract event details if mentioned in query
    const eventIdMatch = query.match(/event[:\s]+([^\s]+)/i);
    if (eventIdMatch) {
      toolParams.eventid = eventIdMatch[1];
    }

    console.log('[McpExecutor] Calling google_calendar_update_event with params:', toolParams);

    try {
      const result = await this.mcpManager.callTool('zap2.google_calendar_update_event', toolParams);
      console.log('[McpExecutor] Google Calendar update successful');
      return result;
    } catch (error) {
      console.error('[McpExecutor] Google Calendar update failed:', error);
      throw error;
    }
  }

  /**
   * Generate instructions for calendar tools
   */
  private generateCalendarInstructions(toolName: string, query: string): string {
    const queryLower = query.toLowerCase();

    if (toolName.includes('find')) {
      if (queryLower.includes('today')) {
        return `Find calendar events for today. ${query}`;
      } else if (queryLower.includes('meeting')) {
        return `Find meetings in calendar. ${query}`;
      } else {
        return `Search calendar for events matching: ${query}`;
      }
    } else if (toolName.includes('add') || toolName.includes('create')) {
      return `Create a calendar event: ${query}`;
    } else if (toolName.includes('update')) {
      return `Update calendar event: ${query}`;
    }

    return `Execute calendar operation: ${query}`;
  }

  /**
   * Parse file-related queries into parameters
   */
  private parseFileQuery(query: string): any {
    const queryLower = query.toLowerCase();

    // Extract path if mentioned
    const pathMatch = query.match(/(?:path|directory|folder)\s+([^\s]+)/i) ||
                     query.match(/in\s+([^\s]+)/i);

    // Determine operation type
    if (queryLower.includes('list') || queryLower.includes('show')) {
      return {
        operation: 'list',
        path: pathMatch?.[1] || '.',
        query: query
      };
    } else if (queryLower.includes('read') || queryLower.includes('open')) {
      return {
        operation: 'read',
        path: pathMatch?.[1] || query.split(' ').pop(),
        query: query
      };
    } else if (queryLower.includes('write') || queryLower.includes('create')) {
      return {
        operation: 'write',
        path: pathMatch?.[1],
        content: query,
        query: query
      };
    }

    return {
      operation: 'generic',
      query: query,
      path: pathMatch?.[1]
    };
  }

  /**
   * Parse Slack-related queries into parameters
   */
  private parseSlackQuery(query: string): any {
    // Extract channel if mentioned
    const channelMatch = query.match(/(?:channel|to)\s+([#@]?\w+)/i);

    // Extract message content
    const messageMatch = query.match(/(?:saying|message|send)\s+["']?([^"']+)["']?/i) ||
                        query.match(/["']([^"']+)["']/);

    return {
      channel: channelMatch?.[1] || 'general',
      message: messageMatch?.[1] || query,
      query: query
    };
  }

  /**
   * Parse web/search queries into parameters
   */
  private parseWebQuery(query: string): any {
    // Extract search terms
    const searchMatch = query.match(/(?:search|find|lookup)\s+(?:for\s+)?(.+)/i) ||
                       query.match(/(.+)/);

    // Extract URL if mentioned
    const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);

    return {
      query: searchMatch?.[1] || query,
      url: urlMatch?.[1],
      limit: this.extractNumberFromQuery(query) || 10
    };
  }

  /**
   * Parse calendar-related queries into parameters
   */
  private parseCalendarQuery(query: string): any {
    const queryLower = query.toLowerCase();

    // Extract date/time if mentioned
    const dateMatch = query.match(/(?:on|at|for)\s+([^,\n]+)/i);

    // Determine operation type
    if (queryLower.includes('list') || queryLower.includes('show') || queryLower.includes('check')) {
      return {
        operation: 'list',
        date: dateMatch?.[1] || 'today',
        query: query
      };
    } else if (queryLower.includes('create') || queryLower.includes('schedule') || queryLower.includes('book')) {
      return {
        operation: 'create',
        title: query,
        date: dateMatch?.[1],
        query: query
      };
    }

    return {
      operation: 'generic',
      query: query,
      date: dateMatch?.[1]
    };
  }

  /**
   * Phase 2: Caching and Performance Optimization Methods
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
   * Resolve tool name from Claude's recommendation to full MCP registry format
   */
  private async resolveFullToolName(toolName: string): Promise<string> {
    // If already in full format (server.toolName), return as-is
    if (toolName.includes('.')) {
      return toolName;
    }

    try {
      // Get all available tools from MCP registry
      const allTools = await this.mcpManager.listAllTools();
      console.log('[McpExecutor] Available tools for resolution:', allTools);

      // Find the full name that matches our tool name
      const matchingTool = allTools.find((fullName: string) => {
        const shortName = fullName.split('.').pop(); // Get part after the last dot
        return shortName === toolName;
      });

      if (matchingTool) {
        console.log('[McpExecutor] Found matching tool in registry:', matchingTool);
        return matchingTool;
      }
    } catch (error) {
      console.warn('[McpExecutor] Failed to get tools list:', error);
    }

    // Fallback: assume it's from the main server (common case)
    const fallbackName = `zap2.${toolName}`;
    console.warn('[McpExecutor] Tool not found in registry, using fallback:', fallbackName);
    return fallbackName;
  }

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
      // Build parameters for MCP tool using Claude's analysis
      const mcpParameters = this.buildMcpParameters(toolMatch.toolName, claudeParams, intent);
      console.log('[McpExecutor] Built MCP parameters:', mcpParameters);

      // Resolve the tool name to full MCP registry format (server.toolName)
      const fullToolName = await this.resolveFullToolName(toolMatch.toolName);
      console.log('[McpExecutor] Resolved tool name:', toolMatch.toolName, '→', fullToolName);

      // Execute the tool with proper parameters
      const result = await this.mcpManager.callTool(fullToolName, mcpParameters);

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
        stepDescription: `Claude AI recommended: ${toolMatch.description}`
      };

      console.log('[McpExecutor] Claude-enhanced tool execution successful');
      return executionResult;

    } catch (error) {
      console.error('[McpExecutor] Claude-enhanced tool execution failed:', error);

      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        toolName: toolMatch.toolName,
        executionTime: 0,
        stepDescription: `Claude AI execution failed: ${toolMatch.toolName}`
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
    console.log('[McpExecutor] Building dynamic MCP parameters for tool:', toolName, 'with Claude params:', claudeParams);

    // NEW APPROACH: Use Claude's parameters directly - no hardcoded tool logic
    const mcpParams: Record<string, any> = {};

    // Copy all Claude parameters as they should be tool-agnostic
    Object.assign(mcpParams, claudeParams);

    // ENHANCEMENT: Ensure limit parameter is included for tools that need it
    const requestedLimit = this.extractRequestedLimit(intent, claudeParams);
    if (requestedLimit && !mcpParams.limit && !mcpParams.max_results && !mcpParams.count) {
      // Add multiple parameter variations since different tools use different names
      mcpParams.limit = requestedLimit;
      mcpParams.max_results = requestedLimit;
      mcpParams.count = requestedLimit;
      console.log(`[McpExecutor] Added limit parameters: ${requestedLimit}`);
    }

    // Log the enhanced parameter mapping
    console.log('[McpExecutor] Enhanced parameter mapping (with limits):', mcpParams);

    return mcpParams;
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
}