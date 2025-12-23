import { WebContentsView, app } from 'electron';
import { mkdir, writeFile, stat } from 'fs/promises';
import path from 'path';

import { RecordedAction } from '@/shared/types';

/**
 * SnapshotManager - Intelligent screenshot capture for visual context
 *
 * Captures screenshots at strategic moments during recording to provide
 * visual context for LLMs without overwhelming system resources.
 *
 * Strategy:
 * - Only capture on high-value interactive actions (clicks, submits, etc.)
 * - Skip rapid successive actions (debouncing)
 * - Async capture with queue management
 * - Optimized image compression
 */
export class SnapshotManager {
  private snapshotsDir: string;
  private recordingId: string | null = null;
  private lastSnapshotTime = 0;
  private snapshotQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private snapshotCount = 0;

  // Configuration
  private readonly MIN_SNAPSHOT_INTERVAL = 500; // Minimum 500ms between snapshots
  private readonly SNAPSHOT_QUALITY = 80; // JPEG quality (0-100)
  private readonly MAX_QUEUE_SIZE = 10; // Max pending snapshots

  // Action types that warrant snapshots (high-value interactions)
  private readonly SNAPSHOT_ACTION_TYPES = new Set([
    'click',
    'submit',
    'navigate',
    'select',
    'checkbox',
    'radio',
    'toggle',
    'tab-switch',
  ]);

  constructor() {
    // Store snapshots in app's userData directory
    this.snapshotsDir = path.join(
      app.getPath('userData'),
      'recordings',
      'snapshots'
    );
  }

  /**
   * Initialize snapshot directory for a new recording session
   */
  public async initializeRecording(recordingId: string): Promise<void> {
    // Reset state for new recording
    this.recordingId = recordingId;
    this.snapshotCount = 0;
    this.lastSnapshotTime = 0;
    this.snapshotQueue = []; // Clear any pending snapshots from previous session
    this.isProcessingQueue = false;

    // Create session-specific directory
    const sessionDir = path.join(this.snapshotsDir, recordingId);
    await mkdir(sessionDir, { recursive: true });

    console.log('📸 Snapshot manager initialized for recording:', recordingId);
  }

  /**
   * Intelligently decide if we should capture a snapshot for this action
   */
  private shouldCaptureSnapshot(action: RecordedAction): boolean {
    // Only capture for specific action types
    if (!this.SNAPSHOT_ACTION_TYPES.has(action.type)) {
      return false;
    }

    // Skip if too soon after last snapshot (debouncing)
    const now = Date.now();
    if (now - this.lastSnapshotTime < this.MIN_SNAPSHOT_INTERVAL) {
      return false;
    }

    // Skip if queue is too large (system under load)
    if (this.snapshotQueue.length >= this.MAX_QUEUE_SIZE) {
      console.warn('⚠️ Snapshot queue full, skipping capture');
      return false;
    }

    // For input actions, only capture on significant changes
    if (action.type === 'input') {
      // Skip individual keystrokes, only capture on blur/enter
      return false;
    }

    return true;
  }

  /**
   * Capture snapshot for an action (async, non-blocking)
   */
  public async captureSnapshot(
    view: WebContentsView,
    action: RecordedAction
  ): Promise<string | null> {
    if (!this.recordingId) {
      console.warn('⚠️ No recording session initialized');
      return null;
    }

    if (!this.shouldCaptureSnapshot(action)) {
      return null;
    }

    // Update last snapshot time immediately to prevent rapid captures
    this.lastSnapshotTime = Date.now();

    // Add to queue for async processing
    return new Promise((resolve) => {
      this.snapshotQueue.push(async () => {
        try {
          const snapshotPath = await this.captureAndSave(view, action);
          resolve(snapshotPath);
        } catch (error) {
          console.error('Failed to capture snapshot:', error);
          resolve(null);
        }
      });

      // Start processing queue if not already running
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process snapshot queue asynchronously
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.snapshotQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.snapshotQueue.length > 0) {
      const task = this.snapshotQueue.shift();
      if (task) {
        await task();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Actually capture and save the screenshot
   */
  private async captureAndSave(
    view: WebContentsView,
    action: RecordedAction
  ): Promise<string | null> {
    try {
      // Capture screenshot from WebContentsView
      const image = await view.webContents.capturePage();

      // Convert to JPEG with compression for smaller file size
      const jpeg = image.toJPEG(this.SNAPSHOT_QUALITY);

      // Generate filename with timestamp and action type
      const filename = `${Date.now()}_${action.type}_${this.snapshotCount}.jpg`;
      const snapshotPath = path.join(
        this.snapshotsDir,
        this.recordingId || 'unknown',
        filename
      );

      // Save to disk
      await writeFile(snapshotPath, jpeg);

      this.snapshotCount++;

      // Get file size for metadata
      const stats = await stat(snapshotPath);
      action.snapshotSize = stats.size;

      console.log(
        `📸 Snapshot captured: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`
      );

      return snapshotPath;
    } catch (error) {
      console.error('Error capturing snapshot:', error);
      return null;
    }
  }

  /**
   * Get snapshot statistics for the current recording
   */
  public async getSnapshotStats(): Promise<{
    count: number;
    totalSize: number;
    directory: string;
  }> {
    if (!this.recordingId) {
      return { count: 0, totalSize: 0, directory: '' };
    }

    const sessionDir = path.join(this.snapshotsDir, this.recordingId);

    // Calculate total size of all snapshots
    let totalSize = 0;
    try {
      const fs = await import('fs/promises');
      const files = await fs.readdir(sessionDir);

      for (const file of files) {
        const filePath = path.join(sessionDir, file);
        const stats = await stat(filePath);
        totalSize += stats.size;
      }
    } catch (error) {
      console.error('Error calculating snapshot stats:', error);
    }

    return {
      count: this.snapshotCount,
      totalSize,
      directory: sessionDir,
    };
  }

  /**
   * Clean up and finalize recording
   */
  public async finalizeRecording(): Promise<void> {
    // Wait for queue to finish processing
    while (this.snapshotQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const stats = await this.getSnapshotStats();
    console.log(
      `📸 Snapshot session finalized: ${stats.count} snapshots, ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`
    );

    this.lastSnapshotTime = 0;
  }

  /**
   * Delete all snapshots for a recording session
   */
  public async deleteSnapshots(recordingId: string): Promise<void> {
    const sessionDir = path.join(this.snapshotsDir, recordingId);

    try {
      const fs = await import('fs/promises');
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log('🗑️ Snapshots deleted for recording:', recordingId);
    } catch (error) {
      console.error('Error deleting snapshots:', error);
    }
  }

  /**
   * Get the snapshots directory for a recording
   */
  public getSnapshotsDirectory(recordingId: string): string {
    return path.join(this.snapshotsDir, recordingId);
  }
}
