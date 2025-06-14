import { EventEmitter } from 'events';
import { ExtensionMessage, ExtensionMessaging, MessageHandler } from '../core/types';

export class CommunicationBus extends EventEmitter {
  private extensionMessaging = new Map<string, ExtensionMessagingImpl>();

  async initialize(): Promise<void> {
    // TODO: Initialize communication subsystem
  }

  createExtensionMessaging(extensionId: string): ExtensionMessaging {
    const messaging = new ExtensionMessagingImpl(extensionId, this);
    this.extensionMessaging.set(extensionId, messaging);
    return messaging;
  }

  async broadcast(message: ExtensionMessage): Promise<void> {
    // TODO: Broadcast message to all extensions
    this.emit('broadcast', message);
  }

  async sendMessage(message: ExtensionMessage): Promise<any> {
    // TODO: Route message to specific extension
    this.emit('message', message);
  }
}

class ExtensionMessagingImpl implements ExtensionMessaging {
  private listeners: MessageHandler[] = [];

  constructor(
    private extensionId: string,
    private bus: CommunicationBus
  ) {}

  async send(extensionId: string, message: ExtensionMessage): Promise<any> {
    message.from = this.extensionId;
    message.to = extensionId;
    return this.bus.sendMessage(message);
  }

  async broadcast(message: ExtensionMessage): Promise<void> {
    message.from = this.extensionId;
    return this.bus.broadcast(message);
  }

  listen(callback: MessageHandler): void {
    this.listeners.push(callback);
  }

  unlisten(callback: MessageHandler): void {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }
} 