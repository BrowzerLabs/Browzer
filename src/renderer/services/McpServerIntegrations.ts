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

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.router = new McpRouter(mcpManager);
    this.initializeIntegrations();
  }

  /**
   * Initialize all target MCP server integrations
   */
  private initializeIntegrations(): void {
    console.log('[McpServerIntegrations] Initializing target MCP server integrations...');

    const integrations: ServerIntegration[] = [
      this.createGmailIntegration(),
      this.createGoogleCalendarIntegration(),
      this.createTrelloIntegration(),
      this.createNotionIntegration(),
      this.createGoogleDocsIntegration(),
      this.createOutlookIntegration(),
      this.createSlackIntegration()
    ];

    integrations.forEach(integration => {
      this.integrations.set(integration.serverId, integration);
      console.log(`[McpServerIntegrations] Registered ${integration.displayName} integration`);
    });

    console.log(`[McpServerIntegrations] Initialized ${integrations.length} MCP server integrations`);
  }

  /**
   * Gmail MCP Server Integration (already working)
   */
  private createGmailIntegration(): ServerIntegration {
    return {
      serverId: 'gmail',
      serverName: 'zap2.gmail',
      displayName: 'Gmail',
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
          toolId: 'gmail_find_email',
          toolName: 'zap2.gmail_find_email',
          displayName: 'Find Emails',
          description: 'Search and retrieve emails from Gmail inbox',
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
          toolId: 'gmail_send_email',
          toolName: 'zap2.gmail_send_email',
          displayName: 'Send Email',
          description: 'Send email via Gmail',
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
      connectionStatus: 'connected'
    };
  }

  /**
   * Google Calendar MCP Server Integration
   */
  private createGoogleCalendarIntegration(): ServerIntegration {
    return {
      serverId: 'gcal',
      serverName: 'zap2.google_calendar',
      displayName: 'Google Calendar',
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
          toolId: 'calendar_find_events',
          toolName: 'zap2.google_calendar_find_events',
          displayName: 'Find Calendar Events',
          description: 'Search for events in Google Calendar',
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
          toolId: 'calendar_quick_add_event',
          toolName: 'zap2.google_calendar_quick_add_event',
          displayName: 'Quick Add Event',
          description: 'Quickly add event to Google Calendar',
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
          toolId: 'calendar_create_event',
          toolName: 'zap2.google_calendar_create_event',
          displayName: 'Create Detailed Event',
          description: 'Create detailed event with all properties',
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
   * Trello MCP Server Integration
   */
  private createTrelloIntegration(): ServerIntegration {
    return {
      serverId: 'trello',
      serverName: 'trello',
      displayName: 'Trello',
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
          toolId: 'trello_get_boards',
          toolName: 'trello.get_boards',
          displayName: 'Get Boards',
          description: 'Retrieve Trello boards',
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
          toolId: 'trello_get_board_cards',
          toolName: 'trello.get_board_cards',
          displayName: 'Get Board Cards',
          description: 'Get all cards from a Trello board',
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
          toolId: 'trello_create_card',
          toolName: 'trello.create_card',
          displayName: 'Create Card',
          description: 'Create new card in Trello',
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
   * Notion MCP Server Integration
   */
  private createNotionIntegration(): ServerIntegration {
    return {
      serverId: 'notion',
      serverName: 'notion',
      displayName: 'Notion',
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
          toolId: 'notion_search_pages',
          toolName: 'notion.search_pages',
          displayName: 'Search Pages',
          description: 'Search pages and databases in Notion',
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
          toolId: 'notion_create_page',
          toolName: 'notion.create_page',
          displayName: 'Create Page',
          description: 'Create new page in Notion',
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
          toolId: 'notion_update_page',
          toolName: 'notion.update_page',
          displayName: 'Update Page',
          description: 'Update existing Notion page',
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
   * Google Docs MCP Server Integration
   */
  private createGoogleDocsIntegration(): ServerIntegration {
    return {
      serverId: 'gdocs',
      serverName: 'zap2.google_docs',
      displayName: 'Google Docs',
      category: 'docs',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: false,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
        supportsAuth: true,
        supportsBatch: false,
        rateLimit: 100
      },
      tools: [
        {
          toolId: 'docs_create_document',
          toolName: 'zap2.google_docs_create_document',
          displayName: 'Create Document',
          description: 'Create new Google Doc',
          category: 'create',
          parameters: [
            {
              name: 'title',
              type: 'string',
              required: true,
              description: 'Document title'
            },
            {
              name: 'content',
              type: 'string',
              required: false,
              description: 'Initial document content'
            }
          ],
          examples: [
            'create meeting agenda document',
            'create project specification doc'
          ],
          rateLimitWeight: 3
        },
        {
          toolId: 'docs_get_document',
          toolName: 'zap2.google_docs_get_document',
          displayName: 'Get Document',
          description: 'Retrieve Google Doc content',
          category: 'read',
          parameters: [
            {
              name: 'documentId',
              type: 'string',
              required: true,
              description: 'Google Doc ID'
            }
          ],
          examples: [
            'read content from shared document',
            'get text from meeting notes doc'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'docs_update_document',
          toolName: 'zap2.google_docs_update_document',
          displayName: 'Update Document',
          description: 'Update Google Doc content',
          category: 'update',
          parameters: [
            {
              name: 'documentId',
              type: 'string',
              required: true,
              description: 'Google Doc ID'
            },
            {
              name: 'requests',
              type: 'array',
              required: true,
              description: 'Batch update requests'
            }
          ],
          examples: [
            'add text to end of document',
            'replace section in shared doc'
          ],
          rateLimitWeight: 4
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Outlook MCP Server Integration
   */
  private createOutlookIntegration(): ServerIntegration {
    return {
      serverId: 'outlook',
      serverName: 'zap2.outlook',
      displayName: 'Outlook',
      category: 'email',
      capabilities: {
        canRead: true,
        canWrite: true,
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
        supportsAuth: true,
        supportsBatch: false,
        rateLimit: 100
      },
      tools: [
        {
          toolId: 'outlook_find_email',
          toolName: 'zap2.outlook_find_email',
          displayName: 'Find Emails',
          description: 'Search emails in Outlook',
          category: 'read',
          parameters: [
            {
              name: 'searchQuery',
              type: 'string',
              required: false,
              description: 'Outlook search query'
            },
            {
              name: 'folder',
              type: 'string',
              required: false,
              description: 'Email folder (inbox, sent, etc.)',
              defaultValue: 'inbox'
            },
            {
              name: 'maxResults',
              type: 'number',
              required: false,
              description: 'Maximum emails to return',
              defaultValue: 10
            }
          ],
          examples: [
            'get latest Outlook emails',
            'search for emails from manager',
            'find emails with "urgent" in subject'
          ],
          rateLimitWeight: 2
        },
        {
          toolId: 'outlook_send_email',
          toolName: 'zap2.outlook_send_email',
          displayName: 'Send Email',
          description: 'Send email via Outlook',
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
            },
            {
              name: 'importance',
              type: 'string',
              required: false,
              description: 'Email importance (low, normal, high)',
              defaultValue: 'normal'
            }
          ],
          examples: [
            'send high priority email to team',
            'reply to latest Outlook email'
          ],
          rateLimitWeight: 5
        }
      ],
      connectionStatus: 'disconnected'
    };
  }

  /**
   * Enhanced Slack MCP Server Integration
   */
  private createSlackIntegration(): ServerIntegration {
    return {
      serverId: 'slack',
      serverName: 'slack',
      displayName: 'Slack',
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
          toolId: 'slack_send_message',
          toolName: 'slack.send_message',
          displayName: 'Send Message',
          description: 'Send message to Slack channel',
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
          toolId: 'slack_get_messages',
          toolName: 'slack.get_messages',
          displayName: 'Get Messages',
          description: 'Retrieve messages from Slack channel',
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
          toolId: 'slack_search_messages',
          toolName: 'slack.search_messages',
          displayName: 'Search Messages',
          description: 'Search messages across Slack workspace',
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
   * Find tool by name across all servers
   */
  findTool(toolName: string): { integration: ServerIntegration, tool: ServerTool } | null {
    for (const integration of this.integrations.values()) {
      const tool = integration.tools.find(t => t.toolName === toolName || t.toolId === toolName);
      if (tool) {
        return { integration, tool };
      }
    }
    return null;
  }

  /**
   * Get optimized parameters for a specific tool
   */
  getOptimizedParameters(toolName: string, query: string): Record<string, any> {
    const toolInfo = this.findTool(toolName);
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