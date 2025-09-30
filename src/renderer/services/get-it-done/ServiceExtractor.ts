import { McpToolInfo } from './types';

/**
 * ServiceExtractor - Dynamically extracts service names from tools and queries
 *
 * This class provides ZERO-HARDCODING service detection by:
 * 1. Extracting service prefixes from tool names (e.g., "gmail_send_email" → "gmail")
 * 2. Matching services in user queries
 * 3. Filtering tools by detected services
 *
 * Works automatically with ANY MCP tools - no code changes needed for new services!
 */
export class ServiceExtractor {

  /**
   * Extract service prefixes from tool names dynamically
   *
   * Examples:
   * - "gmail_send_email" → "gmail"
   * - "trello_find_board" → "trello"
   * - "google_calendar_create_event" → "google_calendar"
   * - "microsoft_outlook_find_emails" → "microsoft_outlook"
   *
   * @param tools - Array of MCP tools
   * @returns Set of unique service names
   */
  extractServicesFromTools(tools: McpToolInfo[]): Set<string> {
    const services = new Set<string>();

    tools.forEach(tool => {
      // Extract everything before the last action verb
      // Pattern: service_name_action_verb
      // Example: "trello_find_board" → "trello"
      // Example: "google_calendar_create_event" → "google_calendar"

      const parts = tool.name.split('_');

      if (parts.length >= 2) {
        // Handle compound service names (google_calendar, microsoft_outlook)
        // Strategy: Take all parts except the last one (which is usually the action)
        const serviceParts = parts.slice(0, -1);
        const service = serviceParts.join('_');

        if (service) {
          services.add(service);
        }
      }
    });

    console.log('[ServiceExtractor] Detected services:', Array.from(services));
    return services;
  }

  /**
   * Extract service keywords from user query
   *
   * Examples:
   * - "find trello board" → ["trello"]
   * - "send gmail email" → ["gmail"]
   * - "google calendar event" → ["google_calendar"]
   * - "outlook email" → ["microsoft_outlook"]
   *
   * @param query - User query string
   * @param availableServices - Set of available service names from tools
   * @returns Array of matched service names
   */
  extractServicesFromQuery(query: string, availableServices: Set<string>): string[] {
    const lowerQuery = query.toLowerCase();
    const matchedServices: string[] = [];

    // Check each available service
    availableServices.forEach(service => {
      // Handle compound services (google_calendar → check for "google" OR "calendar")
      const serviceParts = service.split('_');

      // Strategy 1: Check if full service name appears (with space instead of underscore)
      const serviceWithSpaces = service.replace(/_/g, ' ');
      if (lowerQuery.includes(serviceWithSpaces)) {
        matchedServices.push(service);
        return;
      }

      // Strategy 2: Check if ANY part of service name appears
      // This handles: "gmail" matching "gmail_*", "calendar" matching "google_calendar_*"
      const hasMatch = serviceParts.some(part => {
        // Skip very short parts (like "ms" from microsoft)
        if (part.length < 3) return false;
        return lowerQuery.includes(part);
      });

      if (hasMatch) {
        matchedServices.push(service);
      }
    });

    // Remove duplicates
    const uniqueServices = [...new Set(matchedServices)];

    console.log('[ServiceExtractor] Query services:', uniqueServices);
    return uniqueServices;
  }

  /**
   * Filter tools by service prefix
   *
   * Examples:
   * - services=["trello"] → only tools starting with "trello_"
   * - services=["gmail", "google_calendar"] → tools starting with "gmail_" OR "google_calendar_"
   *
   * @param tools - All available tools
   * @param services - Service names to filter by
   * @returns Filtered tools matching the services
   */
  filterToolsByServices(tools: McpToolInfo[], services: string[]): McpToolInfo[] {
    if (services.length === 0) {
      console.log('[ServiceExtractor] No services detected, returning all tools');
      return tools; // No services detected, return all
    }

    const filtered = tools.filter(tool => {
      return services.some(service => {
        // Check if tool name starts with service prefix
        return tool.name.startsWith(`${service}_`);
      });
    });

    console.log(`[ServiceExtractor] Filtered ${tools.length} → ${filtered.length} tools for services: [${services.join(', ')}]`);
    return filtered;
  }

  /**
   * Get service name from a tool name
   *
   * @param toolName - Tool name (e.g., "gmail_send_email")
   * @returns Service name (e.g., "gmail")
   */
  getServiceFromToolName(toolName: string): string {
    const parts = toolName.split('_');
    if (parts.length >= 2) {
      // Return all parts except the last one
      return parts.slice(0, -1).join('_');
    }
    return toolName;
  }
}
