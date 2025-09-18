import { McpClientManager } from './McpClientManager';
import { McpRouter, ToolMatch } from './McpRouter';
import { McpErrorHandler } from './McpErrorHandler';

export interface McpExecutionResult {
  success: boolean;
  data: any;
  error?: string;
  toolName: string;
  executionTime: number;
}

/**
 * Concrete MCP tool executor focused on email queries.
 * Handles real tool execution with proper error handling and result formatting.
 */
export class McpExecutor {
  private errorHandler: McpErrorHandler;

  constructor(private mcpManager: McpClientManager) {
    const router = new McpRouter(this.mcpManager);
    this.errorHandler = new McpErrorHandler(this.mcpManager, router);
  }

  async executeEmailQuery(query: string): Promise<McpExecutionResult[]> {
    const results: McpExecutionResult[] = [];
    console.log('[McpExecutor] Executing email query:', query);

    // Pre-flight server health check
    const healthStatus = await this.errorHandler.validateServerHealth();
    console.log('[McpExecutor] Server health status:', healthStatus);

    if (healthStatus.healthy.length === 0 && healthStatus.unhealthy.length > 0) {
      console.error('[McpExecutor] All MCP servers are unhealthy');
      return [{
        success: false,
        data: null,
        error: `All MCP servers are unavailable: ${healthStatus.unhealthy.join(', ')}`,
        toolName: 'MCP System',
        executionTime: 0
      }];
    }

    // DIAGNOSTIC: Check what tools are actually available
    const allAvailableTools = await this.mcpManager.listAllTools();
    console.log('[DEBUG] Available tools from listAllTools():', allAvailableTools);

    // Step 1: Route query to appropriate tools
    const router = new McpRouter(this.mcpManager);
    const matches = await router.routeQuery(query, 2); // Try top 2 tools

    // DIAGNOSTIC: Enhanced tool matching information
    console.log('[DEBUG] Tool matches found:', matches.map(m => ({
      name: m.toolName,
      score: m.score,
      description: m.description
    })));

    if (matches.length === 0) {
      console.error('[DEBUG] No tools matched - Available tools:', allAvailableTools);
      throw new Error(`No suitable MCP tools found for email query. Available tools: ${allAvailableTools.join(', ')}`);
    }

    console.log('[McpExecutor] Found tool matches:', matches.map(m => `${m.toolName} (score: ${m.score})`));

    // Step 2: Execute the best match first
    const topMatch = matches[0];
    const result = await this.executeSingleTool(topMatch, query);
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
        const fallbackResult = await this.executeSingleTool(matches[1], query);
        results.push(fallbackResult);
      } else {
        // No recovery possible, add the original failed result
        results.push(result);
      }
    }

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

  private async executeGmailFind(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Gmail find for query:', query);

    // Parse Gmail-specific requirements from query
    const params = this.parseGmailQuery(query);
    console.log('[McpExecutor] Parsed Gmail params:', params);

    // DIAGNOSTIC: Log detailed tool call information
    const toolName = 'zap2.gmail_find_email';

    // Generate natural language instructions for Zapier tool
    let instructions = `Find the first ${params.limit} emails from Gmail inbox`;
    if (query.includes('recent') || query.includes('latest') || query.includes('first')) {
      instructions += ' (most recent first)';
    }
    if (query.includes('from')) {
      const fromMatch = query.match(/from\s+([^\s]+)/i);
      if (fromMatch) instructions += ` from ${fromMatch[1]}`;
    }
    if (query.includes('unread')) {
      instructions += ' that are unread';
    }
    if (params.searchQuery && params.searchQuery !== 'in:inbox') {
      instructions += `. Use Gmail search query: ${params.searchQuery}`;
    }
    instructions += '. Include email content/body in the results.';

    // Use correct Zapier schema: instructions (required) + query (optional)
    const toolParams = {
      instructions: instructions,
      query: params.searchQuery
    };

    console.log('[DEBUG] Calling tool with params:', {
      toolName: toolName,
      params: toolParams
    });

    // DIAGNOSTIC: Check if tool exists and get its schema
    const toolInfo = this.mcpManager.getToolInfo(toolName);
    console.log('[DEBUG] Tool info from registry:', toolInfo);
    if (toolInfo?.inputSchema) {
      console.log('[DEBUG] Expected tool schema:', toolInfo.inputSchema);
    }


    try {
      const result = await this.mcpManager.callTool(toolName, toolParams);
      console.log('[DEBUG] Tool call successful, result type:', typeof result);
      console.log('[DEBUG] Full result from Gmail tool:', JSON.stringify(result, null, 2));


      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[DEBUG] Tool call failed with detailed error:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        toolName: toolName,
        params: toolParams
      });


      throw error;
    }
  }

  private async executeGmailSend(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Gmail send for query:', query);

    // Extract email details from query
    const emailDetails = this.parseEmailSendQuery(query);

    return await this.mcpManager.callTool('zap2.gmail_send_email', {
      to: emailDetails.to,
      subject: emailDetails.subject,
      body: emailDetails.body
    });
  }

  private async executeGmailReply(query: string): Promise<any> {
    console.log('[McpExecutor] Executing Gmail reply for query:', query);

    // Extract reply details from query
    const replyDetails = this.parseEmailReplyQuery(query);

    return await this.mcpManager.callTool('zap2.gmail_reply_to_email', {
      message_id: replyDetails.messageId,
      reply_body: replyDetails.body
    });
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

    // Extract number from query (e.g., "first 3 emails" -> 3)
    const numberMatch = query.match(/(\d+)/);
    if (numberMatch) {
      limit = parseInt(numberMatch[1]);
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

    // Handle temporal queries
    if (query.includes('recent') || query.includes('latest') || query.includes('first')) {
      searchQuery += 'newer_than:7d ';
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
    }

    return {
      searchQuery: searchQuery.trim(),
      limit: Math.min(limit, 20) // Cap at 20 emails max
    };
  }

  private parseEmailSendQuery(query: string): { to: string; subject: string; body: string } {
    // Extract recipient
    const toMatch = query.match(/(?:send|email|to)\s+([^\s@]+@[^\s]+)/i) ||
                   query.match(/to\s+([^\s@]+@[^\s]+)/i);

    // Extract subject
    const subjectMatch = query.match(/subject[:\s]+([^,\n]+)/i);

    // Extract body/message
    const bodyMatch = query.match(/(?:saying|message|body)[:\s]+(.+)/i);

    return {
      to: toMatch?.[1] || '',
      subject: subjectMatch?.[1]?.trim() || 'Message from Browzer',
      body: bodyMatch?.[1]?.trim() || query
    };
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
    const complexIndicators = [
      'then', 'and then', 'after that', 'also',
      'summarize', 'reply to', 'forward to',
      'create', 'schedule', 'send to'
    ];

    return complexIndicators.some(indicator =>
      query.toLowerCase().includes(indicator)
    );
  }

  /**
   * Future: Execute complex multi-tool queries
   */
  async executeComplexQuery(query: string): Promise<McpExecutionResult[]> {
    // For now, just execute as single query
    // This will be enhanced in Week 4 for multi-tool workflows
    console.log('[McpExecutor] Complex query detected, executing as single query for now:', query);
    return await this.executeEmailQuery(query);
  }
}