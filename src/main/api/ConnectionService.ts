import { BaseWindow, WebContentsView } from 'electron';
import { ApiClient, ApiConfig } from './ApiClient';
import { SSEClient, SSEConfig } from './SSEClient';
import { initializeApi } from './api';
import { EventEmitter } from 'events';

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export class ConnectionService extends EventEmitter {
  private apiClient: ApiClient;
  private sseClient: SSEClient | null = null;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private apiBaseURL: string;

  constructor(
    private baseWindow: BaseWindow,
    private browserView: WebContentsView
  ) {
    super();
    this.apiBaseURL = process.env.BACKEND_API_URL ?? 'http://localhost:8000/api/v1'; 

    const apiConfig: ApiConfig = {
      baseURL: this.apiBaseURL,
      timeout: 70000,
    };

    this.apiClient = new ApiClient(apiConfig);
    initializeApi(this.apiClient);
    
    this.initialize().catch(err => {
      console.error('Failed to initialize ConnectionService:', err);
    });
  }

  async initialize(): Promise<boolean> {
    if (this.status === ConnectionStatus.CONNECTING || this.status === ConnectionStatus.CONNECTED) {
      console.log('[ConnectionService] Already connected or connecting');
      return true;
    }

    this.status = ConnectionStatus.CONNECTING;

    try {
      const response = await this.apiClient.connect();

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to establish connection');
      }

      const { sse_url, message } = response.data;
      console.log(message);

      if (sse_url) {
        await this.initializeSSE(sse_url);
      }

      this.status = ConnectionStatus.CONNECTED;
      return true;

    } catch (error: any) {
      console.error('[ConnectionService] Connection failed:', error);
      this.status = ConnectionStatus.ERROR;
      return false;
    }
  }

  private async initializeSSE(url: string): Promise<void> {
    const sseConfig: SSEConfig = {
      baseWindow: this.baseWindow,
      browserView: this.browserView,
      url,
      electronId: this.apiClient.getElectronId(),
      reconnectInterval: 3000,
      heartbeatTimeout: 29000,
    };

    this.sseClient = new SSEClient(sseConfig);

    await this.sseClient.connect();
  }

  /**
   * Set refresh callback for ApiClient
   */
  public setRefreshCallback(callback: () => Promise<boolean>): void {
    this.apiClient.setRefreshCallback(callback);
  }

  async disconnect(): Promise<void> {
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    await this.apiClient.disconnect();

    this.status = ConnectionStatus.DISCONNECTED;
  }

  getApiClient(): ApiClient {
    return this.apiClient;
  }

  getSSEClient(): SSEClient | null {
    return this.sseClient;
  }

  async reconnectSSEWithAuth(): Promise<void> {
    if (this.sseClient) {
      await this.sseClient.reconnectWithAuth();
    } else {
      console.warn('[ConnectionService] No SSE client to reconnect');
    }
  }
}
