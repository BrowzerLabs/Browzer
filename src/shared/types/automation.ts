/**
 * Progress event types for real-time UI updates
 */
export type AutomationEventType =
  | 'automation_started'
  | 'thinking'
  | 'claude_response'
  | 'step_start'
  | 'step_progress'
  | 'step_complete'
  | 'step_error'
  | 'automation_complete'
  | 'automation_error';

export interface AutomationProgressEvent {
  type: AutomationEventType;
  data: any;
  timestamp: number;
}

export interface ElementFinderParams {
  tag: string;
  text?: string
  attributes?: Record<string, string>;  
  boundingBox?: { x: number; y: number; width: number; height: number };
  elementIndex?: number;           
}

export interface NavigateParams {
  url: string;
}

export interface ClickParams extends ElementFinderParams {
  click_position?: { x: number; y: number };
}

export interface TypeParams extends ElementFinderParams {
  text: string;
  clearFirst?: boolean; // Clear existing value before typing (default true)
  pressEnter?: boolean; // Press Enter after typing (default false)
}

export interface SelectParams extends ElementFinderParams {
  value?: string; // Select by value attribute
  label?: string; // Select by visible text
  index?: number; // Select by index
}

export interface CheckboxParams extends ElementFinderParams {
  checked: boolean; // true to check, false to uncheck
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

export interface SubmitParams {
  // Optional: specific form to submit
  form?: ElementFinderParams;
  // Optional: click submit button instead
  submitButton?: ElementFinderParams;
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
    lastError?: string; // Last error message from CDP/execution
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
  tabId?: string;
  url: string;
  error?: AutomationError;
}