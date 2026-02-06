import { BaseWindow, WebContentsView } from 'electron';

import { v4 as uuidv4 } from 'uuid';

import {
  AutopilotExecutionService,
  AutopilotProgressEvent,
} from './AutopilotExecutionService';
import { AutopilotConfig } from './types';

import { ExecutionService } from '@/main/automation';
import { AuditService, AuditScreenRecordingService } from '@/main/audit';
import { RecordingSession } from '@/shared/types';
import { TabService } from '@/main/browser';

export class AutopilotService {
  private sessions: Map<string, AutopilotExecutionService> = new Map();
  private electronId: string;
  private auditService: AuditService | null = null;
  private stoppedSessions: Set<string> = new Set();
  private screenRecordingService: AuditScreenRecordingService | null = null;
  private activeRecordingSessions: Map<string, string> = new Map();

  constructor(
    private tabService: TabService,
    private browserUIView: WebContentsView,
    private baseWindow: BaseWindow
  ) {
    this.electronId = uuidv4();
  }

  public setAuditService(auditService: AuditService): void {
    this.auditService = auditService;
  }

  public async executeAutopilot(
    userGoal: string,
    startUrl?: string,
    referenceRecording?: RecordingSession,
    config?: Partial<AutopilotConfig>
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    console.log(
      `[AutopilotManager] Starting autopilot for goal: "${userGoal}"`
    );
    if (referenceRecording) {
      console.log(
        `[AutopilotManager] Using reference recording: "${referenceRecording.name}" with ${referenceRecording.actions.length} actions`
      );
    }

    // Create an ExecutionService for this tab
    const executionService = new ExecutionService(this.tabService);

    const executor = new AutopilotExecutionService(
      executionService,
      this.electronId
    );
    const sessionId = executor.getSessionId();

    this.sessions.set(sessionId, executor);

    const effectiveStartUrl = startUrl || 'browzer://home';

    let auditId: string | null = null;
    console.log(
      `[AutopilotManager] Starting audit - hasAuditService=${!!this.auditService}`
    );
    if (this.auditService) {
      try {
        auditId = await this.auditService.startSession({
          sessionId,
          recordingId: referenceRecording?.id || null,
          agentMode: 'autopilot',
          userGoal,
          startUrl: effectiveStartUrl,
        });
        console.log(
          `[AutopilotManager] Audit session started - auditId=${auditId}, sessionId=${sessionId}`
        );

        await this.startScreenRecording(sessionId, auditId);
      } catch (error) {
        console.error(
          '[AutopilotManager] Failed to start audit session:',
          error
        );
      }
    } else {
      console.warn('[AutopilotManager] No auditService available!');
    }

    executor.on('progress', (event: AutopilotProgressEvent) => {
      if (auditId && this.auditService) {
        this.auditService.recordEvent(auditId, event.type, event.data || {});
      }

      this.sendToRenderer('automation:progress', {
        sessionId,
        event,
      });
    });

    const executionPromise = executor.execute(
      userGoal,
      effectiveStartUrl,
      referenceRecording,
      config
    );

    executionPromise
      .then(async (result) => {
        try {
          console.log(
            `[AutopilotManager] .then() entered - Autopilot completed: ${result.success ? 'SUCCESS' : 'FAILED'}`
          );

          await this.stopScreenRecording(sessionId, auditId);

          this.sendToRenderer('automation:complete', {
            sessionId,
            result: {
              success: result.success,
              message: result.message,
              totalStepsExecuted: result.stepCount,
            },
          });

          console.log(
            `[AutopilotManager] Audit session check: auditId=${auditId}, hasAuditService=${!!this.auditService}, isStopped=${this.stoppedSessions.has(sessionId)}`
          );
          if (
            auditId &&
            this.auditService &&
            !this.stoppedSessions.has(sessionId)
          ) {
            const status = result.success ? 'completed' : 'failed';
            console.log(
              `[AutopilotManager] Calling endSession with auditId=${auditId}, status=${status}`
            );
            this.auditService.endSession(auditId, status, result.message);
            console.log(`[AutopilotManager] endSession completed successfully`);
          } else {
            console.log(
              `[AutopilotManager] Skipping endSession - conditions not met`
            );
          }

          this.sessions.delete(sessionId);
          this.stoppedSessions.delete(sessionId);
          console.log(`[AutopilotManager] .then() completed successfully`);
        } catch (err) {
          console.error(`[AutopilotManager] Error in .then() callback:`, err);
          if (auditId && this.auditService) {
            try {
              this.auditService.endSession(auditId, 'failed', `Error: ${err}`);
            } catch (e) {
              console.error(
                `[AutopilotManager] Failed to end session after error:`,
                e
              );
            }
          }
        }
      })
      .catch(async (error: Error) => {
        console.error('[AutopilotManager] Autopilot error in .catch():', error);

        await this.stopScreenRecording(sessionId, auditId);

        this.sendToRenderer('automation:error', {
          sessionId,
          error: error.message,
        });

        if (
          auditId &&
          this.auditService &&
          !this.stoppedSessions.has(sessionId)
        ) {
          this.auditService.endSession(auditId, 'failed', error.message);
        }

        this.sessions.delete(sessionId);
        this.stoppedSessions.delete(sessionId);
      })
      .finally(() => {
        console.log(
          `[AutopilotManager] Promise chain finished for sessionId=${sessionId}`
        );
      });

    return {
      success: true,
      sessionId,
      message: 'Autopilot started successfully',
    };
  }

  public stopAutopilot(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(
        `[AutopilotManager] Stopping autopilot session: ${sessionId}`
      );

      this.stoppedSessions.add(sessionId);

      session.stop();

      const auditId = this.auditService?.getAuditIdBySessionId(sessionId);
      if (auditId) {
        this.stopScreenRecording(sessionId, auditId);
      }

      if (this.auditService) {
        this.auditService.endSessionBySessionId(
          sessionId,
          'stopped',
          'Autopilot stopped by user'
        );
      }
    } else {
      console.warn(
        `[AutopilotManager] No active session found for: ${sessionId}`
      );
    }
  }

  public getSessionStatus(sessionId: string): {
    exists: boolean;
    status?: string;
  } {
    const session = this.sessions.get(sessionId);
    if (session) {
      return {
        exists: true,
        status: session.getStatus(),
      };
    }
    return { exists: false };
  }

  public hasActiveSession(): boolean {
    return this.sessions.size > 0;
  }

  public getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send(channel, data);
    }
  }

  private async startScreenRecording(
    sessionId: string,
    auditId: string
  ): Promise<void> {
    try {
      if (!this.screenRecordingService) {
        this.screenRecordingService = new AuditScreenRecordingService(
          this.baseWindow
        );
      }

      const started = await this.screenRecordingService.startRecording(auditId);
      if (started) {
        this.activeRecordingSessions.set(sessionId, auditId);
        console.log(
          `[AutopilotManager] Screen recording started for session: ${sessionId}`
        );
      }
    } catch (error) {
      console.warn(
        '[AutopilotManager] Screen recording failed to start (continuing without video):',
        error
      );
    }
  }

  private async stopScreenRecording(
    sessionId: string,
    auditId: string | null
  ): Promise<void> {
    if (!auditId || !this.activeRecordingSessions.has(sessionId)) {
      return;
    }

    try {
      const videoPath =
        await this.screenRecordingService?.stopRecording(auditId);
      if (videoPath && this.auditService) {
        this.auditService.setVideoPath(auditId, videoPath);
        console.log(
          `[AutopilotManager] Screen recording saved for session: ${sessionId}`
        );
      }
    } catch (error) {
      console.error(
        '[AutopilotManager] Failed to stop screen recording:',
        error
      );
    }
    this.activeRecordingSessions.delete(sessionId);
  }

  public destroy(): void {
    for (const [sessionId, session] of this.sessions) {
      console.log(`[AutopilotManager] Cleaning up session: ${sessionId}`);
      session.stop();
    }
    this.sessions.clear();
    this.screenRecordingService?.destroy();
  }
}
