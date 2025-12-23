import { WebContentsView } from 'electron';

import { ElementTarget, RecordedAction, TabInfo } from '@/shared/types';
import { VideoRecorder } from '@/main/recording';
import { BrowserAutomationExecutor } from '@/main/automation';
import { PasswordAutomation } from '@/main/password';

/**
 * Internal tab structure with WebContentsView and associated services
 */
export interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  videoRecorder?: VideoRecorder;
  passwordAutomation?: PasswordAutomation;
  automationExecutor: BrowserAutomationExecutor;
  // Track selected credential for multi-step flows
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
  bypassedCertificateHosts?: Set<string>;
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
  'context-menu-action': (event: RecordedAction) => void;
}

export interface RecordingState {
  isRecording: boolean;
  recordingId: string | null;
  startTime: number;
  startUrl: string;
}
