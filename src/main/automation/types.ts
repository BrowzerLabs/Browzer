/**
 * Automation Types
 *
 * Type definitions for the workflow automation/playback system.
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  InputVariable,
} from '../recording/types';

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecutionContext {
  sessionId: string;
  workflowId: string;
  variables: Record<string, any>; // Resolved variable values
  extractedData: Record<string, any>; // Data extracted during execution
  currentStepIndex: number;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  error?: ExecutionError;
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ExecutionError {
  stepIndex: number;
  type: 'element_not_found' | 'action_failed' | 'timeout' | 'validation_failed';
  message: string;
  recoveryAttempted: boolean;
  recoverySucceeded: boolean;
}

export interface StepExecutionResult {
  stepIndex: number;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  selectorUsed?: string;
  strategyUsed?: string;
  extractedData?: any;
  error?: string;
  screenshot?: string; // Base64 screenshot after step
}

export interface ExecutionOptions {
  closeBrowserOnComplete?: boolean;
  toolbarHeight?: number;
  headless?: boolean;
  timeout?: number;
  stepDelay?: number; // Delay between steps in ms
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT FINDING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ElementLocator {
  strategies: SelectorStrategy[];
  targetText?: string;
  containerHint?: string;
  positionHint?: string;
}

export interface SelectorStrategy {
  type: SelectorType;
  value: string;
  priority: number;
  metadata?: Record<string, any>;
}

export type SelectorType =
  | 'text_exact'
  | 'text_fuzzy'
  | 'text_contains'
  | 'aria_label'
  | 'placeholder'
  | 'title'
  | 'alt_text'
  | 'role_text'
  | 'css'
  | 'xpath'
  | 'data_testid'
  | 'nth_item'
  | 'ai_visual'; // AI-based visual matching

export interface FoundElement {
  selector: string;
  strategyUsed: SelectorStrategy;
  confidence: number; // 0-1 confidence score
  boundingBox: BoundingBox;
  attributes: Record<string, string>;
  innerText: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERALIZATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GeneralizationRequest {
  workflowId: string;
  userPrompt: string; // "change visibility of 3rd repo"
  pageContext?: PageContext; // Current page state
}

export interface GeneralizationResult {
  adaptedWorkflow: WorkflowDefinition;
  modifications: WorkflowModification[];
  newVariables: InputVariable[];
  explanation: string;
}

export interface WorkflowModification {
  type: 'add_step' | 'modify_step' | 'remove_step' | 'reorder_steps';
  stepIndex?: number;
  originalStep?: WorkflowStep;
  newStep?: WorkflowStep;
  reason: string;
}

export interface PageContext {
  url: string;
  title: string;
  visibleElements: VisibleElement[];
  pageStructure: string; // Simplified DOM structure
}

export interface VisibleElement {
  index: number;
  tagName: string;
  text: string;
  ariaLabel?: string;
  role?: string;
  isClickable: boolean;
  boundingBox: BoundingBox;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT PARSING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedIntent {
  type: IntentType;
  rawPrompt: string;
  parameters: Record<string, any>;
  confidence: number;
}

export type IntentType =
  | 'select_nth_item'
  | 'change_target'
  | 'add_condition'
  | 'loop_items'
  | 'filter_items'
  | 'custom';

export interface ContextInsights {
  url: string;
  elements?: VisibleElement[];
  itemCounts?: Record<string, number>;
  containerSelector?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HealingStrategy {
  name: string;
  attempt: (
    step: WorkflowStep,
    webContents: Electron.WebContents,
    context: ExecutionContext
  ) => Promise<HealingResult>;
}

export interface HealingResult {
  success: boolean;
  element?: FoundElement;
  strategy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AutomationEvents {
  'execution:started': (context: ExecutionContext) => void;
  'execution:completed': (data: {
    context: ExecutionContext;
    results: StepExecutionResult[];
  }) => void;
  'execution:failed': (context: ExecutionContext) => void;
  'execution:paused': (context: ExecutionContext) => void;
  'execution:resumed': (context: ExecutionContext) => void;
  'execution:cancelled': (context: ExecutionContext) => void;
  'step:started': (data: {
    stepIndex: number;
    context: ExecutionContext;
  }) => void;
  'step:completed': (result: StepExecutionResult) => void;
  'step:failed': (result: StepExecutionResult) => void;
  'healing:attempted': (data: { step: WorkflowStep; error: string }) => void;
  'healing:succeeded': (data: { stepIndex: number; strategy: string }) => void;
  'generalization:completed': (result: GeneralizationResult) => void;
}

// Re-export recording types for convenience
export type { WorkflowDefinition, WorkflowStep, InputVariable };
