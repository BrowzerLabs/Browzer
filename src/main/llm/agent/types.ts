export interface AutopilotConfig {
  maxSteps: number;
  maxConsecutiveFailures: number;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  maxSteps: 100,
  maxConsecutiveFailures: 3,
};

export type AutopilotStatus = 'running' | 'completed' | 'failed' | 'stopped';

export type AutopilotEventType =
  | 'thinking'
  | 'step_start'
  | 'step_complete'
  | 'step_error'
  | 'text_response'
  | 'plan_generated'
  | 'autopilot_stopped'
  | 'autopilot_error'
  | 'autopilot_complete';

export interface AutopilotProgressEvent {
  id: string;
  sessionId: string;
  type: AutopilotEventType;
  data: Record<string, unknown>;
  timestamp: number;
}
