/**
 * Agent Types - Core type definitions for the agent orchestration system
 * 
 * Defines the fundamental data structures for:
 * - Agent state and execution context
 * - Planning and execution steps
 * - Memory and conversation management
 * - Tool execution tracking
 */

import { LLMMessage, ToolCall } from '../llm/types';
import { ToolResult } from '../tools/types';
import { BrowserContext } from '../context/types';
import { RecordedAction } from '@/shared/types';

/**
 * Agent execution state
 */
export type AgentState = 
  | 'idle'           // Not executing anything
  | 'thinking'       // LLM is reasoning about next action
  | 'planning'       // Creating execution plan
  | 'executing'      // Executing tool/action
  | 'observing'      // Gathering browser context
  | 'waiting'        // Waiting for user input
  | 'completed'      // Task completed successfully
  | 'failed'         // Task failed
  | 'paused';        // Execution paused

/**
 * Agent execution mode
 */
export type AgentMode = 
  | 'autonomous'     // Fully autonomous - executes without user approval
  | 'semi-supervised' // Asks for approval on critical actions
  | 'supervised';    // Requires approval for every action

/**
 * A single step in the agent's plan
 */
export interface PlanStep {
  id: string;
  type: 'tool_call' | 'observation' | 'reasoning' | 'user_input';
  description: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: ToolResult;
  error?: string;
  reasoning?: string; // Why this step is needed
  createdAt: number;
  completedAt?: number;
}

/**
 * Agent's execution plan
 */
export interface ExecutionPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  currentStepIndex: number;
  createdAt: number;
  completedAt?: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Execution context - everything the agent needs to know
 */
export interface ExecutionContext {
  // Session info
  sessionId: string;
  tabId: string;
  userId?: string;
  
  // Current state
  state: AgentState;
  mode: AgentMode;
  
  // Task/goal
  currentGoal?: string;
  currentPlan?: ExecutionPlan;
  
  // Browser context
  browserContext?: BrowserContext;
  
  // Recording context (optional workflow reference)
  recordingContext?: {
    id: string;
    name: string;
    actions: RecordedAction[];
    url?: string;
  };
  
  // Conversation history
  messages: LLMMessage[];
  
  // Execution history
  executedSteps: PlanStep[];
  
  // Metadata
  startTime: number;
  lastUpdateTime: number;
  executionCount: number;
  
  // Constraints
  maxExecutionSteps: number;
  maxThinkingTime: number; // ms
  requiresUserApproval: boolean;
}

/**
 * Agent observation - what the agent sees
 */
export interface AgentObservation {
  type: 'browser_state' | 'tool_result' | 'user_message' | 'error' | 'system';
  timestamp: number;
  data: unknown;
  summary?: string; // Human-readable summary
}

/**
 * Agent thought/reasoning step (for ReAct pattern)
 */
export interface AgentThought {
  id: string;
  timestamp: number;
  type: 'observation' | 'reasoning' | 'planning' | 'reflection';
  content: string;
  relatedStepId?: string;
}

/**
 * Agent action - what the agent does
 */
export interface AgentAction {
  id: string;
  timestamp: number;
  type: 'tool_call' | 'ask_user' | 'complete_task' | 'retry' | 'abort';
  toolCall?: ToolCall;
  reasoning?: string;
  awaitingApproval?: boolean;
}

/**
 * Conversation turn (one user message + agent response)
 */
export interface ConversationTurn {
  id: string;
  timestamp: number;
  userMessage: string;
  agentThoughts: AgentThought[];
  agentActions: AgentAction[];
  agentResponse: string;
  toolResults: ToolResult[];
  browserContext?: BrowserContext;
}

/**
 * Chat session - persistent conversation state
 */
export interface ChatSession {
  id: string;
  tabId: string;
  userId?: string;
  
  // Session metadata
  title?: string;
  createdAt: number;
  lastMessageAt: number;
  
  // Conversation
  turns: ConversationTurn[];
  messages: LLMMessage[];
  
  // Current state
  currentContext?: ExecutionContext;
  
  // Statistics
  stats: {
    totalMessages: number;
    totalToolCalls: number;
    totalTokensUsed: number;
    totalCost: number;
    successfulActions: number;
    failedActions: number;
  };
}

/**
 * Memory entry for long-term context
 */
export interface MemoryEntry {
  id: string;
  type: 'fact' | 'preference' | 'context' | 'tool_usage';
  content: string;
  source: string; // Which conversation/action created this
  importance: number; // 0-1 score
  timestamp: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  // Model selection
  model: 'claude-4-5-sonnet' | 'gemini-2.5-pro' | 'gemini-2.5-flash';
  fallbackModel?: string;
  
  // Behavior
  mode: AgentMode;
  maxExecutionSteps: number;
  maxThinkingTime: number;
  temperature: number;
  
  // Context management
  maxContextTokens: number;
  contextCompressionEnabled: boolean;
  
  // Error handling
  maxRetries: number;
  retryDelay: number;
  
  // Safety
  dangerousActionsRequireApproval: string[]; // List of tool names
  allowedDomains?: string[];
  
  // Features
  enableReflection: boolean; // Self-critique after actions
  enablePlanning: boolean; // Create multi-step plans
  enableMemory: boolean; // Persist learnings across sessions
  
  // Streaming
  streamingEnabled: boolean;
}

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  success: boolean;
  finalState: AgentState;
  response: string;
  thoughts: AgentThought[];
  actions: AgentAction[];
  observations: AgentObservation[];
  plan?: ExecutionPlan;
  error?: string;
  metadata: {
    executionTime: number;
    stepsExecuted: number;
    tokensUsed: number;
    cost: number;
  };
}

/**
 * Agent event for real-time updates
 */
export interface AgentEvent {
  type: 'state_change' | 'thought' | 'action' | 'observation' | 'plan_update' | 'error' | 'complete';
  timestamp: number;
  sessionId: string;
  data: unknown;
}

/**
 * Agent event callback
 */
export type AgentEventCallback = (event: AgentEvent) => void | Promise<void>;

/**
 * Planner output - multi-step plan
 */
export interface PlannerOutput {
  plan: ExecutionPlan;
  reasoning: string;
  estimatedSteps: number;
  estimatedTime?: number;
  confidence: number; // 0-1 score
}

/**
 * ReAct iteration - one Observe-Think-Act cycle
 */
export interface ReActIteration {
  iteration: number;
  
  // Observe
  observation: AgentObservation;
  browserContext?: BrowserContext;
  
  // Think
  thought: AgentThought;
  reasoning: string;
  
  // Act
  action: AgentAction;
  actionResult?: ToolResult;
  
  // Metadata
  timestamp: number;
  tokensUsed: number;
}

/**
 * Context window optimization strategy
 */
export type ContextOptimizationStrategy = 
  | 'sliding_window'      // Keep recent messages
  | 'compression'         // Summarize old messages
  | 'importance_based'    // Keep important messages
  | 'hierarchical';       // Multi-level summarization

/**
 * Compressed context
 */
export interface CompressedContext {
  summary: string;
  keyFacts: string[];
  importantActions: PlanStep[];
  compressedFrom: number; // How many messages compressed
  tokensaved: number;
}

