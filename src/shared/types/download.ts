export type DownloadState =
  | 'queued'
  | 'progressing'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'interrupted';

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  savePath?: string;
  mimeType?: string;
  totalBytes: number;
  receivedBytes: number;
  progress: number;
  state: DownloadState;
  startTime: number;
  endTime?: number;
  canResume: boolean;
  error?: string;
  speed?: number;
  remainingTime?: number;
}

export interface DownloadUpdatePayload {
  downloads: DownloadItem[];
  changedId?: string;
}

