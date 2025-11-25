import { WebContentsView, dialog } from 'electron';
import { AutomationService } from '@/main/llm';
import { RecordingStore } from '@/main/recording';
import { Tab } from './types';
import { SessionManager } from '@/main/llm/session/SessionManager';
import { AutomationProgressEvent } from '@/shared/types';

export class AutomationManager {
  private automationSessions: Map<string, AutomationService> = new Map();

  constructor(
    private recordingStore: RecordingStore,
    private sessionManager: SessionManager,
    private browserUIView: WebContentsView,
  ) {}

  public async executeAutomation(
    newTab: Tab,
    userGoal: string,
    recordedSessionId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
  }> {
    if (!newTab || !newTab.automationExecutor) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Error',
        message: 'No active tab or automation. At least one tab must be open.'
      });
      return {
        success: false,
        sessionId: '',
        message: 'No active tab or automation. At least one tab must be open.'
      };
    }

    const automationService = new AutomationService(
      newTab.automationExecutor,
      this.recordingStore,
      this.sessionManager,
    );

    const automationPromise = automationService.executeAutomation(userGoal, recordedSessionId);

    await new Promise(resolve => setTimeout(resolve, 200));
    const sessionId = automationService.getSessionId();

    this.automationSessions.set(sessionId, automationService);
    automationService.on('progress', (event: AutomationProgressEvent) => {
      if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
        this.browserUIView.webContents.send('automation:progress', {
          sessionId,
          event
        });
      }
    });

    automationPromise
      .then(result => {
        if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
          this.browserUIView.webContents.send('automation:complete', {
            sessionId,
            result
          });
        }

        this.automationSessions.delete(sessionId);
      })
      .catch(error => {
        console.error('[AutomationManager] LLM automation failed:', error);
        
        if (this.browserUIView && !this.browserUIView.webContents.isDestroyed()) {
          this.browserUIView.webContents.send('automation:error', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        this.automationSessions.delete(sessionId);
      });

    return {
      success: true,
      sessionId,
      message: 'Automation started successfully 🎉'
    };
  }

  public stopAutomation(sessionId: string): void {
    const automationService = this.automationSessions.get(sessionId);
    if (automationService) {
      console.log(`🛑 [AutomationManager] Stopping automation session: ${sessionId}`);
      automationService.stopAutomation();
    } else {
      console.warn(`⚠️ [AutomationManager] No active automation found for session: ${sessionId}`);
    }
  }

  public async loadAutomationSession(sessionId: string): Promise<any> {
    try {
      const sessionData = this.sessionManager.loadSession(sessionId);
      
      if (!sessionData) {
        dialog.showMessageBox({
          type: 'error',
          title: 'Error',
          message: 'Session not found'
        });
        return null;
      }
      
      // Parse messages into individual events
      const events: any[] = [];
      
      for (const msg of sessionData.messages) {
        const content = Array.isArray(msg.content) ? msg.content : [msg.content];
        
        if (msg.role === 'assistant') {
          // Assistant messages contain text blocks and tool_use blocks
          for (const block of content) {
            if (typeof block === 'object' && block !== null) {
              if (block.type === 'text') {
                // Claude's thinking/response
                events.push({
                  id: `msg_${msg.id}_text`,
                  sessionId: sessionData.session.id,
                  type: 'claude_response',
                  data: { message: block.text },
                  timestamp: msg.createdAt
                });
              } else if (block.type === 'tool_use') {
                // Tool call (step start)
                events.push({
                  id: `msg_${msg.id}_tool_${block.id}`,
                  sessionId: sessionData.session.id,
                  type: 'step_start',
                  data: {
                    toolName: block.name,
                    toolUseId: block.id,
                    input: block.input,
                    stepNumber: events.filter(e => e.type.startsWith('step_')).length + 1
                  },
                  timestamp: msg.createdAt
                });
              }
            }
          }
        } else if (msg.role === 'user') {
          // User messages contain tool_result blocks
          for (const block of content) {
            if (typeof block === 'object' && block !== null && block.type === 'tool_result') {
              // Tool result (step complete or error)
              const isError = block.is_error || false;
              const resultContent = Array.isArray(block.content) ? block.content[0] : block.content;
              const resultText = typeof resultContent === 'object' && resultContent.type === 'text' 
                ? resultContent.text 
                : typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent);
              
              // Try to parse result as JSON to extract structured data
              let parsedResult: any = null;
              try {
                parsedResult = JSON.parse(resultText);
              } catch {
                parsedResult = { message: resultText };
              }
              
              events.push({
                id: `msg_${msg.id}_result_${block.tool_use_id}`,
                sessionId: sessionData.session.id,
                type: isError ? 'step_error' : 'step_complete',
                data: {
                  toolUseId: block.tool_use_id,
                  result: parsedResult,
                  success: !isError,
                  error: isError ? parsedResult : undefined,
                  stepNumber: events.filter(e => e.type.startsWith('step_')).length
                },
                timestamp: msg.createdAt
              });
            }
          }
        }
      }
      
      // Convert to format expected by renderer
      return {
        sessionId: sessionData.session.id,
        userGoal: sessionData.session.userGoal,
        recordingId: sessionData.session.recordingId,
        status: sessionData.session.status,
        events,
        result: sessionData.session.metadata.finalSuccess,
        error: sessionData.session.metadata.finalError,
        startTime: sessionData.session.createdAt,
        endTime: sessionData.session.completedAt
      };
    } catch (error) {
      console.error('[AutomationManager] Failed to load session:', error);
      return null;
    }
  }

  /**
   * Get automation session history (limited list for sidebar)
   */
  public async getAutomationSessionHistory(limit = 5): Promise<any[]> {
    try {
      const sessions = this.sessionManager.listSessions(limit, 0);
      
      return sessions.map(session => ({
        sessionId: session.id,
        userGoal: session.userGoal,
        recordingId: session.recordingId,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        stepCount: session.stepCount
      }));
    } catch (error) {
      console.error('[AutomationManager] Failed to load session history:', error);
      return [];
    }
  }

  /**
   * Get all automation sessions (for automation screen)
   */
  public async getAutomationSessions(): Promise<any[]> {
    try {
      // Get all sessions (no limit)
      const sessions = this.sessionManager.listSessions(1000, 0);
      
      return sessions.map(session => ({
        sessionId: session.id,
        userGoal: session.userGoal,
        recordingId: session.recordingId,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        stepCount: session.stepCount
      }));
    } catch (error) {
      console.error('[AutomationManager] Failed to load sessions:', error);
      return [];
    }
  }

  /**
   * Get detailed session information
   */
  public async getAutomationSessionDetails(sessionId: string): Promise<any> {
    try {
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Return session with all available details
      return session;
    } catch (error) {
      console.error('[AutomationManager] Failed to load session details:', error);
      throw error;
    }
  }

  /**
   * Resume a paused or failed automation session
   */
  public async resumeAutomationSession(sessionId: string): Promise<any> {
    try {
      // Load the session
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // TODO: Implement resume logic
      // For now, just return the session info
      console.log('[AutomationManager] Resume session:', sessionId);
      
      return {
        success: true,
        sessionId,
        message: 'Session resume not yet implemented'
      };
    } catch (error) {
      console.error('[AutomationManager] Failed to resume session:', error);
      throw error;
    }
  }

  /**
   * Delete automation session
   */
  public async deleteAutomationSession(sessionId: string): Promise<boolean> {
    try {
      this.sessionManager.deleteSession(sessionId);
      return true;
    } catch (error) {
      console.error('[AutomationManager] Failed to delete session:', error);
      return false;
    }
  }

  /**
   * Clean up
   */
  public destroy(): void {
    this.automationSessions.clear();
  }
}
