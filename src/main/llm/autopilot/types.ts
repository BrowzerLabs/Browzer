export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  is_error: boolean;
  content: string;
}

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

export interface AutopilotStartResponse {
  session_id: string;
  actions: ToolCall[];
  messages: Record<string, unknown>[];
  message?: string;
}

export interface AutopilotStepResponse {
  status: string;
  actions: ToolCall[];
  messages: Record<string, unknown>[];
  message?: string;
  result?: {
    success: boolean;
    message: string;
  };
  step_count: number;
}
