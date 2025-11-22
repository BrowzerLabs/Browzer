import Anthropic from '@anthropic-ai/sdk';
import { api } from '@/main/api';
import { SystemPromptType } from '@/shared/types';
import { AutomationStatus } from '..';

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

      this.sessionId = response.data.session_id;
      console.log(`✅ [AutomationClient] Session created: ${this.sessionId}`);

      return response.data.message;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to create automation plan:', error);
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

      console.log('✅ [AutomationClient] Conversation continued successfully');
      return response.data.message as Anthropic.Message;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to continue conversation:', error);
      throw error;
    }
  }

  public async updateSessionStatus(status: AutomationStatus): Promise<void> {
    if (!this.sessionId) {
      console.warn('[AutomationClient] No active automation session to update');
      return;
    }

    try {
      console.log(`[AutomationClient] 🔄 Updating session ${this.sessionId} status to ${status}`);

      const response = await api.post<{ success: boolean; session_id: string; status: string }>(
        '/automation/session/update',
        {
          status: status
        },
        {
          headers: {
            'session-id': this.sessionId
          }
        }
      );

      if (!response.success || !response.data?.success) {
        throw new Error(response.error || 'Failed to update session status');
      }

      console.log(`✅ [AutomationClient] Session ${this.sessionId} status updated to ${status}`);

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to update session status:', error);
      throw error;
    }
  }

  public async endAutomation(): Promise<void> {
    if (!this.sessionId) {
      console.warn('[AutomationClient] No active automation session to end');
      return;
    }

    try {
      if (this.onThinking) {
        this.onThinking('Ending automation session...');
      }

      console.log(`✅ [AutomationClient] Automation session ended: ${this.sessionId}`);
      this.sessionId = null;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to end automation:', error);
      this.sessionId = null;
      throw error;
    }
  }
}
