import { WebContentsView } from 'electron';
import { RecordedAction, TabInfo } from '@/shared/types';
export interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
  bypassedCertificateHosts?: Set<string>;
  clickTrackingHandler?: ClickTrackingHandler;
}

export type ClickTrackingHandler = (event: any, method: string, params: any) => Promise<void>;

export interface TabServiceEvents {
  'tab:created': (tab: Tab, previousActiveTabId: string | null) => void;
  'tab:closed': (
    closedTabId: string,
    newActiveTabId: string | null,
    wasActiveTab: boolean
  ) => void;
  'tab:switched': (previousTabId: string, newTab: Tab) => void;
  'tab:reordered': (data: { tabId: string; from: number; to: number }) => void;
  'tabs:changed': () => void;
  'context-menu-action': (event: RecordedAction) => void;
  'recording:started': () => void;
  'recording:stopped': () => void;
  'recording:action': (event: RecordingEvent) => void;
}

export interface RecordingEvent {
  tabId: string;
  type: 'click' | 'input' | 'key' | 'navigation' | 'upload';
  url: string;
  role?: string;
  text?: string;
  value?: string;
  keys?: string[];
}

export interface AXNode {
  role: string;
  name: string;
  value?: string;
}
