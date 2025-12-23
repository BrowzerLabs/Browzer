export interface ElementTarget {
  tagName: string;
  text?: string;
  value?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isDisabled?: boolean;
  attributes: Record<string, string>;
  elementIndex?: number;
}

export interface RecordedAction {
  type:
    | 'click'
    | 'input'
    | 'navigate'
    | 'keypress'
    | 'submit'
    | 'select'
    | 'checkbox'
    | 'radio'
    | 'toggle'
    | 'file-upload'
    | 'tab-switch'
    | 'context-menu';
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
}
