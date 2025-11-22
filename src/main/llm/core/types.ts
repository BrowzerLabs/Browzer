/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';
import { ParsedAutomationPlan } from '../parsers/AutomationPlanParser';
import { RecordingSession } from '@/shared/types/recording';
import { ToolExecutionResult } from '@/shared/types';

/**
 * Internal types for LLM automation core modules
 * These types are used internally and not exposed in the public API
 */

export enum AutomationStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused'
}

/**
 * Automation session state
 * Tracks the complete state of an ongoing automation session
 */
export interface AutomationState {
  // User context
  userGoal: string;
  recordedSession: RecordingSession;
  cachedContext?: string; // Formatted recorded session for caching
  
  // Conversation history
  messages: Anthropic.MessageParam[];
  
  // Execution tracking
  currentPlan?: ParsedAutomationPlan;
  executedSteps: ExecutedStep[];
  
  // Multi-phase tracking
  phaseNumber: number;
  completedPlans: CompletedPlan[];
  isInRecovery: boolean;
  
  // Recovery tracking
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  
  // Status
  status: AutomationStatus;
  finalSuccess: boolean;
  finalError?: string;
}

/**
 * Executed automation step
 */
export interface ExecutedStep {
  stepNumber: number;
  toolName: string;
  success: boolean;
  result?: ToolExecutionResult;
  error?: string;
}

/**
 * Completed automation plan
 */
export interface CompletedPlan {
  phaseNumber: number;
  plan: ParsedAutomationPlan;
  stepsExecuted: number;
}

/**
 * Plan execution result
 */
export interface PlanExecutionResult {
  success: boolean;
  isComplete: boolean;
  error?: string;
  usage?: UsageStats;
}

/**
 * Token usage statistics
 */
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

/**
 * Plan generation result
 */
export interface PlanGenerationResult {
  plan: ParsedAutomationPlan;
  response: Anthropic.Message;
  usage: UsageStats;
}

/**
 * Error recovery context
 */
export interface ErrorRecoveryContext {
  failedStep: any;
  result: ToolExecutionResult;
  state: AutomationState;
}

/**
 * Intermediate plan continuation context
 */
export interface IntermediatePlanContext {
  state: AutomationState;
}


/**
 * Result of iterative automation execution
 */
export interface IterativeAutomationResult {
  success: boolean;
  plan?: ParsedAutomationPlan;
  executionResults: any[];
  error?: string;
  analysis?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
  };
  recoveryAttempts: number;
  totalStepsExecuted: number;
}