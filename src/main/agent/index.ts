/**
 * Agent Module - Agentic Browser Intelligence
 * 
 * Complete agent orchestration system implementing the ReAct pattern
 * (Reasoning + Acting) for autonomous browser automation.
 */

// Main orchestrator
export { AgentOrchestrator } from './AgentOrchestrator';

// Core engines
export { ReActEngine } from './ReActEngine';
export { ChatSessionManager } from './ChatSessionManager';
export { ContextMemoryManager } from './ContextMemoryManager';

// Types
export type {
  AgentState,
  AgentMode,
  AgentConfig,
  AgentExecutionResult,
  AgentEventCallback,
  AgentEvent,
  ExecutionContext,
  ChatSession,
  ConversationTurn,
  AgentThought,
  AgentAction,
  AgentObservation,
  PlanStep,
  ExecutionPlan,
  ReActIteration,
  MemoryEntry,
  CompressedContext,
  ContextOptimizationStrategy,
  PlannerOutput
} from './types';

