export interface TargetElement {
  role: string;
  name: string;
  value?: string;
  attributes?: Record<string, string | number>;
}

export interface RecordingAction {
  tabId: string;
  type:
    | 'click'
    | 'type'
    | 'key'
    | 'navigate'
    | 'context-menu'
    | 'tab-switch'
    | 'file';
  url: string;
  element?: TargetElement;
  filePaths?: string[];
  timestamp: number;
  keys?: string[];
}

export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  actions: RecordingAction[];
  createdAt: number;
  duration: number;
  startUrl?: string;
}

export interface AXNode {
  role: string;
  name: string;
  value?: string;
  url?: string;
}
