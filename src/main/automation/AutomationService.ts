/**
 * Automation Service - Main orchestrator for LLM-controlled browser automation
 * 
 * This service coordinates:
 * - LLM plan generation
 * - Automation execution
 * - Progress tracking
 * - Error handling
 */

import { BrowserAutomation } from './BrowserAutomation';
import { LLMService } from './LLMService';
import { AutomationExecutor } from './AutomationExecutor';
import { RecordingSession } from '@/shared/types/recording';
import {
  AutomationPlan,
  AutomationResult,
  AutomationStep,
  LLMAutomationRequest,
  LLMAutomationResponse
} from '@/shared/types/automation';

export class AutomationService {
  private llmService: LLMService;
  private currentPlan: AutomationPlan | null = null;
  private isExecuting = false;

  constructor() {
    this.llmService = new LLMService();
  }

  /**
   * Initialize the service with API key
   */
  public initialize(apiKey: string): void {
    this.llmService.initialize(apiKey);
  }

  /**
   * Generate and execute automation plan
   */
  public async executeAutomation(
    request: LLMAutomationRequest,
    automation: BrowserAutomation,
    onProgress?: (step: AutomationStep, index: number, total: number) => void
  ): Promise<AutomationResult> {
    if (this.isExecuting) {
      return {
        success: false,
        plan: this.currentPlan!,
        error: 'Another automation is already running',
        executionTime: 0
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      // Step 1: Generate automation plan using LLM
      console.log('[AutomationService] Generating automation plan...');
      const llmResponse = await this.llmService.generateAutomationPlan(
        request.userPrompt,
        request.recordingSession
      );

      if (!llmResponse.success || !llmResponse.steps) {
        return {
          success: false,
          plan: this.createEmptyPlan(request),
          error: llmResponse.error || 'Failed to generate automation plan',
          executionTime: Date.now() - startTime
        };
      }

      // Step 2: Create automation plan
      this.currentPlan = {
        id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        steps: llmResponse.steps,
        userPrompt: request.userPrompt,
        recordingSessionId: request.recordingSession.id,
        createdAt: Date.now(),
        status: 'pending',
        completedSteps: 0,
        failedSteps: 0
      };

      console.log('[AutomationService] Plan generated with', llmResponse.steps.length, 'steps');
      if (llmResponse.tokensUsed) {
        console.log('[AutomationService] Tokens used:', llmResponse.tokensUsed);
        if (llmResponse.tokensUsed.cacheRead) {
          console.log('[AutomationService] Cache hit! Saved', llmResponse.tokensUsed.cacheRead, 'tokens');
        }
      }

      // Step 3: Execute the plan
      console.log('[AutomationService] Starting execution...');
      const executor = new AutomationExecutor(automation);
      const result = await executor.executePlan(this.currentPlan, onProgress);

      return result;

    } catch (error) {
      console.error('[AutomationService] Automation failed:', error);
      return {
        success: false,
        plan: this.currentPlan || this.createEmptyPlan(request),
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Generate automation plan without executing
   */
  public async generatePlan(
    userPrompt: string,
    recordingSession: RecordingSession
  ): Promise<LLMAutomationResponse> {
    return await this.llmService.generateAutomationPlan(userPrompt, recordingSession);
  }

  /**
   * Get current execution status
   */
  public getStatus(): {
    isExecuting: boolean;
    currentPlan: AutomationPlan | null;
  } {
    return {
      isExecuting: this.isExecuting,
      currentPlan: this.currentPlan
    };
  }

  /**
   * Cancel current execution
   */
  public cancel(): void {
    if (this.isExecuting && this.currentPlan) {
      this.currentPlan.status = 'cancelled';
      this.isExecuting = false;
      console.log('[AutomationService] Execution cancelled');
    }
  }

  /**
   * Create empty plan for error cases
   */
  private createEmptyPlan(request: LLMAutomationRequest): AutomationPlan {
    return {
      id: `plan-error-${Date.now()}`,
      steps: [],
      userPrompt: request.userPrompt,
      recordingSessionId: request.recordingSession.id,
      createdAt: Date.now(),
      status: 'failed',
      completedSteps: 0,
      failedSteps: 0
    };
  }
}
