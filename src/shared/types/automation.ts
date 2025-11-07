/* eslint-disable @typescript-eslint/no-explicit-any */

import Anthropic from "@anthropic-ai/sdk";

/**
 * Browser Automation Types
 * 
 * Defines the structure for browser automation tools and execution results.
 * Designed for LLM-based automation with detailed error reporting and effect tracking.
 */

/**
 * Progress event types for real-time UI updates
 */
export type AutomationEventType =
  | 'automation_started'
  | 'claude_thinking'
  | 'claude_response'
  | 'plan_generated'
  | 'plan_executing'
  | 'step_start'
  | 'step_progress'
  | 'step_complete'
  | 'step_error'
  | 'error_recovery_start'
  | 'error_recovery_complete'
  | 'intermediate_plan_start'
  | 'intermediate_plan_complete'
  | 'plan_complete'
  | 'automation_complete'
  | 'automation_error';

export interface AutomationProgressEvent {
  type: AutomationEventType;
  data: any;
  timestamp: number;
}

/**
 * Detailed step execution event data
 */
export interface StepExecutionData {
  stepNumber: number;
  totalSteps: number;
  toolName: string;
  toolUseId: string;
  params?: any;
  result?: any;
  error?: any;
  duration?: number;
  status: 'pending' | 'running' | 'success' | 'error';
}

/**
 * Claude thinking/response data
 */
export interface ClaudeThinkingData {
  message: string;
  thinking?: string;
  planType?: 'intermediate' | 'final';
}

/**
 * Plan execution data
 */
export interface PlanExecutionData {
  planType: 'intermediate' | 'final';
  totalSteps: number;
}


// ============================================================================
// Tool Parameter Types
// ============================================================================

/**
 * Parameters for navigate tool
 */
export interface NavigateParams {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number; // milliseconds, default 30000
}

/**
 * Parameters for click tool
 */
export interface ClickParams {
  selector: string; // Primary CSS selector
  backupSelectors?: string[]; // Fallback selectors to try if primary fails
  text?: string; // Expected text content for verification
  boundingBox?: { x: number; y: number; width: number; height: number }; // Expected position for verification
  waitForElement?: number; // Wait time in ms before attempting click (default 1000)
  verifyVisible?: boolean; // Ensure element is visible before clicking (default true)
}

/**
 * Parameters for type/input tool
 */
export interface TypeParams {
  selector: string;
  backupSelectors?: string[];
  text: string;
  clearFirst?: boolean; // Clear existing value before typing (default true)
  pressEnter?: boolean; // Press Enter after typing (default false)
  waitForElement?: number;
}

/**
 * Parameters for select tool (dropdown)
 */
export interface SelectParams {
  selector: string;
  backupSelectors?: string[];
  value?: string; // Select by value attribute
  label?: string; // Select by visible text
  index?: number; // Select by index
  waitForElement?: number;
}

/**
 * Parameters for checkbox/radio tool
 */
export interface CheckboxParams {
  selector: string;
  backupSelectors?: string[];
  checked: boolean; // true to check, false to uncheck
  waitForElement?: number;
}

/**
 * Parameters for waitForElement tool
 */
export interface WaitForElementParams {
  selector: string;
  state?: 'visible' | 'hidden' | 'attached'; // Default 'visible'
  timeout?: number; // milliseconds, default 10000
}

/**
 * Parameters for keyPress tool
 */
export interface KeyPressParams {
  key: string; // e.g., 'Enter', 'Escape', 'Tab', 'ArrowDown'
  modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[]; // Modifier keys
  selector?: string; // Optional: focus element before key press
}

/**
 * Parameters for scroll tool
 */
export interface ScrollParams {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number; // Pixels to scroll
  toElement?: string; // Scroll to element selector
}

/**
 * Parameters for submit tool
 */
export interface SubmitParams {
  formSelector?: string; // Optional: specific form to submit
  submitButtonSelector?: string; // Optional: click submit button instead
}

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Element information found during execution
 */
export interface FoundElement {
  selector: string; // The selector that successfully found the element
  selectorType: 'primary' | 'backup'; // Which selector was used
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isEnabled: boolean;
}

/**
 * Execution effects - what happened after the action
 */
export interface ExecutionEffects {
  // Navigation
  navigationOccurred: boolean;
  newUrl?: string;
  navigationTiming?: number; // ms after action
  
  // DOM changes
  domMutations?: {
    addedNodes: number;
    removedNodes: number;
    attributeChanges: number;
  };
  
  // Modal/Dialog detection
  modalAppeared?: {
    detected: boolean;
    selector?: string;
    role?: string;
    ariaLabel?: string;
  };
  
  // Focus changes
  focusChanged?: {
    occurred: boolean;
    newFocusSelector?: string;
    newFocusTagName?: string;
  };
  
  // Form submission
  formSubmitted?: boolean;
  
  // Network activity
  networkRequests?: number; // Count of requests triggered
  
  // Summary for LLM
  summary: string; // Human-readable description of what happened
}

/**
 * Detailed error information
 */
export interface AutomationError {
  code: 
    | 'ELEMENT_NOT_FOUND'
    | 'ELEMENT_NOT_VISIBLE'
    | 'ELEMENT_NOT_ENABLED'
    | 'ELEMENT_COVERED'
    | 'TIMEOUT'
    | 'INVALID_SELECTOR'
    | 'NAVIGATION_FAILED'
    | 'CDP_ERROR'
    | 'EXECUTION_ERROR'
    | 'UNKNOWN_ERROR';
  message: string;
  details?: {
    attemptedSelectors?: string[]; // All selectors that were tried
    lastError?: string; // Last error message from CDP/execution
    elementState?: {
      found: boolean;
      visible?: boolean;
      enabled?: boolean;
      boundingBox?: { x: number; y: number; width: number; height: number };
    };
    suggestions?: string[]; // Suggestions for the model to retry
  };
}

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  executionTime: number; // milliseconds
  
  // Success data
  element?: FoundElement; // Element that was acted upon
  effects?: ExecutionEffects; // What happened after the action
  value?: any; // Return value (e.g., extracted text, attribute value)
  context?: any; // Return value (e.g., extracted text, attribute value)
  
  // Error data
  error?: AutomationError;
  
  // Metadata
  timestamp: number;
  tabId: string;
  url: string;
}

// ============================================================================
// Tool Registry Types (Anthropic Claude Format)
// ============================================================================

/**
 * Complete tool registry
 */
export interface ToolRegistry {
  tools: Anthropic.Tool[];
  version: string;
}

// ============================================================================
// Internal Execution Types
// ============================================================================

/**
 * Internal element query result
 */
export interface ElementQueryResult {
  found: boolean;
  nodeId?: number;
  selector: string;
  selectorType: 'primary' | 'backup';
  element?: {
    tagName: string;
    text?: string;
    attributes: Record<string, string>;
    boundingBox: { x: number; y: number; width: number; height: number };
    isVisible: boolean;
    isEnabled: boolean;
  };
  error?: string;
}

/**
 * Wait options for element operations
 */
export interface WaitOptions {
  timeout: number;
  interval: number; // Polling interval
  state: 'visible' | 'hidden' | 'attached';
}
