export type AutomationEventType =
  | 'thinking'
  | 'text_response'
  | 'step_start'
  | 'step_progress'
  | 'step_complete'
  | 'step_error'
  | 'automation_complete'
  | 'automation_error'
  | 'automation_stopped'
  | 'recording_updated';

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
