import { ipcRenderer } from 'electron';

/**
 * Type-safe IPC invoke wrapper
 */
export const invoke = <T = any>(channel: string, ...args: any[]): Promise<T> => {
  return ipcRenderer.invoke(channel, ...args);
};

/**
 * Creates a type-safe event listener with automatic cleanup
 * @param channel - IPC channel to listen to
 * @param callback - Callback function to execute
 * @returns Cleanup function to remove the listener
 */
export const createEventListener = <T = any>(
  channel: string,
  callback: (data: T) => void
): (() => void) => {
  const subscription = (_event: Electron.IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
};

/**
 * Creates a simple event listener without data payload
 * @param channel - IPC channel to listen to
 * @param callback - Callback function to execute
 * @returns Cleanup function to remove the listener
 */
export const createSimpleListener = (
  channel: string,
  callback: () => void
): (() => void) => {
  const subscription = () => callback();
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
};
