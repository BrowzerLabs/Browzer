import { RecordingAction, RecordingSession } from '@/shared/types';

export interface RecordingAPI {
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  saveRecording: (name: string, description?: string) => Promise<string>;
  discardRecording: () => Promise<boolean>;
  getCurrentActions: () => Promise<RecordingAction[]>;
  getAllRecordings: () => Promise<RecordingSession[]>;
  getRecording: (id: string) => Promise<RecordingSession>;
  exportRecording: (
    id: string
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  deleteRecording: (id: string) => Promise<boolean>;
  isRecording: () => Promise<boolean>;
  onActionRecorded: (callback: (action: RecordingAction) => void) => () => void;
  onRecordingStarted: (callback: () => void) => () => void;
  onRecordingStopped: (callback: () => void) => () => void;
}
