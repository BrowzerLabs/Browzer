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
export interface ElementFinderParams {
  tag: string;
  text?: string
  attributes?: Record<string, string>;  
  boundingBox?: { x: number; y: number; width: number; height: number };
  elementIndex?: number;           
}

/**
 * Parameters for navigate tool
 */
export interface NavigateParams {
  url: string;
}

/**
 * Parameters for click tool
 */
export interface ClickParams extends ElementFinderParams {
  click_position?: { x: number; y: number };
}

/**
 * Parameters for type/input tool
 */
export interface TypeParams extends ElementFinderParams {
  text: string;
  clearFirst?: boolean; // Clear existing value before typing (default true)
  pressEnter?: boolean; // Press Enter after typing (default false)
}


/**
 * Parameters for select tool (dropdown)
 */
export interface SelectParams extends ElementFinderParams {
  value?: string; // Select by value attribute
  label?: string; // Select by visible text
  index?: number; // Select by index
}

/**
 * Parameters for checkbox/radio tool
 */
export interface CheckboxParams extends ElementFinderParams {
  checked: boolean; // true to check, false to uncheck
}

/**
 * Parameters for waitForElement tool
 */
export interface WaitForElementParams {
  selector: string;
  state?: 'visible' | 'hidden' | 'attached'; // Default 'visible'
  timeout?: number; // milliseconds, default 10000
}

export interface KeyPressParams {
  key: string; // e.g., 'Enter', 'Escape', 'Tab', 'ArrowDown'
  modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[]; // Modifier keys
  // Optional: element to focus before key press
  focusElement?: ElementFinderParams;
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
  // Optional: specific form to submit
  form?: ElementFinderParams;
  // Optional: click submit button instead
  submitButton?: ElementFinderParams;
}

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Element information found during execution
 */
export interface FoundElement {
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isEnabled: boolean;
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
    | 'INVALID_PARAMS'
    | 'CLICK_FAILED'
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
  value?: any; // Return value (e.g., extracted text, attribute value)
  context?: any; // Return value (e.g., extracted text, attribute value)
  url: string;
  // Error data
  error?: AutomationError;
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
