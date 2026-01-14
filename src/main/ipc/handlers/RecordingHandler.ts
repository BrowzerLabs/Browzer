import { shell } from 'electron';

import { BaseHandler } from './base';


export class RecordingHandler extends BaseHandler {
  register(): void {
    const { tabService, browserService } = this.context;
    const recordingService = browserService.getRecordingService();

    this.handle('browser:start-recording', async () => {
      return tabService.startRecording();
    });

    this.handle('browser:stop-recording', async () => {
      return tabService.stopRecording();
    });
    
    this.handle('browser:save-recording', async (_, name: string, description?: string) => {
      return recordingService.saveRecording(name, description);
    });
    
    this.handle('browser:discard-recording', async () => {
      recordingService.discardRecording();
      return true;
    });
    
    this.handle('browser:get-current-actions', async () => {
      return recordingService.getCurrentActions();
    });
    
    this.handle('browser:get-all-recordings', async () => {
      return recordingService.getRecordingStore().getAllRecordings();
    });
    
    this.handle('browser:get-recording', async (_, id: string) => {
      return recordingService.getRecordingStore().getRecording(id);
    });

    this.handle('browser:delete-recording', async (_, id: string) => {
      return recordingService.getRecordingStore().deleteRecording(id);
    });

    this.handle('browser:is-recording', async () => {
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
