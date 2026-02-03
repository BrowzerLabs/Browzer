import { EventEmitter } from 'events';
import { WebContentsView } from 'electron';

import { AutomationClient } from './clients/AutomationClient';
import { AutomationStateManager } from './core/AutomationStateManager';
import { IterativeAutomationResult } from './core/types';

import { RecordingStore } from '@/main/recording';
import { ExecutionService } from '@/main/automation';
import {
  AutomationProgressEvent,
  AutomationEventType,
  RecordingSession,
  AutomationStatus,
} from '@/shared/types';

export class AutomationService extends EventEmitter {
  private recordingStore: RecordingStore;
  private recordedSession: RecordingSession | null = null;
  private automationClient: AutomationClient;
  private stateManager: AutomationStateManager;
  private executionService: ExecutionService;

  constructor(
    recordingStore: RecordingStore,
    private view: WebContentsView,
    private tabId: string
  ) {
    super();
    this.recordingStore = recordingStore;

    this.executionService = new ExecutionService(
      {
        view: this.view,
        tabId: this.tabId,
      },
      this.recordingStore,
      this.recordedSession?.id
    );

    this.automationClient = new AutomationClient();
    this.setupAutomationClientListeners();
  }

  private setupAutomationClientListeners(): void {
    this.automationClient.on('thinking', (message: string) => {
      this.emitProgress('thinking', { message });
    });

    this.automationClient.on('error', (error: Error) => {
      console.error('❌ [AutomationService] AutomationClient error:', error);
      this.emitProgress('automation_error', {
        error: error.message,
        stack: error.stack,
      });
    });
  }

  public getSessionId(): string | null {
    return this.stateManager?.getSessionId() || null;
  }

  public stopAutomation(): void {
    this.stateManager.markComplete(
      AutomationStatus.STOPPED,
      'Automation stopped by user'
    );
    this.emitProgress('automation_stopped', {
      message: 'Automation stopped by user',
    });
  }

  private emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data,
    };
    this.emit('progress', event);
  }

  public async executeAutomation(
    userGoal: string,
    recordedSessionId: string
  ): Promise<IterativeAutomationResult> {
    this.recordedSession = this.recordingStore.getRecording(recordedSessionId);
    this.stateManager = new AutomationStateManager(
      userGoal,
      this.recordedSession,
      this.automationClient,
      this.executionService
    );
    this.stateManager.on('progress', (event: AutomationProgressEvent) => {
      this.emitProgress(event.type, event.data);
    });

    try {
      await this.stateManager.generateInitialPlan();

      while (this.stateManager.isRunning()) {
        const executionResult =
          await this.stateManager.executePlanWithRecovery();

        if (executionResult.isComplete) {
          if (executionResult.error) {
            this.emitProgress('automation_error', {
              error: executionResult.error,
              stack: executionResult.error,
            });
          }
          this.stateManager.markComplete(
            executionResult.status,
            executionResult.error
          );
          break;
        }
      }

      const finalResult = this.stateManager.getFinalResult();

      const status = finalResult.success
        ? AutomationStatus.COMPLETED
        : AutomationStatus.FAILED;

      await this.automationClient.updateSessionStatus(status);

      this.emitProgress('automation_complete', {
        success: finalResult.success,
        totalSteps: this.stateManager.getTotalStepsExecuted(),
      });

      return {
        success: finalResult.success,
        plan: this.stateManager.getCurrentPlan(),
        executionResults: this.stateManager.getExecutedSteps(),
        error: finalResult.error,
        totalStepsExecuted: this.stateManager.getTotalStepsExecuted(),
      };
    } catch (error: any) {
      console.error('❌ [IterativeAutomation] Fatal error:', error);
      this.emitProgress('automation_error', {
        error: error.message || 'Unknown error occurred',
        stack: error.stack,
      });

      this.automationClient
        .updateSessionStatus(AutomationStatus.FAILED)
        .catch((error) => {
          console.error(
            '❌ [IterativeAutomation] Failed to update session status:',
            error
          );
        });

      return {
        success: false,
        executionResults: this.stateManager?.getExecutedSteps() || [],
        error: error.message || 'Unknown error occurred',
        totalStepsExecuted: this.stateManager?.getTotalStepsExecuted() || 0,
      };
    }
  }
}
