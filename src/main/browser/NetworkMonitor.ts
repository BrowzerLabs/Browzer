import { EventEmitter } from 'events';
import { net } from 'electron';

export interface NetworkMonitorEvents {
  'online': () => void;
  'offline': () => void;
  'connectivity-changed': (isOnline: boolean) => void;
}

export class NetworkMonitor extends EventEmitter {
  private isOnline: boolean = true;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 5000;
  private readonly CHECK_URLS = [
    'https://www.google.com/generate_204',
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://connectivity-check.ubuntu.com/',
  ];

  public on<K extends keyof NetworkMonitorEvents>(
    event: K,
    listener: NetworkMonitorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof NetworkMonitorEvents>(
    event: K,
    ...args: Parameters<NetworkMonitorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  constructor() {
    super();
    this.isOnline = net.isOnline();
  }

  public start(): void {
    if (this.checkInterval) {
      return;   
    }

    this.checkConnectivity();

    this.checkInterval = setInterval(() => {
      this.checkConnectivity();
    }, this.CHECK_INTERVAL_MS);

    console.log('[NetworkMonitor] Started monitoring network connectivity');
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[NetworkMonitor] Stopped monitoring network connectivity');
    }
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public async checkConnectivity(): Promise<boolean> {
    const wasOnline = this.isOnline;
    const electronOnline = net.isOnline();
    
    if (!electronOnline) {
      this.updateStatus(false, wasOnline);
      return false;
    }

    const actuallyOnline = await this.verifyConnectivity();
    this.updateStatus(actuallyOnline, wasOnline);
    
    return actuallyOnline;
  }

  private async verifyConnectivity(): Promise<boolean> {
    for (const url of this.CHECK_URLS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await net.fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok || response.status === 204) {
          return true;
        }
      } catch {
        // Try next URL
        continue;
      }
    }

    return false;
  }

  private updateStatus(newStatus: boolean, wasOnline: boolean): void {
    this.isOnline = newStatus;

    if (newStatus !== wasOnline) {
      newStatus ? this.emit('online') : this.emit('offline');
    }
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

export const networkMonitor = new NetworkMonitor();
