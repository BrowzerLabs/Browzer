/**
 * Recording API Types
 */

export interface RecordedElement {
  innerText: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  altText?: string;
  value?: string;
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  type?: string;
  xpath: string;
  cssSelector: string;
  index: number;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parentText?: string;
  containerHint?: string;
}

export interface RecordedAction {
  id: string;
  timestamp: string;
  type: string;
  pageUrl: string;
  pageTitle: string;
  element?: RecordedElement;
  value?: string;
  key?: string;
  scrollX?: number;
  scrollY?: number;
  selectedText?: string;
}

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

export interface RecordingStatusResponse {
  status: RecordingStatus;
  sessionId?: string;
  actionCount: number;
  actions: RecordedAction[];
}

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

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  default_wait_time?: number;
  input_schema?: Array<{
    name: string;
    type: 'string' | 'number' | 'bool';
    required: boolean;
    default?: string | number | boolean;
  }>;
  steps: Array<{
    type: string;
    description?: string;
    url?: string;
    target_text?: string;
    value?: string;
    key?: string;
    selectedText?: string;
    scrollX?: number;
    scrollY?: number;
  }>;
  metadata?: {
    created_at: string;
    updated_at?: string;
    generation_mode: string;
  };
}

export interface RecordingStateUpdate {
  status: RecordingStatus;
  sessionId?: string;
  actionCount?: number;
}

export interface EnhanceWorkflowOptions {
  improveDescriptions?: boolean;
  detectVariables?: boolean;
}

export interface EnhanceWorkflowResult {
  success: boolean;
  workflow?: WorkflowDefinition;
  error?: string;
}

export interface RecordingAPI {
  // Recording control
  startRecording: () => Promise<{ sessionId: string }>;
  stopRecording: () => Promise<RecordingSession | null>;
  discardRecording: () => Promise<void>;
  getStatus: () => Promise<RecordingStatusResponse>;

  // Workflow generation
  generateWorkflow: (
    name: string,
    description: string
  ) => Promise<{ workflowId: string; filePath: string } | null>;

  // Workflow management
  listWorkflows: () => Promise<StoredWorkflowMetadata[]>;
  getWorkflow: (workflowId: string) => Promise<WorkflowDefinition | null>;
  deleteWorkflow: (workflowId: string) => Promise<boolean>;
  updateWorkflow: (
    workflowId: string,
    updates: { name?: string; description?: string }
  ) => Promise<boolean>;
  searchWorkflows: (query: string) => Promise<StoredWorkflowMetadata[]>;

  // Import/Export
  exportWorkflow: (workflowId: string) => Promise<string | null>;
  importWorkflow: (yamlContent: string) => Promise<string | null>;

  // AI Enhancement
  enhanceWorkflow: (
    workflowId: string,
    options?: EnhanceWorkflowOptions
  ) => Promise<EnhanceWorkflowResult>;

  // Event listeners
  onRecordingStarted: (
    callback: (data: { sessionId: string }) => void
  ) => () => void;
  onRecordingStopped: (
    callback: (data: { session: RecordingSession }) => void
  ) => () => void;
  onRecordingAction: (callback: (action: RecordedAction) => void) => () => void;
  onRecordingStateChanged: (
    callback: (state: RecordingStateUpdate) => void
  ) => () => void;
}
