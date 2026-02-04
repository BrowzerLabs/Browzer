import { invoke } from '@/preload/utils/ipc-helpers';
import type {
  NotionOAuthResponse,
  NotionConnectionState,
  NotionDisconnectResponse,
} from '@/shared/types';

export interface NotionSyncResponse {
  success: boolean;
  message: string;
  syncId?: string;
}

export interface NotionServerStatus {
  isConnected: boolean;
  syncStatus?: string;
  lastSyncAt?: string;
  totalDocuments?: number;
  syncError?: string;
}

export interface NotionAPI {
  connect: () => Promise<NotionOAuthResponse>;
  disconnect: () => Promise<NotionDisconnectResponse>;
  getConnectionState: () => Promise<NotionConnectionState>;
  startSync: (forceFullSync?: boolean) => Promise<NotionSyncResponse>;
  getServerStatus: () => Promise<NotionServerStatus>;
}

export const createNotionAPI = (): NotionAPI => ({
  connect: () => invoke<NotionOAuthResponse>('notion:connect'),
  disconnect: () => invoke<NotionDisconnectResponse>('notion:disconnect'),
  getConnectionState: () =>
    invoke<NotionConnectionState>('notion:get-connection-state'),
  startSync: (forceFullSync = false) =>
    invoke<NotionSyncResponse>('notion:start-sync', forceFullSync),
  getServerStatus: () => invoke<NotionServerStatus>('notion:get-server-status'),
});
