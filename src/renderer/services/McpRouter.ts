import { McpClientManager, McpTool } from './McpClientManager';

export interface ToolMatch {
  toolName: string;
  score: number;
  description: string;
  schema?: any;
}

/**
 * Simple keyword-based router that selects relevant MCP tools for a user query.
 * Keeps it lightweight and effective for MVP.
 */
export class McpRouter {
  constructor(private mcpManager: McpClientManager) {}

  async routeQuery(userQuery: string, maxTools: number = 3): Promise<ToolMatch[]> {
    const allToolNames = await this.mcpManager.listAllTools();
    const query = userQuery.toLowerCase();

    // DIAGNOSTIC: Log all discovered tool names
    console.log('[DEBUG] All discovered tool names:', allToolNames);
    console.log('[DEBUG] Query for routing:', query);

    const matches: ToolMatch[] = [];
    const scoringResults: any[] = [];

    for (const toolName of allToolNames) {
      const toolInfo = this.mcpManager.getToolInfo(toolName);
      if (!toolInfo) {
        console.log('[DEBUG] No tool info found for:', toolName);
        continue;
      }

      const score = this.scoreToolForQuery(toolName, query);

      // DIAGNOSTIC: Log all scoring attempts
      scoringResults.push({
        toolName,
        score,
        description: toolInfo.description || this.getToolDescription(toolName)
      });

      if (score > 0) {
        matches.push({
          toolName,
          score,
          description: toolInfo.description || this.getToolDescription(toolName),
          schema: toolInfo.inputSchema || this.getToolSchema(toolName)
        });
      }
    }

    // DIAGNOSTIC: Log complete scoring results
    console.log('[DEBUG] Query scoring results:', scoringResults);
    console.log('[DEBUG] Tools with score > 0:', matches);

    // Sort by score descending and take top K
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTools);
  }

  private scoreToolForQuery(toolName: string, query: string): number {
    const [serverName, ...toolParts] = toolName.split('.');
    const tool = toolParts.join('.');

    let score = 0;

    // GMAIL SCORING - HIGH PRIORITY
    if (serverName.includes('gmail') || toolName.includes('gmail')) {
      // HIGHEST PRIORITY: Sending emails (must be checked first to override reading scores)
      if (query.includes('send') || query.includes('reply') || query.includes('forward') ||
          query.includes('compose') || query.includes('write email') || query.includes('email to')) {
        if (tool.includes('send')) score += 10; // Higher than reading tools
        if (tool.includes('reply')) score += 10;
        // Penalize find tools for send queries to avoid wrong routing
        if (tool.includes('find') || tool.includes('get') || tool.includes('search')) score -= 5;
      }
      // Email reading queries (only if not a send query)
      else if (query.includes('email') || query.includes('inbox') || query.includes('message')) {
        if (tool.includes('find') || tool.includes('get') || tool.includes('read')) score += 5;
        if (tool.includes('search') || tool.includes('list')) score += 4;
      }

      // Specific email actions
      if (query.includes('first') || query.includes('recent') || query.includes('latest')) {
        if (tool.includes('find') || tool.includes('list') || tool.includes('get')) score += 4;
      }

      // Email count queries
      const numberMatch = query.match(/(\d+)/);
      if (numberMatch) {
        if (tool.includes('find') || tool.includes('get')) score += 3;
      }

      // Gmail-specific terms
      if (query.includes('gmail')) score += 2;
    }

    // Filesystem scoring
    if (serverName === 'filesystem') {
      if (query.includes('read') || query.includes('open') || query.includes('file')) {
        if (tool.includes('read')) score += 3;
        if (tool.includes('list')) score += 1;
      }
      if (query.includes('write') || query.includes('save') || query.includes('create')) {
        if (tool.includes('write')) score += 3;
        if (tool.includes('create')) score += 2;
      }
      if (query.includes('list') || query.includes('directory') || query.includes('folder')) {
        if (tool.includes('list')) score += 3;
      }
    }
    
    // GOOGLE CALENDAR SCORING
    if (toolName.includes('calendar')) {
      // Calendar viewing queries
      if (query.includes('calendar') || query.includes('schedule') || query.includes('appointment') || query.includes('meeting')) {
        if (tool.includes('find') || tool.includes('get') || tool.includes('events')) score += 5;
        if (tool.includes('list')) score += 4;
      }

      // Time-based queries
      if (query.includes('today') || query.includes('tomorrow') || query.includes('week') || query.includes('month')) {
        if (tool.includes('find') || tool.includes('events')) score += 4;
      }

      // Event creation
      if (query.includes('create') || query.includes('add') || query.includes('schedule') || query.includes('book')) {
        if (tool.includes('add') || tool.includes('create') || tool.includes('quick')) score += 5;
      }

      // Event updates
      if (query.includes('update') || query.includes('change') || query.includes('modify')) {
        if (tool.includes('update') || tool.includes('edit')) score += 5;
      }
    }

    // Slack scoring
    if (serverName.includes('slack') || toolName.includes('slack')) {
      if (query.includes('slack') || query.includes('message') || query.includes('send')) {
        if (tool.includes('send') || tool.includes('message')) score += 3;
        if (tool.includes('channel')) score += 2;
      }
    }
    
    // Web/browser scoring
    if (serverName.includes('web') || serverName.includes('browser') || toolName.includes('web') || toolName.includes('browser')) {
      if (query.includes('search') || query.includes('web') || query.includes('browse')) {
        if (tool.includes('search')) score += 3;
        if (tool.includes('navigate')) score += 2;
      }
    }
    
    // Generic scoring for any tool
    if (query.includes(tool.toLowerCase())) score += 2;
    if (query.includes(serverName.toLowerCase())) score += 1;
    
    return score;
  }

  private getToolDescription(toolName: string): string {
    const [serverName, ...toolParts] = toolName.split('.');
    const tool = toolParts.join('.');

    // Gmail/Email tool descriptions
    if (serverName.includes('gmail') || toolName.includes('gmail')) {
      if (tool.includes('find_email') || tool.includes('find')) {
        return 'Search and find emails in Gmail inbox';
      }
      if (tool.includes('send_email') || tool.includes('send')) {
        return 'Send a new email via Gmail';
      }
      if (tool.includes('reply_to_email') || tool.includes('reply')) {
        return 'Reply to an existing email';
      }
      if (tool.includes('get_email') || tool.includes('get')) {
        return 'Get specific email content from Gmail';
      }
      if (tool.includes('list')) {
        return 'List emails from Gmail inbox';
      }
    }

    // Simple descriptions based on common patterns
    if (serverName === 'filesystem') {
      if (tool.includes('read')) return 'Read contents of a file';
      if (tool.includes('write')) return 'Write content to a file';
      if (tool.includes('list')) return 'List files and directories';
      if (tool.includes('delete')) return 'Delete a file or directory';
    }

    if (serverName === 'slack') {
      if (tool.includes('send')) return 'Send a message to Slack';
      if (tool.includes('channel')) return 'List or manage Slack channels';
    }

    return `Execute ${tool} on ${serverName}`;
  }

  private getToolSchema(toolName: string): any {
    // This would normally come from the MCP client's tool registry
    // For now, return a basic schema
    return {
      type: 'object',
      properties: {
        // Common parameters that most tools might need
        ...(toolName.includes('read') && { path: { type: 'string', description: 'File path to read' } }),
        ...(toolName.includes('write') && { 
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' }
        }),
        ...(toolName.includes('list') && { path: { type: 'string', description: 'Directory path to list' } }),
        ...(toolName.includes('send') && { 
          message: { type: 'string', description: 'Message to send' },
          channel: { type: 'string', description: 'Channel or recipient' }
        })
      }
    };
  }
}
