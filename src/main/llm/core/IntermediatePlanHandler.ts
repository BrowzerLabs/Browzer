import { AutomationClient } from '../clients/AutomationClient';
import { SystemPromptBuilder } from '../builders/SystemPromptBuilder';
import { AutomationPlanParser } from '../parsers/AutomationPlanParser';
import { AutomationStateManager } from './AutomationStateManager';
import { PlanExecutionResult } from './types';
import { SystemPromptType } from '@/shared/types';

export class IntermediatePlanHandler {
  private automationClient: AutomationClient;
  private stateManager: AutomationStateManager;
  private streamingMessage: any = null;

  constructor(
    automationClient: AutomationClient,
    stateManager: AutomationStateManager
  ) {
    this.automationClient = automationClient;
    this.stateManager = stateManager;
  }

  private setupStreamListeners(): void {
    this.streamingMessage = null;

    this.automationClient.removeAllListeners('stream_complete');
    this.automationClient.on('stream_complete', (data: any) => {
      this.streamingMessage = data.message;
    });
  }

  private async waitForStreamComplete(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stream timeout'));
      }, 120000);

      const checkComplete = () => {
        if (this.streamingMessage) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };

      checkComplete();
    });
  }

  public async handleIntermediatePlanCompletionStream(): Promise<PlanExecutionResult> {
    this.setupStreamListeners();

    const continuationPrompt = SystemPromptBuilder.buildIntermediatePlanContinuationPrompt({
      userGoal: this.stateManager.getUserGoal(),
      extractedContext: this.getExtractedContextSummary(),
      currentUrl: this.getCurrentUrl()
    });

    this.stateManager.addMessage({
      role: 'user',
      content: continuationPrompt
    });

    // Start streaming
    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    // Wait for completion
    await this.waitForStreamComplete();

    if (this.streamingMessage) {
      this.stateManager.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      this.stateManager.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.stateManager.setCurrentPlan(newPlan);
    } else {
      throw new Error('Stream completed but no message received');
    }

    return {
      success: false,
      isComplete: false,
    };
  }

  public async handleIntermediatePlanCompletion(): Promise<PlanExecutionResult> {

    const continuationPrompt = SystemPromptBuilder.buildIntermediatePlanContinuationPrompt({
      userGoal: this.stateManager.getUserGoal(),
      extractedContext: this.getExtractedContextSummary(),
      currentUrl: this.getCurrentUrl()
    });

    this.stateManager.addMessage({
      role: 'user',
      content: continuationPrompt
    });

    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    const thinkingText = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');
    
    if (thinkingText) {
      this.stateManager.emitProgress('claude_response', {
        message: thinkingText,
      });
    }

    this.stateManager.compressMessages();

    const newPlan = AutomationPlanParser.parsePlan(response);
    this.stateManager.setCurrentPlan(newPlan);

    return {
      success: false,
      isComplete: false,
    };
  }

  public async handleContextExtractionStream(): Promise<PlanExecutionResult> {
    this.setupStreamListeners();

    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    await this.waitForStreamComplete();

    if (this.streamingMessage) {
      this.stateManager.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      this.stateManager.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);
      this.stateManager.setCurrentPlan(newPlan);
    } else {
      throw new Error('Stream completed but no message received');
    }

    return {
      success: false,
      isComplete: false,
    };
  }

  public async handleContextExtraction(): Promise<PlanExecutionResult> {

    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_CONTINUATION,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    const thinkingText = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');
    
    if (thinkingText) {
      this.stateManager.emitProgress('claude_response', {
        message: thinkingText,
      });
    }

    this.stateManager.compressMessages();

    const newPlan = AutomationPlanParser.parsePlan(response);
    this.stateManager.setCurrentPlan(newPlan);

    return {
      success: false,
      isComplete: false,
    };
  }

  public async handleRecoveryPlanCompletionStream(): Promise<PlanExecutionResult> {
    this.setupStreamListeners();

    await this.automationClient.continueConversationStream(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    await this.waitForStreamComplete();

    if (this.streamingMessage) {
      this.stateManager.addMessage({
        role: 'assistant',
        content: this.streamingMessage.content
      });

      this.stateManager.compressMessages();

      const newPlan = AutomationPlanParser.parsePlan(this.streamingMessage);

      this.stateManager.setCurrentPlan(newPlan);
      this.stateManager.exitRecoveryMode();
    } else {
      throw new Error('Stream completed but no message received');
    }

    return {
      success: false,
      isComplete: false,
    };
  }

  public async handleRecoveryPlanCompletion(): Promise<PlanExecutionResult> {

    const response = await this.automationClient.continueConversation(
      SystemPromptType.AUTOMATION_ERROR_RECOVERY,
      this.stateManager.getOptimizedMessages(),
      this.stateManager.getCachedContext()
    );

    this.stateManager.addMessage({
      role: 'assistant',
      content: response.content
    });

    const thinkingText = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');
    
    if (thinkingText) {
      this.stateManager.emitProgress('claude_response', {
        message: thinkingText,
      });
    }

    this.stateManager.compressMessages();

    const newPlan = AutomationPlanParser.parsePlan(response);

    this.stateManager.setCurrentPlan(newPlan);
    this.stateManager.exitRecoveryMode();

    return {
      success: false,
      isComplete: false,
    };
  }

  private getExtractedContextSummary(): { url: string; interactiveElements: number; forms: number } | undefined {
    const executedSteps = this.stateManager.getExecutedSteps();
    if (executedSteps.length === 0) return undefined;

    const lastStep = executedSteps[executedSteps.length - 1];
    if (!lastStep.result) return undefined;

    return {
      url: lastStep.result.url,
      interactiveElements: lastStep.result.context?.dom?.stats?.interactiveElements || 0,
      forms: lastStep.result.context?.dom?.forms?.length || 0
    };
  }

  private getCurrentUrl(): string {
    const executedSteps = this.stateManager.getExecutedSteps();
    if (executedSteps.length === 0) return '';
    return executedSteps[executedSteps.length - 1]?.result?.url || '';
  }
}
