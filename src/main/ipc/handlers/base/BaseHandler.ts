import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPCContext, IIPCHandler } from './types';

export abstract class BaseHandler implements IIPCHandler {
  protected context: IPCContext;
  protected registeredChannels: string[] = [];

  constructor(context: IPCContext) {
    this.context = context;
  }

  getChannels(): string[] {
    return [...this.registeredChannels];
  }

  abstract register(): void;

  cleanup(): void {
    this.registeredChannels.forEach(channel => {
      ipcMain.removeHandler(channel);
    });
    this.registeredChannels = [];
  }

  protected handle<TReturn>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<TReturn> | TReturn
  ): void {
    ipcMain.handle(channel, handler);
    this.registeredChannels.push(channel);
  }
}
