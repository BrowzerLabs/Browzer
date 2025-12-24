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

export interface FormField {
  name: string;
  type: string;
  label?: string;
  required: boolean;
  selector: string;
}

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
    children?: number;
  }>;
  liveRegions: Array<{
    politeness: 'polite' | 'assertive' | 'off';
    selector: string;
    content: string;
  }>;
}

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

export interface JavaScriptContext {
  frameworks: Array<{
    name: string;
    version?: string;
    confidence: number;
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
    keys: string[];
  };

  sessionStorage: {
    itemCount: number;
    keys: string[];
  };
}

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

export interface BrowserContext {
  extractedAt: number;
  url: string;
  title: string;
  dom: DOMContext;
}

export interface ContextExtractionOptions {
  full?: boolean;
  scrollTo?: 'current' | 'top' | 'bottom' | number;
  elementTags?: string[];
  maxElements?: number;
}

export interface ContextExtractionResult {
  success: boolean;
  context?: BrowserContext;
  error?: string;
  duration: number;
}

export interface XMLContextOptions {
  viewport: 'current' | 'full';
  tags: string[];
  maxElements: number;
  attributes: Record<string, string>;
}

export interface XMLContextResult {
  xml?: string;
  error?: string;
}
