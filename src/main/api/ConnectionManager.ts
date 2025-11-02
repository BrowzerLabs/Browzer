/**
 * Connection Manager - Orchestrates API and SSE connections
 * 
 * Responsibilities:
 * - Initialize and maintain connection to backend
 * - Monitor connection health
 * - Handle reconnection logic
 * - Provide unified interface for backend communication
 */

import { ApiClient, ApiConfig } from './ApiClient';
import { SSEClient, SSEConfig, SSEConnectionState } from './SSEClient';
import { initializeApi } from './api';
import { EventEmitter } from 'events';

export interface ConnectionManagerConfig {
  apiBaseURL: string;
  apiKey: string;
  getAccessToken: () => string | null;
  clearSession: () => void;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export class ConnectionManager extends EventEmitter {
  private apiClient: ApiClient;
  private sseClient: SSEClient | null = null;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private getAccessToken: () => string | null;
  private clearSession: () => void;

  constructor(config: ConnectionManagerConfig) {
    super();
    
    this.getAccessToken = config.getAccessToken;
    this.clearSession = config.clearSession;
    
    const apiConfig: ApiConfig = {
      baseURL: config.apiBaseURL,
      apiKey: config.apiKey,
      timeout: 30000,
      retryAttempts: 3,
      getAccessToken: this.getAccessToken,
      clearSession: this.clearSession,
    };

    this.apiClient = new ApiClient(apiConfig);
    
    // Initialize global api instance
    initializeApi(this.apiClient);
  }

  /**
   * Initialize connection to backend
   */
  async initialize(): Promise<boolean> {
    if (this.status === ConnectionStatus.CONNECTING || this.status === ConnectionStatus.CONNECTED) {
      console.log('[ConnectionManager] Already connected or connecting');
      return true;
    }

    this.status = ConnectionStatus.CONNECTING;
    this.emit('status', this.status);

    try {
      // Step 1: Establish API connection
      console.log('[ConnectionManager] Establishing API connection...');
      const response = await this.apiClient.connect();

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to establish connection');
      }

      const { sse_url } = response.data;
      console.log('[ConnectionManager] Electron app verified with backend');

      // Step 2: Initialize SSE connection
      if (sse_url) {
        await this.initializeSSE(sse_url);
      }

      this.status = ConnectionStatus.CONNECTED;
      this.emit('status', this.status);
      this.emit('connected');

      return true;

    } catch (error: any) {
      console.error('[ConnectionManager] Connection failed:', error);
      this.status = ConnectionStatus.ERROR;
      this.emit('status', this.status);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Initialize SSE connection
   */
  private async initializeSSE(url: string): Promise<void> {
    const sseConfig: SSEConfig = {
      url,
      electronId: this.apiClient.getElectronId(),
      apiKey: this.apiClient['apiKey'], // Access private field
      getAccessToken: this.getAccessToken,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatTimeout: 60000,
    };

    this.sseClient = new SSEClient(sseConfig);

    // Forward SSE events
    this.sseClient.on('connected', () => {
      console.log('[ConnectionManager] SSE connected');
      this.emit('sse:connected');
    });

    this.sseClient.on('disconnected', () => {
      console.log('[ConnectionManager] SSE disconnected');
      this.emit('sse:disconnected');
    });

    this.sseClient.on('error', (error: any) => {
      console.error('[ConnectionManager] SSE error:', error);
      this.emit('sse:error', error);
    });

    this.sseClient.on('state_change', (state: SSEConnectionState) => {
      console.log('[ConnectionManager] SSE state changed:', state);
      this.emit('sse:state_change', state);
    });

    // Forward all SSE message events
    this.sseClient.on('message', (message: any) => {
      this.emit('sse:message', message);
    });

    this.sseClient.on('automation_progress', (data: any) => {
      this.emit('automation_progress', data);
    });

    this.sseClient.on('notification', (data: any) => {
      this.emit('notification', data);
    });

    this.sseClient.on('command', (data: any) => {
      this.emit('command', data);
    });

    this.sseClient.on('sync', (data: any) => {
      this.emit('sync', data);
    });

    // Connect
    await this.sseClient.connect();
  }

  /**
   * Disconnect from backend
   */
  async disconnect(): Promise<void> {
    console.log('[ConnectionManager] Disconnecting...');

    // Disconnect SSE
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    // Disconnect API
    await this.apiClient.disconnect();

    this.status = ConnectionStatus.DISCONNECTED;
    this.emit('status', this.status);
    this.emit('disconnected');
  }


  /**
   * Get API client
   */
  getApiClient(): ApiClient {
    return this.apiClient;
  }

  /**
   * Get SSE client
   */
  getSSEClient(): SSEClient | null {
    return this.sseClient;
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Check if SSE is connected
   */
  isSSEConnected(): boolean {
    return this.sseClient?.isConnected() || false;
  }

  /**
   * Get SSE connection state
   */
  getSSEState(): SSEConnectionState | null {
    return this.sseClient?.getState() || null;
  }
}
