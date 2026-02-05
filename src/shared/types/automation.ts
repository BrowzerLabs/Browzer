export type AutomationEventType =
  | 'thinking'
  | 'text_response'
  | 'step_start'
  | 'step_progress'
  | 'step_complete'
  | 'step_error'
  | 'automation_complete'
  | 'automation_error'
  | 'automation_stopped';

export interface AutomationProgressEvent {
  type: AutomationEventType;
  data: any;
}

export enum AutomationStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

export interface ToolExecutionResult {
  success: boolean;
  value?: string;
  error?: string;
}

export type ScheduleFrequency =
  | 'one-time'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly';

export enum ScheduledAutomationStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ScheduledAutomation {
  id: string;
  name: string;
  userGoal: string;
  recordingId: string;
  frequency: ScheduleFrequency;
  scheduledTime: string; // ISO date string for one-time, or cron-like reference time
  dayOfWeek?: number; // 0-6 (Sun-Sat) for weekly
  dayOfMonth?: number; // 1-31 for monthly
  hour: number; // 0-23
  minute: number; // 0-59
  status: ScheduledAutomationStatus;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunStatus?: AutomationStatus;
  lastRunOutput?: string;
  lastRunError?: string;
  nextRunAt?: string; // ISO date string
  runCount: number;
}

export interface CreateScheduledAutomationInput {
  name: string;
  userGoal: string;
  recordingId: string;
  frequency: ScheduleFrequency;
  scheduledTime: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour: number;
  minute: number;
}

export interface ScheduledAutomationRunLog {
  id: string;
  scheduledAutomationId: string;
  startedAt: number;
  completedAt?: number;
  status: AutomationStatus;
  error?: string;
  output?: string;
}
