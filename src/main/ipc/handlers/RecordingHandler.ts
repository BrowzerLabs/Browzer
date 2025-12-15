import { shell } from 'electron';
import { BaseHandler } from './base';
import { RecordedAction } from '@/shared/types';

export class RecordingHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;

    this.handle('browser:start-recording', async () => {
      return browserService.startRecording();
    });

    this.handle('browser:stop-recording', async () => {
      return browserService.stopRecording();
    });

    this.handle('browser:save-recording', async (_, name: string, description: string, actions: RecordedAction[]) => {
      return browserService.saveRecording(name, description, actions);
    });

    this.handle('browser:get-all-recordings', async () => {
      return browserService.getRecordingStore().getAllRecordings();
    });

    this.handle('browser:delete-recording', async (_, id: string) => {
      return browserService.deleteRecording(id);
    });

    this.handle('browser:is-recording', async () => {
      return browserService.isRecordingActive();
    });

    this.handle('browser:get-recorded-actions', async () => {
      return browserService.getRecordedActions();
    });

    this.handle('browser:export-recording', async (_, id: string) => {
      return await browserService.getRecordingStore().exportRecording(id);
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
