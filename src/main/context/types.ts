/**
 * Browser Context Types
 * 
 * Type definitions for browser state and context extraction.
 * These types are designed to be LLM-friendly and token-efficient.
 */

/**
 * Pruned DOM element - only significant/interactive elements
 */
export interface PrunedElement {
  tagName: string;
  selector: string; // Best selector for this element
  attributes: {
    id?: string;
    className?: string;
    name?: string;
    type?: string;
    placeholder?: string;
    value?: string;
    href?: string;
    
    // Accessibility attributes
    role?: string;
    ariaLabel?: string;
    ariaDescribedBy?: string;
    
    // Test attributes
    dataTestId?: string;
    dataCy?: string;
  };
  
  // Content
  text?: string; // Inner text (truncated if long)
  
  // Visual properties
  isVisible: boolean;
  isInteractive: boolean;
  
  // Position (optional, for click actions)
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Children count (not full children, just count)
  childrenCount?: number;
}

/**
 * Accessibility tree node - semantic representation
 */
export interface A11yNode {
  role: string;
  name?: string; // Accessible name
  description?: string;
  value?: string;
  focused?: boolean;
  disabled?: boolean;
  children?: A11yNode[];
}

/**
 * Console log entry
 */
export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
  source?: string;
  stackTrace?: string;
}

/**
 * Network request entry
 */
export interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  type: string; // XHR, Fetch, Document, etc.
  timestamp: number;
  duration?: number;
  failed?: boolean;
  errorText?: string;
}

/**
 * Page metadata
 */
export interface PageMetadata {
  url: string;
  title: string;
  readyState: string;
  contentType?: string;
  encoding?: string;
  scrollPosition: {
    x: number;
    y: number;
  };
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Visual context (screenshot + optional description)
 */
export interface VisualContext {
  screenshotPath?: string; // Path to saved screenshot
  screenshotBase64?: string; // Base64 for immediate use (optional)
  description?: string; // AI-generated text description
  timestamp: number;
}

/**
 * Complete browser context snapshot
 * This is what gets sent to the LLM
 */
export interface BrowserContext {
  // Basic page info
  metadata: PageMetadata;
  
  // DOM representation (pruned)
  interactiveElements: PrunedElement[];
  elementCount: {
    total: number;
    interactive: number;
    visible: number;
  };
  
  // Accessibility tree (optional, lighter alternative to DOM)
  accessibilityTree?: A11yNode;
  
  // Recent activity
  recentConsoleLogs?: ConsoleEntry[];
  recentNetworkActivity?: NetworkEntry[];
  
  // Visual context
  visual?: VisualContext;
  
  // Timestamp
  capturedAt: number;
  
  // Summary (optional, AI-generated)
  summary?: string;
}

/**
 * Context extraction options
 */
export interface ContextExtractionOptions {
  // What to include
  includePrunedDOM?: boolean;
  includeAccessibilityTree?: boolean;
  includeConsoleLogs?: boolean;
  includeNetworkActivity?: boolean;
  includeScreenshot?: boolean;
  includeVisualDescription?: boolean;
  
  // Limits
  maxElements?: number; // Max pruned elements to return
  maxConsoleEntries?: number;
  maxNetworkEntries?: number;
  maxTextLength?: number; // Max length for text content
  
  // Filters
  consoleLogLevel?: 'log' | 'info' | 'warn' | 'error' | 'debug';
  networkTypeFilter?: string[]; // ['XHR', 'Fetch'] etc.
  
  // Time range
  activitySince?: number; // Timestamp - only include logs/network after this
}

/**
 * DOM pruning strategy configuration
 */
export interface PruningStrategy {
  // Which elements to always include
  alwaysIncludeTags: string[]; // e.g., ['button', 'a', 'input', 'select']
  alwaysIncludeRoles: string[]; // e.g., ['button', 'link', 'textbox']
  
  // Which elements to exclude
  excludeTags: string[]; // e.g., ['script', 'style', 'noscript']
  excludeHidden: boolean; // Skip display:none, visibility:hidden
  
  // Content limits
  maxTextLength: number;
  maxChildrenDepth: number;
  
  // Scoring
  minInteractivityScore: number; // 0-100, only include elements above this
}

