import { ipcRenderer } from 'electron';
import { RecordingAPI } from '../types/recording.types';
import { createSimpleListener, invoke } from '@/preload/utils/ipc-helpers';
import { RecordingAction } from '@/shared/types';

export const createRecordingAPI = (): RecordingAPI => ({
  startRecording: () => invoke('start-recording'),
  stopRecording: () => invoke('stop-recording'),
  saveRecording: (name: string, description?: string) =>
    invoke('save-recording', name, description),
  discardRecording: () => invoke('discard-recording'),
  getCurrentActions: () => invoke('get-current-actions'),
  getAllRecordings: () => invoke('get-all-recordings'),
  getRecording: (id: string) => invoke('get-recording', id),
  exportRecording: (id: string) => invoke('export-recording', id),
  deleteRecording: (id: string) => invoke('delete-recording', id),
  isRecording: () => invoke('is-recording'),
  onActionRecorded: (callback: (action: RecordingAction) => void) => {
    const listener = (_: any, action: RecordingAction) => callback(action);
    ipcRenderer.on('recording:action-recorded', listener);
    return () =>
      ipcRenderer.removeListener('recording:action-recorded', listener);
  },
  onRecordingStarted: (callback) =>
    createSimpleListener('recording:started', callback),
  onRecordingStopped: (callback) =>
    createSimpleListener('recording:stopped', callback),
});
