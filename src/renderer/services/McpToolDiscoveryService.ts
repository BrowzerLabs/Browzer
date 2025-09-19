/**
 * MCP Tool Discovery Service
 *
 * Dynamically discovers all available tools from all connected MCP servers.
 * No hardcoded tool logic - everything is discovered and analyzed automatically.
 */

export interface DiscoveredTool {
  name: string;
  description: string;
  serverName: string;
  serverId: string;
  parameters: ToolParameter[];
  inputSchema?: any;
  outputSchema?: any;
  category: string;
  capabilities: string[];
  lastUpdated: number;
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
  enum?: any[];
}

export interface ToolRegistry {
  tools: Map<string, DiscoveredTool>;
  categories: Map<string, DiscoveredTool[]>;
  lastDiscovery: number;
  totalTools: number;
}

export class McpToolDiscoveryService {
  private mcpManager: any;
  private toolRegistry: ToolRegistry;
  private discoveryInProgress: boolean = false;
  private readonly DISCOVERY_CACHE_TTL = 300000; // 5 minutes

  constructor(mcpManager: any) {
    this.mcpManager = mcpManager;
    this.toolRegistry = {
      tools: new Map(),
      categories: new Map(),
      lastDiscovery: 0,
      totalTools: 0
    };
  }

  /**
   * Discover all available tools from all connected MCP servers
   */
  async discoverAllTools(): Promise<ToolRegistry> {
    console.log('[McpToolDiscoveryService] Starting comprehensive tool discovery');

    if (this.discoveryInProgress) {
      console.log('[McpToolDiscoveryService] Discovery already in progress, waiting...');
      return this.toolRegistry;
    }

    // Check if we have recent discovery results
    const now = Date.now();
    if (now - this.toolRegistry.lastDiscovery < this.DISCOVERY_CACHE_TTL && this.toolRegistry.totalTools > 0) {
      console.log('[McpToolDiscoveryService] Using cached tool discovery results');
      return this.toolRegistry;
    }

    this.discoveryInProgress = true;

    try {
      // Step 1: Get all connected MCP servers
      const servers = await this.getConnectedServers();
      console.log('[McpToolDiscoveryService] Found', servers.length, 'connected MCP servers');

      // Step 2: Discover tools from each server
      const allDiscoveredTools: DiscoveredTool[] = [];

      for (const server of servers) {
        try {
          console.log(`[McpToolDiscoveryService] Discovering tools from server: ${server.name}`);
          const serverTools = await this.discoverToolsFromServer(server);
          allDiscoveredTools.push(...serverTools);
          console.log(`[McpToolDiscoveryService] Found ${serverTools.length} tools from ${server.name}`);
        } catch (error) {
          console.error(`[McpToolDiscoveryService] Failed to discover tools from ${server.name}:`, error);
          // Continue with other servers even if one fails
        }
      }

      // Step 3: Process and categorize discovered tools
      this.processDiscoveredTools(allDiscoveredTools);

      // Step 4: Update registry
      this.toolRegistry.lastDiscovery = now;
      this.toolRegistry.totalTools = allDiscoveredTools.length;

      console.log(`[McpToolDiscoveryService] Discovery complete! Found ${this.toolRegistry.totalTools} tools across ${this.toolRegistry.categories.size} categories`);
      return this.toolRegistry;

    } catch (error) {
      console.error('[McpToolDiscoveryService] Tool discovery failed:', error);
      throw error;
    } finally {
      this.discoveryInProgress = false;
    }
  }

  /**
   * Get all connected MCP servers
   */
  private async getConnectedServers(): Promise<any[]> {
    try {
      // Use MCP manager to get server information
      const servers = await this.mcpManager.getAllServers();
      return servers.filter((server: any) => server.connected);
    } catch (error) {
      console.error('[McpToolDiscoveryService] Failed to get connected servers:', error);
      return [];
    }
  }

  /**
   * Discover tools from a specific MCP server
   */
  private async discoverToolsFromServer(server: any): Promise<DiscoveredTool[]> {
    console.log(`[McpToolDiscoveryService] Fetching tools from ${server.name}...`);

    try {
      // Get tools list from the server using existing method
      const toolsList = await this.mcpManager.getToolsForServer(server.name);
      console.log(`[McpToolDiscoveryService] Raw tools from ${server.name}:`, toolsList.length, 'tools');
      const discoveredTools: DiscoveredTool[] = [];

      for (const tool of toolsList) {
        try {
          console.log(`[McpToolDiscoveryService] Processing tool: ${tool.name}`);
          // Create discovered tool from MCP tool info
          const discoveredTool = this.parseToolInformation(server, tool, tool);
          discoveredTools.push(discoveredTool);
        } catch (error) {
          console.warn(`[McpToolDiscoveryService] Failed to process tool ${tool.name}:`, error);
          // Create basic tool entry even if processing fails
          discoveredTools.push(this.createBasicToolEntry(server, tool));
        }
      }

      console.log(`[McpToolDiscoveryService] Successfully processed ${discoveredTools.length} tools from ${server.name}`);
      return discoveredTools;
    } catch (error) {
      console.error(`[McpToolDiscoveryService] Failed to discover tools from ${server.name}:`, error);
      return [];
    }
  }

  /**
   * Get detailed information about a specific tool
   */
  private async getToolDetails(server: any, tool: any): Promise<any> {
    try {
      // Use the getToolInfo method with correct parameter format
      const fullToolName = `${server.name}.${tool.name}`;
      return this.mcpManager.getToolInfo(fullToolName);
    } catch (error) {
      console.warn(`[McpToolDiscoveryService] Could not get detailed info for ${tool.name}`);
      return tool; // Return the tool itself as fallback
    }
  }

  /**
   * Parse tool information into standardized format
   */
  private parseToolInformation(server: any, tool: any, toolInfo: any): DiscoveredTool {
    const parameters = this.extractParameters(toolInfo?.inputSchema || tool.inputSchema || {});
    const category = this.categorizeFromTool(tool.name, tool.description, server.name);
    const capabilities = this.extractCapabilities(tool, toolInfo, server);

    return {
      name: tool.name,
      description: tool.description || toolInfo?.description || 'No description available',
      serverName: server.name,
      serverId: server.id,
      parameters,
      inputSchema: toolInfo?.inputSchema || tool.inputSchema,
      outputSchema: toolInfo?.outputSchema || tool.outputSchema,
      category,
      capabilities,
      lastUpdated: Date.now()
    };
  }

  /**
   * Create basic tool entry when detailed info is unavailable
   */
  private createBasicToolEntry(server: any, tool: any): DiscoveredTool {
    return {
      name: tool.name,
      description: tool.description || 'No description available',
      serverName: server.name,
      serverId: server.id,
      parameters: [],
      category: this.categorizeFromTool(tool.name, tool.description, server.name),
      capabilities: ['basic'],
      lastUpdated: Date.now()
    };
  }

  /**
   * Extract parameters from tool schema
   */
  private extractParameters(inputSchema: any): ToolParameter[] {
    const parameters: ToolParameter[] = [];

    if (inputSchema?.properties) {
      const required = inputSchema.required || [];

      for (const [paramName, paramDef] of Object.entries(inputSchema.properties)) {
        const param = paramDef as any;
        parameters.push({
          name: paramName,
          type: param.type || 'string',
          description: param.description || 'No description',
          required: required.includes(paramName),
          default: param.default,
          enum: param.enum
        });
      }
    }

    return parameters;
  }

  /**
   * Categorize tool based on name and description
   */
  private categorizeFromTool(toolName: string, description: string = '', serverName: string = ''): string {
    const text = `${toolName} ${description} ${serverName}`.toLowerCase();

    // Email tools
    if (text.includes('email') || text.includes('gmail') || text.includes('mail') || text.includes('outlook')) {
      return 'email';
    }

    // Calendar tools
    if (text.includes('calendar') || text.includes('event') || text.includes('meeting') || text.includes('schedule')) {
      return 'calendar';
    }

    // Project management tools
    if (text.includes('trello') || text.includes('jira') || text.includes('notion') || text.includes('task') || text.includes('project')) {
      return 'project-management';
    }

    // Communication tools
    if (text.includes('slack') || text.includes('teams') || text.includes('discord') || text.includes('message')) {
      return 'communication';
    }

    // Documentation tools
    if (text.includes('doc') || text.includes('note') || text.includes('wiki') || text.includes('confluence')) {
      return 'documentation';
    }

    // File/storage tools
    if (text.includes('file') || text.includes('drive') || text.includes('dropbox') || text.includes('storage')) {
      return 'storage';
    }

    return 'general';
  }

  /**
   * Extract capabilities from tool information
   */
  private extractCapabilities(tool: any, toolInfo: any, server: any): string[] {
    const capabilities: string[] = [];

    // Analyze tool name and description for capabilities
    const text = `${tool.name} ${tool.description || ''}`.toLowerCase();

    if (text.includes('find') || text.includes('search') || text.includes('get') || text.includes('list')) {
      capabilities.push('read');
    }

    if (text.includes('create') || text.includes('add') || text.includes('new')) {
      capabilities.push('create');
    }

    if (text.includes('update') || text.includes('edit') || text.includes('modify')) {
      capabilities.push('update');
    }

    if (text.includes('delete') || text.includes('remove')) {
      capabilities.push('delete');
    }

    if (text.includes('send') || text.includes('reply')) {
      capabilities.push('send');
    }

    return capabilities.length > 0 ? capabilities : ['general'];
  }

  /**
   * Process discovered tools and organize them
   */
  private processDiscoveredTools(tools: DiscoveredTool[]): void {
    // Clear existing registry
    this.toolRegistry.tools.clear();
    this.toolRegistry.categories.clear();

    // Organize tools
    for (const tool of tools) {
      // Add to main tools map
      this.toolRegistry.tools.set(tool.name, tool);

      // Add to category
      if (!this.toolRegistry.categories.has(tool.category)) {
        this.toolRegistry.categories.set(tool.category, []);
      }
      this.toolRegistry.categories.get(tool.category)!.push(tool);
    }

    console.log('[McpToolDiscoveryService] Processed tools by category:');
    for (const [category, categoryTools] of this.toolRegistry.categories.entries()) {
      console.log(`  ${category}: ${categoryTools.length} tools`);
    }
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): DiscoveredTool[] {
    return this.toolRegistry.categories.get(category) || [];
  }

  /**
   * Get all tools as array for Claude API
   */
  getAllToolsForClaudeAPI(): DiscoveredTool[] {
    return Array.from(this.toolRegistry.tools.values());
  }

  /**
   * Search tools by capability
   */
  getToolsByCapability(capability: string): DiscoveredTool[] {
    return Array.from(this.toolRegistry.tools.values())
      .filter(tool => tool.capabilities.includes(capability));
  }

  /**
   * Get tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Force refresh tool discovery
   */
  async refreshToolDiscovery(): Promise<ToolRegistry> {
    this.toolRegistry.lastDiscovery = 0; // Force refresh
    return await this.discoverAllTools();
  }
}