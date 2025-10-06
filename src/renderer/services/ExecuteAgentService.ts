import { ExecuteResult } from '../types';
import { TabService } from './TabService';
import { SessionSelector } from '../components/SessionSelector';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import { AutomationOrchestrator, AutomationRequest, AutomationResponse } from '../automation';
import { Utils } from '../utils';

export class ExecuteAgentService {
  private tabService: TabService;
  private recordingEngine: SmartRecordingEngine;
  private orchestrator: AutomationOrchestrator;
  private isExecuting = false;
  private sessionSelector: SessionSelector | null = null;

  constructor(tabService: TabService) {
    this.tabService = tabService;
    this.recordingEngine = SmartRecordingEngine.getInstance();
    this.sessionSelector = new SessionSelector();
    this.orchestrator = AutomationOrchestrator.getInstance();
    
    this.initializeOrchestrator();
    
    this.setupExecutionFeedback();
  }

  private initializeOrchestrator(): void {
    const webview = this.tabService.getActiveWebview();
    this.orchestrator.initialize(webview);
  }

  private setupExecutionFeedback(): void {
    this.orchestrator.onExecutionFeedback((feedback) => {
      window.dispatchEvent(new CustomEvent('automation-feedback', {
        detail: feedback
      }));
      
      console.log(`[ExecuteAgentService] Step ${feedback.stepId}: ${feedback.message} (${feedback.progress}%)`);
    });
  }

  public async executeTask(instruction: string): Promise<ExecuteResult> {
    if (this.isExecuting) {
      return {
        success: false,
        error: 'Already executing a task. Please wait for current task to complete.',
        executionTime: 0
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      const webview = this.tabService.getActiveWebview();
      this.orchestrator.initialize(webview);

      this.addMessageToChat('assistant', '<div class="loading">🤖 Preparing adaptive execution - I will execute step-by-step with real-time verification...</div>');
      
      const selectedSessionId = await this.showSessionSelectorAndWaitForSelection();
      
      if (!selectedSessionId) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'No recording session selected. Task execution cancelled.');
        return {
          success: false,
          error: 'No recording session selected',
          executionTime: Date.now() - startTime
        };
      }

      const session = this.recordingEngine.getSession(selectedSessionId);
      if (!session) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Selected recording session not found. Please try again.');
        return {
          success: false,
          error: 'Recording session not found',
          executionTime: Date.now() - startTime
        };
      }

      this.clearLoadingMessages();
      this.addMessageToChat('user', instruction);

      const automationRequest: AutomationRequest = {
        userPrompt: instruction,
        recordingSessionId: selectedSessionId,
        recordingSession: session
      };

      const response: AutomationResponse = await this.orchestrator.executeAutomation(automationRequest);
      
      return {
        success: response.success,
        data: response.steps,
        error: response.error,
        executionTime: response.executionTime
      };
    } catch (error) {
      console.error('[ExecuteAgentService] Task execution failed:', error);
      this.addMessageToChat('assistant', `Execution failed: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    } finally {
      this.isExecuting = false;
    }
  }

  public setSelectedSessionId(sessionId: string): void {
    console.log('[ExecuteAgentService] Selected recording session ID:', sessionId);
  }

  /**
   * Continue conversation with new message
   */
  public continueConversation(message: string): void {
    this.orchestrator.sendMessage('user', message);
  }

  /**
   * Get conversation history
   */
  public getConversationHistory(): Array<{ role: string; content: string }> {
    return this.orchestrator.getConversationHistory();
  }

  /**
   * Clear current conversation
   */
  public clearConversation(): void {
    this.orchestrator.clearConversation();
  }

  private async showSessionSelectorAndWaitForSelection(): Promise<string | null> {
    return await this.sessionSelector!.show();
  }

  private addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      // Use the new ChatMessage component if available
      if (typeof window !== 'undefined' && (window as any).ChatMessage) {
        (window as any).ChatMessage.addMessageToChat(role, content, timing);
        return;
      }
      
      // Fallback to original implementation if ChatMessage is not available
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) return;
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) existingWelcome.remove();
        
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${role}-message`;
      messageDiv.dataset.role = role;
      messageDiv.dataset.timestamp = new Date().toISOString();
      
      const isLoading = content.includes('class="loading"');
      const processedContent = isLoading ? content : Utils.markdownToHtml(content);
      
      if (timing && !isLoading) {
        messageDiv.innerHTML = `
          <div class="timing-info">Response generated in ${timing.toFixed(2)}s</div>
          <div class="message-content">${processedContent}</div>
        `;
      } else {
        messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
      console.error('[ExecuteAgentService] Error adding message to chat:', error);
    }
  }

  private clearLoadingMessages(): void {
    // Use the new ChatMessage component if available
    if (typeof window !== 'undefined' && (window as any).ChatMessage) {
      (window as any).ChatMessage.clearLoadingMessages();
      return;
    }
    
    // Fallback to original implementation
    const loadingMessages = document.querySelectorAll('.loading');
    Array.from(loadingMessages).forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) parentMessage.remove();
    });
  }

  public destroy(): void {
    try {
      this.isExecuting = false;
      this.sessionSelector = null;
    } catch (error) {
      console.error('[ExecuteAgentService] Error during destruction:', error);
    }
  }
}
