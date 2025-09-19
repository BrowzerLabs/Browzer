/**
 * MCP Workflow Templates
 *
 * Common workflow pattern templates for "Get it done" mode:
 * - Email-Calendar workflows
 * - Project management workflows
 * - Multi-platform data synchronization
 * - Communication workflows
 *
 * Week 6: MCP Workflow Templates & Optimization
 */

import { ConditionalWorkflow, WorkflowStep } from './McpWorkflowOrchestrator';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  category: 'email-calendar' | 'project-management' | 'communication' | 'data-sync' | 'generic';
  complexity: 'simple' | 'medium' | 'complex';
  estimatedDuration: number; // in seconds
  generateWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow;
}

export class McpWorkflowTemplates {
  private templates: WorkflowTemplate[] = [];

  constructor() {
    this.initializeTemplates();
  }

  /**
   * Initialize common workflow templates
   */
  private initializeTemplates(): void {
    this.templates = [
      // Email-Calendar Templates
      {
        id: 'email-schedule-conditional',
        name: 'Email-Schedule-Conditional',
        description: 'Read email, schedule meeting, or reply if no time available',
        pattern: /.+email.+setup.+meeting.+if\s+no.+time.+reply|.+email.+schedule.+meeting.+if\s+no.+time.+reply/i,
        category: 'email-calendar',
        complexity: 'complex',
        estimatedDuration: 45,
        generateWorkflow: this.generateEmailScheduleConditionalWorkflow.bind(this)
      },
      {
        id: 'email-calendar-sync',
        name: 'Email-Calendar-Sync',
        description: 'Create calendar event from email and notify participants',
        pattern: /create.+calendar.+event.+from.+email.+notify/i,
        category: 'email-calendar',
        complexity: 'medium',
        estimatedDuration: 30,
        generateWorkflow: this.generateEmailCalendarSyncWorkflow.bind(this)
      },

      // Project Management Templates
      {
        id: 'jira-board-tickets',
        name: 'JIRA-Board-Tickets',
        description: 'Get board ID then retrieve all tickets from board',
        pattern: /get.+board.+id.+then.+get.+tickets|get.+tickets.+from.+board/i,
        category: 'project-management',
        complexity: 'medium',
        estimatedDuration: 25,
        generateWorkflow: this.generateJiraBoardTicketsWorkflow.bind(this)
      },
      {
        id: 'trello-card-creation',
        name: 'Trello-Card-Creation',
        description: 'Create Trello card and add to specific list/board',
        pattern: /create.+trello.+card.+add.+to/i,
        category: 'project-management',
        complexity: 'simple',
        estimatedDuration: 15,
        generateWorkflow: this.generateTrelloCardCreationWorkflow.bind(this)
      },

      // Communication Templates
      {
        id: 'slack-notification-workflow',
        name: 'Slack-Notification-Workflow',
        description: 'Send message to Slack channel and follow up conditionally',
        pattern: /send.+slack.+message.+if.+no.+response/i,
        category: 'communication',
        complexity: 'complex',
        estimatedDuration: 35,
        generateWorkflow: this.generateSlackNotificationWorkflow.bind(this)
      },
      {
        id: 'multi-platform-announcement',
        name: 'Multi-Platform-Announcement',
        description: 'Post announcement across multiple communication platforms',
        pattern: /announce.+on.+slack.+and.+email/i,
        category: 'communication',
        complexity: 'medium',
        estimatedDuration: 20,
        generateWorkflow: this.generateMultiPlatformAnnouncementWorkflow.bind(this)
      },

      // Data Sync Templates
      {
        id: 'notion-docs-sync',
        name: 'Notion-Docs-Sync',
        description: 'Create Notion page from document and share with team',
        pattern: /create.+notion.+page.+from.+doc.+share/i,
        category: 'data-sync',
        complexity: 'medium',
        estimatedDuration: 30,
        generateWorkflow: this.generateNotionDocsSyncWorkflow.bind(this)
      },
      {
        id: 'email-document-workflow',
        name: 'Email-Document-Workflow',
        description: 'Extract info from email, create document, and send back',
        pattern: /extract.+from.+email.+create.+document.+send/i,
        category: 'data-sync',
        complexity: 'complex',
        estimatedDuration: 40,
        generateWorkflow: this.generateEmailDocumentWorkflow.bind(this)
      }
    ];
  }

  /**
   * Find matching template for a query
   */
  findMatchingTemplate(query: string): { template: WorkflowTemplate, matches: RegExpMatchArray } | null {
    for (const template of this.templates) {
      const matches = query.match(template.pattern);
      if (matches) {
        console.log(`[McpWorkflowTemplates] Found matching template: ${template.name}`);
        return { template, matches };
      }
    }
    return null;
  }

  /**
   * Get template suggestions based on query keywords
   */
  suggestTemplates(query: string): WorkflowTemplate[] {
    const queryLower = query.toLowerCase();
    const suggestions: Array<{ template: WorkflowTemplate, score: number }> = [];

    for (const template of this.templates) {
      let score = 0;
      const keywords = template.description.toLowerCase().split(' ');

      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          score += 1;
        }
      }

      if (score > 0) {
        suggestions.push({ template, score });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.template);
  }

  /**
   * Get all templates by category
   */
  getTemplatesByCategory(category: WorkflowTemplate['category']): WorkflowTemplate[] {
    return this.templates.filter(t => t.category === category);
  }

  /**
   * Generate email-schedule-conditional workflow
   * "Read email from user and setup meeting. If no convenient time, reply asking for slots"
   */
  private generateEmailScheduleConditionalWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `email_schedule_conditional_${Date.now()}`;

    const steps: WorkflowStep[] = [
      // Step 1: Read email
      {
        stepId: 'read_email',
        stepType: 'execute',
        toolName: 'zap2.gmail_find_email',
        query: 'get latest email',
        parameters: { searchQuery: 'in:inbox', maxResults: 1 }
      },

      // Step 2: Check calendar availability
      {
        stepId: 'check_calendar',
        stepType: 'execute',
        toolName: 'zap2.google_calendar_find_events',
        query: 'check calendar availability today',
        parameters: { timeMin: new Date().toISOString() }
      },

      // Step 3: Conditional logic - Schedule or Reply
      {
        stepId: 'schedule_or_reply',
        stepType: 'conditional',
        conditional: {
          condition: 'calendar available',
          conditionType: 'custom',
          conditionTarget: 'check_calendar',
          trueSteps: [{
            stepId: 'schedule_meeting',
            stepType: 'execute',
            toolName: 'zap2.google_calendar_quick_add_event',
            query: 'schedule meeting',
            parameters: { summary: 'Meeting from email', duration: 60 }
          }],
          falseSteps: [{
            stepId: 'reply_for_slots',
            stepType: 'execute',
            toolName: 'zap2.gmail_send_email',
            query: 'reply asking for available time slots',
            parameters: {
              subject: 'Re: Meeting Request - Need Alternative Times',
              body: 'I cannot meet at the suggested time. Could you please provide alternative time slots?'
            }
          }]
        }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate JIRA board-tickets workflow
   * "Get list of open tickets on JIRA XYZ board"
   */
  private generateJiraBoardTicketsWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `jira_board_tickets_${Date.now()}`;

    const steps: WorkflowStep[] = [
      // Step 1: Get board ID
      {
        stepId: 'get_board_id',
        stepType: 'execute',
        toolName: 'jira.get_boards',
        query: 'find board by name',
        parameters: { name: matches[1] || 'XYZ' }
      },

      // Step 2: Get tickets from board
      {
        stepId: 'get_board_tickets',
        stepType: 'execute',
        toolName: 'jira.get_board_issues',
        query: 'get all open tickets from board ${board_id}',
        parameters: { status: 'open', dependsOn: ['get_board_id'] }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate email-calendar sync workflow
   */
  private generateEmailCalendarSyncWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `email_calendar_sync_${Date.now()}`;

    const steps: WorkflowStep[] = [
      {
        stepId: 'read_email',
        stepType: 'execute',
        toolName: 'zap2.gmail_find_email',
        query: 'get email with meeting details',
        parameters: { searchQuery: 'meeting OR calendar OR schedule' }
      },
      {
        stepId: 'create_calendar_event',
        stepType: 'execute',
        toolName: 'zap2.google_calendar_quick_add_event',
        query: 'create calendar event from email ${emails_1}',
        parameters: { dependsOn: ['read_email'] }
      },
      {
        stepId: 'notify_participants',
        stepType: 'execute',
        toolName: 'zap2.gmail_send_email',
        query: 'notify participants about calendar event',
        parameters: { dependsOn: ['create_calendar_event'] }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate Trello card creation workflow
   */
  private generateTrelloCardCreationWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `trello_card_creation_${Date.now()}`;

    const steps: WorkflowStep[] = [
      {
        stepId: 'create_trello_card',
        stepType: 'execute',
        toolName: 'trello.create_card',
        query: 'create new Trello card',
        parameters: {
          name: matches[1] || 'New Task',
          description: 'Created from "Get it done" mode'
        }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate Slack notification workflow
   */
  private generateSlackNotificationWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `slack_notification_${Date.now()}`;

    const steps: WorkflowStep[] = [
      {
        stepId: 'send_slack_message',
        stepType: 'execute',
        toolName: 'slack.send_message',
        query: 'send Slack message',
        parameters: { channel: '#general', text: matches[1] || 'Notification' }
      },
      {
        stepId: 'check_response',
        stepType: 'conditional',
        conditional: {
          condition: 'no response after 1 hour',
          conditionType: 'custom',
          conditionTarget: 'send_slack_message',
          trueSteps: [{
            stepId: 'follow_up_email',
            stepType: 'execute',
            toolName: 'zap2.gmail_send_email',
            query: 'send follow-up email',
            parameters: { subject: 'Follow-up: Slack Message' }
          }],
          falseSteps: []
        }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate multi-platform announcement workflow
   */
  private generateMultiPlatformAnnouncementWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `multi_platform_announcement_${Date.now()}`;

    const steps: WorkflowStep[] = [
      {
        stepId: 'post_to_slack',
        stepType: 'execute',
        toolName: 'slack.send_message',
        query: 'post announcement to Slack',
        parameters: { channel: '#announcements' }
      },
      {
        stepId: 'send_email_announcement',
        stepType: 'execute',
        toolName: 'zap2.gmail_send_email',
        query: 'send email announcement to team',
        parameters: { subject: 'Team Announcement' }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate Notion-docs sync workflow
   */
  private generateNotionDocsSyncWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `notion_docs_sync_${Date.now()}`;

    const steps: WorkflowStep[] = [
      {
        stepId: 'read_document',
        stepType: 'execute',
        toolName: 'filesystem.read_file',
        query: 'read document content',
        parameters: {}
      },
      {
        stepId: 'create_notion_page',
        stepType: 'execute',
        toolName: 'notion.create_page',
        query: 'create Notion page from document ${document_content}',
        parameters: { dependsOn: ['read_document'] }
      },
      {
        stepId: 'share_with_team',
        stepType: 'execute',
        toolName: 'slack.send_message',
        query: 'share Notion page link with team',
        parameters: { dependsOn: ['create_notion_page'] }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Generate email-document workflow
   */
  private generateEmailDocumentWorkflow(query: string, matches: RegExpMatchArray): ConditionalWorkflow {
    const workflowId = `email_document_${Date.now()}`;

    const steps: WorkflowStep[] = [
      {
        stepId: 'extract_from_email',
        stepType: 'execute',
        toolName: 'zap2.gmail_find_email',
        query: 'extract information from email',
        parameters: {}
      },
      {
        stepId: 'create_document',
        stepType: 'execute',
        toolName: 'gdocs.create_document',
        query: 'create document from email content ${email_content}',
        parameters: { dependsOn: ['extract_from_email'] }
      },
      {
        stepId: 'send_document_back',
        stepType: 'execute',
        toolName: 'zap2.gmail_send_email',
        query: 'send document back to sender',
        parameters: { dependsOn: ['create_document'] }
      }
    ];

    return {
      workflowId,
      steps,
      context: {},
      currentStepIndex: 0,
      status: 'pending'
    };
  }

  /**
   * Get workflow performance statistics
   */
  getTemplateStats(): { [category: string]: { count: number, avgDuration: number } } {
    const stats: { [category: string]: { count: number, avgDuration: number } } = {};

    for (const template of this.templates) {
      if (!stats[template.category]) {
        stats[template.category] = { count: 0, avgDuration: 0 };
      }
      stats[template.category].count++;
      stats[template.category].avgDuration += template.estimatedDuration;
    }

    // Calculate averages
    for (const category in stats) {
      stats[category].avgDuration = Math.round(stats[category].avgDuration / stats[category].count);
    }

    return stats;
  }
}