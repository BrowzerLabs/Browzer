import { AutomationEventType } from './automation';

export type AuditAgentMode = 'automate' | 'autopilot';

export type AuditStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface AuditEvent {
  id: string;
  auditLogId: string;
  eventType: AutomationEventType;
  eventData: Record<string, unknown>;
  timestamp: number;
}

export interface AuditLog {
  id: string;
  sessionId: string;
  recordingId: string | null;
  userEmail: string;
  agentMode: AuditAgentMode;
  userGoal: string;
  startUrl?: string;
  status: AuditStatus;
  startedAt: number;
  endedAt?: number;
  totalSteps: number;
  resultMessage?: string;
  videoPath?: string;
}

export interface AuditLogWithEvents extends AuditLog {
  events: AuditEvent[];
}

export interface AuditStats {
  totalLogs: number;
  completedCount: number;
  failedCount: number;
  stoppedCount: number;
  runningCount: number;
  automateCount: number;
  autopilotCount: number;
  averageSteps: number;
}

export interface AuditFilters {
  userEmail?: string;
  agentMode?: AuditAgentMode;
  status?: AuditStatus;
  startDate?: number;
  endDate?: number;
  searchQuery?: string;
}
