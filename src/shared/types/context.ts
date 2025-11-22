/**
 * Interactive element information for automation
 */
export interface InteractiveElement {
  selector: string;
  tagName: string;
  role?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  title?: string;
  placeholder?: string;
  text?: string;
  value?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isDisabled: boolean;
  attributes: Record<string, string>;
}

/**
 * Form field information (extends InteractiveElement)
 */
export interface FormField {
    name: string;
    type: string;
    label?: string;
    required: boolean;
    selector: string;
}

/**
 * DOM structure with semantic annotations
 */
export interface DOMContext {
  forms: Array<{
    action?: string;
    method?: string;
    selector: string;
    fields: FormField[];
  }>;
  allInteractiveElements: InteractiveElement[];
  stats: {
    totalElements: number;
    interactiveElements: number;
    forms: number;
  };
}

/**
 * Accessibility tree for better element understanding
 */
export interface AccessibilityContext {
  focusedElement?: {
    role: string;
    name?: string;
    selector: string;
  };
  nodes: Array<{
    role: string;
    name?: string;
    description?: string;
    value?: string;
    selector?: string;
    children?: number; // Number of children
  }>;
  liveRegions: Array<{
    politeness: 'polite' | 'assertive' | 'off';
    selector: string;
    content: string;
  }>;
}

/**
 * Visual and layout context
 */
export interface VisualContext {
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  scroll: {
    x: number;
    y: number;
    maxX: number;
    maxY: number;
  };
  visibleElements: number;
  hasFixedHeader: boolean;
  hasFixedFooter: boolean;
  hasSidebar: boolean;
  activeModals: Array<{
    selector: string;
    role?: string;
    ariaLabel?: string;
    zIndex: number;
  }>;
}

/**
 * JavaScript execution context
 */
export interface JavaScriptContext {
  frameworks: Array<{
    name: string;
    version?: string;
    confidence: number; // 0-100
  }>;
  globalVariables: string[];
  readyState: 'loading' | 'interactive' | 'complete';
  consoleErrors: Array<{
    message: string;
    timestamp: number;
    level: 'error' | 'warning';
  }>;
  performance?: {
    loadTime: number;
    domContentLoaded: number;
    firstContentfulPaint?: number;
  };
}

/**
 * Network and resource context
 */
export interface NetworkContext {
  activeRequests: number;
  recentRequests: Array<{
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
  }>;
  cookieCount: number;
  localStorage: {
    itemCount: number;
    keys: string[]; // Key names only, not values
  };
  
  sessionStorage: {
    itemCount: number;
    keys: string[];
  };
}

/**
 * Page metadata
 */
export interface PageMetadata {
  title: string;
  description?: string;
  keywords?: string[];
  author?: string;
  language?: string;
  charset?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  favicon?: string;
}

/**
 * Complete browser context
 */
export interface BrowserContext {
  extractedAt: number;
  tabId: string;
  url: string;
  title: string;
  dom: DOMContext;
}

/**
 * Context extraction options
 */
export interface ContextExtractionOptions {
  tabId: string; // Required: Tab identifier
  full?: boolean; // Extract full page (overrides scrollTo)
  scrollTo?: 'current' | 'top' | 'bottom' | number; // Scroll position before extraction
  elementTags?: string[]; // Filter: only extract these element types (e.g., ['BUTTON', 'INPUT'])
  maxElements?: number; // Limit number of elements (default: 200)
}

/**
 * Context extraction result
 */
export interface ContextExtractionResult {
  success: boolean;
  context?: BrowserContext;
  error?: string;
  duration: number; // Extraction time in ms
}
