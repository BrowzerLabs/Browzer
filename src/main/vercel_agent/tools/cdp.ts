import { WebContentsView } from 'electron';

export class CDPConnection {
  private debugger: any;
  private isConnected = false;

  constructor(private view: WebContentsView) {
    this.debugger = view.webContents.debugger;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      if (this.debugger.isAttached()) {
        this.isConnected = true;
        return;
      }

      await this.debugger.attach('1.3');
      await this.enableDomains();
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect CDP: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      if (this.debugger.isAttached()) {
        await this.debugger.detach();
      }
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting CDP:', error);
    }
  }

  async sendCommand(method: string, params?: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('CDP not connected');
    }
    return await this.debugger.sendCommand(method, params);
  }

  private async enableDomains(): Promise<void> {
    await this.sendCommand('DOM.enable');
    await this.sendCommand('Page.enable');
    await this.sendCommand('Runtime.enable');
    await this.sendCommand('Network.enable');
    await this.sendCommand('Input.enable');
    await this.sendCommand('CSS.enable');
    await this.sendCommand('Overlay.enable');
  }

  getView(): WebContentsView {
    return this.view;
  }

  isReady(): boolean {
    return this.isConnected;
  }
}