import { McpToolInfo } from './types';

/**
 * ToolDescriptionAnalyzer - Formats tools with descriptions for Claude
 *
 * This class helps Claude understand tool capabilities by:
 * 1. Formatting tools with clear descriptions
 * 2. Grouping tools by action type
 * 3. Providing context about tool requirements
 *
 * This enables Claude to make intelligent decisions about tool chaining
 * and matching user input formats (name vs ID) with tool requirements.
 */
export class ToolDescriptionAnalyzer {

  /**
   * Format tools with rich descriptions for Claude to understand
   *
   * Example output:
   * - trello_find_board: Finds a board in your Trello organization by name.
   * - trello_find_board_by_id: Finds a specific board using its ID. This provides direct access to board details for agentic use cases.
   * - gmail_send_email: Create and send a new email message.
   *
   * @param tools - Array of MCP tools
   * @returns Formatted string with tool names and descriptions
   */
  formatToolsForClaude(tools: McpToolInfo[]): string {
    if (tools.length === 0) {
      return '(No tools available)';
    }

    return tools.map((tool, index) => {
      const description = tool.description || 'No description available';

      // Format: tool_name: Description
      return `${index + 1}. ${tool.name}: ${description}`;
    }).join('\n');
  }

  /**
   * Group tools by action type for better organization
   *
   * Examples:
   * - "find" → [trello_find_board, gmail_find_email, ...]
   * - "create" → [trello_create_card, gmail_create_draft, ...]
   * - "update" → [trello_update_card, notion_update_database_item, ...]
   *
   * @param tools - Array of MCP tools
   * @returns Map of action type to tools
   */
  groupToolsByAction(tools: McpToolInfo[]): Map<string, McpToolInfo[]> {
    const groups = new Map<string, McpToolInfo[]>();

    tools.forEach(tool => {
      // Extract action verb from tool name
      // Pattern: service_action_target
      // Example: "trello_find_board" → "find"
      // Example: "gmail_send_email" → "send"

      const parts = tool.name.split('_');

      if (parts.length >= 2) {
        // Action is usually the second-to-last or last part
        // Try to identify common action verbs
        const possibleActions = ['find', 'create', 'update', 'delete', 'send', 'get', 'add', 'remove', 'archive', 'move'];

        let action = 'other';
        for (const verb of possibleActions) {
          if (tool.name.includes(`_${verb}_`) || tool.name.endsWith(`_${verb}`)) {
            action = verb;
            break;
          }
        }

        if (!groups.has(action)) {
          groups.set(action, []);
        }
        groups.get(action)!.push(tool);
      }
    });

    return groups;
  }

  /**
   * Format tools grouped by action for Claude
   *
   * Example output:
   * Find Tools:
   * - trello_find_board: Finds a board by name
   * - trello_find_board_by_id: Finds a board by ID
   *
   * Create Tools:
   * - trello_create_card: Creates a new card
   * - trello_create_board: Creates a new board
   *
   * @param tools - Array of MCP tools
   * @returns Formatted string with grouped tools
   */
  formatGroupedToolsForClaude(tools: McpToolInfo[]): string {
    const groups = this.groupToolsByAction(tools);
    const sections: string[] = [];

    groups.forEach((toolsInGroup, action) => {
      const capitalizedAction = action.charAt(0).toUpperCase() + action.slice(1);
      sections.push(`\n${capitalizedAction} Tools:`);

      toolsInGroup.forEach(tool => {
        const description = tool.description || 'No description';
        sections.push(`  - ${tool.name}: ${description}`);
      });
    });

    return sections.join('\n');
  }

  /**
   * Analyze if tool requires ID or name based on description
   *
   * @param tool - MCP tool to analyze
   * @returns Object with analysis results
   */
  analyzeToolRequirements(tool: McpToolInfo): {
    requiresId: boolean;
    requiresName: boolean;
    requiresTitle: boolean;
  } {
    const description = (tool.description || '').toLowerCase();
    const toolName = tool.name.toLowerCase();

    return {
      requiresId: toolName.includes('by_id') || description.includes('by id') || description.includes('using its id'),
      requiresName: toolName.includes('by_name') || description.includes('by name'),
      requiresTitle: toolName.includes('by_title') || description.includes('by title')
    };
  }

  /**
   * Get summary statistics about tools
   *
   * @param tools - Array of MCP tools
   * @returns Statistics object
   */
  getToolStatistics(tools: McpToolInfo[]): {
    total: number;
    withDescriptions: number;
    byAction: Map<string, number>;
  } {
    const groups = this.groupToolsByAction(tools);
    const byAction = new Map<string, number>();

    groups.forEach((toolsInGroup, action) => {
      byAction.set(action, toolsInGroup.length);
    });

    return {
      total: tools.length,
      withDescriptions: tools.filter(t => t.description && t.description.length > 0).length,
      byAction
    };
  }
}
