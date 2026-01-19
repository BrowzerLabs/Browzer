import { WebContentsView } from 'electron';

import { v4 as uuidv4 } from 'uuid';

import { AutopilotExecutor, AutopilotProgressEvent } from './AutopilotExecutor';
import { AutopilotConfig } from './types';

import { Tab } from '@/main/browser/types';
import { RecordingSession } from '@/shared/types';

export class AutopilotManager {
  private sessions: Map<string, AutopilotExecutor> = new Map();
  private electronId: string;

  constructor(private browserUIView: WebContentsView) {
    this.electronId = uuidv4();
  }

  public async executeAutopilot(
    tab: Tab,
    userGoal: string,
    startUrl?: string,
    referenceRecording?: RecordingSession,
    config?: Partial<AutopilotConfig>
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    if (!tab || !tab.automationExecutor) {
      return {
        success: false,
        sessionId: '',
        message: 'No active tab or automation executor available',
      };
    }

    console.log(
      `[AutopilotManager] Starting autopilot for goal: "${userGoal}"`
    );
    if (referenceRecording) {
      console.log(
        `[AutopilotManager] Using reference recording: "${referenceRecording.name}" with ${referenceRecording.actions.length} actions`
      );
    }

    const executor = new AutopilotExecutor(
      tab.automationExecutor,
      this.electronId
    );
    const sessionId = executor.getSessionId();

    this.sessions.set(sessionId, executor);

    executor.on('progress', (event: AutopilotProgressEvent) => {
      this.sendToRenderer('automation:progress', {
        sessionId,
        event,
      });
    });

    const effectiveStartUrl = startUrl || 'about:blank';

    const executionPromise = executor.execute(
      userGoal,
      effectiveStartUrl,
      referenceRecording,
      config
    );

    executionPromise
      .then((result) => {
        console.log(
          `[AutopilotManager] Autopilot completed: ${result.success ? 'SUCCESS' : 'FAILED'}`
        );

        this.sendToRenderer('automation:complete', {
          sessionId,
          result: {
            success: result.success,
            message: result.message,
            totalStepsExecuted: result.stepCount,
          },
        });

        this.sessions.delete(sessionId);
      })
      .catch((error: Error) => {
        console.error('[AutopilotManager] Autopilot error:', error);

        this.sendToRenderer('automation:error', {
          sessionId,
          error: error.message,
        });

        this.sessions.delete(sessionId);
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
      session.stop();
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

  public destroy(): void {
    for (const [sessionId, session] of this.sessions) {
      console.log(`[AutopilotManager] Cleaning up session: ${sessionId}`);
      session.stop();
    }
    this.sessions.clear();
  }
}
