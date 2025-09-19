/**
 * MCP Result Formatter Service
 *
 * Provides comprehensive markdown template system for formatting
 * all types of MCP tool results in a user-friendly way.
 */

export interface FormattedResult {
  content: string;
  hasResults: boolean;
  resultCount: number;
  toolType: 'email' | 'calendar' | 'generic';
}

export class McpResultFormatter {

  /**
   * Main entry point for formatting any MCP result
   */
  formatMcpResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    console.log('[McpResultFormatter] Formatting result for tool:', toolName);
    console.log('[McpResultFormatter] Data structure:', JSON.stringify(data, null, 2));

    // Determine tool type and route to appropriate formatter
    if (toolName.includes('gmail') || toolName.includes('email')) {
      return this.formatEmailResult(data, toolName, originalQuery);
    } else if (toolName.includes('calendar')) {
      return this.formatCalendarResult(data, toolName, originalQuery);
    } else {
      return this.formatGenericResult(data, toolName, originalQuery);
    }
  }

  /**
   * Format email results with comprehensive templates
   */
  private formatEmailResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: '📧 **No email data received**\n\nThe email service didn\'t return any data.',
        hasResults: false,
        resultCount: 0,
        toolType: 'email'
      };
    }

    try {
      // Parse MCP response structure
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: this.formatEmailError(parsedData.error || 'Unknown error occurred'),
          hasResults: false,
          resultCount: 0,
          toolType: 'email'
        };
      }

      if (!parsedData.results || !Array.isArray(parsedData.results)) {
        return {
          content: '📧 **No emails found**\n\nYour search didn\'t return any emails.',
          hasResults: false,
          resultCount: 0,
          toolType: 'email'
        };
      }

      if (parsedData.results.length === 0) {
        return {
          content: '📧 **No emails found**\n\nNo emails match your search criteria.',
          hasResults: false,
          resultCount: 0,
          toolType: 'email'
        };
      }

      // Apply email limit based on query
      const emailLimit = this.extractEmailLimit(originalQuery, parsedData.results.length);
      const emailsToShow = parsedData.results.slice(0, emailLimit);

      let content = `📧 **Your Gmail Emails** (${emailsToShow.length}${emailsToShow.length < parsedData.results.length ? ` of ${parsedData.results.length}` : ''})\n\n`;

      emailsToShow.forEach((email: any, index: number) => {
        content += this.formatSingleEmail(email, index + 1);
      });

      return {
        content,
        hasResults: true,
        resultCount: emailsToShow.length,
        toolType: 'email'
      };

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting email result:', error);
      return {
        content: '📧 **Email formatting error**\n\nCouldn\'t parse the email data properly.',
        hasResults: false,
        resultCount: 0,
        toolType: 'email'
      };
    }
  }

  /**
   * Format calendar results with comprehensive templates
   */
  private formatCalendarResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: '📅 **No calendar data received**\n\nThe calendar service didn\'t return any data.',
        hasResults: false,
        resultCount: 0,
        toolType: 'calendar'
      };
    }

    try {
      // Parse MCP response structure
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: this.formatCalendarError(parsedData.error || 'Unknown error occurred'),
          hasResults: false,
          resultCount: 0,
          toolType: 'calendar'
        };
      }

      if (!parsedData.results || !Array.isArray(parsedData.results)) {
        return {
          content: '📅 **No calendar events found**\n\nYour search didn\'t return any events.',
          hasResults: false,
          resultCount: 0,
          toolType: 'calendar'
        };
      }

      if (parsedData.results.length === 0) {
        return {
          content: '📅 **No calendar events found**\n\nNo events match your search criteria.',
          hasResults: false,
          resultCount: 0,
          toolType: 'calendar'
        };
      }

      let content = `📅 **Your Calendar Events** (${parsedData.results.length})\n\n`;

      parsedData.results.forEach((event: any, index: number) => {
        content += this.formatSingleCalendarEvent(event, index + 1);
      });

      return {
        content,
        hasResults: true,
        resultCount: parsedData.results.length,
        toolType: 'calendar'
      };

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting calendar result:', error);
      return {
        content: '📅 **Calendar formatting error**\n\nCouldn\'t parse the calendar data properly.',
        hasResults: false,
        resultCount: 0,
        toolType: 'calendar'
      };
    }
  }

  /**
   * Format generic results for other tool types
   */
  private formatGenericResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: `🔧 **No data from ${toolName}**\n\nThe tool didn\'t return any data.`,
        hasResults: false,
        resultCount: 0,
        toolType: 'generic'
      };
    }

    try {
      // Parse MCP response structure
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: `🔧 **Error from ${toolName}**\n\n**Error:** ${parsedData.error || 'Unknown error occurred'}`,
          hasResults: false,
          resultCount: 0,
          toolType: 'generic'
        };
      }

      // Try to format as structured data
      let content = `🔧 **Results from ${toolName}**\n\n`;

      if (parsedData.results && Array.isArray(parsedData.results)) {
        if (parsedData.results.length === 0) {
          content += 'No results found.';
        } else {
          content += `Found ${parsedData.results.length} result${parsedData.results.length !== 1 ? 's' : ''}:\n\n`;
          parsedData.results.forEach((item: any, index: number) => {
            content += `**${index + 1}.** ${this.formatGenericItem(item)}\n\n`;
          });
        }
      } else {
        // Format as key-value pairs or JSON
        content += this.formatGenericData(parsedData);
      }

      return {
        content,
        hasResults: parsedData.results ? parsedData.results.length > 0 : true,
        resultCount: parsedData.results ? parsedData.results.length : 1,
        toolType: 'generic'
      };

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting generic result:', error);
      return {
        content: `🔧 **Formatting error for ${toolName}**\n\nCouldn\'t parse the result data properly.`,
        hasResults: false,
        resultCount: 0,
        toolType: 'generic'
      };
    }
  }

  /**
   * Parse common MCP response structure
   */
  private parseMcpResponse(data: any): any {
    // Handle MCP response: {content: [{type: 'text', text: JSON_STRING}]}
    if (data.content && Array.isArray(data.content) && data.content[0]?.type === 'text') {
      try {
        return JSON.parse(data.content[0].text);
      } catch (e) {
        return { error: 'Invalid JSON in response', isError: true };
      }
    }

    // Handle direct object
    if (typeof data === 'object') {
      return data;
    }

    // Handle string JSON
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        return { error: 'Invalid JSON string', isError: true };
      }
    }

    return { error: 'Unknown data format', isError: true };
  }

  /**
   * Format a single email with rich details
   */
  private formatSingleEmail(email: any, index: number): string {
    let formatted = `**${index}. ${email.subject || 'No Subject'}**\n`;

    // From line
    if (email.from) {
      const fromName = email.from.name || email.from.email || 'Unknown';
      const fromEmail = email.from.email || '';
      formatted += `   📤 From: ${fromName}`;
      if (fromEmail && fromEmail !== fromName) {
        formatted += ` (${fromEmail})`;
      }
      formatted += '\n';
    }

    // Date and time
    if (email.date) {
      const date = new Date(email.date);
      formatted += `   📅 Date: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}\n`;
    }

    // Labels (filtered)
    if (email.labels && Array.isArray(email.labels) && email.labels.length > 0) {
      const displayLabels = email.labels.filter((label: string) =>
        !label.startsWith('CATEGORY_') &&
        !['INBOX', 'IMPORTANT', 'UNREAD'].includes(label)
      );
      if (displayLabels.length > 0) {
        formatted += `   🏷️ Labels: ${displayLabels.join(', ')}\n`;
      }
    }

    // Preview
    if (email.body_plain) {
      const cleanBody = email.body_plain.replace(/\s+/g, ' ').trim();
      const preview = cleanBody.length > 150 ? cleanBody.substring(0, 150) + '...' : cleanBody;
      if (preview.length > 10) {
        formatted += `   📄 Preview: ${preview}\n`;
      }
    }

    formatted += '\n---\n\n';
    return formatted;
  }

  /**
   * Format a single calendar event with rich details
   */
  private formatSingleCalendarEvent(event: any, index: number): string {
    let formatted = `**${index}. ${event.summary || event.title || 'Untitled Event'}**\n`;

    // Date and time
    if (event.start) {
      const startDate = new Date(event.start.dateTime || event.start.date);
      formatted += `   📅 Start: ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}\n`;
    }

    if (event.end) {
      const endDate = new Date(event.end.dateTime || event.end.date);
      formatted += `   🕐 End: ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString()}\n`;
    }

    // Location
    if (event.location) {
      formatted += `   📍 Location: ${event.location}\n`;
    }

    // Attendees
    if (event.attendees && Array.isArray(event.attendees) && event.attendees.length > 0) {
      const attendeeNames = event.attendees
        .map((a: any) => a.displayName || a.email || 'Unknown')
        .slice(0, 3); // Show max 3 attendees
      formatted += `   👥 Attendees: ${attendeeNames.join(', ')}${event.attendees.length > 3 ? ` (+${event.attendees.length - 3} more)` : ''}\n`;
    }

    // Description preview
    if (event.description) {
      const cleanDesc = event.description.replace(/\s+/g, ' ').trim();
      const preview = cleanDesc.length > 100 ? cleanDesc.substring(0, 100) + '...' : cleanDesc;
      formatted += `   📝 Description: ${preview}\n`;
    }

    // Status
    if (event.status && event.status !== 'confirmed') {
      formatted += `   ⚠️ Status: ${event.status}\n`;
    }

    formatted += '\n---\n\n';
    return formatted;
  }

  /**
   * Format email errors
   */
  private formatEmailError(error: string): string {
    return `❌ **Email Access Error**\n\n**Error:** ${error}\n\n💡 **Tip:** Make sure your Gmail account is connected and try again.`;
  }

  /**
   * Format calendar errors
   */
  private formatCalendarError(error: string): string {
    return `❌ **Calendar Access Error**\n\n**Error:** ${error}\n\n💡 **Tip:** Make sure your calendar is connected and try again.`;
  }

  /**
   * Format generic data as key-value pairs
   */
  private formatGenericData(data: any): string {
    if (typeof data === 'string') return data;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);

    let formatted = '';
    for (const [key, value] of Object.entries(data)) {
      if (key === 'feedbackUrl' || key === 'execution') continue; // Skip internal MCP fields
      formatted += `**${this.capitalize(key)}:** ${this.formatValue(value)}\n\n`;
    }
    return formatted || 'No data to display.';
  }

  /**
   * Format a generic item
   */
  private formatGenericItem(item: any): string {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item.name) return item.name;
    if (typeof item === 'object' && item.title) return item.title;
    return JSON.stringify(item, null, 2);
  }

  /**
   * Format a value for display
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  /**
   * Extract email limit from query
   */
  private extractEmailLimit(query?: string, totalResults?: number): number {
    if (!query) return Math.min(totalResults || 5, 5);

    // Look for numbers in the query
    const numberMatch = query.match(/\b(\d+)\b/);
    if (numberMatch) {
      const requestedLimit = parseInt(numberMatch[1]);
      return Math.min(requestedLimit, totalResults || requestedLimit);
    }

    // Look for "latest" or singular forms
    if (query.toLowerCase().includes('latest') ||
        query.toLowerCase().includes('recent') ||
        /\b(an?\s+)?email\b/.test(query.toLowerCase())) {
      return 1;
    }

    return Math.min(totalResults || 5, 5);
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }
}