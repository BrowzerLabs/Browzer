import { shell } from 'electron';

import { BaseHandler } from './base';

export class RecordingHandler extends BaseHandler {
  register(): void {
    const { tabService, browserService } = this.context;
    const recordingService = browserService.getRecordingService();

    this.handle('start-recording', async () => {
      return tabService.startRecording();
    });

    this.handle('stop-recording', async () => {
      return tabService.stopRecording();
    });

    this.handle(
      'save-recording',
      async (_, name: string, description?: string) => {
        return recordingService.saveRecording(name, description);
      }
    );

    this.handle('discard-recording', async () => {
      recordingService.discardRecording();
      return true;
    });

    this.handle('get-current-actions', async () => {
      return recordingService.getCurrentActions();
    });

    this.handle('get-all-recordings', async () => {
      return recordingService.getRecordingStore().getAllRecordings();
    });

    this.handle('get-recording', async (_, id: string) => {
      return recordingService.getRecordingStore().getRecording(id);
    });

    this.handle('export-recording', async (_, id: string) => {
      return recordingService.getRecordingStore().exportRecording(id);
    });

    this.handle('delete-recording', async (_, id: string) => {
      return recordingService.getRecordingStore().deleteRecording(id);
    });

    this.handle('is-recording', async () => {
      return recordingService.isRecording();
    });

    this.handle('video:open-file', async (_, videoPath: string) => {
      try {
        await shell.openPath(videoPath);
      } catch (error) {
        console.error('Failed to open video file:', error);
        throw error;
      }
    });

    this.handle('video:get-file-url', async (_, videoPath: string) => {
      return `video-file://${encodeURIComponent(videoPath)}`;
    });
  }
}
