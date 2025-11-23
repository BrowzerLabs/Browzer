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
  private isStreaming: boolean = false;
  private streamEventHandlers: Map<string, (data: any) => void> = new Map();

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
        'message_start',
        'content_block_start',
        'text_delta',
        'tool_use_start',
        'tool_input_delta',
        'tool_use_complete',
        'content_block_stop',
        'message_delta',
        'message_stop',
        'stream_complete',
        'stream_error',
        'automation_start',
        'continuation_start'
      ];

      eventTypes.forEach(eventType => {
        sseClient.on(eventType, (data: any) => {
          if (data.session_id === this.sessionId && this.isStreaming) {
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
    console.log(`📡 [AutomationClient] Stream event: ${eventType}`);

    this.emit('stream_event', { type: eventType, data });
    this.emit(eventType, data);

    const handler = this.streamEventHandlers.get(eventType);
    if (handler) {
      handler(data);
    }
  }

  private async subscribeToAutomation(sessionId: string): Promise<void> {
    try {
      const response = await api.post(
        `/automation/subscribe/${sessionId}`,
        {
          electron_id: process.env.ELECTRON_ID || 'electron-app'
        },
        {
          headers: {
            'session-id': sessionId
          }
        }
      );

      if (!response.success) {
        throw new Error('Failed to subscribe to automation channel');
      }

      console.log(`✅ [AutomationClient] Subscribed to automation:${sessionId}`);
    } catch (error) {
      console.error('❌ [AutomationClient] Failed to subscribe:', error);
      throw error;
    }
  }

  public async createAutomationPlanStream(
    formatted_session: string,
    user_goal: string
  ): Promise<string> {
    try {
      this.emit('thinking', 'Creating automation plan...');

      // Call streaming endpoint
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
      this.isStreaming = true;

      await this.subscribeToAutomation(this.sessionId);

      console.log(`✅ [AutomationClient] Streaming session created: ${this.sessionId}`);

      return this.sessionId;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to create streaming automation plan:', error);
      this.isStreaming = false;
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
      console.log(`✅ [AutomationClient] Session created: ${this.sessionId}`);

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
      this.isStreaming = true;

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
      this.isStreaming = false;
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
      this.isStreaming = false;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to update session status:', error);
      throw error;
    }
  }

  public stopStreaming(): void {
    this.isStreaming = false;
    console.log('[AutomationClient] Streaming stopped');
  }

  public getIsStreaming(): boolean {
    return this.isStreaming;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }
}