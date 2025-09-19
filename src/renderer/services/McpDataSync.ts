/**
 * MCP Data Synchronization
 *
 * Cross-platform data synchronization for "Get It Done" mode:
 * - Data format standardization across MCP servers
 * - Cross-platform data transformation
 * - MCP server capability detection and adaptation
 * - Unified MCP tool discovery and registration
 *
 * Cross-Platform MCP Data Synchronization
 */

import { McpClientManager } from './McpClientManager';
import { McpServerIntegrations, ServerIntegration, ServerTool } from './McpServerIntegrations';

export interface DataFormat {
  formatId: string;
  name: string;
  description: string;
  schema: Record<string, any>;
  supportedTypes: string[];
}

export interface DataTransformation {
  transformId: string;
  name: string;
  sourceFormat: string;
  targetFormat: string;
  transform: (data: any) => any;
  validate: (data: any) => boolean;
}

export interface SyncRule {
  ruleId: string;
  name: string;
  sourceServer: string;
  targetServer: string;
  dataType: string;
  syncMode: 'one-way' | 'two-way' | 'event-driven';
  interval?: number; // in milliseconds for periodic sync
  conditions?: string[];
  transformations: string[];
  lastSync?: Date;
  status: 'active' | 'paused' | 'error';
  errorMessage?: string;
}

export interface SyncConflict {
  conflictId: string;
  sourceData: any;
  targetData: any;
  conflictType: 'duplicate' | 'update' | 'deletion';
  resolution: 'source-wins' | 'target-wins' | 'merge' | 'manual';
  timestamp: Date;
}

export class McpDataSync {
  private serverIntegrations: McpServerIntegrations;
  private mcpManager: McpClientManager;
  private dataFormats: Map<string, DataFormat> = new Map();
  private transformations: Map<string, DataTransformation> = new Map();
  private syncRules: Map<string, SyncRule> = new Map();
  private conflicts: Map<string, SyncConflict> = new Map();

  constructor(mcpManager: McpClientManager) {
    this.mcpManager = mcpManager;
    this.serverIntegrations = new McpServerIntegrations(mcpManager);
    this.initializeDataFormats();
    this.initializeTransformations();
    this.initializeSyncRules();
  }

  /**
   * Initialize standard data formats
   */
  private initializeDataFormats(): void {
    console.log('[McpDataSync] Initializing standard data formats...');

    const formats: DataFormat[] = [
      // Email format
      {
        formatId: 'email',
        name: 'Email Message',
        description: 'Standardized email message format',
        schema: {
          id: 'string',
          subject: 'string',
          from: { email: 'string', name: 'string' },
          to: { email: 'string', name: 'string' },
          body: 'string',
          timestamp: 'date',
          attachments: ['object'],
          labels: ['string'],
          threadId: 'string'
        },
        supportedTypes: ['gmail', 'outlook', 'email']
      },

      // Calendar event format
      {
        formatId: 'calendar-event',
        name: 'Calendar Event',
        description: 'Standardized calendar event format',
        schema: {
          id: 'string',
          summary: 'string',
          description: 'string',
          startTime: 'date',
          endTime: 'date',
          location: 'string',
          attendees: [{ email: 'string', name: 'string', status: 'string' }],
          creator: { email: 'string', name: 'string' },
          calendarId: 'string',
          recurrence: 'string',
          reminders: ['object']
        },
        supportedTypes: ['google-calendar', 'outlook-calendar', 'calendar']
      },

      // Task/Card format
      {
        formatId: 'task',
        name: 'Task/Card',
        description: 'Standardized task or card format',
        schema: {
          id: 'string',
          title: 'string',
          description: 'string',
          status: 'string',
          assignee: { id: 'string', name: 'string' },
          creator: { id: 'string', name: 'string' },
          dueDate: 'date',
          priority: 'string',
          labels: ['string'],
          comments: ['object'],
          attachments: ['object'],
          boardId: 'string',
          listId: 'string'
        },
        supportedTypes: ['trello', 'jira', 'asana', 'task']
      },

      // Document format
      {
        formatId: 'document',
        name: 'Document',
        description: 'Standardized document format',
        schema: {
          id: 'string',
          title: 'string',
          content: 'string',
          contentType: 'string',
          author: { id: 'string', name: 'string' },
          lastModified: 'date',
          created: 'date',
          permissions: ['object'],
          url: 'string',
          parentId: 'string',
          version: 'number'
        },
        supportedTypes: ['google-docs', 'notion', 'confluence', 'document']
      },

      // Message format (chat/communication)
      {
        formatId: 'message',
        name: 'Chat Message',
        description: 'Standardized chat message format',
        schema: {
          id: 'string',
          text: 'string',
          sender: { id: 'string', name: 'string' },
          channel: { id: 'string', name: 'string' },
          timestamp: 'date',
          threadId: 'string',
          reactions: ['object'],
          mentions: ['string'],
          attachments: ['object'],
          edited: 'boolean'
        },
        supportedTypes: ['slack', 'teams', 'discord', 'chat']
      }
    ];

    formats.forEach(format => {
      this.dataFormats.set(format.formatId, format);
      console.log(`[McpDataSync] Registered data format: ${format.name}`);
    });
  }

  /**
   * Initialize data transformations between formats
   */
  private initializeTransformations(): void {
    console.log('[McpDataSync] Initializing data transformations...');

    const transformations: DataTransformation[] = [
      // Email transformations
      {
        transformId: 'gmail-to-outlook',
        name: 'Gmail to Outlook Email',
        sourceFormat: 'gmail',
        targetFormat: 'outlook',
        transform: this.transformGmailToOutlook.bind(this),
        validate: this.validateEmailFormat.bind(this)
      },
      {
        transformId: 'outlook-to-gmail',
        name: 'Outlook to Gmail Email',
        sourceFormat: 'outlook',
        targetFormat: 'gmail',
        transform: this.transformOutlookToGmail.bind(this),
        validate: this.validateEmailFormat.bind(this)
      },

      // Calendar transformations
      {
        transformId: 'gcal-to-outlook-calendar',
        name: 'Google Calendar to Outlook Calendar',
        sourceFormat: 'google-calendar',
        targetFormat: 'outlook-calendar',
        transform: this.transformGCalToOutlookCalendar.bind(this),
        validate: this.validateCalendarFormat.bind(this)
      },

      // Task transformations
      {
        transformId: 'trello-to-notion',
        name: 'Trello Card to Notion Task',
        sourceFormat: 'trello',
        targetFormat: 'notion',
        transform: this.transformTrelloToNotion.bind(this),
        validate: this.validateTaskFormat.bind(this)
      },
      {
        transformId: 'notion-to-trello',
        name: 'Notion Task to Trello Card',
        sourceFormat: 'notion',
        targetFormat: 'trello',
        transform: this.transformNotionToTrello.bind(this),
        validate: this.validateTaskFormat.bind(this)
      },

      // Document transformations
      {
        transformId: 'gdocs-to-notion',
        name: 'Google Docs to Notion Page',
        sourceFormat: 'google-docs',
        targetFormat: 'notion',
        transform: this.transformGDocsToNotion.bind(this),
        validate: this.validateDocumentFormat.bind(this)
      },

      // Message transformations
      {
        transformId: 'slack-to-email',
        name: 'Slack Message to Email',
        sourceFormat: 'slack',
        targetFormat: 'email',
        transform: this.transformSlackToEmail.bind(this),
        validate: this.validateMessageFormat.bind(this)
      },

      // Cross-platform content transformations
      {
        transformId: 'email-to-task',
        name: 'Email to Task',
        sourceFormat: 'email',
        targetFormat: 'task',
        transform: this.transformEmailToTask.bind(this),
        validate: this.validateTaskFormat.bind(this)
      },
      {
        transformId: 'calendar-to-task',
        name: 'Calendar Event to Task',
        sourceFormat: 'calendar-event',
        targetFormat: 'task',
        transform: this.transformCalendarToTask.bind(this),
        validate: this.validateTaskFormat.bind(this)
      }
    ];

    transformations.forEach(transformation => {
      this.transformations.set(transformation.transformId, transformation);
      console.log(`[McpDataSync] Registered transformation: ${transformation.name}`);
    });
  }

  /**
   * Initialize common sync rules
   */
  private initializeSyncRules(): void {
    console.log('[McpDataSync] Initializing sync rules...');

    const syncRules: SyncRule[] = [
      // Email sync rules
      {
        ruleId: 'gmail-outlook-sync',
        name: 'Gmail-Outlook Email Sync',
        sourceServer: 'gmail',
        targetServer: 'outlook',
        dataType: 'email',
        syncMode: 'two-way',
        interval: 300000, // 5 minutes
        transformations: ['gmail-to-outlook', 'outlook-to-gmail'],
        status: 'paused'
      },

      // Calendar sync rules
      {
        ruleId: 'gcal-outlook-calendar-sync',
        name: 'Google Calendar-Outlook Calendar Sync',
        sourceServer: 'gcal',
        targetServer: 'outlook',
        dataType: 'calendar-event',
        syncMode: 'two-way',
        interval: 600000, // 10 minutes
        transformations: ['gcal-to-outlook-calendar'],
        status: 'paused'
      },

      // Task management sync rules
      {
        ruleId: 'trello-notion-sync',
        name: 'Trello-Notion Task Sync',
        sourceServer: 'trello',
        targetServer: 'notion',
        dataType: 'task',
        syncMode: 'two-way',
        transformations: ['trello-to-notion', 'notion-to-trello'],
        status: 'paused'
      },

      // Communication to task conversion
      {
        ruleId: 'slack-to-trello-tasks',
        name: 'Slack Messages to Trello Tasks',
        sourceServer: 'slack',
        targetServer: 'trello',
        dataType: 'message',
        syncMode: 'event-driven',
        conditions: ['contains:TODO', 'contains:TASK', 'mentions:@channel'],
        transformations: ['slack-to-task'],
        status: 'paused'
      },

      // Email to task conversion
      {
        ruleId: 'email-to-task-conversion',
        name: 'Important Emails to Tasks',
        sourceServer: 'gmail',
        targetServer: 'trello',
        dataType: 'email',
        syncMode: 'event-driven',
        conditions: ['importance:high', 'has:attachment', 'from:boss@company.com'],
        transformations: ['email-to-task'],
        status: 'paused'
      }
    ];

    syncRules.forEach(rule => {
      this.syncRules.set(rule.ruleId, rule);
      console.log(`[McpDataSync] Registered sync rule: ${rule.name}`);
    });
  }

  // Transformation functions

  /**
   * Transform Gmail email to Outlook format
   */
  private transformGmailToOutlook(gmailData: any): any {
    return {
      subject: gmailData.subject || '',
      from: this.parseEmailAddress(gmailData.from),
      to: this.parseEmailAddress(gmailData.to),
      body: gmailData.body || gmailData.snippet || '',
      receivedDateTime: gmailData.internalDate ? new Date(parseInt(gmailData.internalDate)).toISOString() : new Date().toISOString(),
      hasAttachments: gmailData.payload?.parts?.some((part: any) => part.filename) || false,
      importance: gmailData.labelIds?.includes('IMPORTANT') ? 'high' : 'normal',
      isRead: !gmailData.labelIds?.includes('UNREAD')
    };
  }

  /**
   * Transform Outlook email to Gmail format
   */
  private transformOutlookToGmail(outlookData: any): any {
    return {
      subject: outlookData.subject || '',
      from: `${outlookData.from?.emailAddress?.name || ''} <${outlookData.from?.emailAddress?.address || ''}>`,
      to: outlookData.toRecipients?.[0] ? `${outlookData.toRecipients[0].emailAddress?.name || ''} <${outlookData.toRecipients[0].emailAddress?.address || ''}>` : '',
      body: outlookData.body?.content || '',
      snippet: outlookData.bodyPreview || '',
      internalDate: outlookData.receivedDateTime ? new Date(outlookData.receivedDateTime).getTime().toString() : Date.now().toString(),
      labelIds: [
        ...(outlookData.isRead ? [] : ['UNREAD']),
        ...(outlookData.importance === 'high' ? ['IMPORTANT'] : []),
        'INBOX'
      ]
    };
  }

  /**
   * Transform Google Calendar to Outlook Calendar
   */
  private transformGCalToOutlookCalendar(gcalData: any): any {
    return {
      subject: gcalData.summary || '',
      body: {
        content: gcalData.description || '',
        contentType: 'text'
      },
      start: {
        dateTime: gcalData.start?.dateTime || gcalData.start?.date,
        timeZone: gcalData.start?.timeZone || 'UTC'
      },
      end: {
        dateTime: gcalData.end?.dateTime || gcalData.end?.date,
        timeZone: gcalData.end?.timeZone || 'UTC'
      },
      location: {
        displayName: gcalData.location || ''
      },
      attendees: gcalData.attendees?.map((attendee: any) => ({
        emailAddress: {
          address: attendee.email,
          name: attendee.displayName
        },
        status: {
          response: attendee.responseStatus === 'accepted' ? 'accepted' :
                   attendee.responseStatus === 'declined' ? 'declined' : 'notResponded'
        }
      })) || []
    };
  }

  /**
   * Transform Trello card to Notion task
   */
  private transformTrelloToNotion(trelloData: any): any {
    return {
      parent: { type: 'database_id', database_id: 'tasks-database-id' },
      properties: {
        Name: {
          title: [{ text: { content: trelloData.name || '' } }]
        },
        Status: {
          select: { name: trelloData.list?.name || 'To Do' }
        },
        Description: {
          rich_text: [{ text: { content: trelloData.desc || '' } }]
        },
        'Due Date': trelloData.due ? {
          date: { start: new Date(trelloData.due).toISOString().split('T')[0] }
        } : null,
        Labels: {
          multi_select: trelloData.labels?.map((label: any) => ({ name: label.name })) || []
        }
      }
    };
  }

  /**
   * Transform Notion task to Trello card
   */
  private transformNotionToTrello(notionData: any): any {
    const properties = notionData.properties || {};
    return {
      name: properties.Name?.title?.[0]?.text?.content || 'Untitled Task',
      desc: properties.Description?.rich_text?.[0]?.text?.content || '',
      due: properties['Due Date']?.date?.start ? new Date(properties['Due Date'].date.start).toISOString() : null,
      labels: properties.Labels?.multi_select?.map((label: any) => ({ name: label.name })) || [],
      pos: 'bottom'
    };
  }

  /**
   * Transform Google Docs to Notion page
   */
  private transformGDocsToNotion(gdocsData: any): any {
    return {
      parent: { type: 'page_id', page_id: 'parent-page-id' },
      properties: {
        title: {
          title: [{ text: { content: gdocsData.title || 'Untitled Document' } }]
        }
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: gdocsData.body?.content || gdocsData.content || '' } }]
          }
        }
      ]
    };
  }

  /**
   * Transform Slack message to email format
   */
  private transformSlackToEmail(slackData: any): any {
    return {
      subject: `Slack message from ${slackData.user?.name || 'Unknown User'}`,
      from: `${slackData.user?.name || 'Slack'} <noreply@slack.com>`,
      body: `Channel: ${slackData.channel?.name || 'Unknown'}\n\nMessage: ${slackData.text || ''}\n\nTimestamp: ${new Date(parseFloat(slackData.ts) * 1000).toLocaleString()}`,
      timestamp: new Date(parseFloat(slackData.ts) * 1000).toISOString()
    };
  }

  /**
   * Transform email to task format
   */
  private transformEmailToTask(emailData: any): any {
    return {
      title: `Email: ${emailData.subject || 'No Subject'}`,
      description: `From: ${emailData.from}\n\n${emailData.body || emailData.snippet || ''}`,
      status: 'To Do',
      priority: emailData.importance === 'high' ? 'High' : 'Medium',
      labels: ['email-generated'],
      dueDate: null,
      source: {
        type: 'email',
        id: emailData.id,
        url: emailData.webLink || null
      }
    };
  }

  /**
   * Transform calendar event to task format
   */
  private transformCalendarToTask(calendarData: any): any {
    return {
      title: `Meeting: ${calendarData.summary || 'No Title'}`,
      description: `When: ${new Date(calendarData.start?.dateTime || calendarData.start?.date).toLocaleString()}\nWhere: ${calendarData.location || 'No location'}\n\n${calendarData.description || ''}`,
      status: 'In Progress',
      priority: 'Medium',
      labels: ['calendar-generated'],
      dueDate: calendarData.start?.dateTime || calendarData.start?.date,
      source: {
        type: 'calendar',
        id: calendarData.id,
        url: calendarData.htmlLink || null
      }
    };
  }

  // Validation functions

  /**
   * Validate email format
   */
  private validateEmailFormat(data: any): boolean {
    return data &&
           typeof data.subject === 'string' &&
           typeof data.from === 'string' &&
           (typeof data.body === 'string' || typeof data.snippet === 'string');
  }

  /**
   * Validate calendar format
   */
  private validateCalendarFormat(data: any): boolean {
    return data &&
           typeof data.summary === 'string' &&
           (data.start?.dateTime || data.start?.date) &&
           (data.end?.dateTime || data.end?.date);
  }

  /**
   * Validate task format
   */
  private validateTaskFormat(data: any): boolean {
    return data &&
           (typeof data.title === 'string' || typeof data.name === 'string');
  }

  /**
   * Validate message format
   */
  private validateMessageFormat(data: any): boolean {
    return data &&
           typeof data.text === 'string' &&
           data.ts;
  }

  /**
   * Validate document format
   */
  private validateDocumentFormat(data: any): boolean {
    return data &&
           typeof data.title === 'string' &&
           (typeof data.content === 'string' || typeof data.body === 'object');
  }

  // Utility functions

  /**
   * Parse email address from various formats
   */
  private parseEmailAddress(emailStr: string): string {
    if (!emailStr) return '';

    // Extract email from "Name <email@domain.com>" format
    const emailMatch = emailStr.match(/<([^>]+)>/);
    if (emailMatch) {
      return emailMatch[1];
    }

    // Return as-is if already just email
    return emailStr;
  }

  // Public API

  /**
   * Get available data formats
   */
  getDataFormats(): DataFormat[] {
    return Array.from(this.dataFormats.values());
  }

  /**
   * Get available transformations
   */
  getTransformations(): DataTransformation[] {
    return Array.from(this.transformations.values());
  }

  /**
   * Get sync rules
   */
  getSyncRules(): SyncRule[] {
    return Array.from(this.syncRules.values());
  }

  /**
   * Apply transformation to data
   */
  async transformData(transformId: string, data: any): Promise<any> {
    const transformation = this.transformations.get(transformId);
    if (!transformation) {
      throw new Error(`Transformation ${transformId} not found`);
    }

    if (!transformation.validate(data)) {
      throw new Error(`Data validation failed for transformation ${transformId}`);
    }

    try {
      const transformedData = transformation.transform(data);
      console.log(`[McpDataSync] Successfully transformed data using ${transformation.name}`);
      return transformedData;
    } catch (error) {
      console.error(`[McpDataSync] Transformation failed: ${transformation.name}`, error);
      throw error;
    }
  }

  /**
   * Detect optimal data format for server
   */
  detectOptimalFormat(serverId: string, dataType: string): DataFormat | null {
    for (const format of this.dataFormats.values()) {
      if (format.supportedTypes.includes(serverId) || format.supportedTypes.includes(dataType)) {
        return format;
      }
    }
    return null;
  }

  /**
   * Find transformation path between two servers
   */
  findTransformationPath(sourceServer: string, targetServer: string, dataType: string): string[] {
    const transformations = Array.from(this.transformations.values());
    const path: string[] = [];

    // Direct transformation
    const directTransform = transformations.find(t =>
      (t.sourceFormat === sourceServer || t.sourceFormat.includes(sourceServer)) &&
      (t.targetFormat === targetServer || t.targetFormat.includes(targetServer))
    );

    if (directTransform) {
      path.push(directTransform.transformId);
      return path;
    }

    // Multi-step transformation (simplified - could be improved with graph traversal)
    const sourceFormat = this.detectOptimalFormat(sourceServer, dataType);
    const targetFormat = this.detectOptimalFormat(targetServer, dataType);

    if (sourceFormat && targetFormat && sourceFormat.formatId !== targetFormat.formatId) {
      // Look for transformations through standard formats
      const toStandard = transformations.find(t =>
        t.sourceFormat === sourceServer && t.targetFormat === sourceFormat.formatId
      );
      const fromStandard = transformations.find(t =>
        t.sourceFormat === targetFormat.formatId && t.targetFormat === targetServer
      );

      if (toStandard) path.push(toStandard.transformId);
      if (fromStandard) path.push(fromStandard.transformId);
    }

    return path;
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    totalRules: number;
    activeRules: number;
    totalTransformations: number;
    totalFormats: number;
    recentConflicts: number;
  } {
    const rules = Array.from(this.syncRules.values());
    const conflicts = Array.from(this.conflicts.values());
    const recentConflicts = conflicts.filter(c =>
      Date.now() - c.timestamp.getTime() < 86400000 // last 24 hours
    );

    return {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.status === 'active').length,
      totalTransformations: this.transformations.size,
      totalFormats: this.dataFormats.size,
      recentConflicts: recentConflicts.length
    };
  }
}