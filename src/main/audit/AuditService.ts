import { AuditStore } from './AuditStore';

import { AuthService } from '@/main/auth';
import {
  AuditAgentMode,
  AuditStatus,
  AuditLog,
  AuditLogWithEvents,
  AuditStats,
  AuditFilters,
} from '@/shared/types/audit';
import { AutomationEventType } from '@/shared/types/automation';

export class AuditService {
  private store: AuditStore;
  private authService: AuthService;
  private activeAuditIds: Map<string, string> = new Map();

  constructor(authService: AuthService) {
    this.store = new AuditStore();
    this.authService = authService;
  }

  private async getCurrentUserEmail(): Promise<string> {
    const user = await this.authService.getCurrentUser();
    return user?.email || 'unknown';
  }

  async startSession(params: {
    sessionId: string;
    recordingId: string | null;
    agentMode: AuditAgentMode;
    userGoal: string;
    startUrl?: string;
  }): Promise<string> {
    console.log(
      `[AuditService] startSession called with agentMode: ${params.agentMode}`
    );
    const userEmail = await this.getCurrentUserEmail();

    const auditId = this.store.createLog({
      sessionId: params.sessionId,
      recordingId: params.recordingId,
      userEmail,
      agentMode: params.agentMode,
      userGoal: params.userGoal,
      startUrl: params.startUrl,
    });

    this.activeAuditIds.set(params.sessionId, auditId);

    console.log(
      `[AuditService] Started audit session: ${auditId} for automation session: ${params.sessionId}, agentMode: ${params.agentMode}`
    );

    return auditId;
  }

  recordEvent(
    auditId: string,
    eventType: AutomationEventType,
    eventData: Record<string, unknown>
  ): void {
    try {
      this.store.addEvent(auditId, eventType, eventData);
    } catch (error) {
      console.error('[AuditService] Failed to record event:', error);
    }
  }

  recordEventBySessionId(
    sessionId: string,
    eventType: AutomationEventType,
    eventData: Record<string, unknown>
  ): void {
    const auditId = this.activeAuditIds.get(sessionId);
    if (auditId) {
      this.recordEvent(auditId, eventType, eventData);
    } else {
      console.warn(
        `[AuditService] No active audit found for session: ${sessionId}`
      );
    }
  }

  endSession(
    auditId: string,
    status: AuditStatus,
    resultMessage?: string
  ): void {
    console.log(
      `[AuditService] endSession called: auditId=${auditId}, status=${status}`
    );

    const log = this.store.getLog(auditId);
    if (!log) {
      console.warn(`[AuditService] Audit log not found: ${auditId}`);
      return;
    }

    console.log(
      `[AuditService] Current log status: ${log.status}, updating to: ${status}`
    );

    const updateResult = this.store.updateLog(auditId, {
      status,
      endedAt: Date.now(),
      resultMessage,
    });

    console.log(`[AuditService] updateLog result: ${updateResult}`);

    for (const [sessionId, id] of this.activeAuditIds.entries()) {
      if (id === auditId) {
        this.activeAuditIds.delete(sessionId);
        break;
      }
    }

    console.log(
      `[AuditService] Ended audit session: ${auditId} with status: ${status}`
    );
  }

  endSessionBySessionId(
    sessionId: string,
    status: AuditStatus,
    resultMessage?: string
  ): void {
    const auditId = this.activeAuditIds.get(sessionId);
    if (auditId) {
      this.endSession(auditId, status, resultMessage);
    } else {
      console.warn(
        `[AuditService] No active audit found for session: ${sessionId}`
      );
    }
  }

  getAuditIdBySessionId(sessionId: string): string | undefined {
    return this.activeAuditIds.get(sessionId);
  }

  setVideoPath(auditId: string, videoPath: string): void {
    try {
      this.store.updateVideoPath(auditId, videoPath);
      console.log(`[AuditService] Video path set for audit: ${auditId}`);
    } catch (error) {
      console.error('[AuditService] Failed to set video path:', error);
    }
  }

  getLog(id: string): AuditLog | undefined {
    return this.store.getLog(id);
  }

  getLogWithEvents(id: string): AuditLogWithEvents | undefined {
    return this.store.getLogWithEvents(id);
  }

  getAllLogs(limit?: number, offset?: number): AuditLog[] {
    return this.store.getAllLogs(limit, offset);
  }

  getFilteredLogs(filters: AuditFilters): AuditLog[] {
    return this.store.getFilteredLogs(filters);
  }

  searchLogs(query: string, limit?: number): AuditLog[] {
    return this.store.searchLogs(query, limit);
  }

  deleteLog(id: string): boolean {
    return this.store.deleteLog(id);
  }

  clearAll(): void {
    this.store.clearAll();
  }

  getStats(): AuditStats {
    return this.store.getStats();
  }

  getStore(): AuditStore {
    return this.store;
  }

  destroy(): void {
    this.activeAuditIds.clear();
    this.store.close();
  }
}
