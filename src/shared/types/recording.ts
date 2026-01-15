export interface TargetElement {
  role: string;
  text: string;
  href?: string;
  value?: string;
  attributes?: Record<string, string>;
}

export interface RecordingAction {
  tabId: string;
  type: 'click' | 'type' | 'key' | 'navigate' | 'context' | 'tab-switch' | 'file';
  url: string;
  element? : TargetElement;
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
}
