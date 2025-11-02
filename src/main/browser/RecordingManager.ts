import { WebContentsView } from 'electron';
import { ActionRecorder, VideoRecorder, RecordingStore } from '@/main/recording';
import { RecordedAction, RecordingSession, RecordingTabInfo } from '@/shared/types';
import { stat } from 'fs/promises';
import { Tab, RecordingState } from './types';

/**
 * RecordingManager - Orchestrates recording sessions across tabs
 * 
 * Responsibilities:
 * - Start/stop recording sessions
 * - Manage centralized action recorder
 * - Handle multi-tab recording
 * - Coordinate video recording
 * - Save recording sessions with metadata
 */
export class RecordingManager {
  private recordingState: RecordingState = {
    isRecording: false,
    recordingId: null,
    startTime: 0,
    startUrl: ''
  };

  private centralRecorder: ActionRecorder;
  private recordingTabs: Map<string, RecordingTabInfo> = new Map();
  private lastActiveTabId: string | null = null;
  private activeVideoRecorder: VideoRecorder | null = null;

  constructor(
    private recordingStore: RecordingStore,
    private browserUIView?: WebContentsView
  ) {
    this.centralRecorder = new ActionRecorder();
  }

  /**
   * Start recording on active tab
   */
  public async startRecording(activeTab: Tab): Promise<boolean> {
    if (this.recordingState.isRecording) {
      console.error('Recording already in progress');
      return false;
    }

    if (!activeTab || !activeTab.videoRecorder) {
      console.error('Tab or recorders not found');
      return false;
    }

    try {
      // Generate unique recording ID
      this.recordingState.recordingId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize recording tabs map
      this.recordingTabs.clear();
      this.lastActiveTabId = activeTab.id;
      
      // Add initial tab to recording tabs
      this.recordingTabs.set(activeTab.id, {
        tabId: activeTab.id,
        webContentsId: activeTab.view.webContents.id,
        title: activeTab.info.title,
        url: activeTab.info.url,
        firstActiveAt: Date.now(),
        lastActiveAt: Date.now(),
        actionCount: 0
      });

      // Set up centralized recorder with current tab
      this.centralRecorder.setView(activeTab.view);
      this.centralRecorder.setActionCallback((action) => {
        // Update action count for the tab
        const tabInfo = this.recordingTabs.get(action.tabId || activeTab.id || '');
        if (tabInfo) {
          tabInfo.actionCount++;
        }
        
        if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
          this.browserUIView.webContents.send('recording:action-captured', action);
        }
      });
      
      this.centralRecorder.setMaxActionsCallback(() => {
        console.log('🛑 Max actions limit reached, triggering auto-stop');
        // Notify renderer to show save form immediately
        if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
          this.browserUIView.webContents.send('recording:max-actions-reached');
        }
      });

      // Start action recording with tab context and recordingId for snapshots
      await this.centralRecorder.startRecording(
        activeTab.id,
        activeTab.info.url,
        activeTab.info.title,
        activeTab.view.webContents.id,
        this.recordingState.recordingId
      );
      
      // Start video recording on active tab
      this.activeVideoRecorder = activeTab.videoRecorder;
      const videoStarted = await this.activeVideoRecorder.startRecording(this.recordingState.recordingId);
      
      if (!videoStarted) {
        console.warn('⚠️ Video recording failed to start, continuing with action recording only');
        this.activeVideoRecorder = null;
      }
      
      this.recordingState.isRecording = true;
      this.recordingState.startTime = Date.now();
      this.recordingState.startUrl = activeTab.info.url;
      
      console.log('🎬 Recording started (actions + video) on tab:', activeTab.id);
      
      if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
        this.browserUIView.webContents.send('recording:started');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Stop recording and return actions
   */
  public async stopRecording(tabs: Map<string, Tab>): Promise<RecordedAction[]> {
    if (!this.recordingState.isRecording) {
      console.warn('No recording in progress');
      return [];
    }

    // Stop centralized action recording
    const actions = await this.centralRecorder.stopRecording();
    
    // Stop video recording from active video recorder
    let videoPath: string | null = null;
    if (this.activeVideoRecorder && this.activeVideoRecorder.isActive()) {
      videoPath = await this.activeVideoRecorder.stopRecording();
      console.log('🎥 Video recording stopped:', videoPath || 'no video');
      this.activeVideoRecorder = null;
    } else {
      console.warn('⚠️ No active video recorder to stop');
    }
    
    // If no video path from active recorder, search all tabs
    if (!videoPath && this.recordingState.recordingId) {
      for (const tab of tabs.values()) {
        const tabVideoPath = tab.videoRecorder?.getVideoPath();
        if (tabVideoPath && tabVideoPath.includes(this.recordingState.recordingId)) {
          videoPath = tabVideoPath;
          console.log('📹 Found video path from tab recorder:', videoPath);
          break;
        }
      }
    }
    
    this.recordingState.isRecording = false;
    
    const duration = Date.now() - this.recordingState.startTime;
    console.log('⏹️ Recording stopped. Duration:', duration, 'ms, Actions:', actions.length);

    const tabSwitchCount = this.countTabSwitchActions(actions);
    
    // Notify renderer that recording stopped
    if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send('recording:stopped', {
        actions,
        duration,
        startUrl: this.recordingState.startUrl,
        videoPath,
        tabs: Array.from(this.recordingTabs.values()),
        tabSwitchCount
      });
    }
    
    return actions;
  }

  /**
   * Save recording session with metadata
   */
  public async saveRecording(
    name: string,
    description: string,
    actions: RecordedAction[],
    tabs: Map<string, Tab>
  ): Promise<string> {
    let videoPath = this.activeVideoRecorder?.getVideoPath();
    
    // Search for video path if not found
    if (!videoPath && this.recordingState.recordingId) {
      for (const tab of tabs.values()) {
        const tabVideoPath = tab.videoRecorder?.getVideoPath();
        if (tabVideoPath && tabVideoPath.includes(this.recordingState.recordingId)) {
          videoPath = tabVideoPath;
          console.log('📹 Found video path from tab recorder:', videoPath);
          break;
        }
      }
    }
    
    // Get video metadata if available
    let videoSize: number | undefined;
    let videoDuration: number | undefined;
    
    if (videoPath) {
      try {
        const stats = await stat(videoPath);
        videoSize = stats.size;
        videoDuration = Date.now() - this.recordingState.startTime;
      } catch (error) {
        console.error('Failed to get video stats:', error);
      }
    }

    // Get snapshot statistics
    const snapshotStats = await this.centralRecorder.getSnapshotStats();
    
    const tabSwitchCount = this.countTabSwitchActions(actions);
    const firstTab = this.recordingTabs.values().next().value;
    
    const session: RecordingSession = {
      id: this.recordingState.recordingId || `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      actions,
      createdAt: this.recordingState.startTime,
      duration: Date.now() - this.recordingState.startTime,
      actionCount: actions.length,
      url: this.recordingState.startUrl,

      // Multi-tab metadata
      startTabId: firstTab?.tabId,
      tabs: Array.from(this.recordingTabs.values()),
      tabSwitchCount,
      
      // Video metadata
      videoPath,
      videoSize,
      videoFormat: videoPath ? 'webm' : undefined,
      videoDuration,
      
      // Snapshot metadata
      snapshotCount: snapshotStats.count,
      snapshotsDirectory: snapshotStats.directory,
      totalSnapshotSize: snapshotStats.totalSize
    };

    this.recordingStore.saveRecording(session);
    console.log('💾 Recording saved:', session.id, session.name);
    console.log('📊 Multi-tab session:', this.recordingTabs.size, 'tabs,', tabSwitchCount, 'switches');
    if (videoPath && videoSize) {
      console.log('🎥 Video included:', videoPath, `(${(videoSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    if (snapshotStats.count > 0) {
      console.log('📸 Snapshots captured:', snapshotStats.count, `(${(snapshotStats.totalSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    
    // Notify renderer
    if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send('recording:saved', session);
    }
    
    // Reset recording state
    this.recordingState.recordingId = null;
    this.recordingTabs.clear();
    this.lastActiveTabId = null;
    
    return session.id;
  }

  /**
   * Handle tab switch during recording
   */
  public async handleTabSwitch(previousTabId: string | null, newTab: Tab): Promise<void> {
    if (!this.recordingState.isRecording) return;

    try {
      console.log(`🔄 Tab switch detected during recording: ${previousTabId} -> ${newTab.id}`);
      
      // Record tab-switch action
      const tabSwitchAction: RecordedAction = {
        type: 'tab-switch',
        timestamp: Date.now(),
        tabId: newTab.id,
        tabUrl: newTab.info.url,
        tabTitle: newTab.info.title,
        webContentsId: newTab.view.webContents.id,
        metadata: {
          fromTabId: previousTabId,
          toTabId: newTab.id,
        }
      };
      
      // Add to actions through the recorder
      this.centralRecorder.addAction(tabSwitchAction);
      
      // Notify renderer via the action callback
      const callback = this.centralRecorder['onActionCallback'];
      if (callback) {
        callback(tabSwitchAction);
      }
      
      // Update or add tab to recording tabs
      const now = Date.now();
      if (!this.recordingTabs.has(newTab.id)) {
        this.recordingTabs.set(newTab.id, {
          tabId: newTab.id,
          webContentsId: newTab.view.webContents.id,
          title: newTab.info.title,
          url: newTab.info.url,
          firstActiveAt: now,
          lastActiveAt: now,
          actionCount: 0
        });
      } else {
        const tabInfo = this.recordingTabs.get(newTab.id);
        if (tabInfo) {
          tabInfo.lastActiveAt = now;
          tabInfo.title = newTab.info.title;
          tabInfo.url = newTab.info.url;
        }
      }
      
      // Switch the centralized recorder to the new tab
      await this.centralRecorder.switchWebContents(
        newTab.view,
        newTab.id,
        newTab.info.url,
        newTab.info.title
      );
      
      this.lastActiveTabId = newTab.id;
      
      console.log('✅ Recording switched to new tab successfully');
      
    } catch (error) {
      console.error('Failed to handle recording tab switch:', error);
    }
  }

  /**
   * Check if recording is active
   */
  public isRecordingActive(): boolean {
    return this.recordingState.isRecording;
  }

  /**
   * Get recorded actions
   */
  public getRecordedActions(): RecordedAction[] {
    return this.centralRecorder.getActions();
  }

  /**
   * Get recording store
   */
  public getRecordingStore(): RecordingStore {
    return this.recordingStore;
  }

  /**
   * Delete recording
   */
  public async deleteRecording(id: string): Promise<boolean> {
    const success = await this.recordingStore.deleteRecording(id);
    
    if (success && this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send('recording:deleted', id);
    }
    
    return success;
  }

  /**
   * Count tab-switch actions
   */
  private countTabSwitchActions(actions: RecordedAction[]): number {
    return actions.filter(action => action.type === 'tab-switch').length;
  }

  /**
   * Clean up
   */
  public destroy(): void {
    this.recordingTabs.clear();
  }
}
