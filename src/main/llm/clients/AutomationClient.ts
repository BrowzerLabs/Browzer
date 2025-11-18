import Anthropic from '@anthropic-ai/sdk';
import { api } from '@/main/api';
import { SystemPromptType } from '@/shared/types';

export class AutomationClient {
  private sessionId: string | null = null;
  private onThinking?: (message: string) => void;

  constructor(onThinking?: (message: string) => void) {
    this.onThinking = onThinking;
  }

  public async startAutomation(): Promise<string> {
    try {
      if (this.onThinking) {
        this.onThinking('Starting automation session...');
      }

      const response = await api.post<{ session_id: string }>('/automation/start');
      
      if (!response.success || !response.data) {
        throw new Error(response.error);
      }
      this.sessionId = response.data.session_id;
      return this.sessionId;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to start automation:', error);
      throw error;
    }
  }

  public async createAutomationPlan(params: {
    systemPromptType: SystemPromptType;
    userPrompt: string;
    tools: Anthropic.Tool[];
    cachedContext?: string;
  }): Promise<Anthropic.Message> {
    const { systemPromptType, userPrompt, tools, cachedContext } = params;
    
    if (!this.sessionId) {
      alert('No active automation session. Please start a new session.');
      return;
    }

    try {
      if (this.onThinking) {
        this.onThinking('Generating automation plan...');
      }

      const response = await api.post<{ message: any }>(
        '/automation/plan',
        {
          system_prompt: systemPromptType,
          user_prompt: userPrompt,
          tools: tools,
          cached_context: cachedContext
        },
        {
          headers: {
            'session-id': this.sessionId
          }
        }
      );

      if (!response.success || !response.data?.message) {
        throw new Error(response.error || 'Failed to create automation plan');
      }

      console.log('✅ [AutomationClient] Automation plan created successfully');
      return response.data.message as Anthropic.Message;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to create automation plan:', error);
      throw error;
    }
  }

  public async continueConversation(params: {
    systemPromptType: SystemPromptType;
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
    cachedContext?: string;
  }): Promise<Anthropic.Message> {
    const { systemPromptType, messages, tools, cachedContext } = params;

    if (!this.sessionId) {
      throw new Error('No active automation session. Call startAutomation() first.');
    }

    try {
      if (this.onThinking) {
        this.onThinking('Analyzing and generating next steps...');
      }

      messages.forEach(message => {
        console.log('message-role: ', message.role);
        if (typeof message.content === 'string') {
          console.log('message-content: ', message.content);
        } else {
          message.content.forEach(content => {
            console.log('message-content: ', content);
          })
        }
      })

      const response = await api.post<{ message: any }>(
        '/automation/continue',
        {
          system_prompt: systemPromptType,
          messages: messages,
          tools: tools,
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

  public async endAutomation(): Promise<void> {
    if (!this.sessionId) {
      console.warn('[AutomationClient] No active automation session to end');
      return;
    }

    try {
      if (this.onThinking) {
        this.onThinking('Ending automation session...');
      }

      const response = await api.post<string>(
        '/automation/end',
        undefined,
        {
          headers: {
            'session-id': this.sessionId
          }
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to end automation session');
      }

      console.log(`✅ [AutomationClient] Automation session ended: ${this.sessionId}`);
      this.sessionId = null;

    } catch (error) {
      console.error('❌ [AutomationClient] Failed to end automation:', error);
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
