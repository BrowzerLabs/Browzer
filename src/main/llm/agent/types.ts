/**
 * DO Agent (Direct Operation Agent) Types
 *
 * Type definitions for the autonomous browser automation agent
 * that uses Claude AI to accomplish user-defined goals through
 * an observe-think-act-evaluate loop.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the autopilot agent
 */
export interface AutopilotConfig {
  /** Maximum actions before stopping (default: 50) */
  maxSteps: number;
  /** Failures before abort (default: 3) */
  maxConsecutiveFailures: number;
  /** Include visual snapshots in context */
  includeScreenshots: boolean;
  /** Claude model to use */
  model: string;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  maxSteps: 100,
  maxConsecutiveFailures: 3,
  includeScreenshots: false,
  model: 'claude-sonnet-4-5-20250929',
};

// ============================================================================
// Agent State Types
// ============================================================================

/**
 * Agent execution states
 */
export type AutopilotStatus = 'running' | 'completed' | 'failed' | 'stopped';

/**
 * Internal loop state tracking
 */
export interface AgentLoopState {
  isRunning: boolean;
  currentStep: number;
  consecutiveFailures: number;
  lastToolResult: AgentStepResult | null;
}

/**
 * Result of a single agent step
 */
export interface AgentStepResult {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Token usage tracking (includes cache metrics)
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Tokens written to cache (cache miss - full prompt processing) */
  cacheCreationInputTokens: number;
  /** Tokens read from cache (cache hit - reduced cost) */
  cacheReadInputTokens: number;
}

/**
 * Cost calculation result
 */
export interface UsageCost {
  inputCost: number;
  outputCost: number;
  /** Cost for cache write operations */
  cacheWriteCost: number;
  /** Cost for cache read operations (much cheaper than input) */
  cacheReadCost: number;
  totalCost: number;
  currency: string;
}

/**
 * Final result from agent execution
 */
export interface DOAgentResult {
  success: boolean;
  message: string;
  stepCount: number;
  finalUrl?: string;
  usage?: TokenUsage;
  cost?: UsageCost;
}

// ============================================================================
// Tool Input Types
// ============================================================================

/**
 * Click tool input parameters
 */
export interface ClickToolInput {
  /** The backend_node_id of the element to click */
  backend_node_id: number;
  /** Number of clicks: 1 (default), 2 (double), 3 (triple) */
  clickCount?: number;
}

/**
 * Type tool input parameters
 */
export interface TypeToolInput {
  /** The backend_node_id of the element to type into */
  backend_node_id: number;
  /** Text to type */
  text: string;
  /** Clear existing content first (default: true) */
  clearFirst?: boolean;
  /** Press Enter after typing (default: false) */
  pressEnter?: boolean;
}

/**
 * Scroll tool input parameters
 */
export interface ScrollToolInput {
  /** Direction to scroll */
  direction: 'up' | 'down' | 'left' | 'right';
  /** Amount to scroll in pixels (default: 300) */
  amount?: number;
}

/**
 * Navigate tool input parameters
 */
export interface NavigateToolInput {
  /** URL to navigate to */
  url: string;
}

/**
 * Key press tool input parameters
 */
export interface KeyPressToolInput {
  /** Key to press (e.g., 'Enter', 'Escape', 'Tab') */
  key: string;
  /** Modifier keys to hold */
  modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[];
}

/**
 * Wait tool input parameters
 */
export interface WaitToolInput {
  /** Wait for network to become idle (recommended for page loads) */
  waitForNetwork?: boolean;
  /** Duration to wait in milliseconds (max 5000) - for animations only */
  duration?: number;
  /** Maximum time to wait for network idle in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Done tool input parameters - signals task completion
 */
export interface DoneToolInput {
  /** Whether the task was completed successfully */
  success: boolean;
  /** Completion message explaining outcome */
  message: string;
}

// ============================================================================
// Progress Event Types
// ============================================================================

/**
 * Progress event types emitted during agent execution
 */
export type AutopilotEventType =
  | 'thinking'
  | 'step_start'
  | 'step_complete'
  | 'step_error'
  | 'text_response'
  | 'plan_generated'
  | 'autopilot_stopped'
  | 'autopilot_error'
  | 'autopilot_complete';

/**
 * Progress event data structure
 */
export interface AutopilotProgressEvent {
  id: string;
  sessionId: string;
  type: AutopilotEventType;
  data: Record<string, any>;
  timestamp: number;
}

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Result from tool execution formatted for Claude
 */
export interface ToolResultForClaude {
  content: string;
  isError: boolean;
}
