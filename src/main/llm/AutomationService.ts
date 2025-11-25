import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation/BrowserAutomationExecutor';
import { RecordingStore } from '@/main/recording';
import { AutomationClient } from './clients/AutomationClient';
import { AutomationStateManager } from './core/AutomationStateManager';
import { SessionManager } from './session/SessionManager';
import { IterativeAutomationResult } from './core/types';
import { AutomationProgressEvent, AutomationEventType, RecordingSession, AutomationStatus } from '@/shared/types';

export class AutomationService extends EventEmitter {
  private executor: BrowserAutomationExecutor;
  private recordingStore: RecordingStore;
  private recordedSession: RecordingSession | null = null;
  private automationClient: AutomationClient;
  private stateManager: AutomationStateManager;
  private sessionManager: SessionManager;

  constructor(
    executor: BrowserAutomationExecutor,
    recordingStore: RecordingStore,
    sessionManager: SessionManager,
  ) {
    super();
    this.executor = executor;
    this.recordingStore = recordingStore;
    this.sessionManager = sessionManager;
    
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
        stack: error.stack
      });
    });
  }

  public getSessionId(): string | null {
    return this.stateManager?.getSessionId() || null;
  }

  public stopAutomation(): void {
    this.stateManager.markComplete(AutomationStatus.STOPPED, 'Automation stopped by user');
    this.emitProgress('automation_stopped', {
      message: 'Automation stopped by user'
    });
  }

  private emitProgress(type: AutomationEventType, data: any): void {
    const event: AutomationProgressEvent = {
      type,
      data
    };
    this.emit('progress', event);
  }

  public async executeAutomation(
    userGoal: string,
    recordedSessionId: string,
  ): Promise<IterativeAutomationResult> {
    this.recordedSession = this.recordingStore.getRecording(recordedSessionId);
    this.stateManager = new AutomationStateManager(
      userGoal,
      this.recordedSession,
      this.sessionManager,
      this.automationClient,
      this.executor
    );
    this.stateManager.on('progress', (event: AutomationProgressEvent) => {
      this.emitProgress(event.type, event.data);
    });
    
    try {
      await this.stateManager.generateInitialPlan();

      while (this.stateManager.isRunning()) {
        const executionResult = await this.stateManager.executePlanWithRecovery();
        
        if (executionResult.isComplete) {
          this.stateManager.markComplete(executionResult.status, executionResult.error);
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
        totalStepsExecuted: this.stateManager.getTotalStepsExecuted()
      };

    } catch (error: any) {
      console.error('❌ [IterativeAutomation] Fatal error:', error);
      
      await this.automationClient.updateSessionStatus(AutomationStatus.FAILED);
      this.emitProgress('automation_error', {
        error: error.message || 'Unknown error occurred',
        stack: error.stack
      });

      return {
        success: false,
        executionResults: this.stateManager?.getExecutedSteps() || [],
        error: error.message || 'Unknown error occurred',
        totalStepsExecuted: this.stateManager?.getTotalStepsExecuted() || 0
      };
    }
  }

}
