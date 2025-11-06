import { WebContents } from 'electron';
import { EventEmitter } from 'events';
import { EventSource } from 'eventsource';
import { tokenManager } from '@/main/auth/TokenManager';

export interface SSEConfig {
  url: string;
  electronId: string;
  reconnectInterval?: number;
  heartbeatTimeout?: number;
  browserUIWebContents: WebContents;
}

export enum SSEConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export class SSEClient extends EventEmitter {
  private eventSource: EventSource | null = null;
  private url: string;
  private electronId: string;
  private browserUIWebContents: WebContents;

  private reconnectInterval: number;
  private heartbeatTimeout: number;
  private maxReconnectAttempts: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private state: SSEConnectionState = SSEConnectionState.DISCONNECTED;
  private shouldReconnect = true;
  private lastHeartbeat: number = Date.now();

  constructor(config: SSEConfig) {
    super();
    this.url = config.url;
    this.electronId = config.electronId;
    this.browserUIWebContents = config.browserUIWebContents;
    
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.heartbeatTimeout = config.heartbeatTimeout || 60000; // 60 seconds
    this.maxReconnectAttempts = Number(process.env.MAX_SSE_RECONNECT_ATTEMPTS ?? 15) 
  }

  /**
   * Connect to SSE endpoint
   */
  async connect(): Promise<void> {
    if (this.state === SSEConnectionState.CONNECTING || this.state === SSEConnectionState.CONNECTED) {
      console.log('[SSEClient] Already connected or connecting');
      return;
    }

    this.setState(SSEConnectionState.CONNECTING);
    this.shouldReconnect = true;

    try {
      const sseUrl = `${this.url}?electron_id=${encodeURIComponent(this.electronId)}`;

      const headers: Record<string, string> = {
        'X-Electron-ID': this.electronId,
      };
      
      const accessToken = tokenManager.getAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      this.eventSource = new EventSource(sseUrl, {
        fetch: (input, init) => {
          return fetch(input, {
            ...init,
            headers: {
              ...init?.headers,
              ...headers,
            }
          });
        }
      });

      this.setupEventListeners();

    } catch (error) {
      console.error('[SSEClient] Connection failed:', error);
      this.setState(SSEConnectionState.ERROR);
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  private setupEventListeners(): void {
    if (!this.eventSource) return;

    this.eventSource.onopen = () => {
      this.setState(SSEConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.lastHeartbeat = Date.now();
      console.log('✅ [SSEClient] Connected successfully');
      this.startHeartbeatMonitor();
    };

    // Generic message handler
    this.eventSource.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Generic message handler: ", data);
        this.handleMessage(data);
      } catch (error) {
        console.error('[SSEClient] Failed to parse message:', error);
      }
    };

    this.eventSource.onerror = (error: any) => {
      console.error('[SSEClient] SSE error:', error);
      
      // EventSource automatically tries to reconnect, but we want more control
      // readyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
      if (this.eventSource?.readyState === 2) {
        console.log('[SSEClient] Connection closed, will attempt reconnection');
        this.cleanup();
        this.emit('disconnected');
        
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      } else if (this.eventSource?.readyState === 0) {
        // Still connecting, wait a bit
        console.log('[SSEClient] Connection in progress...');
      } else {
        // Emit error but don't stop reconnection
        this.emit('error', error);
      }
    };

    this.setupCustomEventListeners();
  }

  /**
   * Setup listeners for custom event types
   */
  private setupCustomEventListeners(): void {
    // Connection established event
    this.eventSource.addEventListener('connection_established', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        this.emit('connection_established', data);
    });

    // Heartbeat event
    this.eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
      this.lastHeartbeat = Date.now();
    });

    // Notification event
    this.eventSource.addEventListener('notification', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      this.browserUIWebContents.send('notification', data);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any): void {
    const { type, ...data } = message;

    if (type) {
      this.emit(type, data);
    }

    this.emit('message', message);
    this.browserUIWebContents.send('sse:message', message);
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    console.log('[SSEClient] Manual disconnect requested');
    this.shouldReconnect = false;
    this.cleanup();
    this.setState(SSEConnectionState.DISCONNECTED);
    this.emit('disconnected');
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopHeartbeatMonitor();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setState(SSEConnectionState.DISCONNECTED);
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   * Will keep trying until connection succeeds
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSEClient] Max reconnection attempts reached');
      this.setState(SSEConnectionState.ERROR);
      this.emit('max_reconnect_attempts_reached');
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts++;
    this.setState(SSEConnectionState.RECONNECTING);

    // Exponential backoff with max delay cap
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, Math.min(this.reconnectAttempts - 1, 6)),
      60000
    );

    console.log(`[SSEClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(err => {
        console.error('[SSEClient] Reconnection attempt failed:', err);
        // Will be handled by onerror and schedule another attempt
      });
    }, delay);
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;

      if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
        console.warn('[SSEClient] Heartbeat timeout, reconnecting...');
        this.cleanup();
        this.emit('heartbeat_timeout');
        this.scheduleReconnect();
      }
    }, 18000); // Check every 18 seconds
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Set connection state
   */
  private setState(state: SSEConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state_change', state);
    }
  }

  /**
   * Get current connection state
   */
  getState(): SSEConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === SSEConnectionState.CONNECTED;
  }

  /**
   * Get reconnection attempts
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Reset reconnection attempts (useful after successful reconnection)
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  async reconnectWithAuth(): Promise<void> {
    console.log('[SSEClient] Reconnecting with updated authentication...');
    this.cleanup();
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    await this.connect();
  }
}
