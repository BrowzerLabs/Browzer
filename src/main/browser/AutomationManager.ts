import { BaseWindow, WebContentsView } from 'electron';

import { TabService } from './TabService';

import { AutomationService } from '@/main/llm';
import { RecordingStore } from '@/main/recording';
import { AuditService, AuditScreenRecordingService } from '@/main/audit';

export class AutomationManager {
  private automationSessions: Map<string, AutomationService> = new Map();
  private auditService: AuditService | null = null;
  private stoppedSessions: Set<string> = new Set();
  private screenRecordingService: AuditScreenRecordingService | null = null;
  private activeRecordingSessions: Map<string, string> = new Map();

  constructor(
    private recordingStore: RecordingStore,
    private browserUIView: WebContentsView,
    private tabService: TabService,
    private baseWindow: BaseWindow
  ) {}

  public setAuditService(auditService: AuditService): void {
    this.auditService = auditService;
  }

  public async executeAutomation(
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    const automationService = new AutomationService(
      this.browserUIView,
      this.recordingStore,
      this.tabService
    );

    const automationPromise = automationService.executeAutomation(
      userGoal,
      recordedSessionId
    );

    const sessionId = automationService.getSessionId();

    this.automationSessions.set(sessionId, automationService);

    let auditId: string | null = null;
    if (this.auditService) {
      try {
        const recording = this.recordingStore.getRecording(recordedSessionId);
        console.log(
          '[AutomationManager] Starting audit session with agentMode: automate'
        );
        auditId = await this.auditService.startSession({
          sessionId,
          recordingId: recordedSessionId,
          agentMode: 'automate',
          userGoal,
          startUrl: recording?.startUrl,
        });
        console.log(
          `[AutomationManager] Audit session created: auditId=${auditId}, agentMode=automate`
        );

        automationService.on('progress', (event) => {
          if (auditId && this.auditService) {
            this.auditService.recordEvent(
              auditId,
              event.type,
              event.data || {}
            );
          }
        });

        this.startScreenRecording(sessionId, auditId);
      } catch (error) {
        console.error(
          '[AutomationManager] Failed to start audit session:',
          error
        );
      }
    }

    automationPromise
      .then(async (result) => {
        await this.stopScreenRecording(sessionId, auditId);

        if (
          this.browserUIView &&
          !this.browserUIView.webContents.isDestroyed()
        ) {
          this.browserUIView.webContents.send('automation:complete', {
            sessionId,
            result,
          });
        }

        if (
          auditId &&
          this.auditService &&
          !this.stoppedSessions.has(sessionId)
        ) {
          this.auditService.endSession(
            auditId,
            result.success ? 'completed' : 'failed',
            result.message
          );
        }

        this.automationSessions.delete(sessionId);
        this.stoppedSessions.delete(sessionId);
      })
      .catch(async (error) => {
        console.error('[AutomationManager] LLM automation failed:', error);

        await this.stopScreenRecording(sessionId, auditId);

        if (
          this.browserUIView &&
          !this.browserUIView.webContents.isDestroyed()
        ) {
          this.browserUIView.webContents.send('automation:error', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        if (
          auditId &&
          this.auditService &&
          !this.stoppedSessions.has(sessionId)
        ) {
          this.auditService.endSession(
            auditId,
            'failed',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }

        this.automationSessions.delete(sessionId);
        this.stoppedSessions.delete(sessionId);
      });

    return {
      success: true,
      sessionId,
      message: 'Automation started successfully 🎉',
    };
  }

  public stopAutomation(sessionId: string): void {
    const automationService = this.automationSessions.get(sessionId);
    if (automationService) {
      console.log(
        `🛑 [AutomationManager] Stopping automation session: ${sessionId}`
      );

      this.stoppedSessions.add(sessionId);

      automationService.stopAutomation();

      const auditId = this.auditService?.getAuditIdBySessionId(sessionId);
      if (auditId) {
        this.stopScreenRecording(sessionId, auditId);
      }

      if (this.auditService) {
        this.auditService.endSessionBySessionId(
          sessionId,
          'stopped',
          'Automation stopped by user'
        );
      }
    } else {
      console.warn(
        `⚠️ [AutomationManager] No active automation found for session: ${sessionId}`
      );
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
          `[AutomationManager] Screen recording started for session: ${sessionId}`
        );
      }
    } catch (error) {
      console.warn(
        '[AutomationManager] Screen recording failed to start (continuing without video):',
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
          `[AutomationManager] Screen recording saved for session: ${sessionId}`
        );
      }
    } catch (error) {
      console.error(
        '[AutomationManager] Failed to stop screen recording:',
        error
      );
    }
    this.activeRecordingSessions.delete(sessionId);
  }

  public destroy(): void {
    this.automationSessions.clear();
    this.screenRecordingService?.destroy();
  }
}
