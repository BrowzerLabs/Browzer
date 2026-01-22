import { WebContentsView } from 'electron';

import { TabInfo } from '@/shared/types';
import { PasswordAutomation } from '../password';

export type ClickTrackingHandler = (
  event: any,
  method: string,
  params: any
) => Promise<void>;

export interface Tab {
  id: string;
  view: WebContentsView;
  info: TabInfo;
  clickTrackingHandler?: ClickTrackingHandler;
  passwordAutomation?: PasswordAutomation;
  selectedCredentialId?: string;
  selectedCredentialUsername?: string;
  bypassedCertificateHosts?: Set<string>;
}
