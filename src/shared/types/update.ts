export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  transferredFormatted: string;
  totalFormatted: string;
  speedFormatted: string;
}

export interface UpdateStatus {
  isDownloading: boolean;
  isUpdateReady: boolean;
  downloadedUpdateInfo: UpdateInfo | null;
  currentVersion: string;
}
