/**
 * Tool Execution Engine Types
 * 
 * MCP-compatible tool definitions and execution results.
 * Designed to work seamlessly with Model Context Protocol while
 * maintaining flexibility for direct usage.
 */

/**
 * Tool parameter schema (JSON Schema compatible)
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: any;
  items?: ToolParameter; // For array types
  properties?: Record<string, ToolParameter>; // For object types
}

/**
 * Tool definition (MCP-compatible)
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category: 'navigation' | 'interaction' | 'observation' | 'state' | 'advanced';
  parameters: Record<string, ToolParameter>;
  returns: {
    type: string;
    description: string;
  };
  examples?: Array<{
    description: string;
    parameters: Record<string, any>;
    expectedResult: string;
  }>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
    recoverable: boolean;
    suggestions?: string[];
  };
  metadata?: {
    executionTime: number;
    retries?: number;
    verificationPassed?: boolean;
  };
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  tabId?: string;
  timeout?: number;
  retries?: number;
  verify?: boolean;
  waitForStability?: boolean;
  captureScreenshot?: boolean;
  logExecution?: boolean;
}

/**
 * Element selector options
 */
export interface ElementSelector {
  strategy: 'id' | 'css' | 'xpath' | 'text' | 'aria-label' | 'data-testid' | 'role';
  value: string;
  fallback?: ElementSelector[]; // Alternative selectors to try
}

/**
 * Navigation options
 */
export interface NavigationOptions {
  waitForLoad?: boolean;
  waitForNetworkIdle?: boolean;
  timeout?: number;
  expectedUrl?: string; // For verification
}

/**
 * Interaction options
 */
export interface InteractionOptions {
  timeout?: number;
  verify?: boolean; // Verify element exists and is clickable
  waitForElement?: boolean;
  offset?: { x: number; y: number };
  retries?: number;
}

/**
 * Type options
 */
export interface TypeOptions {
  delay?: number; // Delay between keystrokes (ms)
  clear?: boolean; // Clear existing text first
  submit?: boolean; // Press Enter after typing
  verify?: boolean;
}

/**
 * Observation options
 */
export interface ObservationOptions {
  includeHidden?: boolean;
  maxDepth?: number;
  selector?: string; // Limit observation to specific element
}

/**
 * Tool error codes
 */
export enum ToolErrorCode {
  // Element errors
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  ELEMENT_NOT_VISIBLE = 'ELEMENT_NOT_VISIBLE',
  ELEMENT_NOT_CLICKABLE = 'ELEMENT_NOT_CLICKABLE',
  ELEMENT_NOT_INTERACTABLE = 'ELEMENT_NOT_INTERACTABLE',
  
  // Navigation errors
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  NAVIGATION_TIMEOUT = 'NAVIGATION_TIMEOUT',
  PAGE_LOAD_FAILED = 'PAGE_LOAD_FAILED',
  
  // Interaction errors
  CLICK_FAILED = 'CLICK_FAILED',
  TYPE_FAILED = 'TYPE_FAILED',
  SUBMIT_FAILED = 'SUBMIT_FAILED',
  
  // State errors
  INVALID_STATE = 'INVALID_STATE',
  PAGE_NOT_READY = 'PAGE_NOT_READY',
  
  // System errors
  TIMEOUT = 'TIMEOUT',
  CDP_ERROR = 'CDP_ERROR',
  DEBUGGER_NOT_ATTACHED = 'DEBUGGER_NOT_ATTACHED',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  
  // Verification errors
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  EXPECTED_STATE_NOT_REACHED = 'EXPECTED_STATE_NOT_REACHED',
  
  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Wait condition types
 */
export type WaitCondition =
  | { type: 'element'; selector: ElementSelector }
  | { type: 'url'; pattern: string | RegExp }
  | { type: 'text'; text: string; selector?: string }
  | { type: 'networkIdle'; timeout?: number }
  | { type: 'custom'; evaluator: string }; // JavaScript expression

/**
 * Action verification result
 */
export interface VerificationResult {
  passed: boolean;
  expected: any;
  actual: any;
  message: string;
  suggestions?: string[];
}

/**
 * Tool execution statistics
 */
export interface ToolExecutionStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  errorsByCode: Record<string, number>;
}

/**
 * MCP Tool format (for MCP server integration)
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP Tool result format
 */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

