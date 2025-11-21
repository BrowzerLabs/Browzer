import Anthropic from '@anthropic-ai/sdk';
import { AutomationStatus } from '..';

export interface StoredSession {
  id: string;
  userGoal: string;
  recordingId: string;
  status: AutomationStatus
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalCost: number;
  recoveryAttempts: number;
  totalStepsExecuted: number;
  phaseNumber: number;
  isInRecovery: boolean;
  finalSuccess?: boolean;
  finalError?: string;
}

export interface StoredMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant';
  content: Anthropic.MessageParam['content'];
  tokens?: number;
  cached: boolean;
  createdAt: number;
}

export interface StoredStep {
  id: number;
  sessionId: string;
  stepNumber: number;
  toolName: string;
  toolUseId?: string;
  effects?: any;
  result: any;
  success: boolean;
  error?: string;
  tokens?: number;
  createdAt: number;
}

/**
 * Cache metadata for session
 */
export interface SessionCacheMetadata {
  sessionId: string;
  cachedContext?: string; // Formatted recorded session
  cacheBreakpoints: CacheBreakpoint[];
  lastCacheHit?: number;
}

/**
 * Cache breakpoint position
 */
export interface CacheBreakpoint {
  type: 'tools' | 'system' | 'messages';
  position: number; // Token position
  messageIndex?: number; // For message breakpoints
}

/**
 * Session with full conversation history
 * Used for loading and resuming sessions
 */
export interface SessionWithHistory {
  session: StoredSession;
  messages: StoredMessage[];
  steps: StoredStep[];
  cache: SessionCacheMetadata;
}

/**
 * Context management configuration
 */
export interface ContextConfig {
  // When to trigger context editing (in tokens)
  triggerThreshold: number;
  
  // How many tool uses to keep after clearing
  keepToolUses: number;
  
  // Minimum tokens to clear (for cache efficiency)
  clearAtLeast: number;
  
  // Tools to exclude from clearing
  excludeTools: string[];
  
  // Whether to clear tool inputs along with results
  clearToolInputs: boolean;
}

/**
 * Context statistics
 */
export interface ContextStats {
  totalTokens: number;
  messagesTokens: number;
  toolsTokens: number;
  systemTokens: number;
  cachedTokens: number;
  remainingCapacity: number;
}

/**
 * Session list item for UI
 */
export interface SessionListItem {
  id: string;
  userGoal: string;
  recordingId: string;
  status: StoredSession['status'];
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  stepCount: number;
  totalCost: number;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  userGoal: string;
  recordingId: string;
  cachedContext?: string;
}

/**
 * Session update options
 */
export interface UpdateSessionOptions {
  status?: StoredSession['status'];
  metadata?: Partial<SessionMetadata>;
  completedAt?: number;
}

/**
 * Message creation options
 */
export interface AddMessageOptions {
  sessionId: string;
  role: 'user' | 'assistant';
  content: Anthropic.MessageParam['content'];
  tokens?: number;
  cached?: boolean;
}

/**
 * Step creation options
 */
export interface AddStepOptions {
  sessionId: string;
  stepNumber: number;
  toolName: string;
  toolUseId?: string;
  effects?: any;
  result: any;
  success: boolean;
  error?: string;
  tokens?: number;
}
