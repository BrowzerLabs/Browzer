import Anthropic from '@anthropic-ai/sdk';
import { api, sse } from '@/main/api';
import { SystemPromptType } from '@/shared/types';
import { AutomationStatus } from '@/shared/types';
import { EventEmitter } from 'events';

export interface StreamEvent {
  type: string;
  data: any;
}

export class AutomationClient extends EventEmitter {
  private sessionId: string | null = null;

  constructor() {
    super();
  }

  public async continueConversationStream(
    system_prompt_type: SystemPromptType,
    messages: Anthropic.MessageParam[],
    cachedContext: string
  ): Promise<void> {
    if (!this.sessionId) {
      console.error('No active automation session. Call createAutomationPlanStream() first.');
      throw new Error('No active automation session');
    }

    try {
      this.emit('thinking', 'Analyzing and generating next steps...');

      const response = await api.post<{ success: boolean; session_id: string }>(
        '/automation/continue/stream',
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

      if (!response.success) {
        throw new Error(response.error || 'Failed to continue conversation');
      }

      console.log('✅ [AutomationClient] Streaming continuation initiated');

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

      this.sessionId = null;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to update session status:', error);
      throw error;
    }
  }
}