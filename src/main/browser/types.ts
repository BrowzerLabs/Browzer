import { WebContentsView } from 'electron';
import { TabInfo } from '@/shared/types';
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
  automationExecutor?: BrowserAutomationExecutor;
  // Track selected credential for multi-step flows
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
}

/**
 * Tab event handlers
 */
export interface TabEventHandlers {
  onTabsChanged: () => void;
  onCredentialSelected: (tabId: string, credentialId: string, username: string) => void;
}

/**
 * Recording state
 */
export interface RecordingState {
  isRecording: boolean;
  recordingId: string | null;
  startTime: number;
  startUrl: string;
}
