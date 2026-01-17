import { WebContentsView, dialog } from 'electron';

import { Tab } from './types';

import { AutomationService } from '@/main/llm';
import { RecordingStore } from '@/main/recording';
import { AutomationProgressEvent } from '@/shared/types';

export class AutomationManager {
  private automationSessions: Map<string, AutomationService> = new Map();

  constructor(
    private recordingStore: RecordingStore,
    private browserUIView: WebContentsView
  ) {}

  public async executeAutomation(
    newTab: Tab,
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    if (!newTab) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Error',
        message: 'No active tab or automation. At least one tab must be open.',
      });
      return {
        success: false,
        sessionId: '',
        message: 'No active tab or automation. At least one tab must be open.',
      };
    }

    const automationService = new AutomationService(
      this.recordingStore,
      newTab.view,
      newTab.id
    );

    const automationPromise = automationService.executeAutomation(
      userGoal,
      recordedSessionId
    );

    const sessionId = automationService.getSessionId();

    this.automationSessions.set(sessionId, automationService);
    automationService.on('progress', (event: AutomationProgressEvent) => {
      if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
        this.browserUIView.webContents.send('automation:progress', {
          sessionId,
          event,
        });
      }
    });

    automationPromise
      .then((result) => {
        if (
          this.browserUIView &&
          !this.browserUIView.webContents.isDestroyed()
        ) {
          this.browserUIView.webContents.send('automation:complete', {
            sessionId,
            result,
          });
        }

        this.automationSessions.delete(sessionId);
      })
      .catch((error) => {
        console.error('[AutomationManager] LLM automation failed:', error);

        if (
          this.browserUIView &&
          !this.browserUIView.webContents.isDestroyed()
        ) {
          this.browserUIView.webContents.send('automation:error', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        this.automationSessions.delete(sessionId);
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
      automationService.stopAutomation();
    } else {
      console.warn(
        `⚠️ [AutomationManager] No active automation found for session: ${sessionId}`
      );
    }
  }

  /**
   * Clean up
   */
  public destroy(): void {
    this.automationSessions.clear();
  }
}
