import {
  app,
  BaseWindow,
  desktopCapturer,
  BrowserWindow,
  systemPreferences,
  shell,
  dialog,
} from 'electron';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';

export class ScreenRecordingService {
  private isRecording = false;
  private currentVideoPath: string | null = null;
  private recordingId: string | null = null;
  private offscreenWindow: BrowserWindow | null = null;
  private recordingDir: string;

  constructor(private baseWindow: BaseWindow) {
    const userDataPath = app.getPath('userData');
    this.recordingDir = path.join(userDataPath, 'recordings', 'videos');
  }

  private async ensurePermissionAndGetSource(): Promise<{
    id: string;
    name: string;
  } | null> {
    if (process.platform !== 'darwin') {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const windowId = this.baseWindow.getMediaSourceId();
      return sources.find((s) => s.id === windowId) || null;
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
      });

      const windowId = this.baseWindow.getMediaSourceId();
      const source = sources.find((s) => s.id === windowId);

      if (source) {
        console.log('[ScreenRecording] Source found:', source.name);
        return source;
      }

      console.warn('[ScreenRecording] Window source not found');
      return null;
    } catch (error) {
      console.error('[ScreenRecording] Failed to get sources:', error);

      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log('[ScreenRecording] Permission status:', status);

      if (status === 'denied') {
        const response = await dialog.showMessageBox({
          type: 'warning',
          title: 'Screen Recording Permission Denied',
          message: 'Browzer needs screen recording permission.',
          detail:
            'Please enable it in System Settings > Privacy & Security > Screen Recording, then restart the app.',
          buttons: ['Open System Settings', 'Cancel'],
        });

        if (response.response === 0) {
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
          );
        }
      } else if (status === 'not-determined') {
        await dialog.showMessageBox({
          type: 'info',
          title: 'Screen Recording Permission Required',
          message:
            'macOS will now ask for screen recording permission. Please allow it and restart the app.',
          buttons: ['OK'],
        });
      }

      return null;
    }
  }

  async startRecording(recordingId: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('[ScreenRecording] Already recording');
      return false;
    }

    try {
      this.recordingId = recordingId;
      await mkdir(this.recordingDir, { recursive: true });

      const source = await this.ensurePermissionAndGetSource();
      if (!source) {
        console.error('[ScreenRecording] Could not get window source');
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
        console.log('[ScreenRecording] Recording started:', recordingId);
        return true;
      } else {
        console.error('[ScreenRecording] Failed to initialize recording');
        this.offscreenWindow.close();
        this.offscreenWindow = null;
        return false;
      }
    } catch (error) {
      console.error('[ScreenRecording] Failed to start recording:', error);
      if (this.offscreenWindow) {
        this.offscreenWindow.close();
        this.offscreenWindow = null;
      }
      return false;
    }
  }

  async stopRecording(): Promise<string | null> {
    if (!this.isRecording || !this.offscreenWindow) {
      console.warn('[ScreenRecording] Not currently recording');
      return null;
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
        console.error('[ScreenRecording] No video data received from recorder');
        this.isRecording = false;
        this.offscreenWindow.close();
        this.offscreenWindow = null;
        return null;
      }

      if (!this.recordingId) {
        console.error('[ScreenRecording] Recording ID not set');
        this.isRecording = false;
        this.offscreenWindow.close();
        this.offscreenWindow = null;
        return null;
      }

      const videoFileName = `${this.recordingId}.webm`;
      const videoPath = path.join(this.recordingDir, videoFileName);

      const buffer = Buffer.from(videoBlob);
      await writeFile(videoPath, buffer);

      this.currentVideoPath = videoPath;
      this.isRecording = false;
      this.offscreenWindow.close();
      this.offscreenWindow = null;

      return this.currentVideoPath;
    } catch (error) {
      console.error('[ScreenRecording] Failed to stop recording:', error);
      this.isRecording = false;
      if (this.offscreenWindow) {
        this.offscreenWindow.close();
        this.offscreenWindow = null;
      }
      return null;
    }
  }

  async discardRecording(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    }

    if (this.currentVideoPath && existsSync(this.currentVideoPath)) {
      try {
        await unlink(this.currentVideoPath);
      } catch (error) {
        console.error('[ScreenRecording] Failed to delete video:', error);
      }
    }

    this.currentVideoPath = null;
    this.recordingId = null;
  }

  async deleteVideo(videoPath: string): Promise<boolean> {
    try {
      if (existsSync(videoPath)) {
        await unlink(videoPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ScreenRecording] Failed to delete video:', error);
      return false;
    }
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  getCurrentVideoPath(): string | null {
    return this.currentVideoPath;
  }

  destroy(): void {
    if (this.isRecording && this.offscreenWindow) {
      this.offscreenWindow.webContents
        .executeJavaScript('window.stopRecording()')
        .catch(console.error);
    }
    if (this.offscreenWindow && !this.offscreenWindow.isDestroyed()) {
      this.offscreenWindow.close();
      this.offscreenWindow = null;
    }
  }
}
