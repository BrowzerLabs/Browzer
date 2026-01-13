/**
 * Recording System Types
 *
 * Types for capturing user interactions in the browser and generating
 * workflow files for automation.
 */

// ═══════════════════════════════════════════════════════════════════════
// RECORDED ELEMENT TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface RecordedElement {
  // Semantic identifiers (PRIMARY - best for self-healing)
  innerText: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  altText?: string;
  value?: string;

  // Technical identifiers (FALLBACK)
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  type?: string;

  // Selectors (GENERATED)
  xpath: string;
  cssSelector: string;

  // Position info
  index: number;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Context
  parentText?: string;
  containerHint?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════

export type ActionType =
  | 'navigation'
  | 'click'
  | 'input'
  | 'keypress'
  | 'scroll'
  | 'select_change'
  | 'focus'
  | 'blur'
  | 'submit';

export interface RecordedAction {
  id: string;
  timestamp: string;
  type: ActionType;

  // Page context
  pageUrl: string;
  pageTitle: string;

  // Element (for interactive actions)
  element?: RecordedElement;

  // Action-specific data
  value?: string; // For input actions
  key?: string; // For keypress actions
  scrollX?: number; // For scroll actions
  scrollY?: number;
  selectedText?: string; // For select actions
}

// ═══════════════════════════════════════════════════════════════════════
// SESSION TYPES
// ═══════════════════════════════════════════════════════════════════════

export type RecordingStatus = 'idle' | 'recording' | 'stopped' | 'processing';

export interface RecordingSession {
  id: string;
  startedAt: string;
  stoppedAt?: string;
  actions: RecordedAction[];
  status: RecordingStatus;
  initialUrl?: string;
  tabId?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// WORKFLOW TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface SelectorStrategy {
  type:
    | 'text_exact'
    | 'text_fuzzy'
    | 'aria_label'
    | 'placeholder'
    | 'title'
    | 'alt_text'
    | 'role_text'
    | 'xpath'
    | 'css';
  value: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

export type WorkflowStepType =
  | 'navigation'
  | 'click'
  | 'input'
  | 'key_press'
  | 'select_change'
  | 'scroll'
  | 'wait'
  | 'extract';

export interface WorkflowStep {
  type: WorkflowStepType;
  description?: string;

  // Navigation
  url?: string;

  // Element targeting
  target_text?: string;
  selectorStrategies?: SelectorStrategy[];
  container_hint?: string;

  // Input
  value?: string;
  default_value?: string;

  // Key press
  key?: string;

  // Select
  selectedText?: string;

  // Scroll
  scrollX?: number;
  scrollY?: number;

  // Wait
  wait_time?: number;

  // Extract
  extractionGoal?: string;
}

export interface InputVariable {
  name: string;
  type: 'string' | 'number' | 'bool';
  required: boolean;
  default?: string | number | boolean;
  format?: 'email' | 'phone' | 'url' | 'date';
  description?: string;
}

export interface WorkflowMetadata {
  created_at: string;
  updated_at?: string;
  generation_mode: 'recording' | 'ai_generated' | 'manual';
  action_count?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  default_wait_time?: number;
  input_schema?: InputVariable[];
  steps: WorkflowStep[];
  metadata?: WorkflowMetadata;
}

// ═══════════════════════════════════════════════════════════════════════
// STORAGE TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface StoredWorkflowMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  created_at: string;
  updated_at: string;
  file_path: string;
  generation_mode: 'recording' | 'ai_generated' | 'manual';
  step_count: number;
  variable_count: number;
}

export interface MetadataIndex {
  workflows: StoredWorkflowMetadata[];
}

// ═══════════════════════════════════════════════════════════════════════
// IPC MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════

export type RecorderMessageType =
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'ACTION_RECORDED';

export interface RecorderMessage {
  type: RecorderMessageType;
  payload?: RecordedAction;
}

export type RecorderCommand = 'START' | 'STOP';

// ═══════════════════════════════════════════════════════════════════════
// EVENT TYPES FOR RENDERER
// ═══════════════════════════════════════════════════════════════════════

export interface RecordingStateUpdate {
  status: RecordingStatus;
  sessionId?: string;
  actionCount?: number;
}
