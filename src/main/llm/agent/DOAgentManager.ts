/**
 * DO Agent Manager
 *
 * Manages autopilot session lifecycle and coordinates between
 * the agent service and the browser service.
 */

import { WebContentsView } from 'electron';

import { DOAgentService } from './DOAgentService';
import {
  AutopilotConfig,
  AutopilotProgressEvent,
  DOAgentResult,
} from './types';

import { Tab } from '@/main/browser/types';
import { RecordingSession } from '@/shared/types';

export class DOAgentManager {
  private sessions: Map<string, DOAgentService> = new Map();

  constructor(private browserUIView: WebContentsView) {}

  /**
   * Start a new autopilot session
   */
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

    console.log(`[DOAgentManager] Starting autopilot for goal: "${userGoal}"`);
    if (referenceRecording) {
      console.log(
        `[DOAgentManager] Using reference recording: "${referenceRecording.name}" with ${referenceRecording.actions.length} actions`
      );
    }

    // Create new agent service
    const agentService = new DOAgentService(tab.automationExecutor, config);
    const sessionId = agentService.getSessionId();

    // Store the session
    this.sessions.set(sessionId, agentService);

    // Forward progress events to the renderer
    agentService.on('progress', (event: AutopilotProgressEvent) => {
      this.sendToRenderer('automation:progress', {
        sessionId,
        event,
      });
    });

    // Start execution (non-blocking)
    const executionPromise = agentService.execute(
      userGoal,
      startUrl,
      referenceRecording
    );

    // Handle completion
    executionPromise
      .then((result: DOAgentResult) => {
        console.log(
          `[DOAgentManager] Autopilot completed: ${result.success ? 'SUCCESS' : 'FAILED'}`
        );

        this.sendToRenderer('automation:complete', {
          sessionId,
          result: {
            success: result.success,
            message: result.message,
            totalStepsExecuted: result.stepCount,
            finalUrl: result.finalUrl,
          },
        });

        // Cleanup
        this.sessions.delete(sessionId);
      })
      .catch((error: Error) => {
        console.error('[DOAgentManager] Autopilot error:', error);

        this.sendToRenderer('automation:error', {
          sessionId,
          error: error.message,
        });

        // Cleanup
        this.sessions.delete(sessionId);
      });

    return {
      success: true,
      sessionId,
      message: 'Autopilot started successfully',
    };
  }

  /**
   * Stop an autopilot session
   */
  public stopAutopilot(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`[DOAgentManager] Stopping autopilot session: ${sessionId}`);
      session.stop();
    } else {
      console.warn(
        `[DOAgentManager] No active session found for: ${sessionId}`
      );
    }
  }

  /**
   * Get status of an autopilot session
   */
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

  /**
   * Check if there's an active session
   */
  public hasActiveSession(): boolean {
    return this.sessions.size > 0;
  }

  /**
   * Get all active session IDs
   */
  public getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, data: any): void {
    if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send(channel, data);
    }
  }

  /**
   * Cleanup all sessions
   */
  public destroy(): void {
    for (const [sessionId, session] of this.sessions) {
      console.log(`[DOAgentManager] Cleaning up session: ${sessionId}`);
      session.stop();
    }
    this.sessions.clear();
  }
}
