import { EventEmitter } from 'events';
import { WebContentsView } from 'electron';

import { v4 as uuidv4 } from 'uuid';

import type {
  AutopilotConfig,
  AutopilotEventType,
  AutopilotProgressEvent,
  AutopilotStartResponse,
  AutopilotStepResponse,
  ToolCall,
  ToolResult,
} from './types';

import { tokenManager } from '@/main/auth/TokenManager';
import {
  AccessibilityTreeExtractor,
  ExecutionService,
} from '@/main/automation';
import { RecordingSession } from '@/shared/types';

export type { AutopilotProgressEvent };

const API_BASE_URL = process.env.SERVICES_API_URL || 'http://localhost:8000';

export class AutopilotExecutionService extends EventEmitter {
  private executor: ExecutionService;
  private view: WebContentsView;
  private accessibilityExtractor: AccessibilityTreeExtractor;
  private sessionId: string | null = null;
  private localSessionId: string;
  private status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped' =
    'idle';
  private stepCount = 0;
  private electronId: string;
  private messages: Record<string, unknown>[] = [];

  constructor(
    executor: ExecutionService,
    view: WebContentsView,
    electronId: string
  ) {
    super();
    this.executor = executor;
    this.view = view;
    this.accessibilityExtractor = new AccessibilityTreeExtractor(this.view);
    this.localSessionId = uuidv4();
    this.electronId = electronId;
  }

  public getSessionId(): string {
    return this.sessionId || this.localSessionId;
  }

  public getStatus(): string {
    return this.status;
  }

  public async execute(
    userGoal: string,
    startUrl: string,
    referenceRecording?: RecordingSession,
    config?: Partial<AutopilotConfig>
  ): Promise<{ success: boolean; message: string; stepCount: number }> {
    this.status = 'running';
    this.stepCount = 0;
    this.messages = [];

    try {
      const startPayload: Record<string, unknown> = {
        user_goal: userGoal,
        start_url: startUrl,
      };

      if (referenceRecording) {
        startPayload.reference_recording = {
          name: referenceRecording.name,
          description: referenceRecording.description,
          start_url: referenceRecording.startUrl,
          actions: referenceRecording.actions,
        };
      }

      if (config) {
        startPayload.config = {
          max_steps: config.maxSteps,
          max_consecutive_failures: config.maxConsecutiveFailures,
        };
      }

      const startResponse = await this.callBackendAPI<AutopilotStartResponse>(
        '/api/v1/autopilot/start',
        startPayload
      );

      this.sessionId = startResponse.session_id;
      this.messages = startResponse.messages;

      if (startResponse.message) {
        this.emitProgress('text_response', { message: startResponse.message });
      }

      let actions: ToolCall[] = startResponse.actions;

      while (this.status === 'running' && actions.length > 0) {
        this.stepCount++;
        this.emitProgress('thinking', {
          step: this.stepCount,
          message: 'Executing actions...',
        });

        const results = await this.executeToolCalls(actions);

        // Build the tool result message to append to messages
        const toolResultMessage = {
          role: 'user',
          content: results.map((r) => ({
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })),
        };

        const stepResponse = await this.callBackendAPI<AutopilotStepResponse>(
          '/api/v1/autopilot/step',
          {
            session_id: this.sessionId,
            messages: [...this.messages, toolResultMessage],
          }
        );

        this.messages = stepResponse.messages;

        if (stepResponse.message) {
          this.emitProgress('text_response', { message: stepResponse.message });
        }

        if (
          stepResponse.status === 'completed' ||
          stepResponse.status === 'failed'
        ) {
          this.status = stepResponse.status as 'completed' | 'failed';
          this.emitProgress('autopilot_complete', {
            success: stepResponse.result?.success ?? false,
            message: stepResponse.result?.message ?? '',
          });

          return {
            success: stepResponse.result?.success ?? false,
            message: stepResponse.result?.message ?? 'Autopilot finished',
            stepCount: this.stepCount,
          };
        }

        if (stepResponse.status === 'stopped') {
          this.status = 'stopped';
          return {
            success: false,
            message: 'Autopilot stopped by user',
            stepCount: this.stepCount,
          };
        }

        actions = stepResponse.actions;
      }

      return {
        success: false,
        message: 'Autopilot finished unexpectedly',
        stepCount: this.stepCount,
      };
    } catch (error) {
      this.status = 'failed';
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.emitProgress('autopilot_error', { error: errorMessage });
      return {
        success: false,
        message: `Autopilot failed: ${errorMessage}`,
        stepCount: this.stepCount,
      };
    }
  }

  public async stop(): Promise<void> {
    if (!this.sessionId) {
      this.status = 'stopped';
      return;
    }

    this.status = 'stopped';

    try {
      await this.callBackendAPI('/api/v1/autopilot/stop', {
        session_id: this.sessionId,
      });
    } catch {
      // Ignore stop errors
    }

    this.emitProgress('autopilot_stopped', { message: 'Stopped by user' });
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      this.emitProgress('step_start', {
        toolName: toolCall.name,
        toolInput: toolCall.input,
        stepNumber: this.stepCount,
      });

      try {
        const result = await this.executeSingleTool(
          toolCall.name,
          toolCall.input
        );

        this.emitProgress('step_complete', {
          toolName: toolCall.name,
          success: result.success,
          stepNumber: this.stepCount,
        });

        results.push({
          tool_use_id: toolCall.id,
          is_error: !result.success,
          content: result.content,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        this.emitProgress('step_error', {
          toolName: toolCall.name,
          error: errorMessage,
          stepNumber: this.stepCount,
        });

        results.push({
          tool_use_id: toolCall.id,
          is_error: true,
          content: `Error: ${errorMessage}`,
        });
      }
    }

    return results;
  }

  private async executeSingleTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<{ success: boolean; content: string }> {
    let result: {
      success: boolean;
      value?: string;
      error?: string;
    };

    switch (toolName) {
      case 'extract_context': {
        const extractResult =
          await this.accessibilityExtractor.extractContext();
        if (extractResult.error) {
          return { success: false, content: extractResult.error };
        }
        const content = extractResult.tree ?? '';
        const truncated =
          content.length > 50000
            ? content.substring(0, 50000) + '\n[...truncated...]'
            : content;
        return { success: true, content: truncated };
      }

      case 'click': {
        result = await this.executor.executeTool('click', {
          nodeId: input.backend_node_id as number,
        });
        return {
          success: result?.success !== false,
          content: result?.success
            ? 'Click successful'
            : (result?.error ?? 'Click failed'),
        };
      }

      case 'type': {
        result = await this.executor.executeTool('type', {
          nodeId: input.backend_node_id as number,
          value: input.text as string,
          clearFirst: (input.clearFirst as boolean) ?? true,
        });
        if (result?.success && input.pressEnter) {
          await this.executor.executeTool('key', { key: 'Enter' });
        }
        return {
          success: result?.success !== false,
          content: result?.success
            ? 'Type successful'
            : (result?.error ?? 'Type failed'),
        };
      }

      case 'scroll': {
        result = await this.executor.executeTool('scroll', {
          direction: input.direction as string,
          amount: input.amount as number,
        });
        return {
          success: result?.success !== false,
          content: result?.success
            ? `Scrolled ${input.direction}`
            : 'Scroll failed',
        };
      }

      case 'navigate': {
        result = await this.executor.executeTool('navigate', {
          url: input.url as string,
        });
        await this.sleep(1500);
        return {
          success: result?.success !== false,
          content: result?.success
            ? `Navigated to ${input.url}`
            : 'Navigation failed',
        };
      }

      case 'keyPress': {
        result = await this.executor.executeTool('key', {
          key: input.key as string,
          modifiers: input.modifiers as string[],
        });
        return {
          success: result?.success !== false,
          content: result?.success
            ? `Pressed ${input.key}`
            : 'Key press failed',
        };
      }

      case 'wait': {
        if (input.waitForNetwork) {
          const timeout = Math.min((input.timeout as number) ?? 10000, 30000);
          result = await this.executor.executeTool('waitForNetworkIdle', {
            timeout,
            idleTime: 500,
          });
          return {
            success: result?.success !== false,
            content:
              typeof result?.value === 'string'
                ? result.value
                : 'Network idle wait completed',
          };
        }
        const duration = Math.min((input.duration as number) ?? 100, 2000);
        await this.sleep(duration);
        return { success: true, content: `Waited ${duration}ms` };
      }

      case 'done': {
        return {
          success: input.success as boolean,
          content: input.message as string,
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async callBackendAPI<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const token = this.getAuthToken();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Electron-ID': this.electronId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { detail?: string }).detail || `API error: ${response.status}`
      );
    }

    return response.json() as Promise<T>;
  }

  private getAuthToken(): string {
    return tokenManager.getAccessToken() ?? '';
  }

  private emitProgress(
    type: AutopilotEventType,
    data: Record<string, unknown>
  ): void {
    const event: AutopilotProgressEvent = {
      id: uuidv4(),
      sessionId: this.sessionId || this.localSessionId,
      type,
      data,
      timestamp: Date.now(),
    };
    this.emit('progress', event);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
