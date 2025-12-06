import { app, session, shell, type WebContents, BaseWindow, WebContentsView } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'events';
import type { DownloadItem, DownloadUpdatePayload } from '@/shared/types';
import { randomUUID } from 'node:crypto';

interface ManagedDownload {
  item?: Electron.DownloadItem;
  data: DownloadItem;
}

export class DownloadService extends EventEmitter {
  private downloads = new Map<string, ManagedDownload>();
  private pendingSavePaths = new Map<string, string>();
  private pendingRetryIds = new Map<string, string>();
  private readonly handleWillDownload: (event: Electron.Event, item: Electron.DownloadItem) => void;

  constructor(private baseWindow: BaseWindow, private rendererContents: WebContents) {
    super();

    session.defaultSession.setDownloadPath(app.getPath('downloads'));

    this.handleWillDownload = this.onWillDownload.bind(this);
    session.defaultSession.on('will-download', this.handleWillDownload);
  }

  public destroy(): void {
    session.defaultSession.removeListener('will-download', this.handleWillDownload);
    this.downloads.clear();
    this.pendingSavePaths.clear();
  }

  public getDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values()).map(entry => ({ ...entry.data }));
  }

  public pauseDownload(id: string): boolean {
    const entry = this.downloads.get(id);
    if (!entry?.item || entry.item.isPaused()) return false;
    entry.item.pause();
    entry.data.state = 'paused';
    this.notifyRenderer(id);
    return true;
  }

  public resumeDownload(id: string): boolean {
    const entry = this.downloads.get(id);
    if (!entry?.item || !entry.item.canResume()) return false;
    entry.item.resume();
    entry.data.state = 'progressing';
    this.notifyRenderer(id);
    return true;
  }

  public cancelDownload(id: string): boolean {
    const entry = this.downloads.get(id);
    if (!entry?.item) return false;
    entry.item.cancel();
    entry.data.state = 'cancelled';
    entry.data.error = 'Cancelled by user';
    this.notifyRenderer(id);
    return true;
  }

  public retryDownload(id: string): boolean {
    const entry = this.downloads.get(id);
    if (!entry) return false;

    const savePath = entry.data.savePath || path.join(app.getPath('downloads'), entry.data.fileName);
    this.pendingSavePaths.set(entry.data.url, savePath);
    this.pendingRetryIds.set(entry.data.url, id);

    session.defaultSession.downloadURL(entry.data.url);
    return true;
  }

  public removeDownload(id: string): boolean {
    const removed = this.downloads.delete(id);
    if (removed) {
      this.notifyRenderer(id);
    }
    return removed;
  }

  public async openDownload(id: string): Promise<boolean> {
    const entry = this.downloads.get(id);
    if (!entry?.data.savePath) return false;

    if (!fs.existsSync(entry.data.savePath)) {
      return false;
    }

    const result = await shell.openPath(entry.data.savePath);
    return result === '';
  }

  public showInFolder(id: string): boolean {
    const entry = this.downloads.get(id);
    if (!entry?.data.savePath || !fs.existsSync(entry.data.savePath)) return false;
    shell.showItemInFolder(entry.data.savePath);
    return true;
  }

  private onWillDownload(_event: Electron.Event, item: Electron.DownloadItem): void {
    const retryId = this.pendingRetryIds.get(item.getURL());
    const id = retryId ?? this.generateId();
    const existing = this.downloads.get(id);
    const savePath = this.resolveSavePath(item);

    if (retryId) {
      this.pendingRetryIds.delete(item.getURL());
    }

    const download: DownloadItem = existing?.data ?? {
      id,
      url: item.getURL(),
      fileName: item.getFilename(),
      savePath,
      mimeType: item.getMimeType(),
      totalBytes: Math.max(item.getTotalBytes(), 0),
      receivedBytes: item.getReceivedBytes(),
      progress: this.calculateProgress(item.getReceivedBytes(), item.getTotalBytes()),
      state: 'progressing',
      startTime: Date.now(),
      canResume: item.canResume(),
    };

    download.id = id;
    download.url = item.getURL();
    download.startTime = Date.now();
    download.endTime = undefined;
    download.error = undefined;

    download.savePath = savePath;
    download.totalBytes = Math.max(item.getTotalBytes(), download.totalBytes);
    download.receivedBytes = item.getReceivedBytes();
    download.progress = this.calculateProgress(download.receivedBytes, download.totalBytes);
    download.canResume = item.canResume();
    download.state = item.isPaused() ? 'paused' : 'progressing';

    const managed: ManagedDownload = {
      item,
      data: download,
    };

    this.downloads.set(id, managed);
    this.notifyRenderer(id);

    item.on('updated', (_updateEvent, state) => {
      this.onItemUpdated(id, item, state);
    });

    item.once('done', (_doneEvent, state) => {
      this.onItemDone(id, item, state);
    });
  }

  private onItemUpdated(id: string, item: Electron.DownloadItem, state: 'interrupted' | 'progressing'): void {
    const entry = this.downloads.get(id);
    if (!entry) return;

    entry.data.totalBytes = Math.max(item.getTotalBytes(), entry.data.totalBytes);
    entry.data.receivedBytes = item.getReceivedBytes();
    entry.data.progress = this.calculateProgress(entry.data.receivedBytes, entry.data.totalBytes);
    entry.data.canResume = item.canResume();

    if (state === 'interrupted') {
      entry.data.state = 'interrupted';
      entry.data.error = 'Download interrupted';
    } else {
      entry.data.state = item.isPaused() ? 'paused' : 'progressing';
      entry.data.error = undefined;
    }

    this.notifyRenderer(id);
  }

  private onItemDone(id: string, item: Electron.DownloadItem, state: 'completed' | 'cancelled' | 'interrupted'): void {
    const entry = this.downloads.get(id);
    if (!entry) return;

    entry.data.totalBytes = Math.max(item.getTotalBytes(), entry.data.totalBytes);
    entry.data.receivedBytes = item.getReceivedBytes();
    entry.data.progress = this.calculateProgress(entry.data.receivedBytes, entry.data.totalBytes);
    entry.data.endTime = Date.now();
    entry.data.canResume = false;
    entry.item = undefined;

    switch (state) {
      case 'completed':
        entry.data.state = 'completed';
        entry.data.error = undefined;
        entry.data.progress = 1;
        break;
      case 'cancelled':
        entry.data.state = 'cancelled';
        entry.data.error = 'Cancelled';
        break;
      default:
        entry.data.state = 'failed';
        entry.data.error = 'Download failed';
        break;
    }

    this.notifyRenderer(id);
  }

  private resolveSavePath(item: Electron.DownloadItem): string {
    const pending = this.pendingSavePaths.get(item.getURL());
    const currentPath = item.getSavePath();

    if (pending) {
      item.setSavePath(pending);
      this.pendingSavePaths.delete(item.getURL());
      return pending;
    }

    if (currentPath) {
      return currentPath;
    }

    const defaultPath = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(defaultPath);
    return defaultPath;
  }

  private calculateProgress(received: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(1, received / total);
  }

  private generateId(): string {
    try {
      return randomUUID();
    } catch {
      return `dl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  private notifyRenderer(changedId?: string): void {
    const payload: DownloadUpdatePayload = {
      downloads: this.getDownloads(),
      changedId,
    };

    this.emit('downloads:updated', payload);

    if (!this.rendererContents.isDestroyed()) {
      this.rendererContents.send('downloads:updated', payload);
    }

    const children = this.baseWindow.contentView?.children ?? [];
    children.forEach((view) => {
      if (view instanceof WebContentsView && !view.webContents.isDestroyed()) {
        view.webContents.send('downloads:updated', payload);
      }
    });
  }
}

