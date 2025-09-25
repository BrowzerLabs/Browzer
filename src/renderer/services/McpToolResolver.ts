import { McpToolDiscoveryService, DiscoveredTool, ToolCapability } from './McpToolDiscoveryService';
import { McpClientManager } from './McpClientManager';

/**
 * MCP Tool Resolver
 * dynamic tool discovery. This service resolves semantic tool requests to
 * actual user-configured MCP server tools.
 *
 * Acts as the replacement layer for all hardcoded tool name references.
 */
export class McpToolResolver {
  private discoveryService: McpToolDiscoveryService;
  private mcpManager: McpClientManager;

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.discoveryService = new McpToolDiscoveryService(mcpManager);
  }

  /**
   * Resolve Gmail send email functionality
   */
  async resolveGmailSendEmail(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'email', action: 'create', provider: 'gmail' },
      toolName: 'send_email',
      fallbackNames: ['gmail_send_email', 'send_email', 'compose_email', 'email_send']
    });
  }

  /**
   * Resolve Gmail find/read email functionality
   */
  async resolveGmailFindEmail(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'email', action: 'read', provider: 'gmail' },
      toolName: 'find_email',
      fallbackNames: ['gmail_find_email', 'find_email', 'get_email', 'read_email', 'list_emails']
    });
  }

  /**
   * Resolve Gmail reply functionality
   */
  async resolveGmailReply(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'email', action: 'create', provider: 'gmail' },
      toolName: 'reply_to_email',
      fallbackNames: ['gmail_reply_to_email', 'reply_to_email', 'email_reply', 'reply']
    });
  }

  /**
   * Resolve Outlook send email functionality
   */
  async resolveOutlookSendEmail(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'email', action: 'create', provider: 'outlook' },
      toolName: 'send_email',
      fallbackNames: ['outlook_send_email', 'send_email', 'compose_email']
    });
  }

  /**
   * Resolve Outlook find email functionality
   */
  async resolveOutlookFindEmail(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'email', action: 'read', provider: 'outlook' },
      toolName: 'find_email',
      fallbackNames: ['outlook_find_email', 'find_email', 'get_email', 'read_email']
    });
  }

  /**
   * Resolve Google Calendar find events functionality
   */
  async resolveCalendarFindEvents(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'calendar', action: 'read', provider: 'google' },
      toolName: 'find_events',
      fallbackNames: ['google_calendar_find_events', 'calendar_find_events', 'find_events', 'get_events', 'list_events']
    });
  }

  /**
   * Resolve Google Calendar quick add event functionality
   */
  async resolveCalendarQuickAddEvent(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'calendar', action: 'create', provider: 'google' },
      toolName: 'quick_add_event',
      fallbackNames: ['google_calendar_quick_add_event', 'calendar_quick_add_event', 'quick_add_event', 'add_event', 'create_event']
    });
  }

  /**
   * Resolve Google Calendar create event functionality
   */
  async resolveCalendarCreateEvent(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'calendar', action: 'create', provider: 'google' },
      toolName: 'create_event',
      fallbackNames: ['google_calendar_create_event', 'calendar_create_event', 'create_event', 'add_event']
    });
  }

  /**
   * Resolve Google Calendar update event functionality
   */
  async resolveCalendarUpdateEvent(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'calendar', action: 'update', provider: 'google' },
      toolName: 'update_event',
      fallbackNames: ['google_calendar_update_event', 'calendar_update_event', 'update_event', 'modify_event']
    });
  }

  /**
   * Resolve Google Docs create document functionality
   */
  async resolveDocsCreateDocument(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'docs', action: 'create', provider: 'google' },
      toolName: 'create_document',
      fallbackNames: ['google_docs_create_document', 'docs_create_document', 'create_document', 'new_document']
    });
  }

  /**
   * Resolve Google Docs get document functionality
   */
  async resolveDocsGetDocument(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'docs', action: 'read', provider: 'google' },
      toolName: 'get_document',
      fallbackNames: ['google_docs_get_document', 'docs_get_document', 'get_document', 'read_document']
    });
  }

  /**
   * Resolve Google Docs update document functionality
   */
  async resolveDocsUpdateDocument(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'docs', action: 'update', provider: 'google' },
      toolName: 'update_document',
      fallbackNames: ['google_docs_update_document', 'docs_update_document', 'update_document', 'edit_document']
    });
  }

  /**
   * Resolve Trello get boards functionality
   * Replaces: "trello.get_boards"
   */
  async resolveTrelloGetBoards(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'project', action: 'read', provider: 'trello' },
      toolName: 'get_boards',
      fallbackNames: ['trello_get_boards', 'get_boards', 'list_boards', 'find_boards']
    });
  }

  /**
   * Resolve Trello get board cards functionality
   * Replaces: "trello.get_board_cards"
   */
  async resolveTrelloGetBoardCards(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'project', action: 'read', provider: 'trello' },
      toolName: 'get_board_cards',
      fallbackNames: ['trello_get_board_cards', 'get_board_cards', 'list_cards', 'get_cards']
    });
  }

  /**
   * Resolve Trello create card functionality
   * Replaces: "trello.create_card"
   */
  async resolveTrelloCreateCard(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'project', action: 'create', provider: 'trello' },
      toolName: 'create_card',
      fallbackNames: ['trello_create_card', 'create_card', 'add_card', 'new_card']
    });
  }

  /**
   * Resolve Notion search pages functionality
   * Replaces: "notion.search_pages"
   */
  async resolveNotionSearchPages(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'docs', action: 'search', provider: 'notion' },
      toolName: 'search_pages',
      fallbackNames: ['notion_search_pages', 'search_pages', 'find_pages', 'search']
    });
  }

  /**
   * Resolve Notion create page functionality
   * Replaces: "notion.create_page"
   */
  async resolveNotionCreatePage(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'docs', action: 'create', provider: 'notion' },
      toolName: 'create_page',
      fallbackNames: ['notion_create_page', 'create_page', 'new_page', 'add_page']
    });
  }

  /**
   * Resolve Notion update page functionality
   * Replaces: "notion.update_page"
   */
  async resolveNotionUpdatePage(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'docs', action: 'update', provider: 'notion' },
      toolName: 'update_page',
      fallbackNames: ['notion_update_page', 'update_page', 'edit_page', 'modify_page']
    });
  }

  /**
   * Resolve Slack send message functionality
   * Replaces: "slack.send_message"
   */
  async resolveSlackSendMessage(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'communication', action: 'create', provider: 'slack' },
      toolName: 'send_message',
      fallbackNames: ['slack_send_message', 'send_message', 'post_message', 'message']
    });
  }

  /**
   * Resolve Slack get messages functionality
   * Replaces: "slack.get_messages"
   */
  async resolveSlackGetMessages(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'communication', action: 'read', provider: 'slack' },
      toolName: 'get_messages',
      fallbackNames: ['slack_get_messages', 'get_messages', 'list_messages', 'read_messages']
    });
  }

  /**
   * Resolve Slack search messages functionality
   * Replaces: "slack.search_messages"
   */
  async resolveSlackSearchMessages(): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category: 'communication', action: 'search', provider: 'slack' },
      toolName: 'search_messages',
      fallbackNames: ['slack_search_messages', 'search_messages', 'find_messages', 'search']
    });
  }

  /**
   * Generic resolver for any tool by capability
   */
  async resolveByCapability(
    category: ToolCapability['category'],
    action: ToolCapability['action'],
    provider?: string
  ): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      capability: { category, action, provider }
    });
  }

  /**
   * Generic resolver for any tool by name
   */
  async resolveByName(toolName: string, fallbackNames?: string[]): Promise<DiscoveredTool | null> {
    return await this.discoveryService.resolveTool({
      toolName,
      fallbackNames
    });
  }

  /**
   * Call a resolved tool
   */
  async callResolvedTool(tool: DiscoveredTool, args: any): Promise<any> {
    console.log(`[McpToolResolver] Calling resolved tool: ${tool.fullName}`);
    console.log(`[McpToolResolver] Original server: ${tool.serverName}, tool: ${tool.name}`);

    try {
      const result = await this.mcpManager.callTool(tool.fullName, args);
      console.log(`[McpToolResolver] Tool ${tool.fullName} executed successfully`);
      return result;
    } catch (error) {
      console.error(`[McpToolResolver] Tool ${tool.fullName} failed:`, error);
      throw error;
    }
  }

  /**
   * Resolve and call a tool in one operation
   * This is the main method for replacing hardcoded calls
   */
  async resolveAndCall(request: {
    capability?: { category: ToolCapability['category']; action: ToolCapability['action']; provider?: string };
    toolName?: string;
    fallbackNames?: string[];
  }, args: any): Promise<any> {
    const tool = await this.discoveryService.resolveTool(request);

    if (!tool) {
      const requestStr = request.capability ?
        `${request.capability.category}.${request.capability.action}` :
        request.toolName || 'unknown';
      throw new Error(`No tool found for request: ${requestStr}`);
    }

    return await this.callResolvedTool(tool, args);
  }

  /**
   * Get all available tools for debugging/inspection
   */
  async getAllAvailableTools(): Promise<DiscoveredTool[]> {
    return await this.discoveryService.getAllDiscoveredTools();
  }

  /**
   * Get discovery statistics
   */
  async getDiscoveryStats() {
    return await this.discoveryService.getDiscoveryStats();
  }

  /**
   * Force refresh of tool discovery
   */
  async refreshTools(): Promise<void> {
    await this.discoveryService.refreshToolDiscovery();
  }
}