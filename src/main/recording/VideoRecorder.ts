import { WebContentsView, desktopCapturer, BrowserWindow, app } from 'electron';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'url';

/**
 * VideoRecorder - Records screen activity of active webContents
 * 
 * Uses Electron's desktopCapturer API to capture the entire window.
 * Creates a hidden offscreen window to handle MediaRecorder API.
 * Saves recordings as WebM files (VP8/VP9 codec) for efficient storage and playback.
 */
export class VideoRecorder {
  private view: WebContentsView;
  private isRecording = false;
  private startTime = 0;
  private videoPath: string | null = null;
  private recordingId: string | null = null;
  private recordingDir: string;
  private offscreenWindow: BrowserWindow | null = null;

  constructor(view: WebContentsView) {
    this.view = view;
    // Set up recordings directory in Application Support
    const userDataPath = app.getPath('userData');
    this.recordingDir = join(userDataPath, 'Recordings');
  }

  /**
   * Start recording the webContents view
   * @param recordingId - Unique identifier for this recording session
   * @returns Promise<boolean> - Success status
   */
  public async startRecording(recordingId: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Video recording already in progress');
      return false;
    }

    try {
      this.recordingId = recordingId;
      this.startTime = Date.now();
      
      // Create recordings directory
      await mkdir(this.recordingDir, { recursive: true });
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${recordingId || timestamp}.webm`;
      this.videoPath = join(this.recordingDir, filename);

      // Get desktop sources
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 150, height: 150 }
      });

      if (sources.length === 0) {
        console.error('No desktop sources available');
        return false;
      }

      // Find the Browzer window or use first screen
      const source = sources.find(s => s.name.includes('browzer') || s.name.includes('Browzer')) 
        || sources.find(s => s.id.startsWith('screen'))
        || sources[0];

      console.log('📹 Using video source:', source.name);

      // Create hidden window for recording
      this.offscreenWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        x: -10000,
        y: -10000,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false, // CRITICAL: Allow access to mediaDevices
          allowRunningInsecureContent: false
        }
      });

      // Load the recorder HTML file from disk (file:// protocol has mediaDevices access)
      const recorderPath = join(__dirname, '../../recorder.html');
      const recorderURL = pathToFileURL(recorderPath).href;
      
      console.log('📄 Loading recorder from:', recorderURL);
      
      await this.offscreenWindow.loadURL(recorderURL);
      
      // Wait a bit for page to fully initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start recording
      const success = await this.offscreenWindow.webContents.executeJavaScript(
        `window.startRecording('${source.id}')`
      );

      if (success) {
        this.isRecording = true;
        console.log('🎥 Video recording started:', recordingId);
        return true;
      } else {
        console.error('Failed to initialize video recording');
        this.offscreenWindow.close();
        this.offscreenWindow = null;
        return false;
      }

    } catch (error) {
      console.error('Failed to start video recording:', error);
      this.isRecording = false;
      if (this.offscreenWindow) {
        this.offscreenWindow.close();
        this.offscreenWindow = null;
      }
      return false;
    }
  }

  /**
   * Stop recording and save the video file
   * @returns Promise<string | null> - Path to saved video file
   */
  public async stopRecording(): Promise<string | null> {
    if (!this.isRecording || !this.offscreenWindow) {
      console.warn('No video recording in progress');
      return null;
    }

    try {
      // Stop recording and get video data with timeout
      const videoBlob = await Promise.race([
        this.offscreenWindow.webContents.executeJavaScript('window.stopRecording()'),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Video stop timeout after 10s')), 10000)
        )
      ]);

      if (!videoBlob || !Array.isArray(videoBlob) || videoBlob.length === 0) {
        console.error('❌ No video data received from recorder');
        console.error('   This usually means no video chunks were captured');
        this.isRecording = false;
        this.offscreenWindow.close();
        this.offscreenWindow = null;
        return null;
      }

      // Save video file
      if (!this.videoPath) {
        console.error('Video path not set');
        this.isRecording = false;
        this.offscreenWindow.close();
        this.offscreenWindow = null;
        return null;
      }
      
      const { writeFile } = await import('fs/promises');
      const buffer = Buffer.from(videoBlob);
      await writeFile(this.videoPath, buffer);

      this.isRecording = false;
      
      this.offscreenWindow.close();
      this.offscreenWindow = null;

      return this.videoPath;

    } catch (error) {
      console.error('Failed to stop video recording:', error);
      this.isRecording = false;
      if (this.offscreenWindow) {
        this.offscreenWindow.close();
        this.offscreenWindow = null;
      }
      return null;
    }
  }

  /**
   * Check if currently recording
   */
  public isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get the path to the saved video file
   */
  public getVideoPath(): string | null {
    return this.videoPath;
  }

  /**
   * Get the recordings directory path
   * Useful for showing users where their recordings are stored
   */
  public getRecordingsDirectory(): string {
    return this.recordingDir;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
    if (this.offscreenWindow && !this.offscreenWindow.isDestroyed()) {
      this.offscreenWindow.close();
      this.offscreenWindow = null;
    }
  }
}
