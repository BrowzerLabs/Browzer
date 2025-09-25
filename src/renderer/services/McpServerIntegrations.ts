/**
 * MCP Server Integrations
 *
 * Complete "Get It Done" Mode ecosystem with all target MCP servers:
 * - Gmail (already integrated)
 * - Google Calendar (GCal) MCP server integration
 * - Trello MCP server integration and board/card operations
 * - Notion MCP server integration for pages/databases
 * - Google Docs (GDocs) MCP server integration
 * - Outlook MCP server integration
 * - Slack MCP server integration (enhanced version)
 * - Tool-specific parameter optimization for each MCP server
 *
 * Target MCP Server Integration
 */

import { McpClientManager } from './McpClientManager';
import { McpRouter } from './McpRouter';
import { McpToolDiscoveryService, ToolCapability } from './McpToolDiscoveryService';

export interface ServerCapabilities {
  canRead: boolean;
  canWrite: boolean;
  canSearch: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  supportsAuth: boolean;
  supportsBatch: boolean;
  rateLimit: number; // requests per minute
}

export interface ServerIntegration {
  serverId: string;
  serverName: string;
  displayName: string;
  category: 'email' | 'calendar' | 'project' | 'docs' | 'communication';
  capabilities: ServerCapabilities;
  tools: ServerTool[];
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastConnected?: Date;
  errorMessage?: string;
}

export interface ServerTool {
  toolId: string;
  toolName: string;
  displayName: string;
  description: string;
  category: 'read' | 'write' | 'search' | 'create' | 'update' | 'delete';
  parameters: ToolParameter[];
  examples: string[];
  rateLimitWeight: number;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: string; // regex pattern
}

export class McpServerIntegrations {
  private integrations: Map<string, ServerIntegration> = new Map();
  private mcpManager: McpClientManager;
  private router: McpRouter;
  private discoveryService: McpToolDiscoveryService;

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.router = new McpRouter(mcpManager);
    this.discoveryService = new McpToolDiscoveryService(mcpManager);
    this.initializeIntegrations();
  }

  /**
   * Initialize capability-based server integrations using dynamic discovery
   */
  private initializeIntegrations(): void {
    console.log('[McpServerIntegrations] Initializing capability-based server integrations...');

    // Define capability templates that can be dynamically matched to discovered tools
    const capabilityTemplates = this.createCapabilityTemplates();

    capabilityTemplates.forEach(template => {
      this.integrations.set(template.serverId, template);
      console.log(`[McpServerIntegrations] Registered ${template.displayName} capability template`);
    });

    console.log(`[McpServerIntegrations] Initialized ${capabilityTemplates.length} capability templates`);

    // Trigger dynamic tool discovery
    this.refreshDynamicIntegrations();
  }

  /**
   * Create capability templates for dynamic tool discovery
   */
  private createCapabilityTemplates(): ServerIntegration[] {
    return [
      this.createEmailCapabilityTemplate(),
      this.createCalendarCapabilityTemplate(),
      this.createProjectCapabilityTemplate(),
      this.createDocsCapabilityTemplate(),
      this.createCommunicationCapabilityTemplate()
    ];
  }

  /**
   * Email capability template (Gmail, Outlook, etc.)
   */
  private createEmailCapabilityTemplate(): ServerIntegration {
    return {
      serverId: 'email',
      serverName: 'email_capability',
      displayName: 'Email Services',
      category: 'email',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: true,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
        supportsAuth: true,
        supportsBatch: false,
        rateLimit: 100
      },
      tools: [
        {
          toolId: 'find_email',
          toolName: '@capability:email.read',
          displayName: 'Find Emails',
          description: 'Search and retrieve emails from any connected email service',
          category: 'read',
          parameters: [
            {
              name: 'searchQuery',
              type: 'string',
              required: false,
              description: 'Gmail search query (default: in:inbox)',
              defaultValue: 'in:inbox'
            },
            {
              name: 'maxResults',
              type: 'number',
              required: false,
              description: 'Maximum number of emails to return',
              defaultValue: 10
            }
          ],
          examples: [
            'get 5 latest emails',
            'find emails from john@example.com',
            'search for emails with subject "meeting"'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'send_email',
          toolName: '@capability:email.create',
          displayName: 'Send Email',
          description: 'Send email via any connected email service',
          category: 'create',
          parameters: [
            {
              name: 'to',
              type: 'string',
              required: true,
              description: 'Recipient email address'
            },
            {
              name: 'subject',
              type: 'string',
              required: true,
              description: 'Email subject'
            },
            {
              name: 'body',
              type: 'string',
              required: true,
              description: 'Email content'
            }
          ],
          examples: [
            'send email to john@example.com with subject "Meeting Request"',
            'reply to latest email with confirmation'
          ],
          rateLimitWeight: 5
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Calendar capability template (Google Calendar, Outlook Calendar, etc.)
   */
  private createCalendarCapabilityTemplate(): ServerIntegration {
    return {
      serverId: 'calendar',
      serverName: 'calendar_capability',
      displayName: 'Calendar Services',
      category: 'calendar',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        supportsAuth: true,
        supportsBatch: false,
        rateLimit: 1000
      },
      tools: [
        {
          toolId: 'find_events',
          toolName: '@capability:calendar.read',
          displayName: 'Find Calendar Events',
          description: 'Search for events in any connected calendar service',
          category: 'read',
          parameters: [
            {
              name: 'timeMin',
              type: 'string',
              required: false,
              description: 'Start time for search (ISO 8601)',
              defaultValue: new Date().toISOString()
            },
            {
              name: 'timeMax',
              type: 'string',
              required: false,
              description: 'End time for search (ISO 8601)'
            },
            {
              name: 'calendarId',
              type: 'string',
              required: false,
              description: 'Calendar ID (default: primary)',
              defaultValue: 'primary'
            }
          ],
          examples: [
            'check today\'s calendar events',
            'find meetings this week',
            'search for events with "standup" in title'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'quick_add_event',
          toolName: '@capability:calendar.create.quick',
          displayName: 'Quick Add Event',
          description: 'Quickly add event to any connected calendar service',
          category: 'create',
          parameters: [
            {
              name: 'text',
              type: 'string',
              required: true,
              description: 'Natural language event description'
            },
            {
              name: 'calendarId',
              type: 'string',
              required: false,
              description: 'Calendar ID (default: primary)',
              defaultValue: 'primary'
            }
          ],
          examples: [
            'schedule meeting tomorrow at 2pm',
            'add reminder to call client at 3pm Friday',
            'book conference room for team standup Monday 9am'
          ],
          rateLimitWeight: 3
        },
        {
          toolId: 'create_event',
          toolName: '@capability:calendar.create',
          displayName: 'Create Detailed Event',
          description: 'Create detailed event with all properties in any connected calendar service',
          category: 'create',
          parameters: [
            {
              name: 'summary',
              type: 'string',
              required: true,
              description: 'Event title'
            },
            {
              name: 'startDateTime',
              type: 'string',
              required: true,
              description: 'Event start time (ISO 8601)'
            },
            {
              name: 'endDateTime',
              type: 'string',
              required: true,
              description: 'Event end time (ISO 8601)'
            },
            {
              name: 'attendees',
              type: 'array',
              required: false,
              description: 'List of attendee email addresses'
            },
            {
              name: 'location',
              type: 'string',
              required: false,
              description: 'Event location'
            }
          ],
          examples: [
            'create detailed meeting with attendees and location',
            'schedule recurring weekly team meeting'
          ],
          rateLimitWeight: 4
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Project management capability template (Trello, Asana, etc.)
   */
  private createProjectCapabilityTemplate(): ServerIntegration {
    return {
      serverId: 'project',
      serverName: 'project_capability',
      displayName: 'Project Management',
      category: 'project',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        supportsAuth: true,
        supportsBatch: true,
        rateLimit: 100
      },
      tools: [
        {
          toolId: 'get_boards',
          toolName: '@capability:project.read.boards',
          displayName: 'Get Boards',
          description: 'Retrieve boards from any connected project management service',
          category: 'read',
          parameters: [
            {
              name: 'filter',
              type: 'string',
              required: false,
              description: 'Filter boards (open, closed, all)',
              defaultValue: 'open'
            }
          ],
          examples: [
            'list all my Trello boards',
            'find board named "Project Alpha"'
          ],
          rateLimitWeight: 1
        },
        {
          toolId: 'get_board_cards',
          toolName: '@capability:project.read.cards',
          displayName: 'Get Board Cards',
          description: 'Get all cards from a project board',
          category: 'read',
          parameters: [
            {
              name: 'boardId',
              type: 'string',
              required: true,
              description: 'Trello board ID'
            },
            {
              name: 'filter',
              type: 'string',
              required: false,
              description: 'Filter cards (open, closed, all)',
              defaultValue: 'open'
            }
          ],
          examples: [
            'get all cards from project board',
            'list open tickets from board XYZ'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'create_card',
          toolName: '@capability:project.create.card',
          displayName: 'Create Card',
          description: 'Create new card in any connected project management service',
          category: 'create',
          parameters: [
            {
              name: 'name',
              type: 'string',
              required: true,
              description: 'Card title'
            },
            {
              name: 'listId',
              type: 'string',
              required: true,
              description: 'Trello list ID where card should be created'
            },
            {
              name: 'desc',
              type: 'string',
              required: false,
              description: 'Card description'
            },
            {
              name: 'due',
              type: 'string',
              required: false,
              description: 'Due date (ISO 8601)'
            }
          ],
          examples: [
            'create card "Fix login bug" in backlog',
            'add task "Review PR #123" to doing list'
          ],
          rateLimitWeight: 3
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Document capability template (Notion, Google Docs, etc.)
   */
  private createDocsCapabilityTemplate(): ServerIntegration {
    return {
      serverId: 'docs',
      serverName: 'docs_capability',
      displayName: 'Document Services',
      category: 'docs',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
        supportsAuth: true,
        supportsBatch: false,
        rateLimit: 50
      },
      tools: [
        {
          toolId: 'search_pages',
          toolName: '@capability:docs.search',
          displayName: 'Search Pages',
          description: 'Search pages and documents in any connected document service',
          category: 'search',
          parameters: [
            {
              name: 'query',
              type: 'string',
              required: false,
              description: 'Search query text'
            },
            {
              name: 'filter',
              type: 'object',
              required: false,
              description: 'Search filter options'
            }
          ],
          examples: [
            'search for pages containing "meeting notes"',
            'find database with name "Projects"'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'create_page',
          toolName: '@capability:docs.create',
          displayName: 'Create Page',
          description: 'Create new page/document in any connected document service',
          category: 'create',
          parameters: [
            {
              name: 'parent',
              type: 'object',
              required: true,
              description: 'Parent page or database'
            },
            {
              name: 'properties',
              type: 'object',
              required: true,
              description: 'Page properties (title, etc.)'
            },
            {
              name: 'children',
              type: 'array',
              required: false,
              description: 'Page content blocks'
            }
          ],
          examples: [
            'create meeting notes page',
            'add new project page to database'
          ],
          rateLimitWeight: 4
        },
        {
          toolId: 'update_page',
          toolName: '@capability:docs.update',
          displayName: 'Update Page',
          description: 'Update existing page/document in any connected document service',
          category: 'update',
          parameters: [
            {
              name: 'pageId',
              type: 'string',
              required: true,
              description: 'Notion page ID'
            },
            {
              name: 'properties',
              type: 'object',
              required: false,
              description: 'Updated page properties'
            }
          ],
          examples: [
            'update project status to completed',
            'add tags to existing page'
          ],
          rateLimitWeight: 3
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Communication capability template (Slack, Discord, etc.)
   */
  private createCommunicationCapabilityTemplate(): ServerIntegration {
    return {
      serverId: 'communication',
      serverName: 'communication_capability',
      displayName: 'Communication Services',
      category: 'communication',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
        supportsAuth: true,
        supportsBatch: false,
        rateLimit: 50
      },
      tools: [
        {
          toolId: 'send_message',
          toolName: '@capability:communication.create',
          displayName: 'Send Message',
          description: 'Send message to any connected communication platform',
          category: 'create',
          parameters: [
            {
              name: 'channel',
              type: 'string',
              required: true,
              description: 'Slack channel ID or name'
            },
            {
              name: 'text',
              type: 'string',
              required: true,
              description: 'Message text'
            },
            {
              name: 'thread_ts',
              type: 'string',
              required: false,
              description: 'Thread timestamp for replies'
            }
          ],
          examples: [
            'send message to #general channel',
            'reply to thread in #development',
            'notify team about deployment'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'get_messages',
          toolName: '@capability:communication.read',
          displayName: 'Get Messages',
          description: 'Retrieve messages from any connected communication platform',
          category: 'read',
          parameters: [
            {
              name: 'channel',
              type: 'string',
              required: true,
              description: 'Slack channel ID or name'
            },
            {
              name: 'count',
              type: 'number',
              required: false,
              description: 'Number of messages to retrieve',
              defaultValue: 20
            },
            {
              name: 'latest',
              type: 'string',
              required: false,
              description: 'Latest message timestamp'
            }
          ],
          examples: [
            'get latest messages from #general',
            'read conversation history from #project-alpha',
            'check for mentions in #development'
          ],
          rateLimitWeight: 1
        },
        {
          toolId: 'search_messages',
          toolName: '@capability:communication.search',
          displayName: 'Search Messages',
          description: 'Search messages across any connected communication platform',
          category: 'search',
          parameters: [
            {
              name: 'query',
              type: 'string',
              required: true,
              description: 'Search query'
            },
            {
              name: 'sort',
              type: 'string',
              required: false,
              description: 'Sort order (timestamp, score)',
              defaultValue: 'timestamp'
            },
            {
              name: 'count',
              type: 'number',
              required: false,
              description: 'Number of results',
              defaultValue: 20
            }
          ],
          examples: [
            'search for messages about "deployment"',
            'find messages from user @john',
            'search for files shared last week'
          ],
          rateLimitWeight: 3
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Refresh dynamic integrations by discovering actual connected tools
   */
  async refreshDynamicIntegrations(): Promise<void> {
    console.log('[McpServerIntegrations] Refreshing dynamic integrations...');

    try {
      // Discover all available tools from connected servers
      const discoveredTools = await this.discoveryService.getAllDiscoveredTools();
      console.log(`[McpServerIntegrations] Discovered ${discoveredTools.length} tools from connected servers`);

      // Update connection status based on discovered tools
      this.updateConnectionStatusFromDiscovery(discoveredTools);

      console.log('[McpServerIntegrations] Dynamic integrations refreshed successfully');
    } catch (error) {
      console.error('[McpServerIntegrations] Failed to refresh dynamic integrations:', error);
    }
  }

  /**
   * Update connection status based on discovered tools
   */
  private updateConnectionStatusFromDiscovery(discoveredTools: any[]): void {
    // Reset all integrations to disconnected
    this.integrations.forEach(integration => {
      integration.connectionStatus = 'disconnected';
    });

    // Mark integrations as connected if we have matching tools
    discoveredTools.forEach(tool => {
      // Determine which capability this tool matches
      const capability = this.mapToolToCapability(tool);
      if (capability) {
        const integration = this.integrations.get(capability);
        if (integration) {
          integration.connectionStatus = 'connected';
          integration.lastConnected = new Date();
        }
      }
    });
  }

  /**
   * Map discovered tool to capability category
   */
  private mapToolToCapability(tool: any): string | null {
    const toolName = tool.name?.toLowerCase() || '';
    const serverName = tool.serverName?.toLowerCase() || '';

    // Email services
    if (toolName.includes('email') || toolName.includes('gmail') || toolName.includes('outlook') ||
        serverName.includes('gmail') || serverName.includes('outlook')) {
      return 'email';
    }

    // Calendar services
    if (toolName.includes('calendar') || toolName.includes('event') ||
        serverName.includes('calendar') || serverName.includes('gcal')) {
      return 'calendar';
    }

    // Project management
    if (toolName.includes('board') || toolName.includes('card') || toolName.includes('trello') ||
        serverName.includes('trello') || serverName.includes('asana')) {
      return 'project';
    }

    // Documents
    if (toolName.includes('doc') || toolName.includes('page') || toolName.includes('notion') ||
        serverName.includes('docs') || serverName.includes('notion')) {
      return 'docs';
    }

    // Communication
    if (toolName.includes('message') || toolName.includes('slack') || toolName.includes('chat') ||
        serverName.includes('slack') || serverName.includes('discord')) {
      return 'communication';
    }

    return null;
  }

  /**
   * Resolve capability tool name to actual discovered tool
   */
  async resolveCapabilityTool(capabilityToolName: string): Promise<string | null> {
    if (!capabilityToolName.startsWith('@capability:')) {
      return capabilityToolName; // Not a capability identifier
    }

    const capabilityPath = capabilityToolName.replace('@capability:', '');
    const [category, action, provider] = capabilityPath.split('.');

    try {
      const capability: ToolCapability = { category: category as any, action: action as any, provider };
      const tool = await this.discoveryService.resolveTool({ capability });
      return tool?.fullName || null;
    } catch (error) {
      console.error(`[McpServerIntegrations] Failed to resolve capability tool ${capabilityToolName}:`, error);
      return null;
    }
  }

  /**
   * Get all registered server integrations
   */
  getAllIntegrations(): ServerIntegration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get integration by server ID
   */
  getIntegration(serverId: string): ServerIntegration | null {
    return this.integrations.get(serverId) || null;
  }

  /**
   * Get integrations by category
   */
  getIntegrationsByCategory(category: ServerIntegration['category']): ServerIntegration[] {
    return Array.from(this.integrations.values()).filter(integration => integration.category === category);
  }

  /**
   * Get connected integrations
   */
  getConnectedIntegrations(): ServerIntegration[] {
    return Array.from(this.integrations.values()).filter(integration => integration.connectionStatus === 'connected');
  }

  /**
   * Update integration connection status
   */
  updateConnectionStatus(serverId: string, status: ServerIntegration['connectionStatus'], errorMessage?: string): void {
    const integration = this.integrations.get(serverId);
    if (integration) {
      integration.connectionStatus = status;
      integration.lastConnected = status === 'connected' ? new Date() : integration.lastConnected;
      integration.errorMessage = errorMessage;
      console.log(`[McpServerIntegrations] Updated ${integration.displayName} status: ${status}`);
    }
  }

  /**
   * Get all tools for a specific server
   */
  getServerTools(serverId: string): ServerTool[] {
    const integration = this.integrations.get(serverId);
    return integration?.tools || [];
  }

  /**
   * Find tool by name across all servers (with capability resolution)
   */
  async findTool(toolName: string): Promise<{ integration: ServerIntegration, tool: ServerTool } | null> {
    // First try direct match
    for (const integration of this.integrations.values()) {
      const tool = integration.tools.find(t => t.toolName === toolName || t.toolId === toolName);
      if (tool) {
        return { integration, tool };
      }
    }

    // If not found and it's a capability identifier, try to resolve it
    if (toolName.startsWith('@capability:')) {
      const resolvedName = await this.resolveCapabilityTool(toolName);
      if (resolvedName && resolvedName !== toolName) {
        // Recursively search with resolved name
        return this.findTool(resolvedName);
      }
    }

    return null;
  }

  /**
   * Get optimized parameters for a specific tool
   */
  async getOptimizedParameters(toolName: string, query: string): Promise<Record<string, any>> {
    const toolInfo = await this.findTool(toolName);
    if (!toolInfo) {
      return {};
    }

    const { integration, tool } = toolInfo;
    const optimized: Record<string, any> = {};

    // Apply server-specific optimizations
    switch (integration.serverId) {
      case 'gmail':
        return this.optimizeGmailParameters(tool, query);
      case 'gcal':
        return this.optimizeCalendarParameters(tool, query);
      case 'trello':
        return this.optimizeTrelloParameters(tool, query);
      case 'notion':
        return this.optimizeNotionParameters(tool, query);
      case 'gdocs':
        return this.optimizeGoogleDocsParameters(tool, query);
      case 'outlook':
        return this.optimizeOutlookParameters(tool, query);
      case 'slack':
        return this.optimizeSlackParameters(tool, query);
      default:
        // Apply default parameter values
        tool.parameters.forEach(param => {
          if (param.defaultValue !== undefined) {
            optimized[param.name] = param.defaultValue;
          }
        });
        return optimized;
    }
  }

  /**
   * Optimize Gmail-specific parameters
   */
  private optimizeGmailParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    if (tool.toolId === 'gmail_find_email') {
      // Extract search query from natural language
      const numberMatch = query.match(/(\d+)\s+emails?/);
      if (numberMatch) {
        params.maxResults = parseInt(numberMatch[1]);
      }

      // Extract sender information
      const fromMatch = query.match(/from\s+([^\s]+@[^\s]+)/i);
      if (fromMatch) {
        params.searchQuery = `from:${fromMatch[1]}`;
      } else {
        params.searchQuery = 'in:inbox';
      }

      // Extract subject information
      const subjectMatch = query.match(/subject[:\s]+["']([^"']+)["']/i);
      if (subjectMatch) {
        params.searchQuery = `subject:"${subjectMatch[1]}"`;
      }
    }

    return params;
  }

  /**
   * Optimize Calendar-specific parameters
   */
  private optimizeCalendarParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    if (tool.toolId === 'calendar_find_events') {
      // Set time range based on query
      const now = new Date();
      if (query.toLowerCase().includes('today')) {
        params.timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        params.timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      } else if (query.toLowerCase().includes('this week')) {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        params.timeMin = startOfWeek.toISOString();
      }
    }

    return params;
  }

  /**
   * Optimize Trello-specific parameters
   */
  private optimizeTrelloParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract board name from query
    const boardMatch = query.match(/board\s+["']?([^"'\s]+)["']?/i);
    if (boardMatch) {
      params.boardName = boardMatch[1];
    }

    // Extract list name from query
    const listMatch = query.match(/list\s+["']?([^"'\s]+)["']?/i);
    if (listMatch) {
      params.listName = listMatch[1];
    }

    return params;
  }

  /**
   * Optimize Notion-specific parameters
   */
  private optimizeNotionParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    if (tool.toolId === 'notion_search_pages') {
      // Extract search terms
      const searchMatch = query.match(/search\s+for\s+["']?([^"']+)["']?/i);
      if (searchMatch) {
        params.query = searchMatch[1];
      }
    }

    return params;
  }

  /**
   * Optimize Google Docs-specific parameters
   */
  private optimizeGoogleDocsParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    if (tool.toolId === 'docs_create_document') {
      // Extract title from query
      const titleMatch = query.match(/create\s+(?:document|doc)\s+["']?([^"']+)["']?/i);
      if (titleMatch) {
        params.title = titleMatch[1];
      }
    }

    return params;
  }

  /**
   * Optimize Outlook-specific parameters
   */
  private optimizeOutlookParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    // Similar to Gmail optimization but for Outlook
    if (tool.toolId === 'outlook_find_email') {
      const numberMatch = query.match(/(\d+)\s+emails?/);
      if (numberMatch) {
        params.maxResults = parseInt(numberMatch[1]);
      }

      const fromMatch = query.match(/from\s+([^\s]+@[^\s]+)/i);
      if (fromMatch) {
        params.searchQuery = `from:${fromMatch[1]}`;
      }
    }

    return params;
  }

  /**
   * Optimize Slack-specific parameters
   */
  private optimizeSlackParameters(tool: ServerTool, query: string): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract channel from query
    const channelMatch = query.match(/(?:channel\s+)?#([a-zA-Z0-9-_]+)/);
    if (channelMatch) {
      params.channel = `#${channelMatch[1]}`;
    }

    // Extract user mention
    const userMatch = query.match(/@([a-zA-Z0-9-_]+)/);
    if (userMatch) {
      params.user = userMatch[1];
    }

    return params;
  }

  /**
   * Get integration statistics
   */
  getIntegrationStats(): {
    total: number;
    connected: number;
    byCategory: Record<string, number>;
    totalTools: number;
  } {
    const integrations = Array.from(this.integrations.values());

    return {
      total: integrations.length,
      connected: integrations.filter(i => i.connectionStatus === 'connected').length,
      byCategory: integrations.reduce((acc, integration) => {
        acc[integration.category] = (acc[integration.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalTools: integrations.reduce((total, integration) => total + integration.tools.length, 0)
    };
  }
}