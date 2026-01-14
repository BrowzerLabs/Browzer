import { ipcRenderer } from 'electron';
import { RecordingAPI } from "../types/recording.types";
import { createSimpleListener, invoke } from "@/preload/utils/ipc-helpers";
import { RecordingAction } from '@/shared/types';

export const createRecordingAPI = (): RecordingAPI => ({
  startRecording: () => invoke('browser:start-recording'),
  stopRecording: () => invoke('browser:stop-recording'),
  saveRecording: (name: string, description?: string) =>
    invoke('browser:save-recording', name, description),
  discardRecording: () => invoke('browser:discard-recording'),
  getCurrentActions: () => invoke('browser:get-current-actions'),
  getAllRecordings: () => invoke('browser:get-all-recordings'),
  getRecording: (id: string) => invoke('browser:get-recording', id),
  deleteRecording: (id: string) => invoke('browser:delete-recording', id),
  isRecording: () => invoke('browser:is-recording'),
  onActionRecorded: (callback: (action: RecordingAction) => void) => {
    const listener = (_: any, action: RecordingAction) => callback(action);
    ipcRenderer.on('recording:action-recorded', listener);
    return () => ipcRenderer.removeListener('recording:action-recorded', listener);
  },
  onRecordingStarted: (callback) =>
    createSimpleListener('recording:started', callback),
  onRecordingStopped: (callback) =>
    createSimpleListener('recording:stopped', callback)
});
