import Anthropic from '@anthropic-ai/sdk';
import { api, sse } from '@/main/api';
import { SystemPromptType } from '@/shared/types';
import { AutomationStatus } from '@/shared/types';
import { EventEmitter } from 'events';
import { dialog } from 'electron';

export interface StreamEvent {
  type: string;
  data: any;
}

export class AutomationClient extends EventEmitter {
  private sessionId: string | null = null;

  constructor() {
    super();
    if (sse) {
      this.setupSSEListeners();
    } else {
      throw new Error('SSE Stream not initialised')
    }
  }

  private setupSSEListeners(): void {
    try {
      if (!sse) {
        console.warn('[AutomationClient] SSE client is null, cannot setup listeners');
        return;
      }

      const sseClient = sse; // Capture in local variable for type safety

      const eventTypes = [
        'automation_start',
        'continuation_start',
        'message_start',
        'content_block_start',
        'text_delta',
        'tool_use_start',
        'tool_input_delta',
        'tool_use_complete',
        'tool_use_error',
        'content_block_stop',
        'message_delta',
        'message_stop',
        'stream_complete',
        'stream_error'
      ];

      eventTypes.forEach(eventType => {
        sseClient.on(eventType, (data: any) => {
          // Only process if we have an active session and the event is for our session
          if (this.sessionId && data.session_id === this.sessionId) {
            console.log(`📡 [AutomationClient] Received: ${eventType} for session ${data.session_id}`);
            this.handleStreamEvent(eventType, data);
          }
        });
      });

      console.log('✅ [AutomationClient] SSE listeners setup complete');
    } catch (error) {
      console.warn('[AutomationClient] Failed to setup SSE listeners:', error);
    }
  }

  private handleStreamEvent(eventType: string, data: any): void {
    // Emit to state manager
    this.emit(eventType, data);
  }

  public async createAutomationPlanStream(
    formatted_session: string,
    user_goal: string
  ): Promise<string> {
    try {
      this.emit('thinking', 'Creating automation plan...');

      const response = await api.post<{ message: any; session_id: string }>(
        '/automation/plan/stream',
        {
          recording_session: formatted_session,
          user_goal
        }
      );

      if (!response.success || !response.data?.session_id) {
        throw new Error(response.error || 'Failed to create automation plan');
      }

      this.sessionId = response.data.session_id;
      console.log(`✅ [AutomationClient] Session started: ${this.sessionId}`);
      return this.sessionId;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to create streaming automation plan:', error);
      throw error;
    }
  }

  public async createAutomationPlan(
    formatted_session: string,
    user_goal: string
  ): Promise<Anthropic.Message> {

    try {
      this.emit('thinking', 'Creating automation plan...');

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
      return response.data.message;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to create automation plan:', error);
      throw error;
    }
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
      this.emit('thinking', 'Analyzing and generating next steps...');

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

  public stopStreaming(): void {
    this.sessionId = null;
    console.log('[AutomationClient] Streaming stopped');
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }
}