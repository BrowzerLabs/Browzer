import { WebContentsView } from 'electron';

import { PasswordAutomation } from '../password';

import { TabInfo } from '@/shared/types';

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
