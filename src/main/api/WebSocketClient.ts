/**
 * WebSocket Client for real-time communication with FastAPI backend
 * 
 * Features:
 * - Automatic reconnection
 * - Heartbeat/ping-pong
 * - Event-based messaging
 * - Channel subscriptions
 */

import { EventEmitter } from 'events';

export interface WebSocketConfig {
  url: string;
  token: string;
  electronId: string;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private electronId: string;
  private reconnectInterval: number;
  private heartbeatInterval: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(config: WebSocketConfig) {
    super();
    this.url = config.url;
    this.token = config.token;
    this.electronId = config.electronId;
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.heartbeatInterval = config.heartbeatInterval || 30000;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.isConnecting = true;
    const wsUrl = `${this.url}?token=${this.token}&electron_id=${this.electronId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocketClient] Connected');
        this.isConnecting = false;
        this.emit('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocketClient] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocketClient] Error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        console.log('[WebSocketClient] Disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.emit('disconnected');

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

    } catch (error) {
      console.error('[WebSocketClient] Connection failed:', error);
      this.isConnecting = false;
      this.emit('error', error);
      
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a message to the server
   */
  send(message: any): void {
    if (!this.isConnected()) {
      console.warn('[WebSocketClient] Not connected, cannot send message');
      return;
    }

    try {
      this.ws!.send(JSON.stringify(message));
    } catch (error) {
      console.error('[WebSocketClient] Failed to send message:', error);
    }
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string): void {
    this.send({
      type: 'subscribe',
      channel,
    });
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    this.send({
      type: 'unsubscribe',
      channel,
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any): void {
    const { type, ...data } = message;

    switch (type) {
      case 'connection_established':
        console.log('[WebSocketClient] Connection established:', data.message);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'subscribed':
        console.log('[WebSocketClient] Subscribed to channel:', data.channel);
        this.emit('subscribed', data.channel);
        break;

      case 'unsubscribed':
        console.log('[WebSocketClient] Unsubscribed from channel:', data.channel);
        this.emit('unsubscribed', data.channel);
        break;

      case 'echo':
        this.emit('echo', data.data);
        break;

      default:
        // Emit custom event for this message type
        this.emit(type, data);
        break;
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'ping',
          timestamp: Date.now(),
        });
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    console.log(`[WebSocketClient] Reconnecting in ${this.reconnectInterval}ms...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }
}
