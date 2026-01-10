import { WebContentsView } from 'electron';

import { TabInfo } from '@/shared/types';
import { PasswordAutomation } from '@/main/password';

/**
 * Internal tab structure with WebContentsView and associated services
 */
export interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  passwordAutomation?: PasswordAutomation;
  // Track selected credential for multi-step flows
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
  bypassedCertificateHosts?: Set<string>;
}

export interface ContextMenuEvent {
  type: string;
  value: string;
  position: { x: number; y: number };
  target: {
    tagName?: string;
    attributes: Record<string, string>;
  };
  timestamp: number;
}

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
  'context-menu-action': (event: ContextMenuEvent) => void;
}
