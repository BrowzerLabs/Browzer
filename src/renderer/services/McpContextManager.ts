/**
 * MCP Context Manager Service
 *
 * Manages user context, preferences, and session state to provide
 * intelligent defaults and context-aware assistance.
 */

export interface UserPreferences {
  defaultEmailTime: string;
  preferredMeetingDurations: Record<string, number>; // meeting type -> duration in minutes
  workingHours: { start: string; end: string };
  timeZone: string;
  calendarDefaults: {
    defaultReminder: number; // minutes before event
    defaultDuration: number; // minutes
    workCalendar: string; // primary work calendar ID
  };
  emailDefaults: {
    signature: string;
    defaultSender: string;
  };
}

export interface UserContext {
  recentActions: Array<{
    action: string;
    intent: string;
    parameters: Record<string, any>;
    timestamp: Date;
    success: boolean;
  }>;
  frequentContacts: Array<{
    email: string;
    name: string;
    frequency: number;
    lastUsed: Date;
  }>;
  commonMeetingTimes: Array<{
    time: string;
    frequency: number;
  }>;
  recentEntities: {
    emails: Map<string, { count: number; lastUsed: Date }>;
    names: Map<string, { count: number; lastUsed: Date }>;
    subjects: Map<string, { count: number; lastUsed: Date }>;
    meetingTypes: Map<string, { count: number; lastUsed: Date }>;
  };
  sessionInfo: {
    startTime: Date;
    queryCount: number;
    successfulActions: number;
    failedActions: number;
  };
}

export interface ContextualSuggestion {
  type: 'email' | 'time' | 'duration' | 'subject' | 'recipient' | 'meeting_type';
  value: any;
  confidence: number;
  reason: string;
}

// Export compatibility interface for existing code
export interface ContextState {
  workflowId: string;
  parameters: Record<string, any>;
  stepResults: any[];
  metadata: Record<string, any>;
  startTime: Date;
}

export class McpContextManager {
  private preferences: UserPreferences;
  private context: UserContext;

  constructor() {
    this.preferences = this.loadDefaultPreferences();
    this.context = this.initializeUserContext();
  }

  /**
   * Get contextual suggestions for parameters
   */
  getContextualSuggestions(
    parameterName: string,
    intent: string,
    query: string,
    entities?: any
  ): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];

    switch (parameterName) {
      case 'to':
      case 'recipient':
        suggestions.push(...this.getEmailSuggestions(query, entities));
        break;

      case 'start_time':
      case 'time':
        suggestions.push(...this.getTimeSuggestions(query, intent));
        break;

      case 'subject':
        suggestions.push(...this.getSubjectSuggestions(query, entities, intent));
        break;

      case 'duration':
        suggestions.push(...this.getDurationSuggestions(query, entities));
        break;

      case 'title':
        suggestions.push(...this.getTitleSuggestions(query, entities, intent));
        break;
    }

    // Sort by confidence
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get email recipient suggestions
   */
  private getEmailSuggestions(query: string, entities?: any): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];

    // Recent contacts
    const recentContacts = this.context.frequentContacts
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, 5);

    for (const contact of recentContacts) {
      suggestions.push({
        type: 'recipient',
        value: contact.email,
        confidence: Math.min(contact.frequency / 10, 0.8),
        reason: `You frequently email ${contact.name || contact.email}`
      });
    }

    // If query mentions a name, try to match with contacts
    if (entities?.names?.length > 0) {
      const mentionedName = entities.names[0].toLowerCase();
      const matchingContact = this.context.frequentContacts.find(
        contact => contact.name?.toLowerCase().includes(mentionedName)
      );

      if (matchingContact) {
        suggestions.push({
          type: 'recipient',
          value: matchingContact.email,
          confidence: 0.9,
          reason: `Matched "${mentionedName}" with ${matchingContact.name}`
        });
      }
    }

    return suggestions;
  }

  /**
   * Get time suggestions
   */
  private getTimeSuggestions(query: string, intent: string): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    // Working hours suggestions
    const workStart = this.parseTime(this.preferences.workingHours.start);
    const workEnd = this.parseTime(this.preferences.workingHours.end);

    if (workStart && workEnd) {
      // Suggest next available working hour
      let suggestedHour = Math.max(currentHour + 1, workStart.hours);
      if (suggestedHour >= workEnd.hours) {
        // Suggest tomorrow morning
        suggestedHour = workStart.hours;
      }

      const timeStr = this.formatTime(suggestedHour, 0);
      suggestions.push({
        type: 'time',
        value: timeStr,
        confidence: 0.7,
        reason: 'Within your working hours'
      });
    }

    // Common meeting times
    for (const commonTime of this.context.commonMeetingTimes.slice(0, 3)) {
      suggestions.push({
        type: 'time',
        value: commonTime.time,
        confidence: Math.min(commonTime.frequency / 20, 0.6),
        reason: 'You often schedule meetings at this time'
      });
    }

    // Time-of-day based suggestions
    if (query.toLowerCase().includes('morning')) {
      suggestions.push({
        type: 'time',
        value: '9:00 AM',
        confidence: 0.8,
        reason: 'Morning preference detected'
      });
    } else if (query.toLowerCase().includes('afternoon')) {
      suggestions.push({
        type: 'time',
        value: '2:00 PM',
        confidence: 0.8,
        reason: 'Afternoon preference detected'
      });
    } else if (query.toLowerCase().includes('evening')) {
      suggestions.push({
        type: 'time',
        value: '6:00 PM',
        confidence: 0.8,
        reason: 'Evening preference detected'
      });
    }

    return suggestions;
  }

  /**
   * Get subject suggestions
   */
  private getSubjectSuggestions(query: string, entities: any, intent: string): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];

    // Recent subjects
    const recentSubjects = Array.from(this.context.recentEntities.subjects.entries())
      .sort(([, a], [, b]) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, 3);

    for (const [subject, info] of recentSubjects) {
      suggestions.push({
        type: 'subject',
        value: subject,
        confidence: Math.min(info.count / 5, 0.5),
        reason: 'You recently used this subject'
      });
    }

    // Generate subject based on entities
    if (entities?.names?.length > 0) {
      suggestions.push({
        type: 'subject',
        value: `Meeting with ${entities.names[0]}`,
        confidence: 0.7,
        reason: 'Based on mentioned contact'
      });
    }

    // Intent-based suggestions
    if (intent === 'calendar_create') {
      const meetingTypes = ['Team Meeting', 'One-on-One', 'Project Discussion', 'Follow-up'];
      for (const type of meetingTypes) {
        suggestions.push({
          type: 'subject',
          value: type,
          confidence: 0.4,
          reason: 'Common meeting type'
        });
      }
    }

    return suggestions;
  }

  /**
   * Get duration suggestions
   */
  private getDurationSuggestions(query: string, entities: any): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];

    // Default durations based on meeting type
    const defaultDurations = [30, 60, 90]; // minutes

    for (const duration of defaultDurations) {
      suggestions.push({
        type: 'duration',
        value: duration,
        confidence: duration === 30 ? 0.6 : 0.4, // 30 minutes is most common
        reason: `${duration} minutes is a common meeting duration`
      });
    }

    return suggestions;
  }

  /**
   * Get title suggestions
   */
  private getTitleSuggestions(query: string, entities: any, intent: string): ContextualSuggestion[] {
    const suggestions: ContextualSuggestion[] = [];

    // Recent meeting types
    const recentMeetingTypes = Array.from(this.context.recentEntities.meetingTypes.entries())
      .sort(([, a], [, b]) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, 3);

    for (const [meetingType, info] of recentMeetingTypes) {
      suggestions.push({
        type: 'meeting_type',
        value: meetingType,
        confidence: Math.min(info.count / 5, 0.6),
        reason: 'You recently created similar meetings'
      });
    }

    return suggestions;
  }

  /**
   * Learn from user actions
   */
  learnFromAction(
    intent: string,
    parameters: Record<string, any>,
    success: boolean
  ): void {
    // Record the action
    this.context.recentActions.push({
      action: intent,
      intent,
      parameters,
      timestamp: new Date(),
      success
    });

    // Update session stats
    this.context.sessionInfo.queryCount++;
    if (success) {
      this.context.sessionInfo.successfulActions++;
    } else {
      this.context.sessionInfo.failedActions++;
    }

    // Learn from successful actions
    if (success) {
      this.updateEntityFrequencies(parameters);
      this.updateContactUsage(parameters);
      this.updateTimePatterns(parameters);
    }

    // Cleanup old actions (keep last 100)
    if (this.context.recentActions.length > 100) {
      this.context.recentActions.splice(0, this.context.recentActions.length - 100);
    }

    console.log('[McpContextManager] Learned from action:', { intent, success });
  }

  /**
   * Update entity frequencies
   */
  private updateEntityFrequencies(parameters: Record<string, any>): void {
    const now = new Date();

    // Update emails
    if (parameters.to || parameters.recipient) {
      const email = parameters.to || parameters.recipient;
      this.updateEntityFrequency(this.context.recentEntities.emails, email, now);
    }

    // Update subjects
    if (parameters.subject) {
      this.updateEntityFrequency(this.context.recentEntities.subjects, parameters.subject, now);
    }

    // Update meeting types
    if (parameters.title && parameters.title.includes('Meeting')) {
      this.updateEntityFrequency(this.context.recentEntities.meetingTypes, parameters.title, now);
    }
  }

  /**
   * Update entity frequency helper
   */
  private updateEntityFrequency(
    entityMap: Map<string, { count: number; lastUsed: Date }>,
    entity: string,
    timestamp: Date
  ): void {
    const existing = entityMap.get(entity);
    if (existing) {
      existing.count++;
      existing.lastUsed = timestamp;
    } else {
      entityMap.set(entity, { count: 1, lastUsed: timestamp });
    }
  }

  /**
   * Update contact usage
   */
  private updateContactUsage(parameters: Record<string, any>): void {
    const email = parameters.to || parameters.recipient;
    if (!email) return;

    const existing = this.context.frequentContacts.find(c => c.email === email);
    if (existing) {
      existing.frequency++;
      existing.lastUsed = new Date();
    } else {
      this.context.frequentContacts.push({
        email,
        name: parameters.name || email.split('@')[0],
        frequency: 1,
        lastUsed: new Date()
      });
    }

    // Sort and limit contacts
    this.context.frequentContacts.sort((a, b) => b.frequency - a.frequency);
    if (this.context.frequentContacts.length > 50) {
      this.context.frequentContacts.splice(50);
    }
  }

  /**
   * Update time patterns
   */
  private updateTimePatterns(parameters: Record<string, any>): void {
    const timeParam = parameters.start_time || parameters.time;
    if (!timeParam) return;

    let timeStr: string;
    if (timeParam instanceof Date) {
      timeStr = this.formatTime(timeParam.getHours(), timeParam.getMinutes());
    } else if (typeof timeParam === 'string') {
      timeStr = timeParam;
    } else {
      return;
    }

    const existing = this.context.commonMeetingTimes.find(t => t.time === timeStr);
    if (existing) {
      existing.frequency++;
    } else {
      this.context.commonMeetingTimes.push({ time: timeStr, frequency: 1 });
    }

    // Sort and limit
    this.context.commonMeetingTimes.sort((a, b) => b.frequency - a.frequency);
    if (this.context.commonMeetingTimes.length > 20) {
      this.context.commonMeetingTimes.splice(20);
    }
  }

  /**
   * Get user preferences
   */
  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * Update user preferences
   */
  updatePreferences(updates: Partial<UserPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
    this.savePreferences();
  }

  /**
   * Get session statistics
   */
  getSessionStats(): any {
    return {
      ...this.context.sessionInfo,
      successRate: this.context.sessionInfo.queryCount > 0
        ? this.context.sessionInfo.successfulActions / this.context.sessionInfo.queryCount
        : 0,
      recentActions: this.context.recentActions.slice(-10),
      topContacts: this.context.frequentContacts.slice(0, 5),
      commonTimes: this.context.commonMeetingTimes.slice(0, 5)
    };
  }

  /**
   * Reset context (for new sessions)
   */
  resetContext(): void {
    this.context = this.initializeUserContext();
  }

  // Compatibility methods for existing code

  /**
   * Initialize context for workflow (compatibility method)
   */
  initializeContext(workflowId?: string): ContextState {
    return {
      workflowId: workflowId || `workflow_${Date.now()}`,
      parameters: {},
      stepResults: [],
      metadata: {},
      startTime: new Date()
    };
  }

  /**
   * Cleanup context for workflow (compatibility method)
   */
  cleanupContext(workflowId: string): void {
    console.log('[McpContextManager] Cleaning up workflow context:', workflowId);
    // In a full implementation, this would clean up specific workflow data
  }

  /**
   * Get context for workflow (compatibility method)
   */
  getContext(workflowId: string): ContextState | null {
    // In a full implementation, this would retrieve specific workflow context
    return this.initializeContext(workflowId);
  }

  /**
   * Transform parameters (compatibility method)
   */
  transformParameters(workflowId: string, stepId: string, parameters: Record<string, any>): Record<string, any> {
    // Apply context-aware transformations
    console.log('[McpContextManager] Transforming parameters for:', workflowId, stepId);
    return { ...parameters };
  }

  /**
   * Store step result (compatibility method)
   */
  storeStepResult(workflowId: string, stepId: string, result: any, outputVariable?: string): void {
    console.log('[McpContextManager] Storing step result:', workflowId, stepId, outputVariable);
    // In a full implementation, this would store to a workflow-specific context
  }

  /**
   * Get context summary (compatibility method)
   */
  getContextSummary(workflowId: string): string {
    return `Workflow ${workflowId}: context summary`;
  }

  // Private helper methods

  private loadDefaultPreferences(): UserPreferences {
    // In a real implementation, this would load from storage
    return {
      defaultEmailTime: '9:00 AM',
      preferredMeetingDurations: {
        'standup': 15,
        'one-on-one': 30,
        'team-meeting': 60,
        'presentation': 90
      },
      workingHours: { start: '9:00 AM', end: '5:00 PM' },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      calendarDefaults: {
        defaultReminder: 15,
        defaultDuration: 30,
        workCalendar: 'primary'
      },
      emailDefaults: {
        signature: '',
        defaultSender: ''
      }
    };
  }

  private initializeUserContext(): UserContext {
    return {
      recentActions: [],
      frequentContacts: [],
      commonMeetingTimes: [],
      recentEntities: {
        emails: new Map(),
        names: new Map(),
        subjects: new Map(),
        meetingTypes: new Map()
      },
      sessionInfo: {
        startTime: new Date(),
        queryCount: 0,
        successfulActions: 0,
        failedActions: 0
      }
    };
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } | null {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;

    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const ampm = match[3]?.toUpperCase();

    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return { hours, minutes };
  }

  private formatTime(hours: number, minutes: number): string {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  private savePreferences(): void {
    // In a real implementation, this would save to storage
    console.log('[McpContextManager] Preferences updated');
  }
}