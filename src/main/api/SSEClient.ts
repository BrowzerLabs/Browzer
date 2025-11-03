import { WebContents } from 'electron';
import { EventEmitter } from 'events';
import { EventSource } from 'eventsource';

export interface SSEConfig {
  url: string;
  electronId: string;
  apiKey: string;
  getAccessToken: () => string | null;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
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
  private apiKey: string;
  private browserUIWebContents: WebContents;

  private getAccessToken: () => string | null;

  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private heartbeatTimeout: number;
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
    this.apiKey = config.apiKey;
    this.browserUIWebContents = config.browserUIWebContents;

    this.getAccessToken = config.getAccessToken || (() => null);
    
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
    this.heartbeatTimeout = config.heartbeatTimeout || 60000; // 60 seconds
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
      // Build SSE URL with authentication
      const sseUrl = `${this.url}?electron_id=${encodeURIComponent(this.electronId)}`;

      // Create EventSource with custom fetch for headers (eventsource v4.x pattern)
      const headers: Record<string, string> = {
        'X-API-Key': this.apiKey,
        'X-Electron-ID': this.electronId,
      };
      
      // Add access token if available (fetched dynamically)
      const accessToken = this.getAccessToken();
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

      // Setup event listeners
      this.setupEventListeners();

    } catch (error) {
      console.error('[SSEClient] Connection failed:', error);
      this.setState(SSEConnectionState.ERROR);
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Setup EventSource event listeners
   */
  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // Connection opened
    this.eventSource.onopen = () => {
      this.setState(SSEConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.lastHeartbeat = Date.now();
      this.emit('connected');
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
        console.log('[SSEClient] Connection closed by server');
        this.cleanup();
        this.emit('disconnected');
        
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      } else {
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
        console.log('[SSEClient] Connection established:', data.message);
        this.emit('connection_established', data);
    });

    // Heartbeat event
    this.eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
      this.lastHeartbeat = Date.now();
    });

    // Notification event
    this.eventSource.addEventListener('notification', (event: MessageEvent) => {
        console.log('[SSEClient] Notification:', event);
        this.browserUIWebContents.send('notification', event);
    });

    this.eventSource.addEventListener('subscription_update', (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        console.log('[SSEClient] Subscription update:', data);
        this.emit('subscription_update', data);
        this.browserUIWebContents.send('subscription_update', data);
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
    console.log('[SSEClient] Disconnecting...');
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
  }

  /**
   * Schedule reconnection attempt
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

    // Exponential backoff
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(`[SSEClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
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
    }, 100000); // Check every 100 seconds
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
}
