export interface RecordedElement {
  role: string;
  text: string;
  href?: string;
  value?: string;
  attributes?: Record<string, string>;
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'input'
  | 'key'
  | 'context'
  | 'tab-switch'
  | 'file';

export interface RecordingAction {
  tabId: string;
  type: ActionType;
  url: string;
  element?: RecordedElement;
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
