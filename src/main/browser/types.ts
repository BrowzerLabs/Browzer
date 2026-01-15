import { WebContentsView } from 'electron';
import { TabInfo } from '@/shared/types';
import { BrowserAutomationExecutor } from '../automation';

export type ClickTrackingHandler = (event: any, method: string, params: any) => Promise<void>;

export interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  clickTrackingHandler?: ClickTrackingHandler;
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
  bypassedCertificateHosts?: Set<string>;
  automationExecutor?: BrowserAutomationExecutor;
}
