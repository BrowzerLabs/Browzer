import Anthropic from '@anthropic-ai/sdk';
import { api } from '@/main/api';
import { RecordingSession, SystemPromptType } from '@/shared/types';

export class AutomationClient {
  private sessionId: string | null = null;
  private onThinking?: (message: string) => void;

  constructor(onThinking?: (message: string) => void) {
    this.onThinking = onThinking;
  }

  public async createAutomationPlan(
    formatted_session: string,
    user_goal: string
  ): Promise<Anthropic.Message> {

    try {
      if (this.onThinking) {
        this.onThinking('Creating automation plan...');
      } 

      console.log("recorded session", formatted_session);

      const response = await api.post<{ message: Anthropic.Message; session_id: string }>(
        '/automation/plan',
        {
          recording_session: formatted_session,
          user_goal
        }
      );

      if (!response.success || !response.data?.message) {
        throw new Error(response.error || 'Failed to create automation plan');
      }
      console.log(response.data);

      this.sessionId = response.data.session_id;
      console.log(`✅ [AutomationClientV2] Session created: ${this.sessionId}`);

      return response.data.message;

    } catch (error) {
      console.error('❌ [AutomationClientV2] Failed to create automation plan:', error);
      throw error;
    }
  }

  public async continueConversation(
    system_prompt_type: SystemPromptType,
    messages: Anthropic.MessageParam[],
    cachedContext: string
  ): Promise<Anthropic.Message> {

    if (!this.sessionId) {
      console.error('No active automation session. Call createAutomationPlan() first.');
      throw new Error('No active automation session');
    }

    try {
      if (this.onThinking) {
        this.onThinking('Analyzing and generating next steps...');
      }

      const response = await api.post<{ message: Anthropic.Message }>(
        '/automation/continue',
        {
          system_prompt_type: system_prompt_type,
          messages: messages,
          cached_context: cachedContext
        },
        {
          headers: {
            'session-id': this.sessionId
          }
        }
      );

      if (!response.success || !response.data?.message) {
        throw new Error(response.error || 'Failed to continue conversation');
      }

      console.log('✅ [AutomationClientV2] Conversation continued successfully');
      return response.data.message as Anthropic.Message;

    } catch (error) {
      console.error('❌ [AutomationClientV2] Failed to continue conversation:', error);
      throw error;
    }
  }

  public async endAutomation(): Promise<void> {
    if (!this.sessionId) {
      console.warn('[AutomationClientV2] No active automation session to end');
      return;
    }

    try {
      if (this.onThinking) {
        this.onThinking('Ending automation session...');
      }

      console.log(`✅ [AutomationClientV2] Automation session ended: ${this.sessionId}`);
      this.sessionId = null;

    } catch (error) {
      console.error('❌ [AutomationClientV2] Failed to end automation:', error);
      this.sessionId = null;
      throw error;
    }
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }
  public getUsageStats(response: Anthropic.Message): {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
  } {
    const usage = response.usage as any;
    
    const inputCost = (usage.input_tokens / 1_000_000) * 3;
    const outputCost = (usage.output_tokens / 1_000_000) * 15;
    const cacheWriteCost = ((usage.cache_creation_input_tokens || 0) / 1_000_000) * 3.75;
    const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1_000_000) * 0.30;

    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost
    };
  }
}
