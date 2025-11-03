/**
 * Connection Manager - Orchestrates API and SSE connections
 * 
 * Responsibilities:
 * - Initialize and maintain connection to backend
 * - Monitor connection health
 * - Handle reconnection logic
 * - Provide unified interface for backend communication
 */

import { WebContents } from 'electron';
import { ApiClient, ApiConfig } from './ApiClient';
import { SSEClient, SSEConfig, SSEConnectionState } from './SSEClient';
import { initializeApi } from './api';
import { EventEmitter } from 'events';

export interface ConnectionManagerConfig {
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
  private apiKey: string;
  private apiBaseURL: string;

  private browserUIWebContents: WebContents;
  private getAccessToken: () => string | null;
  private clearSession: () => void;

  constructor(
    config: ConnectionManagerConfig,
    browserUIWebContents: WebContents
  ) {
    super();
    this.apiKey = process.env.BACKEND_API_KEY || '';
    this.apiBaseURL = process.env.BACKEND_API_URL || 'http://localhost:8080';    
    this.browserUIWebContents = browserUIWebContents;

    this.getAccessToken = config.getAccessToken;
    this.clearSession = config.clearSession;

    const apiConfig: ApiConfig = {
      baseURL: this.apiBaseURL,
      apiKey: this.apiKey,
      timeout: 30000,
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
      const response = await this.apiClient.connect();

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to establish connection');
      }

      const { sse_url } = response.data;

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
      apiKey: this.apiKey,
      getAccessToken: this.getAccessToken,
      reconnectInterval: 5000,
      maxReconnectAttempts: 3,
      heartbeatTimeout: 60000, // 60 seconds
      browserUIWebContents: this.browserUIWebContents,
    };

    this.sseClient = new SSEClient(sseConfig);

    await this.sseClient.connect();
  }

  /**
   * Disconnect from backend
   */
  async disconnect(): Promise<void> {
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
