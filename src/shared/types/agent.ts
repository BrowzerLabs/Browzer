/**
 * Agent Types - Frontend types for LLM Orchestration
 * 
 * These types are used for communication between renderer and main process
 * for the agent orchestration system.
 */

import { RecordingSession } from './recording';

/**
 * Agent execution request from user
 */
export interface AgentRequest {
  message: string; // User's prompt/instruction
  recordingContext?: string; // ID of recording to use as context
  mode?: 'autonomous' | 'semi-supervised' | 'supervised';
}

/**
 * Agent execution response
 */
export interface AgentResponse {
  sessionId: string;
  success: boolean;
  response: string;
  error?: string;
  metadata: {
    executionTime: number;
    stepsExecuted: number;
    tokensUsed: number;
    cost: number;
  };
}

/**
 * Real-time agent events (streaming)
 */
export type AgentEvent = 
  | { type: 'message_start'; sessionId: string; timestamp: number }
  | { type: 'thought'; sessionId: string; timestamp: number; data: AgentThought }
  | { type: 'action'; sessionId: string; timestamp: number; data: AgentAction }
  | { type: 'observation'; sessionId: string; timestamp: number; data: AgentObservation }
  | { type: 'text_delta'; sessionId: string; timestamp: number; delta: string }
  | { type: 'error'; sessionId: string; timestamp: number; data: { error: string } }
  | { type: 'complete'; sessionId: string; timestamp: number; data: AgentResponse };

/**
 * Agent thought/reasoning
 */
export interface AgentThought {
  id: string;
  timestamp: number;
  type: 'reasoning' | 'planning' | 'reflection';
  content: string;
  relatedStepId?: string;
}

/**
 * Agent action
 */
export interface AgentAction {
  id: string;
  timestamp: number;
  type: 'tool_call' | 'complete_task' | 'ask_user';
  toolCall?: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
  reasoning?: string;
}

/**
 * Agent observation
 */
export interface AgentObservation {
  type: 'browser_state' | 'tool_result' | 'user_input';
  timestamp: number;
  data: any;
  summary: string;
}

/**
 * Chat message for display
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  
  // Agent-specific fields
  thoughts?: AgentThought[];
  actions?: AgentAction[];
  observations?: AgentObservation[];
  
  // Metadata
  metadata?: {
    tokensUsed?: number;
    cost?: number;
    executionTime?: number;
  };
  
  // Streaming state
  isStreaming?: boolean;
  isComplete?: boolean;
}

/**
 * Agent session info
 */
export interface AgentSession {
  id: string;
  tabId: string;
  userId?: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
  stats: {
    totalMessages: number;
    totalTokensUsed: number;
    totalCost: number;
    lastActivity: number;
  };
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  model: 'claude-3-5-sonnet' | 'claude-3-5-haiku' | 'gemini-2.5-pro' | 'gemini-2.5-flash';
  mode: 'autonomous' | 'semi-supervised' | 'supervised';
  temperature?: number;
  maxExecutionSteps?: number;
  enableReflection?: boolean;
  streamingEnabled?: boolean;
}

/**
 * Recording context for agent
 */
export interface RecordingContextInfo {
  id: string;
  name: string;
  actionCount: number;
  duration: number;
  url?: string;
  createdAt: number;
}

