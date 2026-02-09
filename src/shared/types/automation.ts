export type AutomationEventType =
  | 'thinking'
  | 'text_response'
  | 'step_start'
  | 'step_progress'
  | 'step_complete'
  | 'step_error'
  | 'input_required'
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

export interface InputRequest {
  requestId: string;
  fieldName: string;
  fieldDescription: string;
  inputType: 'text' | 'password' | 'email' | 'number' | 'select';
  placeholder?: string;
  options?: string[];
  toolUseId: string;
}
