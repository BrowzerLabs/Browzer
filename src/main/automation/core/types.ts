/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Internal types for automation core modules
 * These are implementation-specific types not exposed to the public API
 */

/**
 * Context shared across all handlers
 */
export interface HandlerContext {
  view: Electron.WebContentsView;
  debugger: Electron.Debugger;
  tabId: string;
}

/**
 * Element query result with detailed information
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
 * Element finding strategy result
 */
export interface FindStrategyResult {
  found: boolean;
  element?: any;
  computedSelector?: string;
}

/**
 * Click execution result
 */
export interface ClickExecutionResult {
  success: boolean;
  method?: string;
  error?: string;
  lastError?: string;
  attemptedMethods?: string[];
}

/**
 * Element clickability check result
 */
export interface ClickabilityResult {
  success: boolean;
  covered?: boolean;
  error?: string;
  state?: any;
  suggestions?: string[];
}

/**
 * Advanced element find result with scoring
 */
export interface AdvancedFindResult {
  success: boolean;
  element?: any;
  error?: string;
  totalCandidates?: number;
}

/**
 * Input preparation result
 */
export interface InputPrepResult {
  success: boolean;
  error?: string;
  details?: string;
}

/**
 * Typing execution result
 */
export interface TypingResult {
  success: boolean;
  error?: string;
  details?: string;
}
