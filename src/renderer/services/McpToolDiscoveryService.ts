import { McpClientManager, McpTool } from './McpClientManager';

/**
 * MCP Tool Discovery Service
 *
 * Dynamically discovers all available tools from user-configured MCP servers.
 * Provides semantic tool matching and intelligent capability resolution.
 */

/**
 * Semantic tool capabilities mapping
 */
export interface ToolCapability {
  category: 'email' | 'calendar' | 'project' | 'docs' | 'communication';
  action: 'read' | 'write' | 'search' | 'create' | 'update' | 'delete';
  provider?: string; // e.g., 'gmail', 'outlook', 'trello', 'notion'
}

/**
 * Enhanced discovered tool with semantic metadata
 */
export interface DiscoveredTool {
  name: string;
  fullName: string; // serverName.toolName
  displayName: string;
  description: string;
  serverName: string;
  serverId: string;
  parameters: ToolParameter[];
  inputSchema?: any;
  outputSchema?: any;
  category: string;
  capabilities: ToolCapability[];
  priority: number; // Higher = preferred when multiple tools provide same capability
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

/**
 * Tool resolution result for semantic matching
 */
export interface ToolResolution {
  primary: DiscoveredTool | null;
  alternatives: DiscoveredTool[];
}

export interface ToolRegistry {
  tools: Map<string, DiscoveredTool>;
  categories: Map<string, DiscoveredTool[]>;
  capabilityIndex: Map<string, DiscoveredTool[]>; // New: semantic capability index
  lastDiscovery: number;
  totalTools: number;
}

export class McpToolDiscoveryService {
  private mcpManager: McpClientManager;
  private toolRegistry: ToolRegistry;
  private discoveryInProgress: boolean = false;
  private readonly DISCOVERY_CACHE_TTL = 300000; // 5 minutes

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.toolRegistry = {
      tools: new Map(),
      categories: new Map(),
      capabilityIndex: new Map(),
      lastDiscovery: 0,
      totalTools: 0
    };
  }

  /**
   * Discover all available tools from user-configured MCP servers
   */
  async discoverAllTools(forceRefresh: boolean = false): Promise<ToolRegistry> {
    console.log('[McpToolDiscoveryService] Starting comprehensive tool discovery');

    if (this.discoveryInProgress) {
      console.log('[McpToolDiscoveryService] Discovery already in progress, waiting...');
      return this.toolRegistry;
    }

    // Check if we have recent discovery results
    const now = Date.now();
    if (!forceRefresh && now - this.toolRegistry.lastDiscovery < this.DISCOVERY_CACHE_TTL && this.toolRegistry.totalTools > 0) {
      console.log('[McpToolDiscoveryService] Using cached tool discovery results');
      return this.toolRegistry;
    }

    this.discoveryInProgress = true;

    try {
      // Get all tools directly from the MCP client manager
      // This uses the user's actual configured servers from localStorage
      console.log('[McpToolDiscoveryService] Getting tools from MCP client manager...');
      const mcpTools = this.mcpManager.getAllTools();
      console.log(`[McpToolDiscoveryService] Found ${mcpTools.length} tools from configured servers`);

      // Enhanced processing with semantic capabilities
      const discoveredTools: DiscoveredTool[] = [];
      for (const mcpTool of mcpTools) {
        const enrichedTool = this.enrichWithSemanticCapabilities(mcpTool);
        discoveredTools.push(enrichedTool);
      }

      // Process and index all tools
      this.processAndIndexTools(discoveredTools);

      // Update registry metadata
      this.toolRegistry.lastDiscovery = now;
      this.toolRegistry.totalTools = discoveredTools.length;

      console.log(`[McpToolDiscoveryService] Discovery complete!`);
      console.log(`  - Total tools: ${this.toolRegistry.totalTools}`);
      console.log(`  - Categories: ${this.toolRegistry.categories.size}`);
      console.log(`  - Capabilities: ${this.toolRegistry.capabilityIndex.size}`);

      return this.toolRegistry;

    } catch (error) {
      console.error('[McpToolDiscoveryService] Tool discovery failed:', error);
      throw error;
    } finally {
      this.discoveryInProgress = false;
    }
  }

  /**
   * Enrich MCP tool with semantic capabilities and metadata
   */
  private enrichWithSemanticCapabilities(mcpTool: McpTool): DiscoveredTool {
    const fullName = `${mcpTool.serverName}.${mcpTool.name}`;
    const displayName = this.generateDisplayName(mcpTool.name);
    const category = this.inferCategory(mcpTool.name, mcpTool.description);
    const capabilities = this.inferCapabilities(mcpTool.name, mcpTool.description);
    const priority = this.calculatePriority(mcpTool.serverName, mcpTool.name, mcpTool.description);
    const parameters = this.extractParameters(mcpTool.inputSchema);

    return {
      name: mcpTool.name,
      fullName,
      displayName,
      description: mcpTool.description || 'No description available',
      serverName: mcpTool.serverName,
      serverId: mcpTool.serverName, // Use serverName as ID
      parameters,
      inputSchema: mcpTool.inputSchema,
      category,
      capabilities,
      priority,
      lastUpdated: Date.now()
    };
  }

  /**
   * Process and index discovered tools for efficient lookup
   */
  private processAndIndexTools(discoveredTools: DiscoveredTool[]): void {
    // Clear existing indexes
    this.toolRegistry.tools.clear();
    this.toolRegistry.categories.clear();
    this.toolRegistry.capabilityIndex.clear();

    console.log('[McpToolDiscoveryService] Processing and indexing tools...');

    for (const tool of discoveredTools) {
      // Index by full name and simple name
      this.toolRegistry.tools.set(tool.fullName, tool);
      this.toolRegistry.tools.set(tool.name, tool); // Allow lookup by simple name too

      // Index by category
      if (!this.toolRegistry.categories.has(tool.category)) {
        this.toolRegistry.categories.set(tool.category, []);
      }
      this.toolRegistry.categories.get(tool.category)!.push(tool);

      // Index by capabilities for semantic matching
      for (const capability of tool.capabilities) {
        const capabilityKey = this.getCapabilityKey(capability);
        if (!this.toolRegistry.capabilityIndex.has(capabilityKey)) {
          this.toolRegistry.capabilityIndex.set(capabilityKey, []);
        }
        this.toolRegistry.capabilityIndex.get(capabilityKey)!.push(tool);
      }
    }

    // Sort capability indexes by priority
    for (const toolList of this.toolRegistry.capabilityIndex.values()) {
      toolList.sort((a, b) => b.priority - a.priority);
    }

    console.log('[McpToolDiscoveryService] Indexing complete:');
    console.log(`  Categories: ${Array.from(this.toolRegistry.categories.keys()).join(', ')}`);
    console.log(`  Capabilities: ${Array.from(this.toolRegistry.capabilityIndex.keys()).slice(0, 10).join(', ')}...`);
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
   * Generate human-readable display name from tool name
   */
  private generateDisplayName(toolName: string): string {
    return toolName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Infer category from tool name and description
   */
  private inferCategory(toolName: string, description?: string): string {
    const text = `${toolName} ${description || ''}`.toLowerCase();

    if (text.includes('email') || text.includes('gmail') || text.includes('mail') || text.includes('outlook')) {
      return 'email';
    }
    if (text.includes('calendar') || text.includes('event') || text.includes('meeting') || text.includes('schedule')) {
      return 'calendar';
    }
    if (text.includes('trello') || text.includes('jira') || text.includes('notion') || text.includes('task') || text.includes('project') || text.includes('board') || text.includes('card')) {
      return 'project';
    }
    if (text.includes('slack') || text.includes('teams') || text.includes('discord') || text.includes('message') || text.includes('chat')) {
      return 'communication';
    }
    if (text.includes('doc') || text.includes('note') || text.includes('wiki') || text.includes('confluence') || text.includes('page')) {
      return 'docs';
    }

    return 'general';
  }

  /**
   * Infer semantic capabilities from tool name and description
   */
  private inferCapabilities(toolName: string, description?: string): ToolCapability[] {
    const text = `${toolName} ${description || ''}`.toLowerCase();
    const capabilities: ToolCapability[] = [];

    // Email capabilities
    if (text.includes('email') || text.includes('gmail') || text.includes('mail') || text.includes('outlook')) {
      const provider = this.inferProvider(text, ['gmail', 'outlook']);
      if (text.includes('send') || text.includes('compose') || text.includes('reply')) {
        capabilities.push({ category: 'email', action: 'create', provider });
      }
      if (text.includes('find') || text.includes('get') || text.includes('read') || text.includes('fetch')) {
        capabilities.push({ category: 'email', action: 'read', provider });
      }
      if (text.includes('search')) {
        capabilities.push({ category: 'email', action: 'search', provider });
      }
    }

    // Calendar capabilities
    if (text.includes('calendar') || text.includes('event') || text.includes('meeting') || text.includes('schedule')) {
      const provider = this.inferProvider(text, ['google', 'gcal', 'calendar']);
      if (text.includes('create') || text.includes('add') || text.includes('schedule') || text.includes('quick')) {
        capabilities.push({ category: 'calendar', action: 'create', provider });
      }
      if (text.includes('find') || text.includes('get') || text.includes('list')) {
        capabilities.push({ category: 'calendar', action: 'read', provider });
      }
      if (text.includes('update') || text.includes('modify')) {
        capabilities.push({ category: 'calendar', action: 'update', provider });
      }
    }

    // Project management capabilities
    if (text.includes('board') || text.includes('card') || text.includes('ticket') || text.includes('task') || text.includes('project')) {
      const provider = this.inferProvider(text, ['trello', 'jira', 'asana', 'notion']);
      if (text.includes('create') || text.includes('add')) {
        capabilities.push({ category: 'project', action: 'create', provider });
      }
      if (text.includes('get') || text.includes('list') || text.includes('find')) {
        capabilities.push({ category: 'project', action: 'read', provider });
      }
      if (text.includes('update') || text.includes('move')) {
        capabilities.push({ category: 'project', action: 'update', provider });
      }
    }

    // Documentation capabilities
    if (text.includes('doc') || text.includes('page') || text.includes('note')) {
      const provider = this.inferProvider(text, ['notion', 'google', 'docs']);
      if (text.includes('create') || text.includes('new')) {
        capabilities.push({ category: 'docs', action: 'create', provider });
      }
      if (text.includes('get') || text.includes('read') || text.includes('retrieve')) {
        capabilities.push({ category: 'docs', action: 'read', provider });
      }
      if (text.includes('update') || text.includes('edit')) {
        capabilities.push({ category: 'docs', action: 'update', provider });
      }
      if (text.includes('search')) {
        capabilities.push({ category: 'docs', action: 'search', provider });
      }
    }

    // Communication capabilities
    if (text.includes('message') || text.includes('chat') || text.includes('slack')) {
      const provider = this.inferProvider(text, ['slack', 'discord', 'teams']);
      if (text.includes('send') || text.includes('post')) {
        capabilities.push({ category: 'communication', action: 'create', provider });
      }
      if (text.includes('get') || text.includes('read') || text.includes('fetch')) {
        capabilities.push({ category: 'communication', action: 'read', provider });
      }
      if (text.includes('search')) {
        capabilities.push({ category: 'communication', action: 'search', provider });
      }
    }

    // If no specific capabilities found, infer from general action words
    if (capabilities.length === 0) {
      const category = this.inferCategory(toolName, description) as ToolCapability['category'];
      if (text.includes('send') || text.includes('create') || text.includes('add') || text.includes('new')) {
        capabilities.push({ category, action: 'create' });
      }
      if (text.includes('get') || text.includes('find') || text.includes('read') || text.includes('list') || text.includes('fetch')) {
        capabilities.push({ category, action: 'read' });
      }
      if (text.includes('search')) {
        capabilities.push({ category, action: 'search' });
      }
      if (text.includes('update') || text.includes('edit') || text.includes('modify')) {
        capabilities.push({ category, action: 'update' });
      }
      if (text.includes('delete') || text.includes('remove')) {
        capabilities.push({ category, action: 'delete' });
      }
    }

    return capabilities.length > 0 ? capabilities : [{ category: 'general' as any, action: 'read' }];
  }

  /**
   * Infer provider from text
   */
  private inferProvider(text: string, possibleProviders: string[]): string | undefined {
    for (const provider of possibleProviders) {
      if (text.includes(provider)) {
        return provider;
      }
    }
    return undefined;
  }

  /**
   * Calculate tool priority based on various factors
   */
  private calculatePriority(serverName: string, toolName: string, description?: string): number {
    let priority = 50; // Base priority

    // Boost priority for well-known server names
    const serverLower = serverName.toLowerCase();
    if (serverLower.includes('gmail') || serverLower.includes('google')) priority += 20;
    if (serverLower.includes('outlook') || serverLower.includes('microsoft')) priority += 15;
    if (serverLower.includes('trello')) priority += 15;
    if (serverLower.includes('notion')) priority += 15;
    if (serverLower.includes('slack')) priority += 15;

    // Boost for descriptive tools
    if (description && description.length > 20) priority += 10;

    // Boost for clear action names
    const toolLower = toolName.toLowerCase();
    if (toolLower.includes('send') || toolLower.includes('create') || toolLower.includes('find')) priority += 5;

    return priority;
  }

  /**
   * Get capability key for indexing
   */
  private getCapabilityKey(capability: ToolCapability): string {
    const provider = capability.provider ? `.${capability.provider}` : '';
    return `${capability.category}.${capability.action}${provider}`;
  }

  /**
   * Find tools by semantic capability
   */
  async findToolsByCapability(
    category: ToolCapability['category'],
    action: ToolCapability['action'],
    provider?: string
  ): Promise<ToolResolution> {
    await this.discoverAllTools();

    // Try with specific provider first
    if (provider) {
      const specificKey = `${category}.${action}.${provider}`;
      const specificTools = this.toolRegistry.capabilityIndex.get(specificKey) || [];
      if (specificTools.length > 0) {
        return {
          primary: specificTools[0],
          alternatives: specificTools.slice(1)
        };
      }
    }

    // Fall back to general capability
    const generalKey = `${category}.${action}`;
    const generalTools = this.toolRegistry.capabilityIndex.get(generalKey) || [];

    return {
      primary: generalTools[0] || null,
      alternatives: generalTools.slice(1)
    };
  }

  /**
   * Find tool by exact name (with fallback strategies)
   */
  async findToolByName(toolName: string): Promise<DiscoveredTool | null> {
    await this.discoverAllTools();

    // Try exact match first
    if (this.toolRegistry.tools.has(toolName)) {
      return this.toolRegistry.tools.get(toolName)!;
    }

    // Try partial matches
    for (const [fullName, tool] of this.toolRegistry.tools) {
      if (fullName.endsWith(`.${toolName}`) || tool.name === toolName) {
        return tool;
      }
    }

    // Try fuzzy matching on display name
    const normalizedSearch = toolName.toLowerCase().replace(/[_\s]/g, '');
    for (const tool of this.toolRegistry.tools.values()) {
      const normalizedTool = tool.name.toLowerCase().replace(/[_\s]/g, '');
      if (normalizedTool.includes(normalizedSearch) || normalizedSearch.includes(normalizedTool)) {
        return tool;
      }
    }

    return null;
  }

  /**
   * Get all discovered tools
   */
  async getAllDiscoveredTools(): Promise<DiscoveredTool[]> {
    await this.discoverAllTools();
    return Array.from(this.toolRegistry.tools.values());
  }

  /**
   * Get tools by category
   */
  async getToolsByCategory(category: ToolCapability['category']): Promise<DiscoveredTool[]> {
    await this.discoverAllTools();
    return this.toolRegistry.categories.get(category) || [];
  }

  /**
   * Get all tools as array for Claude API
   */
  async getAllToolsForClaudeAPI(): Promise<DiscoveredTool[]> {
    await this.discoverAllTools();
    return Array.from(this.toolRegistry.tools.values());
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
    return await this.discoverAllTools(true);
  }

  /**
   * Clear discovery cache
   */
  clearCache(): void {
    this.toolRegistry.tools.clear();
    this.toolRegistry.categories.clear();
    this.toolRegistry.capabilityIndex.clear();
    this.toolRegistry.lastDiscovery = 0;
    this.toolRegistry.totalTools = 0;
  }

  /**
   * Get discovery statistics
   */
  async getDiscoveryStats(): Promise<{
    totalTools: number;
    categories: Record<string, number>;
    servers: string[];
    capabilities: string[];
  }> {
    await this.discoverAllTools();

    const categories: Record<string, number> = {};
    const servers = new Set<string>();

    for (const tool of this.toolRegistry.tools.values()) {
      servers.add(tool.serverName);
      categories[tool.category] = (categories[tool.category] || 0) + 1;
    }

    return {
      totalTools: this.toolRegistry.totalTools,
      categories,
      servers: Array.from(servers),
      capabilities: Array.from(this.toolRegistry.capabilityIndex.keys())
    };
  }

  /**
   * Resolve semantic tool request to actual tool
   * This is the main method that replaces hardcoded tool names
   */
  async resolveTool(request: {
    capability?: { category: ToolCapability['category']; action: ToolCapability['action']; provider?: string };
    toolName?: string;
    fallbackNames?: string[];
  }): Promise<DiscoveredTool | null> {
    // Try capability-based resolution first
    if (request.capability) {
      const resolution = await this.findToolsByCapability(
        request.capability.category,
        request.capability.action,
        request.capability.provider
      );
      if (resolution.primary) {
        return resolution.primary;
      }
    }

    // Try exact tool name
    if (request.toolName) {
      const tool = await this.findToolByName(request.toolName);
      if (tool) return tool;
    }

    // Try fallback names
    if (request.fallbackNames) {
      for (const fallbackName of request.fallbackNames) {
        const tool = await this.findToolByName(fallbackName);
        if (tool) return tool;
      }
    }

    return null;
  }
}