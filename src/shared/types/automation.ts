export type ScheduleType =
  | 'one_time'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly';

export enum ScheduledAutomationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export interface ScheduledAutomation {
  id: string;
  name: string;
  userGoal: string;
  recordingId: string;
  type: ScheduleType;
  status: ScheduledAutomationStatus;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  successCount: number;
  failureCount: number;
  endTime?: number;
  runCount: number;
  enabled: boolean;
}

export interface ScheduledAutomationRun {
  id: string;
  scheduledAutomationId: string;
  startTime: number;
  endTime?: number;
  status: ScheduledAutomationStatus;
  error?: string;
  result?: any;
}

export interface CreateScheduledAutomationParams {
  name: string;
  userGoal: string;
  recordingId: string;
  type: ScheduleType;
}

export interface UpdateScheduledAutomationParams {
  id: string;
  name?: string;
  userGoal?: string;
  recordingId?: string;
  type?: ScheduleType;
  enabled?: boolean;
}

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
