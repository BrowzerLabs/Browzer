import Store from 'electron-store';
import { RecordingSession } from '@/shared/types';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

interface StoreSchema {
  recordings: RecordingSession[];
}

/**
 * RecordingStore - Persistent storage for recorded sessions
 * Uses electron-store for reliable cross-platform storage
 */
export class RecordingStore {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'browzer-recordings',
      defaults: {
        recordings: []
      },
      // Encrypt sensitive data
      encryptionKey: 'browzer-secure-key-2024'
    });
  }

  /**
   * Save a new recording session
   */
  saveRecording(session: RecordingSession): void {
    const recordings = this.store.get('recordings', []);
    recordings.unshift(session); // Add to beginning (newest first)
    this.store.set('recordings', recordings);
    console.log('✅ Recording saved:', session.name);
  }

  /**
   * Get all recordings
   */
  getAllRecordings(): RecordingSession[] {
    return this.store.get('recordings', []);
  }

  /**
   * Get recording by ID
   */
  getRecording(id: string): RecordingSession | undefined {
    const recordings = this.store.get('recordings', []);
    return recordings.find(r => r.id === id);
  }

  /**
   * Delete recording by ID (including video file)
   */
  async deleteRecording(id: string): Promise<boolean> {
    const recordings = this.store.get('recordings', []);
    const recordingToDelete = recordings.find(r => r.id === id);
    
    if (!recordingToDelete) {
      return false;
    }
    
    // Delete video file if it exists
    if (recordingToDelete.videoPath) {
      await this.deleteVideoFile(recordingToDelete.videoPath);
    }
    
    const filtered = recordings.filter(r => r.id !== id);
    this.store.set('recordings', filtered);
    console.log('🗑️ Recording deleted:', id);
    return true;
  }

  /**
   * Update recording metadata (cannot update videoPath)
   */
  updateRecording(id: string, updates: Partial<RecordingSession>): boolean {
    const recordings = this.store.get('recordings', []);
    const index = recordings.findIndex(r => r.id === id);
    
    if (index !== -1) {
      // Prevent updating video-related fields
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { videoPath, videoSize, videoFormat, videoDuration, ...safeUpdates } = updates;
      recordings[index] = { ...recordings[index], ...safeUpdates };
      this.store.set('recordings', recordings);
      console.log('✏️ Recording updated:', id);
      return true;
    }
    
    return false;
  }

  /**
   * Clear all recordings (including video files)
   */
  async clearAll(): Promise<void> {
    const recordings = this.store.get('recordings', []);
    
    // Delete all video files
    for (const recording of recordings) {
      if (recording.videoPath) {
        await this.deleteVideoFile(recording.videoPath);
      }
    }
    
    this.store.set('recordings', []);
    console.log('🗑️ All recordings cleared');
  }

  /**
   * Get storage statistics
   */
  getStats(): { count: number; totalActions: number; totalSize: number; totalVideoSize: number } {
    const recordings = this.store.get('recordings', []);
    const totalActions = recordings.reduce((sum, r) => sum + r.actionCount, 0);
    const totalSize = JSON.stringify(recordings).length;
    const totalVideoSize = recordings.reduce((sum, r) => sum + (r.videoSize || 0), 0);
    
    return {
      count: recordings.length,
      totalActions,
      totalSize,
      totalVideoSize
    };
  }
  
  /**
   * Delete video file from disk
   */
  private async deleteVideoFile(videoPath: string): Promise<void> {
    try {
      if (existsSync(videoPath)) {
        await unlink(videoPath);
        console.log('🎥 Video file deleted:', videoPath);
      }
    } catch (error) {
      console.error('Failed to delete video file:', videoPath, error);
    }
  }
  
  /**
   * Clean up orphaned video files (videos without corresponding recordings)
   */
  async cleanupOrphanedVideos(): Promise<number> {
    // This could be implemented to scan the recordings directory
    // and remove videos that don't have corresponding recording sessions
    // For now, we'll keep it simple and rely on deleteRecording to clean up
    return 0;
  }
}
