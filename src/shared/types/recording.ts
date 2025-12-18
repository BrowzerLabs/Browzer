
/**
 * ENHANCED element target information for recorded actions
 * Now includes multiple selector strategies and position info for precise matching
 */
export interface ElementTarget {
  // Element identification - PRIMARY selector
  selector: string;
  tagName: string;
  
  
  // Semantic information
  text?: string;
  value?: string;
  
  // Visual context (simplified)
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Context and state
  isDisabled?: boolean;
  
  // All element attributes (for reliable element identification)
  attributes: Record<string, string>;
  
  // NEW: Position information for precise matching
  elementIndex?: number; // Index among siblings (0-based)
  siblingCount?: number; // Total number of siblings
}

export interface RecordedAction {
  type: 'click' | 'input' | 'navigate' | 'keypress' | 'submit' | 'select' | 'checkbox' | 'radio' | 'toggle' | 'file-upload' | 'tab-switch' | 'context-menu';
  timestamp: number;
  target?: ElementTarget;
  value?: string | string[] | boolean;
  url?: string;
  position?: { x: number; y: number };
  metadata?: Record<string, any>;

  // Multi-tab recording metadata
  tabId?: string;
  tabUrl?: string;
  tabTitle?: string;

  // Visual context snapshot
  snapshotPath?: string; // Path to screenshot captured at action moment
  snapshotSize?: number; // Snapshot file size in bytes
}

/**
 * Comprehensive click effect tracking
 */
export interface ClickEffects {
  // Navigation effects
  navigation?: {
    occurred: boolean;
    url?: string;
    type?: 'full' | 'spa' | 'hash'; // Full page reload, SPA navigation, or hash change
    timing?: number; // ms after click
  };
  
  // Network activity
  network?: {
    requestCount: number;
    requests?: Array<{
      url: string;
      method: string;
      status?: number;
      type?: string; // xhr, fetch, document, etc.
      timing: number; // ms after click
    }>;
  };
  
  // DOM changes
  dom?: {
    mutationCount: number;
    addedNodes?: number;
    removedNodes?: number;
    attributeChanges?: number;
    significantChanges?: boolean; // Large structural changes
  };
  
  // Modal/Overlay/Dialog detection
  modal?: {
    appeared: boolean;
    type?: 'modal' | 'dialog' | 'dropdown' | 'popover' | 'sheet' | 'toast';
    selector?: string;
    role?: string;
    ariaLabel?: string;
    timing?: number;
  };
  
  // Form submission
  formSubmit?: {
    occurred: boolean;
    formSelector?: string;
    method?: string;
    action?: string;
    timing?: number;
  };
  
  // Element state changes
  stateChange?: {
    occurred: boolean;
    type?: 'toggle' | 'expand' | 'collapse' | 'select' | 'activate' | 'disable';
    targetChanged?: boolean; // Did the clicked element itself change?
    ariaExpanded?: boolean;
    ariaSelected?: boolean;
    ariaChecked?: boolean;
    classChanges?: string[]; // Classes added/removed
  };
  
  // Focus changes
  focus?: {
    changed: boolean;
    newFocusSelector?: string;
    newFocusTagName?: string;
  };
  
  // Scroll behavior
  scroll?: {
    occurred: boolean;
    direction?: 'vertical' | 'horizontal' | 'both';
    distance?: number;
  };
  
  // Download triggered
  download?: {
    occurred: boolean;
    filename?: string;
  };
  
  // New window/tab
  newWindow?: {
    occurred: boolean;
    url?: string;
  };
  
  // Summary
  summary?: string; // Human-readable effect description for LLM
}


/**
 * Tab metadata for multi-tab recording sessions
 */
export interface RecordingTabInfo {
  tabId: string;
  title: string;
  url: string;
  firstActiveAt: number; // When this tab first became active during recording
  lastActiveAt: number; // When this tab was last active during recording
  actionCount: number; // Number of actions recorded in this tab
}

export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  createdAt: number;
  duration: number; // in milliseconds
  actionCount: number;
  url?: string; // Starting URL (deprecated, use startTabId instead)
  
  // Multi-tab recording metadata
  startTabId?: string; // Tab where recording started
  tabs?: RecordingTabInfo[]; // All tabs that were active during recording
  tabSwitchCount?: number; // Number of tab switches during recording
  
  // Video recording metadata
  videoPath?: string; // Absolute path to the video file
  videoSize?: number; // Video file size in bytes
  videoFormat?: string; // Video format (e.g., 'webm')
  videoDuration?: number; // Actual video duration in milliseconds
  
  // Snapshot metadata
  snapshotCount?: number; // Number of snapshots captured
  snapshotsDirectory?: string; // Directory containing all snapshots for this session
  totalSnapshotSize?: number; // Total size of all snapshots in bytes
  
  // LLM-friendly workflow context (optional, added during export/analysis)
  workflowSummary?: string; // High-level description of what was accomplished
  keyMilestones?: string[]; // Important steps (e.g., "Logged in", "Filled form", "Submitted")
  finalOutcome?: string; // What was achieved (e.g., "Repository created successfully")
}