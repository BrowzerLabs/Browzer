import { WebContentsView } from 'electron';

export class CDPClient {
  private debugger: Electron.Debugger;
  private attached = false;

  constructor(private view: WebContentsView) {
    this.debugger = view.webContents.debugger;
  }

  async attach(): Promise<void> {
    if (!this.attached && !this.debugger.isAttached()) {
      try {
        this.debugger.attach('1.3');
        this.attached = true;
      } catch (error) {
        if (this.debugger.isAttached()) {
          this.attached = true;
        } else {
          throw error;
        }
      }
    }
  }

  async send<T = unknown>(method: string, params?: object): Promise<T> {
    await this.attach();
    try {
      const result = await this.debugger.sendCommand(method, params);
      return result as T;
    } catch (error) {
      console.error(`[CDPClient] Command failed: ${method}`, error);
      throw error;
    }
  }

  detach(): void {
    if (this.attached && this.debugger.isAttached()) this.debugger.detach();
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached || this.debugger.isAttached();
  }

  async enableDomains(): Promise<void> {
    await Promise.all([
      this.send('DOM.enable'),
      this.send('Page.enable'),
      this.send('Accessibility.enable'),
    ]);
  }

  getUrl(): string {
    return this.view.webContents.getURL();
  }

  getTitle(): string {
    return this.view.webContents.getTitle();
  }
}
