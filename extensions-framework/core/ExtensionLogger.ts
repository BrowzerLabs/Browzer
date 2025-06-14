import { ExtensionLogger as IExtensionLogger } from './types';

export class ExtensionLogger implements IExtensionLogger {
  constructor(private extensionId: string) {}

  debug(message: string, data?: any): void {
    console.debug(`[${this.extensionId}] ${message}`, data);
  }

  info(message: string, data?: any): void {
    console.info(`[${this.extensionId}] ${message}`, data);
  }

  warn(message: string, data?: any): void {
    console.warn(`[${this.extensionId}] ${message}`, data);
  }

  error(message: string, error?: Error): void {
    console.error(`[${this.extensionId}] ${message}`, error);
  }

  trace(message: string, data?: any): void {
    console.trace(`[${this.extensionId}] ${message}`, data);
  }
} 