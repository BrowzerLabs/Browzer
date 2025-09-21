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
  toolType: 'email' | 'calendar' | 'notion' | 'trello' | 'slack' | 'outlook' | 'gdocs' | 'generic';
}

export class McpResultFormatter {

  /**
   * Main entry point for formatting any MCP result
   */
  formatMcpResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    console.log('[McpResultFormatter] Formatting result for tool:', toolName);
    console.log('[McpResultFormatter] Data structure:', JSON.stringify(data, null, 2));

    const toolLower = toolName.toLowerCase();

    // Determine tool type and route to appropriate formatter
    if (toolLower.includes('gmail') || toolLower.includes('email')) {
      return this.formatEmailResult(data, toolName, originalQuery);
    } else if (toolLower.includes('outlook') && (toolLower.includes('mail') || toolLower.includes('email'))) {
      return this.formatOutlookResult(data, toolName, originalQuery);
    } else if (toolLower.includes('calendar')) {
      return this.formatCalendarResult(data, toolName, originalQuery);
    } else if (toolLower.includes('notion')) {
      return this.formatNotionResult(data, toolName, originalQuery);
    } else if (toolLower.includes('trello')) {
      return this.formatTrelloResult(data, toolName, originalQuery);
    } else if (toolLower.includes('slack')) {
      return this.formatSlackResult(data, toolName, originalQuery);
    } else if (toolLower.includes('gdocs') || toolLower.includes('google_docs') || (toolLower.includes('google') && toolLower.includes('docs'))) {
      return this.formatGDocsResult(data, toolName, originalQuery);
    } else {
      return this.formatGenericResult(data, toolName, originalQuery);
    }
  }

  /**
   * Format email results with comprehensive templates
   */
  private formatEmailResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    const isEmailSend = toolName.includes('send') || (originalQuery && originalQuery.toLowerCase().includes('send'));

    if (!data) {
      const message = isEmailSend
        ? '📧 **Email sending failed**\n\nThe email service didn\'t return any confirmation.'
        : '📧 **No email data received**\n\nThe email service didn\'t return any data.';
      return {
        content: message,
        hasResults: false,
        resultCount: 0,
        toolType: 'email'
      };
    }

    try {
      // Parse MCP response structure
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        const errorMessage = isEmailSend
          ? this.formatEmailSendError(parsedData.error || 'Unknown error occurred')
          : this.formatEmailError(parsedData.error || 'Unknown error occurred');
        return {
          content: errorMessage,
          hasResults: false,
          resultCount: 0,
          toolType: 'email'
        };
      }

      // Handle email sending success
      if (isEmailSend) {
        return this.formatEmailSendSuccess(parsedData, originalQuery);
      }

      // Handle email search/retrieval
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
      const friendlyToolName = this.getFriendlyToolName(toolName);
      return {
        content: `🔧 **${friendlyToolName} - No Data**\n\nThe service didn't return any data.\n\n💡 **Possible reasons:**\n• Service might be temporarily unavailable\n• No results match your query\n• Connection or permission issues\n\n🔄 **Try:** Rephrasing your request or checking service status`,
        hasResults: false,
        resultCount: 0,
        toolType: 'generic'
      };
    }

    try {
      // Parse MCP response structure
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        const friendlyToolName = this.getFriendlyToolName(toolName);
        const errorMessage = parsedData.error || 'Unknown error occurred';

        return {
          content: `❌ **${friendlyToolName} Error**\n\n**Issue:** ${errorMessage}\n\n${this.getGenericTroubleshootingTips(toolName)}`,
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
        // Try graceful fallback strategy first
        const fallbackResult = this.formatGenericResultWithFallback(data, toolName);
        if (fallbackResult.hasResults) {
          return fallbackResult;
        }

        // Format as key-value pairs or JSON as last resort
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

    // Date and time with user-friendly formatting
    if (email.date) {
      const date = new Date(email.date);
      formatted += `   📅 Date: ${this.formatEmailDate(date)}\n`;
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

    // Enhanced date and time formatting
    if (event.start) {
      const startDate = new Date(event.start.dateTime || event.start.date);
      const endDate = event.end ? new Date(event.end.dateTime || event.end.date) : null;

      // Use relative date and user-friendly time format
      const timeInfo = this.formatEventTime(startDate, endDate);
      formatted += `   📅 ${timeInfo}\n`;
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

  /**
   * Format email sending success
   */
  private formatEmailSendSuccess(data: any, originalQuery?: string): FormattedResult {
    // Extract recipient info from data or query
    const recipient = this.extractRecipient(data, originalQuery);
    const subject = this.extractSubject(data, originalQuery);

    let content = '✅ **Email Sent Successfully**\n\n';

    if (recipient) {
      content += `✉️ **Sent to:** ${recipient}\n`;
    }

    if (subject && subject !== 'No Subject') {
      content += `📝 **Subject:** ${subject}\n`;
    }

    content += `💌 Your email has been delivered successfully!`;

    return {
      content,
      hasResults: true,
      resultCount: 1,
      toolType: 'email'
    };
  }

  /**
   * Format email sending error
   */
  private formatEmailSendError(error: string): string {
    return `❌ **Email Sending Failed**\n\n**Error:** ${error}\n\n💡 **Tip:** Check recipient address and try again.`;
  }

  /**
   * Format Outlook email results
   */
  private formatOutlookResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    // Similar to Gmail but with Outlook-specific handling
    return this.formatEmailResult(data, toolName, originalQuery);
  }

  /**
   * Format Notion results with rich previews
   */
  private formatNotionResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: '📄 **No Notion data received**\n\nThe Notion service didn\'t return any data.',
        hasResults: false,
        resultCount: 0,
        toolType: 'notion'
      };
    }

    try {
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: `❌ **Notion Access Error**\n\n**Error:** ${parsedData.error}\n\n💡 **Tip:** Check your Notion connection.`,
          hasResults: false,
          resultCount: 0,
          toolType: 'notion'
        };
      }

      // Handle single page result
      if (parsedData.id && parsedData.properties) {
        return this.formatSingleNotionPage(parsedData);
      }

      // Handle multiple results
      if (parsedData.results && Array.isArray(parsedData.results)) {
        return this.formatMultipleNotionPages(parsedData.results);
      }

      // Handle raw page data (like in your example)
      if (parsedData.object === 'page') {
        return this.formatSingleNotionPage(parsedData);
      }

      return this.formatGenericResult(data, toolName, originalQuery);

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting Notion result:', error);
      return {
        content: '📄 **Notion formatting error**\n\nCouldn\'t parse the Notion data properly.',
        hasResults: false,
        resultCount: 0,
        toolType: 'notion'
      };
    }
  }

  /**
   * Format single Notion page
   */
  private formatSingleNotionPage(page: any): FormattedResult {
    let content = '📄 **Notion Page**\n\n';

    // Extract title
    const title = this.extractNotionTitle(page);
    content += `**${title}**\n\n`;

    // Add creation/edit dates with user-friendly formatting
    if (page.created_time) {
      const created = new Date(page.created_time);
      const createdStr = this.getRelativeDate(created);
      content += `📅 **Created:** ${createdStr.charAt(0).toUpperCase() + createdStr.slice(1)}\n`;
    }

    if (page.last_edited_time) {
      const edited = new Date(page.last_edited_time);
      const editedStr = this.getRelativeDate(edited);
      content += `✏️ **Last edited:** ${editedStr.charAt(0).toUpperCase() + editedStr.slice(1)}\n`;
    }

    // Add URL if available
    if (page.url) {
      content += `🔗 **Open in Notion:** [${title}](${page.url})\n`;
    }

    // Add blocks preview if available
    if (page.blocks && Array.isArray(page.blocks) && page.blocks.length > 0) {
      content += `\n📋 **Contains ${page.blocks.length} block${page.blocks.length !== 1 ? 's' : ''}**\n`;

      // Show child pages if any
      const childPages = page.blocks.filter((block: any) => block.type === 'child_page');
      if (childPages.length > 0) {
        content += `\n📁 **Child pages:**\n`;
        childPages.slice(0, 3).forEach((child: any) => {
          content += `   • ${child.child_page?.title || 'Untitled'}\n`;
        });
        if (childPages.length > 3) {
          content += `   • ... and ${childPages.length - 3} more\n`;
        }
      }
    }

    return {
      content,
      hasResults: true,
      resultCount: 1,
      toolType: 'notion'
    };
  }

  /**
   * Format multiple Notion pages
   */
  private formatMultipleNotionPages(pages: any[]): FormattedResult {
    let content = `📄 **Notion Pages** (${pages.length})\n\n`;

    pages.slice(0, 5).forEach((page: any, index: number) => {
      const title = this.extractNotionTitle(page);
      content += `**${index + 1}. ${title}**\n`;

      if (page.last_edited_time) {
        const edited = new Date(page.last_edited_time);
        const editedStr = this.getRelativeDate(edited);
        content += `   ✏️ Last edited: ${editedStr}\n`;
      }

      if (page.url) {
        content += `   🔗 [Open in Notion](${page.url})\n`;
      }

      content += '\n---\n\n';
    });

    if (pages.length > 5) {
      content += `... and ${pages.length - 5} more pages\n`;
    }

    return {
      content,
      hasResults: true,
      resultCount: pages.length,
      toolType: 'notion'
    };
  }

  /**
   * Format Trello results
   */
  private formatTrelloResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: '🗂️ **No Trello data received**\n\nThe Trello service didn\'t return any data.',
        hasResults: false,
        resultCount: 0,
        toolType: 'trello'
      };
    }

    try {
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: `❌ **Trello Access Error**\n\n**Error:** ${parsedData.error}\n\n💡 **Tip:** Check your Trello connection.`,
          hasResults: false,
          resultCount: 0,
          toolType: 'trello'
        };
      }

      let content = '🗂️ **Trello Cards**\n\n';

      const items = Array.isArray(parsedData.results) ? parsedData.results : [parsedData];

      items.slice(0, 5).forEach((item: any, index: number) => {
        content += `**${index + 1}. ${item.name || 'Untitled Card'}**\n`;

        if (item.list && item.list.name) {
          content += `   📋 List: ${item.list.name}\n`;
        }

        if (item.due) {
          const due = new Date(item.due);
          const isOverdue = due < new Date();
          content += `   ⏰ Due: ${due.toLocaleDateString()}${isOverdue ? ' (OVERDUE)' : ''}\n`;
        }

        if (item.members && item.members.length > 0) {
          const memberNames = item.members.map((m: any) => m.fullName || m.username).slice(0, 3);
          content += `   👥 Assigned: ${memberNames.join(', ')}\n`;
        }

        if (item.labels && item.labels.length > 0) {
          const labelNames = item.labels.map((l: any) => l.name).filter(Boolean);
          if (labelNames.length > 0) {
            content += `   🏷️ Labels: ${labelNames.join(', ')}\n`;
          }
        }

        content += '\n---\n\n';
      });

      return {
        content,
        hasResults: true,
        resultCount: items.length,
        toolType: 'trello'
      };

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting Trello result:', error);
      return {
        content: '🗂️ **Trello formatting error**\n\nCouldn\'t parse the Trello data properly.',
        hasResults: false,
        resultCount: 0,
        toolType: 'trello'
      };
    }
  }

  /**
   * Format Slack results
   */
  private formatSlackResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: '💬 **No Slack data received**\n\nThe Slack service didn\'t return any data.',
        hasResults: false,
        resultCount: 0,
        toolType: 'slack'
      };
    }

    try {
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: `❌ **Slack Access Error**\n\n**Error:** ${parsedData.error}\n\n💡 **Tip:** Check your Slack connection.`,
          hasResults: false,
          resultCount: 0,
          toolType: 'slack'
        };
      }

      let content = '💬 **Slack Messages**\n\n';

      const items = Array.isArray(parsedData.results) ? parsedData.results : [parsedData];

      items.slice(0, 5).forEach((item: any, index: number) => {
        const username = item.user?.name || item.username || 'Unknown User';
        const channel = item.channel?.name || item.channel || 'Unknown Channel';

        content += `**${username}** in #${channel}\n`;

        if (item.text) {
          const messageText = item.text.length > 200 ? item.text.substring(0, 200) + '...' : item.text;
          content += `💭 "${messageText}"\n`;
        }

        if (item.ts || item.timestamp) {
          const timestamp = new Date((item.ts || item.timestamp) * 1000);
          content += `🕐 ${timestamp.toLocaleString()}\n`;
        }

        content += '\n---\n\n';
      });

      return {
        content,
        hasResults: true,
        resultCount: items.length,
        toolType: 'slack'
      };

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting Slack result:', error);
      return {
        content: '💬 **Slack formatting error**\n\nCouldn\'t parse the Slack data properly.',
        hasResults: false,
        resultCount: 0,
        toolType: 'slack'
      };
    }
  }

  /**
   * Format Google Docs results
   */
  private formatGDocsResult(data: any, toolName: string, originalQuery?: string): FormattedResult {
    if (!data) {
      return {
        content: '📄 **No Google Docs data received**\n\nThe Google Docs service didn\'t return any data.',
        hasResults: false,
        resultCount: 0,
        toolType: 'gdocs'
      };
    }

    try {
      const parsedData = this.parseMcpResponse(data);

      if (parsedData.isError) {
        return {
          content: `❌ **Google Docs Access Error**\n\n**Error:** ${parsedData.error}\n\n💡 **Tip:** Check your Google Docs connection.`,
          hasResults: false,
          resultCount: 0,
          toolType: 'gdocs'
        };
      }

      let content = '📄 **Google Documents**\n\n';

      const items = Array.isArray(parsedData.results) ? parsedData.results : [parsedData];

      items.slice(0, 5).forEach((item: any, index: number) => {
        content += `**${index + 1}. ${item.name || item.title || 'Untitled Document'}**\n`;

        if (item.modifiedTime) {
          const modified = new Date(item.modifiedTime);
          content += `   ✏️ Modified: ${modified.toLocaleDateString()}\n`;
        }

        if (item.owners && item.owners.length > 0) {
          const ownerNames = item.owners.map((o: any) => o.displayName || o.emailAddress).slice(0, 2);
          content += `   👤 Owner: ${ownerNames.join(', ')}\n`;
        }

        if (item.shared !== undefined) {
          content += `   🔗 Sharing: ${item.shared ? 'Shared' : 'Private'}\n`;
        }

        if (item.webViewLink) {
          content += `   📖 [Open Document](${item.webViewLink})\n`;
        }

        content += '\n---\n\n';
      });

      return {
        content,
        hasResults: true,
        resultCount: items.length,
        toolType: 'gdocs'
      };

    } catch (error) {
      console.error('[McpResultFormatter] Error formatting Google Docs result:', error);
      return {
        content: '📄 **Google Docs formatting error**\n\nCouldn\'t parse the Google Docs data properly.',
        hasResults: false,
        resultCount: 0,
        toolType: 'gdocs'
      };
    }
  }

  /**
   * Enhanced generic formatter with graceful fallback strategy
   */
  private formatGenericResultWithFallback(data: any, toolName: string): FormattedResult {
    try {
      const parsed = this.parseMcpResponse(data);

      // Try to extract meaningful information using the graceful fallback strategy
      const extractedInfo = this.extractGenericInfo(parsed);

      if (extractedInfo.hasContent) {
        let content = `🔧 **${this.capitalize(toolName)}**\n\n`;

        if (extractedInfo.title) {
          content += `**${extractedInfo.title}**\n\n`;
        }

        if (extractedInfo.description) {
          content += `${extractedInfo.description}\n\n`;
        }

        if (extractedInfo.timestamp) {
          content += `🕐 ${extractedInfo.timestamp}\n\n`;
        }

        if (extractedInfo.link) {
          content += `🔗 [View Original](${extractedInfo.link})\n\n`;
        }

        return {
          content,
          hasResults: true,
          resultCount: 1,
          toolType: 'generic'
        };
      }

      // If no meaningful info extracted, fall back to the original generic formatter
      return this.formatGenericResult(data, toolName);

    } catch (error) {
      return this.formatGenericResult(data, toolName);
    }
  }

  /**
   * Extract meaningful information from generic data using graceful fallback strategy
   */
  private extractGenericInfo(data: any): {
    hasContent: boolean;
    title?: string;
    description?: string;
    timestamp?: string;
    link?: string;
  } {
    if (!data || typeof data !== 'object') {
      return { hasContent: false };
    }

    const result = { hasContent: false } as any;

    // Try to extract title/name
    const titleFields = ['title', 'name', 'summary', 'subject', 'displayName'];
    for (const field of titleFields) {
      if (data[field] && typeof data[field] === 'string') {
        result.title = data[field];
        result.hasContent = true;
        break;
      }
    }

    // Try to extract description/preview
    const descFields = ['description', 'preview', 'content', 'text', 'body'];
    for (const field of descFields) {
      if (data[field] && typeof data[field] === 'string') {
        result.description = data[field].length > 150
          ? data[field].substring(0, 150) + '...'
          : data[field];
        result.hasContent = true;
        break;
      }
    }

    // Try to extract timestamps
    const timeFields = ['created_time', 'modified_time', 'updated_at', 'created_at', 'date', 'timestamp'];
    for (const field of timeFields) {
      if (data[field]) {
        try {
          const date = new Date(data[field]);
          if (!isNaN(date.getTime())) {
            result.timestamp = date.toLocaleDateString();
            result.hasContent = true;
            break;
          }
        } catch (e) {
          // Ignore invalid dates
        }
      }
    }

    // Try to extract links
    const linkFields = ['url', 'link', 'webViewLink', 'permalink'];
    for (const field of linkFields) {
      if (data[field] && typeof data[field] === 'string' && data[field].startsWith('http')) {
        result.link = data[field];
        result.hasContent = true;
        break;
      }
    }

    return result;
  }

  /**
   * Extract Notion page title
   */
  private extractNotionTitle(page: any): string {
    if (page.properties?.title?.title?.[0]?.text?.content) {
      return page.properties.title.title[0].text.content;
    }
    if (page.title && typeof page.title === 'string') {
      return page.title;
    }
    if (page.name && typeof page.name === 'string') {
      return page.name;
    }
    return 'Untitled Page';
  }

  /**
   * Extract recipient from email data or query
   */
  private extractRecipient(data: any, query?: string): string | null {
    // Try to extract from data first
    if (data?.to) return data.to;
    if (data?.recipient) return data.recipient;

    // Try to extract from query
    if (query) {
      const emailMatch = query.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) return emailMatch[1];
    }

    return null;
  }

  /**
   * Extract subject from email data or query
   */
  private extractSubject(data: any, query?: string): string | null {
    // Try to extract from data first
    if (data?.subject) return data.subject;

    // Try to extract from query
    if (query) {
      const subjectMatch = query.match(/subject[:\s]+([^,\n]+)/i);
      if (subjectMatch) return subjectMatch[1].trim();

      const aboutMatch = query.match(/about\s+(.+?)(?:\s+to|\s+and|\s*$)/i);
      if (aboutMatch) return aboutMatch[1].trim();
    }

    return null;
  }

  /**
   * Format event time with relative dates and user-friendly times
   */
  private formatEventTime(startDate: Date, endDate?: Date | null): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    // Calculate relative date
    const dayDiff = Math.round((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let relativeDate: string;
    if (dayDiff === 0) {
      relativeDate = 'Today';
    } else if (dayDiff === 1) {
      relativeDate = 'Tomorrow';
    } else if (dayDiff === -1) {
      relativeDate = 'Yesterday';
    } else if (dayDiff > 1 && dayDiff <= 7) {
      relativeDate = startDate.toLocaleDateString('en-US', { weekday: 'long' });
    } else if (dayDiff > 7 && dayDiff <= 14) {
      relativeDate = `Next ${startDate.toLocaleDateString('en-US', { weekday: 'long' })}`;
    } else {
      relativeDate = startDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: startDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }

    // Format time in 12-hour format
    const startTime = startDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (endDate) {
      const endTime = endDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      // Check if it's the same day
      const isSameDay = startDate.toDateString() === endDate.toDateString();

      if (isSameDay) {
        return `${relativeDate} from ${startTime} to ${endTime}`;
      } else {
        const endRelativeDate = this.getRelativeDate(endDate);
        return `${relativeDate} at ${startTime} until ${endRelativeDate} at ${endTime}`;
      }
    } else {
      return `${relativeDate} at ${startTime}`;
    }
  }

  /**
   * Get relative date string for a given date
   */
  private getRelativeDate(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const dayDiff = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (dayDiff === 0) return 'today';
    if (dayDiff === 1) return 'tomorrow';
    if (dayDiff === -1) return 'yesterday';
    if (dayDiff > 1 && dayDiff <= 7) return date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  /**
   * Format email date with user-friendly relative time
   */
  private formatEmailDate(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const emailDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const dayDiff = Math.round((emailDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (dayDiff === 0) {
      return `Today at ${time}`;
    } else if (dayDiff === -1) {
      return `Yesterday at ${time}`;
    } else if (dayDiff > -7 && dayDiff < 0) {
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `${weekday} at ${time}`;
    } else {
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
      return `${dateStr} at ${time}`;
    }
  }

  /**
   * Get friendly tool name for user display
   */
  private getFriendlyToolName(toolName: string): string {
    const toolLower = toolName.toLowerCase();

    if (toolLower.includes('gdocs') || toolLower.includes('google_docs') || (toolLower.includes('google') && toolLower.includes('docs'))) {
      return 'Google Docs';
    } else if (toolLower.includes('google_drive') || (toolLower.includes('google') && toolLower.includes('drive'))) {
      return 'Google Drive';
    } else if (toolLower.includes('notion')) {
      return 'Notion';
    } else if (toolLower.includes('trello')) {
      return 'Trello';
    } else if (toolLower.includes('slack')) {
      return 'Slack';
    } else if (toolLower.includes('gmail') || toolLower.includes('email')) {
      return 'Gmail';
    } else if (toolLower.includes('calendar')) {
      return 'Calendar';
    }

    // Clean up technical tool names
    return toolName
      .replace(/[_-]/g, ' ')
      .replace(/^.*\./, '') // Remove server prefix
      .replace(/\b\w/g, l => l.toUpperCase()); // Title case
  }

  /**
   * Get generic troubleshooting tips based on tool type
   */
  private getGenericTroubleshootingTips(toolName: string): string {
    const toolLower = toolName.toLowerCase();

    let tips = '💡 **Troubleshooting tips:**\n';

    if (toolLower.includes('google')) {
      tips += '• Check your Google account connection\n';
      tips += '• Verify access permissions for the service\n';
      tips += '• Try refreshing your Google integration\n';
    } else if (toolLower.includes('notion')) {
      tips += '• Verify your Notion workspace connection\n';
      tips += '• Check page permissions and access rights\n';
      tips += '• Ensure the page or database exists\n';
    } else if (toolLower.includes('trello')) {
      tips += '• Check your Trello board access\n';
      tips += '• Verify API connection and permissions\n';
      tips += '• Ensure the board or card exists\n';
    } else if (toolLower.includes('slack')) {
      tips += '• Check your Slack workspace connection\n';
      tips += '• Verify channel permissions\n';
      tips += '• Ensure you have access to the workspace\n';
    } else {
      tips += '• Check your account connection\n';
      tips += '• Verify service permissions\n';
      tips += '• Try refreshing the integration\n';
    }

    tips += '\n🔄 **Next step:** Try the request again or contact support if the issue persists';

    return tips;
  }
}