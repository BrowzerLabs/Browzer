import { WebContentsView, dialog } from 'electron';
import { VideoRecorder, RecordingStore } from '@/main/recording';
import { RecordedAction, RecordingSession, RecordingTabInfo } from '@/shared/types';
import { stat } from 'fs/promises';
import { Tab, RecordingState } from './types';
import { ActionRecorder } from '@/main/recording/ActionRecorder';
import { EventEmitter } from 'events';

export class RecordingService extends EventEmitter {
  private recordingState: RecordingState = {
    isRecording: false,
    recordingId: null,
    startTime: 0,
    startUrl: ''
  };

  private centralRecorder: ActionRecorder;
  private recordingTabs: Map<string, RecordingTabInfo> = new Map();
  private activeVideoRecorder: VideoRecorder | null = null;

  constructor(
    private recordingStore: RecordingStore,
    private browserUIView?: WebContentsView
  ) {
    super();
    this.centralRecorder = new ActionRecorder();
  }

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
      this.recordingState.recordingId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.recordingTabs.clear();
      
      this.recordingTabs.set(activeTab.id, {
        tabId: activeTab.id,
        title: activeTab.info.title,
        url: activeTab.info.url,
        firstActiveAt: Date.now(),
        lastActiveAt: Date.now(),
        actionCount: 0
      });

      this.centralRecorder.setView(activeTab.view);
      this.setupRecorderEventListeners(activeTab.id); 

      await this.centralRecorder.startRecording(
        activeTab.id,
        activeTab.info.url,
        activeTab.info.title,
        this.recordingState.recordingId
      );
      
      this.activeVideoRecorder = activeTab.videoRecorder;
      const videoStarted = await this.activeVideoRecorder.startRecording(this.recordingState.recordingId);
      
      if (!videoStarted) {
        dialog.showMessageBox({
          type: 'warning',
          title: 'Video Recording Failed',
          message: 'Video recording failed to start. Please ensure to provide Screen Recording permissions in System Preferences > Security & Privacy > Privacy > Screen Recording for Browzer.',
          buttons: ['OK']
        }).then(() => {
          this.activeVideoRecorder = null;
        });
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

  public async stopRecording(tabs: Map<string, Tab>): Promise<RecordedAction[]> {
    if (!this.recordingState.isRecording) {
      console.warn('No recording in progress');
      return [];
    }

    const actions = await this.centralRecorder.stopRecording();

    let videoPath: string | null = null;
    if (this.activeVideoRecorder && this.activeVideoRecorder.isActive()) {
      videoPath = await this.activeVideoRecorder.stopRecording();
      console.log('🎥 Video recording stopped:', videoPath || 'no video');
      this.activeVideoRecorder = null;
    } else {
      console.warn('⚠️ No active video recorder to stop');
    }
    
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

  public async saveRecording(
    name: string,
    description: string,
    actions: RecordedAction[],
    tabs: Map<string, Tab>
  ): Promise<string> {
    let videoPath = this.activeVideoRecorder?.getVideoPath();
    
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

      startTabId: firstTab?.tabId,
      tabs: Array.from(this.recordingTabs.values()),
      tabSwitchCount,
      
      videoPath,
      videoSize,
      videoFormat: videoPath ? 'webm' : undefined,
      videoDuration,
      
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
    
    if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send('recording:saved', session);
    }
    
    this.recordingState.recordingId = null;
    this.recordingTabs.clear();
    
    return session.id;
  }

  public async handleTabSwitch(previousTabId: string | null, newTab: Tab): Promise<void> {
    if (!this.recordingState.isRecording) return;

    try {
      console.log(`🔄 Tab switch detected during recording: ${previousTabId} -> ${newTab.id}`);
      
      const tabSwitchAction: RecordedAction = {
        type: 'tab-switch',
        timestamp: Date.now(),
        tabId: newTab.id,
        tabUrl: newTab.info.url,
        tabTitle: newTab.info.title,
        metadata: {
          previousTabId: previousTabId,
        }
      };
      
      this.centralRecorder.addAction(tabSwitchAction);
      this.handleActionCaptured(tabSwitchAction);
      
      const now = Date.now();
      if (!this.recordingTabs.has(newTab.id)) {
        this.recordingTabs.set(newTab.id, {
          tabId: newTab.id,
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
      
      await this.centralRecorder.switchWebContents(
        newTab.view,
        newTab.id,
        newTab.info.url,
        newTab.info.title
      );
    } catch (error) {
      console.error('Failed to handle recording tab switch:', error);
    }
  }

  public isRecordingActive(): boolean {
    return this.recordingState.isRecording;
  }

  public getRecordedActions(): RecordedAction[] {
    return this.centralRecorder.getActions();
  }

  public getRecordingStore(): RecordingStore {
    return this.recordingStore;
  }

  public async deleteRecording(id: string): Promise<boolean> {
    const success = await this.recordingStore.deleteRecording(id);
    
    if (success && this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
      this.browserUIView.webContents.send('recording:deleted', id);
    }
    return success;
  }

  private countTabSwitchActions(actions: RecordedAction[]): number {
    return actions.filter(action => action.type === 'tab-switch').length;
  }

  public handleContextMenuAction(
   action: RecordedAction
  ): void {
    if (!this.recordingState.isRecording) return;

    this.centralRecorder.addAction(action);
    this.handleActionCaptured(action);
  }

  private setupRecorderEventListeners(defaultTabId: string): void {
    this.centralRecorder.on('action', (action: RecordedAction) => {
      this.handleActionCaptured(action, defaultTabId);
    });
    this.centralRecorder.on('maxActionsReached', () => {
      this.handleMaxActionsReached();
    });
  }

  private handleActionCaptured(action: RecordedAction, defaultTabId?: string): void {
    const tabInfo = this.recordingTabs.get(action.tabId || defaultTabId || '');
    if (tabInfo) {
      tabInfo.actionCount++;
    }
    this.browserUIView?.webContents.send('recording:action-captured', action);
  }
  private handleMaxActionsReached(): void {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Recording Limit Reached',
      message: 'Maximum actions limit reached. Recording will stop automatically.',
      buttons: ['OK']
    }).then(() => {
     this.browserUIView?.webContents.send('recording:max-actions-reached');
    });
  }

  public destroy(): void {
    this.centralRecorder.removeAllListeners();
    this.recordingTabs.clear();
  }
}
