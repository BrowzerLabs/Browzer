import { EventEmitter } from 'events';
import { net, powerMonitor } from 'electron';

export interface NetworkMonitorEvents {
  'online': () => void;
  'offline': () => void;
}

export class NetworkMonitor extends EventEmitter {
  private isOnline: boolean = true;
  private isStarted = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastOnlineState: boolean = true;

  private readonly VERIFY_URL = 'https://www.google.com/generate_204';
  private readonly VERIFY_TIMEOUT_MS = 5000;
  private readonly POLL_INTERVAL_ONLINE = 30000;  // 30s when online (just to catch edge cases)
  private readonly POLL_INTERVAL_OFFLINE = 5000;  // 5s when offline (to detect recovery quickly)

  public on<K extends keyof NetworkMonitorEvents>(event: K, listener: NetworkMonitorEvents[K]): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof NetworkMonitorEvents>(event: K, ...args: Parameters<NetworkMonitorEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  constructor() {
    super();
    this.isOnline = net.isOnline();
    this.lastOnlineState = this.isOnline;
  }

  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    powerMonitor.on('resume', () => this.checkNow());

    this.scheduleNextPoll();

    console.log('[NetworkMonitor] Started (adaptive polling mode)');
  }

  public stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;
    this.clearPollTimer();
    powerMonitor.removeAllListeners('resume');
    console.log('[NetworkMonitor] Stopped');
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public checkNow(): void {
    this.clearPollTimer();
    this.poll();
  }

  private scheduleNextPoll(): void {
    this.clearPollTimer();
    
    const interval = this.isOnline ? this.POLL_INTERVAL_ONLINE : this.POLL_INTERVAL_OFFLINE;
    
    this.pollTimer = setTimeout(() => this.poll(), interval);
  }

  private async poll(): Promise<void> {
    if (!this.isStarted) return;

    const osOnline = net.isOnline();
    
    if (!osOnline) {
      this.setOnlineStatus(false);
      this.scheduleNextPoll();
      return;
    }

      if (!this.lastOnlineState || !this.isOnline) {
      const verified = await this.verifyConnectivity();
      this.setOnlineStatus(verified);
    }

    this.scheduleNextPoll();
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async verifyConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.VERIFY_TIMEOUT_MS);

      const response = await net.fetch(this.VERIFY_URL, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  private setOnlineStatus(online: boolean): void {
    this.lastOnlineState = this.isOnline;
    
    if (this.isOnline === online) return;

    this.isOnline = online;
    this.emit(online ? 'online' : 'offline');
    console.log(`[NetworkMonitor] Status: ${online ? 'online' : 'offline'}`);
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

export const networkMonitor = new NetworkMonitor();
