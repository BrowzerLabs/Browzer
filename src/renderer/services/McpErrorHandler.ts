import { McpClientManager } from './McpClientManager';
import { McpRouter, ToolMatch } from './McpRouter';
import { McpExecutionResult } from './McpExecutor';

export interface ErrorContext {
  originalQuery: string;
  failedTool: string;
  errorMessage: string;
  attemptCount: number;
  availableAlternatives: ToolMatch[];
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  canHandle: (context: ErrorContext) => boolean;
  execute: (context: ErrorContext) => Promise<McpExecutionResult | null>;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttemptTime: number;
}

export interface McpServerStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  lastResponseTime: number;
  uptime: number;
  downSince?: number;
}

/**
 * Enhanced error handling system for MCP tool execution failures.
 * Provides intelligent fallback strategies, retry logic, and circuit breakers for Phase 2.
 */
export class McpErrorHandler {
  private recoveryStrategies: RecoveryStrategy[] = [];
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private serverStats: Map<string, McpServerStats> = new Map();

  // Circuit breaker configuration
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT = 30000; // 30 seconds
  private readonly HALF_OPEN_MAX_ATTEMPTS = 3;

  constructor(
    private mcpManager: McpClientManager,
    private router: McpRouter
  ) {
    this.initializeRecoveryStrategies();
    this.startHealthMonitoring();
  }

  /**
   * Handle a failed MCP tool execution with intelligent recovery
   */
  async handleToolFailure(
    originalQuery: string,
    failedTool: string,
    errorMessage: string,
    attemptCount: number = 1
  ): Promise<McpExecutionResult | null> {
    console.log(`[McpErrorHandler] Handling failure for ${failedTool}: ${errorMessage}`);

    // Build error context
    const context: ErrorContext = {
      originalQuery,
      failedTool,
      errorMessage,
      attemptCount,
      availableAlternatives: await this.findAlternativeTools(originalQuery, failedTool)
    };

    console.log(`[McpErrorHandler] Found ${context.availableAlternatives.length} alternative tools`);

    // Try recovery strategies in order of priority
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canHandle(context)) {
        console.log(`[McpErrorHandler] Attempting recovery with strategy: ${strategy.name}`);

        try {
          const result = await strategy.execute(context);
          if (result && result.success) {
            console.log(`[McpErrorHandler] Recovery successful with ${strategy.name}`);
            return result;
          }
        } catch (recoveryError) {
          console.error(`[McpErrorHandler] Recovery strategy ${strategy.name} failed:`, recoveryError);
          // Continue to next strategy
        }
      }
    }

    console.log('[McpErrorHandler] All recovery strategies exhausted');
    return null;
  }

  /**
   * Classify error type for better handling
   */
  classifyError(errorMessage: string): 'connection' | 'authentication' | 'parameter' | 'rate_limit' | 'server_error' | 'unknown' {
    const message = errorMessage.toLowerCase();

    if (message.includes('connection') || message.includes('timeout') || message.includes('network')) {
      return 'connection';
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'authentication';
    }
    if (message.includes('parameter') || message.includes('invalid') || message.includes('missing')) {
      return 'parameter';
    }
    if (message.includes('rate') || message.includes('quota') || message.includes('limit')) {
      return 'rate_limit';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return 'server_error';
    }

    return 'unknown';
  }

  /**
   * Get user-friendly error messages with suggested actions
   */
  getUserFriendlyMessage(errorMessage: string, context: ErrorContext): string {
    const errorType = this.classifyError(errorMessage);

    switch (errorType) {
      case 'connection':
        return `🔄 **Connection Issue**\nCouldn't reach the ${context.failedTool} service. This might be temporary.\n\n*Suggested action:* Try again in a few moments.`;

      case 'authentication':
        return `🔐 **Authentication Required**\nThe ${context.failedTool} tool needs to be authenticated.\n\n*Suggested action:* Check your credentials in Settings.`;

      case 'parameter':
        return `⚙️ **Invalid Request**\nThe query couldn't be processed by ${context.failedTool}.\n\n*Suggested action:* Try rephrasing your request.`;

      case 'rate_limit':
        return `⏰ **Rate Limit Reached**\nYou've made too many requests to ${context.failedTool} recently.\n\n*Suggested action:* Wait a few minutes before trying again.`;

      case 'server_error':
        return `🚫 **Server Error**\nThe ${context.failedTool} service is experiencing issues.\n\n*Suggested action:* Try again later or use an alternative tool.`;

      default:
        return `❌ **Unexpected Error**\n${context.failedTool} encountered an issue: ${errorMessage}`;
    }
  }

  private async findAlternativeTools(originalQuery: string, excludeTool: string): Promise<ToolMatch[]> {
    try {
      const allMatches = await this.router.routeQuery(originalQuery, 5);
      return allMatches.filter(match => match.toolName !== excludeTool);
    } catch (error) {
      console.error('[McpErrorHandler] Error finding alternatives:', error);
      return [];
    }
  }

  private initializeRecoveryStrategies(): void {
    // Strategy 1: Try Alternative Similar Tools
    this.recoveryStrategies.push({
      name: 'Alternative Tool Fallback',
      description: 'Try similar tools that can handle the same query',
      canHandle: (context) => context.availableAlternatives.length > 0,
      execute: async (context) => {
        const topAlternative = context.availableAlternatives[0];
        console.log(`[McpErrorHandler] Trying alternative tool: ${topAlternative.toolName}`);

        try {
          const result = await this.mcpManager.callTool(topAlternative.toolName, {
            query: context.originalQuery,
            instructions: `Alternative execution: ${context.originalQuery}`
          });

          return {
            success: true,
            data: result,
            toolName: topAlternative.toolName,
            executionTime: 0, // We don't track this in recovery
            error: undefined
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            success: false,
            data: null,
            error: `Alternative tool ${topAlternative.toolName} failed: ${errorMessage}`,
            toolName: topAlternative.toolName,
            executionTime: 0
          };
        }
      }
    });

    // Strategy 2: Retry with Modified Parameters
    this.recoveryStrategies.push({
      name: 'Parameter Retry',
      description: 'Retry with simplified or modified parameters',
      canHandle: (context) =>
        context.attemptCount < 3 &&
        this.classifyError(context.errorMessage) === 'parameter',
      execute: async (context) => {
        console.log('[McpErrorHandler] Retrying with simplified parameters');

        try {
          // Simplify the query for retry
          const simplifiedQuery = this.simplifyQuery(context.originalQuery);
          const result = await this.mcpManager.callTool(context.failedTool, {
            instructions: simplifiedQuery,
            query: simplifiedQuery
          });

          return {
            success: true,
            data: result,
            toolName: `${context.failedTool} (retry)`,
            executionTime: 0,
            error: undefined
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            success: false,
            data: null,
            error: `Retry failed: ${errorMessage}`,
            toolName: context.failedTool,
            executionTime: 0
          };
        }
      }
    });

    // Strategy 3: Exponential Backoff Retry
    this.recoveryStrategies.push({
      name: 'Exponential Backoff Retry',
      description: 'Retry after waiting for connection/server issues',
      canHandle: (context) =>
        context.attemptCount < 2 &&
        (this.classifyError(context.errorMessage) === 'connection' ||
         this.classifyError(context.errorMessage) === 'server_error'),
      execute: async (context) => {
        const waitTime = Math.pow(2, context.attemptCount) * 1000; // 2s, 4s, 8s...
        console.log(`[McpErrorHandler] Waiting ${waitTime}ms before retry`);

        await new Promise(resolve => setTimeout(resolve, waitTime));

        try {
          const result = await this.mcpManager.callTool(context.failedTool, {
            instructions: context.originalQuery,
            query: context.originalQuery
          });

          return {
            success: true,
            data: result,
            toolName: `${context.failedTool} (retry)`,
            executionTime: waitTime,
            error: undefined
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            success: false,
            data: null,
            error: `Retry failed: ${errorMessage}`,
            toolName: context.failedTool,
            executionTime: waitTime
          };
        }
      }
    });
  }

  private simplifyQuery(query: string): string {
    // Remove complex modifiers and keep core intent
    return query
      .replace(/\b(first|last|recent|latest)\s+(\d+)\b/i, 'first 5') // Standardize counts
      .replace(/\b(with|including|containing)\s+[^,]+/gi, '') // Remove complex filters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Check if MCP servers are healthy and available
   */
  async validateServerHealth(): Promise<{ healthy: string[]; unhealthy: string[] }> {
    const healthy: string[] = [];
    const unhealthy: string[] = [];

    try {
      // Get all available tools as a proxy for server health
      const allTools = await this.mcpManager.listAllTools();

      if (allTools.length > 0) {
        // Extract server names from tool names (format: "server.tool")
        const serverNames = new Set<string>();
        for (const tool of allTools) {
          const [serverName] = tool.split('.');
          if (serverName) {
            serverNames.add(serverName);
          }
        }

        // Test each server by trying to get its tools
        for (const serverName of serverNames) {
          try {
            const tools = await this.mcpManager.getToolsForServer(serverName);
            if (tools.length > 0) {
              healthy.push(serverName);
            } else {
              unhealthy.push(serverName);
            }
          } catch (error) {
            console.error(`[McpErrorHandler] Server ${serverName} health check failed:`, error);
            unhealthy.push(serverName);
          }
        }
      } else {
        // No tools available suggests all servers are down
        console.warn('[McpErrorHandler] No tools available from any server');
        unhealthy.push('all servers');
      }
    } catch (error) {
      console.error('[McpErrorHandler] Error validating server health:', error);
      unhealthy.push('health check failed');
    }

    return { healthy, unhealthy };
  }

  /**
   * Circuit breaker: Check if server is available for requests
   */
  canCallServer(serverName: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(serverName);
    if (!circuitBreaker) {
      return true; // First time calling, allow
    }

    switch (circuitBreaker.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        // Check if recovery timeout has passed
        if (Date.now() >= circuitBreaker.nextAttemptTime) {
          // Move to half-open state
          circuitBreaker.state = 'HALF_OPEN';
          console.log(`[McpErrorHandler] Circuit breaker for ${serverName} moving to HALF_OPEN`);
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return true; // Allow limited attempts
    }
  }

  /**
   * Circuit breaker: Record successful server call
   */
  recordSuccess(serverName: string, responseTime: number): void {
    const circuitBreaker = this.circuitBreakers.get(serverName) || {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttemptTime: 0
    };

    // Reset circuit breaker on success
    circuitBreaker.failures = 0;
    circuitBreaker.state = 'CLOSED';
    this.circuitBreakers.set(serverName, circuitBreaker);

    // Update server statistics
    this.updateServerStats(serverName, true, responseTime);
    console.log(`[McpErrorHandler] Circuit breaker for ${serverName} reset to CLOSED`);
  }

  /**
   * Circuit breaker: Record failed server call
   */
  recordFailure(serverName: string, error: string): void {
    const circuitBreaker = this.circuitBreakers.get(serverName) || {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      nextAttemptTime: 0
    };

    circuitBreaker.failures++;
    circuitBreaker.lastFailureTime = Date.now();

    if (circuitBreaker.failures >= this.FAILURE_THRESHOLD) {
      circuitBreaker.state = 'OPEN';
      circuitBreaker.nextAttemptTime = Date.now() + this.RECOVERY_TIMEOUT;
      console.log(`[McpErrorHandler] Circuit breaker for ${serverName} OPENED after ${circuitBreaker.failures} failures`);
    }

    this.circuitBreakers.set(serverName, circuitBreaker);

    // Update server statistics
    this.updateServerStats(serverName, false, 0);
  }

  /**
   * Update server performance statistics
   */
  private updateServerStats(serverName: string, success: boolean, responseTime: number): void {
    const stats = this.serverStats.get(serverName) || {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
      uptime: 100,
      downSince: undefined
    };

    stats.totalCalls++;
    stats.lastResponseTime = responseTime;

    if (success) {
      stats.successfulCalls++;
      stats.averageResponseTime = ((stats.averageResponseTime * (stats.successfulCalls - 1)) + responseTime) / stats.successfulCalls;
      if (stats.downSince) {
        delete stats.downSince; // Server is back up
      }
    } else {
      stats.failedCalls++;
      if (!stats.downSince) {
        stats.downSince = Date.now(); // Mark server as down
      }
    }

    // Calculate uptime percentage
    stats.uptime = (stats.successfulCalls / stats.totalCalls) * 100;
    this.serverStats.set(serverName, stats);
  }

  /**
   * Get server performance statistics
   */
  getServerStats(serverName: string): McpServerStats | undefined {
    return this.serverStats.get(serverName);
  }

  /**
   * Get all server statistics
   */
  getAllServerStats(): Map<string, McpServerStats> {
    return new Map(this.serverStats);
  }

  /**
   * Start periodic health monitoring of MCP servers
   */
  private startHealthMonitoring(): void {
    // Run health checks every 60 seconds
    setInterval(async () => {
      try {
        const health = await this.validateServerHealth();
        console.log(`[McpErrorHandler] Health check - Healthy: ${health.healthy.join(', ')}, Unhealthy: ${health.unhealthy.join(', ')}`);

        // Reset circuit breakers for healthy servers
        for (const serverName of health.healthy) {
          const circuitBreaker = this.circuitBreakers.get(serverName);
          if (circuitBreaker && circuitBreaker.state === 'OPEN') {
            console.log(`[McpErrorHandler] Resetting circuit breaker for recovered server: ${serverName}`);
            this.recordSuccess(serverName, 0);
          }
        }
      } catch (error) {
        console.error('[McpErrorHandler] Health monitoring error:', error);
      }
    }, 60000); // 60 seconds
  }

  /**
   * Check if tool is compatible with current MCP server configuration
   */
  async isToolCompatible(toolName: string): Promise<boolean> {
    try {
      const [serverName] = toolName.split('.');

      // Check circuit breaker first
      if (!this.canCallServer(serverName)) {
        console.log(`[McpErrorHandler] Tool ${toolName} blocked by circuit breaker`);
        return false;
      }

      // Check if tool exists in server
      const toolInfo = this.mcpManager.getToolInfo(toolName);
      if (!toolInfo) {
        console.log(`[McpErrorHandler] Tool ${toolName} not found in server`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[McpErrorHandler] Tool compatibility check failed for ${toolName}:`, error);
      return false;
    }
  }

  /**
   * Get circuit breaker status for debugging
   */
  getCircuitBreakerStatus(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }
}