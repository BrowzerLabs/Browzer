/**
 * Centralized logging system for Browzer
 * Automatically disabled in production builds
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private static instance: Logger;
  private minLevel: LogLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return isDevelopment && level >= this.minLevel;
  }

  private formatMessage(level: string, tag: string, message: any, ...args: any[]): void {
    if (!this.shouldLog(this.getLevelFromString(level))) return;

    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
    const formattedTag = tag ? `[${tag}]` : '';
    
    const logMethod = level === 'ERROR' ? console.error : 
                     level === 'WARN' ? console.warn : 
                     console.log;

    logMethod(`${timestamp} ${level} ${formattedTag}`, message, ...args);
  }

  private getLevelFromString(level: string): LogLevel {
    switch (level) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  debug(tag: string, message: any, ...args: any[]) {
    this.formatMessage('DEBUG', tag, message, ...args);
  }

  info(tag: string, message: any, ...args: any[]) {
    this.formatMessage('INFO', tag, message, ...args);
  }

  warn(tag: string, message: any, ...args: any[]) {
    this.formatMessage('WARN', tag, message, ...args);
  }

  error(tag: string, message: any, ...args: any[]) {
    this.formatMessage('ERROR', tag, message, ...args);
  }

  // Convenience methods for common patterns
  flow(tag: string, functionName: string, details?: any) {
    this.debug('FLOW', `${tag} ${functionName}:`, details);
  }

  duplicate(tag: string, message: any, ...args: any[]) {
    this.debug('DUPLICATE', `${tag}:`, message, ...args);
  }

  ipc(tag: string, message: any, ...args: any[]) {
    this.debug('IPC', `${tag}:`, message, ...args);
  }
}

// Export singleton instance
export const log = Logger.getInstance();

// Export convenience functions for easy migration
export const logDebug = (tag: string, message: any, ...args: any[]) => log.debug(tag, message, ...args);
export const logInfo = (tag: string, message: any, ...args: any[]) => log.info(tag, message, ...args);
export const logWarn = (tag: string, message: any, ...args: any[]) => log.warn(tag, message, ...args);
export const logError = (tag: string, message: any, ...args: any[]) => log.error(tag, message, ...args);

// Legacy // console.log replacement (for gradual migration)
export const debugLog = (...args: any[]) => {
  if (isDevelopment) {
    // console.log(...args);
  }
}; 