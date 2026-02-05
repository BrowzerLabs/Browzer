import { EventEmitter } from 'events';
import { WebContentsView } from 'electron';
import { randomUUID } from 'crypto';

import { IterativeAutomationResult } from './core/types';
import { FormatService } from './utils/FormatService';
import { Automation } from './core/Automation';

import { RecordingStore } from '@/main/recording';
import { ExecutionService } from '@/main/automation';
import { AutomationStatus } from '@/shared/types';
import { api } from '@/main/api';

export class AutomationService extends EventEmitter {
  private automationSessions: Map<string, Automation> = new Map();

  constructor(
    private browserView: WebContentsView,
    private recordingStore: RecordingStore,
    private executionService: ExecutionService
  ) {
    super();
    this.recordingStore = recordingStore;
  }

  public async execute(
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    const recordingSession =
      this.recordingStore.getRecording(recordedSessionId);
    const formattedSession =
      FormatService.formatRecordedSession(recordingSession);
    const clientSessionId = randomUUID();
    const automation = new Automation(
      clientSessionId,
      userGoal,
      formattedSession,
      this.executionService,
      this.browserView
    );

    this.automationSessions.set(clientSessionId, automation);
    this.executeAutomation(automation).catch((error) => {
      if (this.browserView && !this.browserView.webContents.isDestroyed()) {
        this.browserView.webContents.send('automation:error', {
          sessionId: clientSessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
    this.automationSessions.delete(clientSessionId);

    return {
      success: true,
      sessionId: clientSessionId,
      message: 'Automation started successfully 🎉',
    };
  }

  public stopAutomation(session_id: string): Promise<boolean> {
    const automation = this.automationSessions.get(session_id);
    if (!automation) {
      return Promise.resolve(false);
    }
    automation.markComplete(
      AutomationStatus.STOPPED,
      'Automation stopped by user'
    );
    this.browserView.webContents.send('automation_stopped', {
      message: 'Automation stopped by user',
    });
    return Promise.resolve(true);
  }

  public async executeAutomation(
    automation: Automation
  ): Promise<IterativeAutomationResult> {
    try {
      await automation.generateInitialPlan();

      while (automation.isRunning()) {
        const executionResult = await automation.executePlanWithRecovery();

        if (executionResult.isComplete) {
          if (executionResult.error) {
            automation.emitProgress('automation_error', {
              error: executionResult.error,
              stack: executionResult.error,
            });
          }
          automation.markComplete(
            executionResult.status,
            executionResult.error
          );
          break;
        }
      }

      const finalResult = automation.getFinalResult();

      const status = finalResult.success
        ? AutomationStatus.COMPLETED
        : AutomationStatus.FAILED;

      await this.updateSessionStatus(automation.getSessionId(), status);

      automation.emitProgress('automation_complete', {
        success: finalResult.success,
        totalSteps: automation.getTotalStepsExecuted(),
      });

      this.emit('automation:session-complete', {
        sessionId: automation.getClientSessionId(),
        success: finalResult.success,
        finalOutput: automation.getFinalOutput(),
        error: finalResult.error,
        totalStepsExecuted: automation.getTotalStepsExecuted(),
      });

      return {
        success: finalResult.success,
        plan: automation.getCurrentPlan(),
        executionResults: automation.getExecutedSteps(),
        error: finalResult.error,
        totalStepsExecuted: automation.getTotalStepsExecuted(),
        finalOutput: automation.getFinalOutput(),
      };
    } catch (error: any) {
      console.error('❌ [AutomationService] Fatal error:', error);
      automation.emitProgress('automation_error', {
        error: error.message || 'Unknown error occurred',
        stack: error.stack,
      });

      this.updateSessionStatus(
        automation.getSessionId(),
        AutomationStatus.FAILED
      ).catch((error) => {
        console.error(
          '❌ [AutomationService] Failed to update session status:',
          error
        );
      });

      this.emit('automation:session-error', {
        sessionId: automation.getClientSessionId(),
        error: error.message || 'Unknown error occurred',
        finalOutput: automation.getFinalOutput(),
      });

      return {
        success: false,
        executionResults: automation.getExecutedSteps() || [],
        error: error.message || 'Unknown error occurred',
        totalStepsExecuted: automation.getTotalStepsExecuted() || 0,
        finalOutput: automation.getFinalOutput(),
      };
    }
  }

  public async updateSessionStatus(
    sessionId: string,
    status: AutomationStatus
  ): Promise<void> {
    try {
      const response = await api.post<{
        success: boolean;
        session_id: string;
        status: string;
      }>(
        '/automation/session/update',
        {
          status: status,
        },
        {
          headers: {
            'session-id': sessionId,
          },
        }
      );

      if (!response.success || !response.data?.success) {
        throw new Error(response.error || 'Failed to update session status');
      }
    } catch (error) {
      console.error(
        '❌ [AutomationService] Failed to update session status:',
        error
      );
      throw error;
    }
  }

  public destroy(): void {
    this.automationSessions.clear();
    this.browserView.webContents.removeAllListeners('automation_error');
    this.browserView.webContents.removeAllListeners('automation_complete');
    this.browserView.webContents.removeAllListeners('automation_stopped');
  }
}
