import {
  app,
  BaseWindow,
  BrowserWindow,
  desktopCapturer,
  systemPreferences,
} from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

export class AuditScreenRecordingService {
  private isRecording = false;
  private currentAuditId: string | null = null;
  private offscreenWindow: BrowserWindow | null = null;
  private auditVideosDir: string;

  constructor(private baseWindow: BaseWindow) {
    const userDataPath = app.getPath('userData');
    this.auditVideosDir = path.join(userDataPath, 'audit-videos');
  }

  async hasPermission(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true;
    }
    return systemPreferences.getMediaAccessStatus('screen') === 'granted';
  }

  async startRecording(auditId: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('[AuditScreenRecording] Already recording');
      return false;
    }

    // Silent check - no dialogs, just skip recording if no permission
    if (!(await this.hasPermission())) {
      console.warn(
        '[AuditScreenRecording] No screen recording permission - skipping audit video'
      );
      return false;
    }

    try {
      this.currentAuditId = auditId;
      await mkdir(this.auditVideosDir, { recursive: true });

      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
      });

      const windowId = this.baseWindow.getMediaSourceId();
      const source = sources.find((s) => s.id === windowId);

      if (!source) {
        console.error('[AuditScreenRecording] Could not find window source');
        return false;
      }

      this.offscreenWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        x: -10000,
        y: -10000,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
          allowRunningInsecureContent: false,
        },
      });

      const recorderPath = path.join(__dirname, '../../recorder.html');
      const recorderURL = pathToFileURL(recorderPath).href;

      await this.offscreenWindow.loadURL(recorderURL);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const success = await this.offscreenWindow.webContents.executeJavaScript(
        `window.startRecording('${source.id}')`
      );

      if (success) {
        this.isRecording = true;
        console.log(
          '[AuditScreenRecording] Recording started for audit:',
          auditId
        );
        return true;
      } else {
        console.error('[AuditScreenRecording] Failed to initialize recording');
        this.cleanup();
        return false;
      }
    } catch (error) {
      console.error('[AuditScreenRecording] Failed to start recording:', error);
      this.cleanup();
      return false;
    }
  }

  async stopRecording(auditId: string): Promise<string | null> {
    if (!this.isRecording || !this.offscreenWindow) {
      console.warn('[AuditScreenRecording] Not currently recording');
      return null;
    }

    if (this.currentAuditId !== auditId) {
      console.warn(
        `[AuditScreenRecording] Audit ID mismatch: expected ${this.currentAuditId}, got ${auditId}`
      );
    }

    try {
      const videoBlob = await Promise.race([
        this.offscreenWindow.webContents.executeJavaScript(
          'window.stopRecording()'
        ),
        new Promise<null>((_, reject) =>
          setTimeout(
            () => reject(new Error('Video stop timeout after 10s')),
            10000
          )
        ),
      ]);

      if (!videoBlob || !Array.isArray(videoBlob) || videoBlob.length === 0) {
        console.error(
          '[AuditScreenRecording] No video data received from recorder'
        );
        this.cleanup();
        return null;
      }

      const videoFileName = `${auditId}.webm`;
      const videoPath = path.join(this.auditVideosDir, videoFileName);

      const buffer = Buffer.from(videoBlob);
      await writeFile(videoPath, buffer);

      this.cleanup();
      console.log('[AuditScreenRecording] Video saved:', videoPath);
      return videoPath;
    } catch (error) {
      console.error('[AuditScreenRecording] Failed to stop recording:', error);
      this.cleanup();
      return null;
    }
  }

  private cleanup(): void {
    this.isRecording = false;
    this.currentAuditId = null;
    if (this.offscreenWindow && !this.offscreenWindow.isDestroyed()) {
      this.offscreenWindow.close();
    }
    this.offscreenWindow = null;
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  destroy(): void {
    if (this.isRecording && this.offscreenWindow) {
      this.offscreenWindow.webContents
        .executeJavaScript('window.stopRecording()')
        .catch(console.error);
    }
    this.cleanup();
  }
}
