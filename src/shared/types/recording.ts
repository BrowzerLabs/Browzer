export interface RecordingAction {
  tabId: string;
  type: 'click' | 'input' | 'key' | 'navigation' | 'context' | 'context' | 'file';
  url: string;
  element?: {
    role: string;
    text: string;
    href?: string;
    value?: string;
    attributes?: Record<string, string>;
  }
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
