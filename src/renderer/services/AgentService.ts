import CONSTANTS from '../constants';
import { DoStep, DoTask, IAgentService, IpcRenderer, WebpageContext } from '../types';
import { Utils } from '../utils';
import { DoAgentService } from './DoAgentService';
import { ExecuteAgentService } from './ExecuteAgentService';
import { McpClientManager } from './McpClientService';
import { MemoryService } from './MemoryService';
import { RecordingService } from './RecordingService';
import { TabService } from './TabService';
import { WorkflowService } from './WorkflowService';

/**
 * AgentService handles AI agent execution and related functionality
 */
export class AgentService implements IAgentService {
  private ipcRenderer: IpcRenderer;
  private isExecuting: boolean = false;
  private tabService: TabService;
  private mcpManager: McpClientManager;
  private memoryService: MemoryService;
  private workflowService: WorkflowService;
  private recordingService: RecordingService;
  private executeAgentService: ExecuteAgentService;
  private selectedWebpageContexts: WebpageContext[];
  private globalQueryTracker: Map<string, number>;

  constructor(
    ipcRenderer: IpcRenderer, 
    tabService: TabService, 
    mcpManager: McpClientManager, 
    memoryService: MemoryService, 
    workflowService: WorkflowService,
    recordingService: RecordingService,
    selectedWebpageContexts: WebpageContext[],
  ) {
    this.ipcRenderer = ipcRenderer;
    this.tabService = tabService;
    this.mcpManager = mcpManager;
    this.memoryService = memoryService;
    this.workflowService = workflowService;
    this.recordingService = recordingService;
    this.selectedWebpageContexts = selectedWebpageContexts;
    this.globalQueryTracker = new Map<string, number>();
    this.executeAgentService = new ExecuteAgentService(tabService);
  }

  public setupControls(): void {
    try {
      this.setupAgentControls();
    } catch (error) {
      console.error('[AgentService] Failed to setup controls:', error);
    }
  }

  private isQueryRecentlyProcessed(query: string, windowMs: number = 3000): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const currentTime = Date.now();
    const lastProcessedTime = this.globalQueryTracker.get(normalizedQuery) || 0;
    
    if (currentTime - lastProcessedTime < windowMs) {
      return true;
    }
    
    this.globalQueryTracker.set(normalizedQuery, currentTime);
    if (this.globalQueryTracker.size > 100) {
      const cutoffTime = currentTime - (windowMs * 10);
      for (const [key, time] of this.globalQueryTracker.entries()) {
        if (time < cutoffTime) {
          this.globalQueryTracker.delete(key);
        }
      }
    }
    
    return false;
  }

  private setupAgentControls(): void {
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer) {
      let chatInputArea = document.querySelector('.chat-input-area');
      if (!chatInputArea) {
        chatInputArea = document.createElement('div');
        chatInputArea.className = 'chat-input-area';
        chatInputArea.innerHTML = `
          <div class="chat-mode-selector">
            <label class="mode-option">
              <input type="radio" name="chatMode" value="ask" checked />
              <span>Ask</span>
            </label>
            <label class="mode-option">
              <input type="radio" name="chatMode" value="do" />
              <span>Do</span>
            </label>
            <label class="mode-option">
              <input type="radio" name="chatMode" value="execute" />
              <span>Execute</span>
            </label>
          </div>
          <div class="chat-input-row">
            <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
            <button id="sendMessageBtn" class="chat-send-btn">Send</button>
          </div>
        `;
        
        chatInputContainer.appendChild(chatInputArea);
        this.setupChatInputHandlers();
      } else {
        this.setupChatInputHandlers();
      }
    }
  }

  private setupChatInputHandlers(): void {
    
    setTimeout(() => {
      const sendButton = document.getElementById('sendMessageBtn');
      const chatInput = document.getElementById('chatInput') as HTMLInputElement;
      
      if (!sendButton || !chatInput) {
        console.error('[AgentService] Chat input elements not found');
        return;
      }
      
      
      if ((sendButton as any).hasHandlers) {
        return;
      }
      
      const sendMessage = () => {
        const message = chatInput.value.trim();
        if (message) {
          const selectedMode = document.querySelector('input[name="chatMode"]:checked') as HTMLInputElement;
          const mode = selectedMode ? selectedMode.value : 'ask';
          
          let placeholderText = 'Ask a follow-up question...';
          if (mode === 'do') {
            placeholderText = 'Enter a task to perform...';
          } else if (mode === 'execute') {
            placeholderText = 'Describe what to do with the recording...';
          }
          chatInput.placeholder = placeholderText;
          
          this.addMessageToChat('user', message);
          
          if (mode === 'do') {
            this.processDoTask(message);
          } else if (mode === 'execute') {
            if (this.executeAgentService) {
              this.processExecuteWithRecording(message).catch(error => {
                console.error('Failed to execute with recording:', error);
                this.addMessageToChat('assistant', 'Error: Failed to execute with recording.');
              });
            } else {
              this.addMessageToChat('assistant', 'Error: Execute agent service not initialized.');
            }
          } else {
            if (this.selectedWebpageContexts.length > 0) {
              this.processFollowupQuestionWithContexts(message, this.selectedWebpageContexts);
            } else {
              this.processFollowupQuestion(message);
            }
          }
          
          chatInput.value = '';
        }
      };
      
      sendButton.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage();
      });
      
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });    
      
      const modeRadios = document.querySelectorAll('input[name="chatMode"]');
      modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
          const mode = (e.target as HTMLInputElement).value;
          
          let placeholderText = 'Ask a follow-up question...';
          if (mode === 'do') {
            placeholderText = 'Enter a task to perform...';
          } else if (mode === 'execute') {
            placeholderText = 'Describe what to do with the recording...';
          }
          chatInput.placeholder = placeholderText;
          
          const sidebarContent = document.querySelector('.chat-sidebar-content');
          if (sidebarContent) {
            if (mode === 'execute') {
              sidebarContent.classList.add('execute-mode');
            } else {
              sidebarContent.classList.remove('execute-mode');
            }
          }
        });
      });
      
      (sendButton as any).hasHandlers = true;
    }, 100); 
  }

  public async execute(): Promise<void> {
    if (this.isExecuting) {
      return;
    }

    this.isExecuting = true;

    try {
      const webview = this.getActiveWebview();
      if (!webview) {
        throw new Error('No active webview found');
      }

      const provider = 'anthropic'; // Always use Anthropic Claude
      
      const url = webview.src || '';
      let title = '';
      try {
        title = webview.getTitle ? webview.getTitle() : '';
      } catch (e) {
        console.error('Error getting title:', e);
        title = '';
      }
      
      if (!title) title = url;
      
      let query = url;
      if (url.includes('google.com/search')) {
        try {
          const urlObj = new URL(url);
          const searchParams = urlObj.searchParams;
          if (searchParams.has('q')) {
            query = searchParams.get('q') || '';
          }
        } catch (e) {
          console.error('Error extracting search query:', e);
        }
      } else {
        query = title;
      }

      if (this.isQueryRecentlyProcessed(query)) {
        this.showToast('This query was just processed, skipping duplicate', 'info');
        return;
      }
      const currentTime = Date.now();
      const queryKey = `${query}-${url}`;
      const lastProcessedKey = `lastProcessed_${queryKey}`;
      const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
      
      if (currentTime - lastProcessedTime < 5000) {
        this.showToast('This query was just processed, skipping duplicate execution', 'info');
        return;
      }
      
      localStorage.setItem(lastProcessedKey, currentTime.toString());
      this.ensureChatInputArea();

      this.addMessageToChat('assistant', '<div class="loading">Analyzing request and routing to appropriate agent...</div>');
      
      const pageContent = await Utils.extractPageContent(webview);
      const routingResult = await this.ipcRenderer.invoke('route-extension-request', query);
      
      this.clearLoadingMessages();

      if (routingResult.type === 'workflow') {
        try {
          const workflowData = {
            pageContent,
            browserApiKeys: Utils.getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022', // Always use Claude 3.5 Sonnet
            isQuestion: false,
            conversationHistory: await this.buildConversationHistoryWithMemories(url, query),
            mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to workflow data
          };
  
          await this.ipcRenderer.invoke('execute-workflow', {
            query,
            data: workflowData
          });
          
        } catch (workflowError) {
          console.error('Workflow execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        } finally {
          this.isExecuting = false;
        }
        
        return; // Don't execute single extension path
      }
      
      
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available for your request');
        return;
      }

      const singleExtensionWorkflowData = {
        workflowId: `single-${Date.now()}`,
        type: 'single_extension',
        steps: [{
          extensionId: extensionId,
          extensionName: Utils.getExtensionDisplayName(extensionId)
        }]
      };
      
      const progressElement = this.workflowService.addWorkflowProgressToChat(singleExtensionWorkflowData);
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'running'
        });
      }
      
      const action = 'process_page';
      const data = {
        query,
        pageContent,
        isQuestion: false,
        conversationHistory: await this.buildConversationHistoryWithMemories(url, query),
        mcpTools: await this.getMcpToolsForAsk()
      };
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: this.getBrowserApiKeys(),
          selectedProvider: provider
        });      

        if (progressElement && (progressElement as any).progressIndicator) {
          (progressElement as any).progressIndicator.updateProgress({
            workflowId: singleExtensionWorkflowData.workflowId,
            currentStep: 0,
            stepStatus: 'completed',
            stepResult: result.data
          });
          
          (progressElement as any).progressIndicator.completeWorkflow({
            workflowId: singleExtensionWorkflowData.workflowId,
            result: result.data
          });
        }
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error}`);
        } else {
          this.displayAgentResults(result.data);
        }

        if (this.memoryService && result.data) {
          let summary = '';
          let memoryQuery = query || 'Agent Query';
          if (result.data.consolidated_summary) {
            summary = result.data.consolidated_summary;
          } else if (result.data.summaries && result.data.summaries.length > 0) {
            summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
          } else if (typeof result.data === 'string') {
            summary = result.data;
          } else if (result.data.content) {
            summary = result.data.content;
          } else if (result.data.response) {
            summary = result.data.response;
          }
          
          if (summary && summary.trim()) {
            const webview = this.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.memoryService.storeMemory(url, memoryQuery, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in workflow-complete');
          }
        }

      } catch (extensionError) {
        this.addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
      }
    } catch (error) {
      console.error("Agent execution error:", error);
      this.clearLoadingMessages();
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
    }
  }


  private loadRecordingSessions(): void {
    if (!this.recordingService) {
      console.error('[AgentService] Recording service not initialized');
      return;
    }
    
    const sessionListItems = document.getElementById('sessionListItems');
    if (!sessionListItems) {
      console.error('[AgentService] Session list items container not found');
      return;
    }
    
    sessionListItems.innerHTML = '<div class="session-list-loading">Loading sessions...</div>';
    
    try {
      const sessions = this.recordingService.getAllSessions();
      
      if (sessions.length === 0) {
        sessionListItems.innerHTML = `
          <div class="session-list-empty">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="#9ca3af">
              <path d="M13 16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10z"/>
            </svg>
            <p>No recording sessions found</p>
            <p class="session-list-empty-hint">Record a workflow first to use with Execute mode</p>
          </div>
        `;
        return;
      }
      
      sessions.sort((a, b) => b.startTime - a.startTime);
      
      sessionListItems.innerHTML = '';
      sessions.forEach(session => {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-list-item';
        sessionItem.dataset.sessionId = session.id;
        const date = new Date(session.startTime);
        const formattedDate = date.toLocaleDateString();
        const duration = session.endTime ? Math.round((session.endTime - session.startTime) / 1000) : 0;
        const formattedDuration = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
        const eventCount = session.events?.length || 0;
        
        sessionItem.innerHTML = `
          <div class="session-item-name">${this.escapeHtml(session.taskGoal || 'Unnamed Session')}</div>
          <div class="session-item-info">
            <span class="session-item-date">${formattedDate}</span>
            <span class="session-item-duration">${formattedDuration}</span>
            <span class="session-item-events">${eventCount} events</span>
          </div>
        `;
        sessionItem.addEventListener('click', () => {
          document.querySelectorAll('.session-list-item').forEach(item => {
            item.classList.remove('selected');
          });
          sessionItem.classList.add('selected');
          if (this.executeAgentService) {
            this.executeAgentService.setSelectedSessionId(session.id);
            const selectionMessage = document.getElementById('sessionSelectionRequired');
            if (selectionMessage) {
              selectionMessage.classList.add('session-selected');
            }
          }
        });
        
        sessionListItems.appendChild(sessionItem);
      });
    } catch (error) {
      console.error('[AgentService] Error loading recording sessions:', error);
      sessionListItems.innerHTML = `
        <div class="session-list-error">
          <p>Failed to load recording sessions</p>
          <button class="retry-btn">Retry</button>
        </div>
      `;
      const retryBtn = sessionListItems.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadRecordingSessions());
      }
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async processExecuteWithRecording(message: string): Promise<void> {
    if (!this.executeAgentService) {
      this.addMessageToChat('assistant', 'Error: Execute agent service not initialized.');
      return;
    }
    
    if (this.isExecuting) {
      this.addMessageToChat('assistant', 'Another task is already in progress. Please wait for it to complete.');
      return;
    }
    
    this.isExecuting = true;
    
    try {
      const conversationHistory = this.executeAgentService.getConversationHistory();
      
      if (conversationHistory.length > 0) {
        console.log('[AgentService] Continuing conversation with', conversationHistory.length, 'messages');
        this.executeAgentService.continueConversation(message);
        
        const result = await this.executeAgentService.executeTask(message);
        
        if (!result.success && result.error) {
          console.error('[AgentService] Execute task failed:', result.error);
        }
      } else {
        const result = await this.executeAgentService.executeTask(message);
        
        if (!result.success && result.error) {
          console.error('[AgentService] Execute task failed:', result.error);
        }
      }
      
    } catch (error) {
      console.error('[AgentService] Execute with recording error:', error);
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
    }
  }

  private async getMcpToolsForAsk(): Promise<any[]> {
    const toolNames = await this.mcpManager.listAllTools();
    const tools = [];
    
    for (const toolName of toolNames) {
      const toolInfo = this.mcpManager.getToolInfo(toolName);
      if (toolInfo) {
        tools.push({
          name: toolName,
          description: toolInfo.description || '',
          inputSchema: toolInfo.inputSchema || {},
          serverName: toolInfo.serverName
        });
      }
    }
    return tools;
  }

  private clearLoadingIndicators = () => {
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  };

  private async processFollowupQuestion(question: string): Promise<void> {
    if (this.isExecuting) {
      return;
    }

    const currentTime = Date.now();
    const queryKey = `followup_${question}`;
    const lastProcessedKey = `lastProcessed_${queryKey}`;
    const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
    
    if (currentTime - lastProcessedTime < 5000) {
      this.showToast('This question was just processed, skipping duplicate execution', 'info');
      return;
    }
    
    localStorage.setItem(lastProcessedKey, currentTime.toString());
    
    try {
      this.addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
      const provider = 'anthropic'; 
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
        return;
      }
      
      const activeWebview = this.getActiveWebview();
      if (!activeWebview) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'No active webview found.');
        return;
      }
      
      const pageContent = await Utils.extractPageContent(activeWebview);
      const questionRequest = `Answer this question about the page: ${question}`;
      const routingResult = await this.ipcRenderer.invoke('route-extension-request', questionRequest);
      
      this.clearLoadingMessages();
      
      if (routingResult.type === 'workflow') {
        try {
          const workflowData = {
            pageContent,
            browserApiKeys: this.getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022',
            isQuestion: true,
          };

          await this.ipcRenderer.invoke('execute-workflow', {
            query: questionRequest,
            data: workflowData
          });
          
        } catch (workflowError) {
          console.error('Follow-up workflow execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        }
        
        return; 
      }
      
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available to answer your question');
        return;
      }
      
      const action = 'process_page';
      const data = {
        query: questionRequest,
        pageContent,
        isQuestion: true,
      };
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: this.getBrowserApiKeys(),
          selectedProvider: provider
        });
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
          return;
        }
        
        this.displayAgentResults(result.data);

        if (this.memoryService && result.data) {
          let summary = '';
          if (result.data.consolidated_summary) {
            summary = result.data.consolidated_summary;
          } else if (result.data.summaries && result.data.summaries.length > 0) {
            summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
          } else if (typeof result.data === 'string') {
            summary = result.data;
          } else if (result.data.content) {
            summary = result.data.content;
          } else if (result.data.response) {
            summary = result.data.response;
          }
          
          if (summary && summary.trim()) {
            const webview = this.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.memoryService.storeMemory(url, question, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in followup');
          }
        }
      } catch (error) {
        console.error('Error in processFollowupQuestion:', error);
      }
      this.clearLoadingMessages();
    } catch (error) {
      console.error('Error in processFollowupQuestion:', error);
      this.clearLoadingMessages();
    }
  }

  private async processFollowupQuestionWithContexts(question: string, contexts: WebpageContext[]): Promise<void> {
    if (this.isExecuting) {
      this.showToast('Workflow already in progress...', 'info');
      return;
    }
    this.isExecuting = true;
    
    try {
      this.addMessageToChat('assistant', '<div class="loading">Processing your question with webpage contexts...</div>');
      
      const provider = 'anthropic'; // Always use Anthropic Claude
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        this.clearLoadingIndicators();
        this.addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
        this.isExecuting = false;
        return;
      } 
      
      const activeWebview = this.getActiveWebview();
      if (!activeWebview) {
        this.clearLoadingIndicators();
        this.addMessageToChat('assistant', 'No active webview found.');
        this.isExecuting = false;
        return;
      }
      
      const currentUrl = activeWebview.src || '';
      const pageContent = await Utils.extractPageContent(activeWebview);
      
      const enhancedPageContent = {
        ...pageContent,
        additionalContexts: contexts.map(ctx => ({
          title: ctx.title,
          url: ctx.url,
          content: ctx.content || {}
        }))
      };
      
      const questionRequest = `Answer this question using the current page and any provided webpage contexts: ${question}`;

      const routingResult = await this.ipcRenderer.invoke('route-extension-request', questionRequest);
      
      this.clearLoadingIndicators();
      
      if (routingResult.type === 'workflow') {
        
        try {
          const workflowData = {
            pageContent: enhancedPageContent,
            browserApiKeys: this.getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022', // Always use Claude 3.5 Sonnet
            isQuestion: true,
            conversationHistory: await this.buildConversationHistoryWithMemories(currentUrl, question),
            mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to workflow data
          };
  
          await this.ipcRenderer.invoke('execute-workflow', {
            query: questionRequest,
            data: workflowData
          });
          
        } catch (workflowError) {
          console.error('Follow-up workflow with contexts execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        }
        
        return;
      }
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available to answer your question');
        return;
      }
      const singleExtensionWorkflowData = {
        workflowId: `followup-context-single-${Date.now()}`,
        type: 'single_extension',
        steps: [{
          extensionId: extensionId,
          extensionName: Utils.getExtensionDisplayName(extensionId)
        }]
      };

      const progressElement = this.workflowService.addWorkflowProgressToChat(singleExtensionWorkflowData);
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'running'
        });
      }
      
      const action = 'process_page';
      const data = {
        query: questionRequest,
        pageContent: enhancedPageContent,
        isQuestion: true,
        conversationHistory: await this.buildConversationHistoryWithMemories(currentUrl, question),
        mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to extension data
      };
      
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: this.getBrowserApiKeys(),
          selectedProvider: provider
        });
        if (progressElement && (progressElement as any).progressIndicator) {
          (progressElement as any).progressIndicator.updateProgress({
            workflowId: singleExtensionWorkflowData.workflowId,
            currentStep: 0,
            stepStatus: 'completed',
            stepResult: result.data
          });
          
          (progressElement as any).progressIndicator.completeWorkflow({
            workflowId: singleExtensionWorkflowData.workflowId,
            result: result.data
          });
        }
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
          return;
        }
        
        console.log('[processFollowupQuestionWithContexts] Displaying results...');
        this.displayAgentResults(result.data);
        if (this.memoryService && result.data) {
          let summary = '';
          if (result.data.consolidated_summary) {
            summary = result.data.consolidated_summary;
          } else if (result.data.summaries && result.data.summaries.length > 0) {
            summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
          } else if (typeof result.data === 'string') {
            summary = result.data;
          } else if (result.data.content) {
            summary = result.data.content;
          } else if (result.data.response) {
            summary = result.data.response;
          }
          
          if (summary && summary.trim()) {
            const webview = this.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.memoryService.storeMemory(url, question, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in followup with contexts');
          }
        }
      } catch (extensionError) {
        console.error('Follow-up extension with contexts execution failed:', extensionError);
        if (progressElement && (progressElement as any).progressIndicator) {
          (progressElement as any).progressIndicator.handleWorkflowError({
            workflowId: singleExtensionWorkflowData.workflowId,
            error: (extensionError as Error).message
          });
        }
        
        this.addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
      }
    } catch (error) {
      console.error('Error in processFollowupQuestionWithContexts:', error);
      this.clearLoadingIndicators();
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
    }
  }

  private getActiveWebview(): any {
    return this.tabService.getActiveWebview();
  }

  private getBrowserApiKeys(): Record<string, string> {
    const providers = ['anthropic'];
    const apiKeys: Record<string, string> = {};
    
    providers.forEach(provider => {
      const key = localStorage.getItem(`${provider}_api_key`);
      if (key) {
        apiKeys[provider] = key;
      }
    });
    
    return apiKeys;
  }

  private ensureChatInputArea(): void {
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer && !document.querySelector('.chat-input-area')) {
      const chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <div class="chat-mode-selector">
          <label class="mode-option">
            <input type="radio" name="chatMode" value="ask" checked />
            <span>Ask</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="execute" />
            <span>Execute</span>
          </label>
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      this.setupChatInputHandlers();
    }
  }

  private addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      // Use the new ChatMessage component if available
      if (typeof window !== 'undefined' && window.ChatMessage) {
        window.ChatMessage.addMessageToChat(role, content, timing);
        return;
      }
      
      // Fallback to original implementation if ChatMessage is not available
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) {
          return;
        }
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) {
          existingWelcome.remove();
        } 
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') {
        return;
      }
      
      const messageDiv = document.createElement('div');
      
      if (role === 'context') {
        messageDiv.className = 'chat-message context-message';
        messageDiv.innerHTML = `<div class="message-content">${Utils.markdownToHtml(content)}</div>`;
        messageDiv.dataset.role = 'context';
      } else if (role === 'user') {
        messageDiv.className = 'chat-message user-message';
        messageDiv.innerHTML = `<div class="message-content">${Utils.markdownToHtml(content)}</div>`;
        messageDiv.dataset.role = 'user';
        messageDiv.dataset.timestamp = new Date().toISOString();
      } else if (role === 'assistant') {
        messageDiv.className = 'chat-message assistant-message';
        messageDiv.dataset.role = 'assistant';
        messageDiv.dataset.timestamp = new Date().toISOString();
        
        const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
        const processedContent = isLoading ? content : Utils.markdownToHtml(content);
        
        if (timing && !isLoading) {
          messageDiv.innerHTML = `
            <div class="timing-info">
              <span>Response generated in</span>
              <span class="time-value">${timing.toFixed(2)}s</span>
            </div>
            <div class="message-content">${processedContent}</div>
          `;
          messageDiv.dataset.genTime = timing.toFixed(2);
        } else {
          messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
        }
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      this.ensureChatInputArea();
      
    } catch (error) {
      console.error('[AgentService] Error adding message to chat:', error);
    }
  }

  private displayAgentResults(data: any): void {
    try {
      if (!data) {
        this.addMessageToChat('assistant', 'No data received from agent');
        return;
      }
      
      const currentTime = Date.now();
      const contentHash = JSON.stringify(data).substring(0, 200); 
      const lastDisplayKey = `lastDisplayed_${contentHash}`;
      
      localStorage.setItem(lastDisplayKey, currentTime.toString());

      if (data.consolidated_summary) {
        this.addMessageToChat('assistant', data.consolidated_summary, data.generation_time);
      } else if (data.summaries && data.summaries.length > 0) {
        const summariesText = data.summaries.map((s: any) => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
        this.addMessageToChat('assistant', summariesText, data.generation_time);
      } else {
        this.addMessageToChat('assistant', 'No relevant information found.', data.generation_time);
      }
      
    } catch (error) {
      try {
        this.addMessageToChat('assistant', 'Error displaying results: ' + (error instanceof Error ? error.message : 'Unknown error'));
      } catch (chatError) {
        console.error('[AgentService] Error displaying results and adding chat message:', chatError);
      }
    }
  }

  private clearLoadingMessages(): void {
    // Use the new ChatMessage component if available
    if (typeof window !== 'undefined' && window.ChatMessage) {
      window.ChatMessage.clearLoadingMessages();
      return;
    }
    
    // Fallback to original implementation
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  }

  private showToast(message: string, type: string = 'info'): void {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
      toast!.className = 'toast';
    }, 3000);
  }

  private async processDoTask(taskInstruction: string): Promise<void> {
    
    if (!CONSTANTS.DOAGENT_ENABLED) {
      this.addMessageToChat('assistant', 'DoAgent functionality is disabled in this build.');
      return;
    }
  
    if (this.isExecuting) {
      this.showToast('Task already in progress...', 'info');
      return;
    }
    
    this.isExecuting = true;
    
    try {
      const activeWebview = this.getActiveWebview();
      if (!activeWebview) {
        this.addMessageToChat('assistant', 'No active webview found.');
        return;
      }
      
      const doAgent = new DoAgentService(activeWebview, (task: DoTask, step: DoStep) => {
        
        let progressMessage = `**${step.id}:** ${step.description}`;
        
        if (step.reasoning) {
          progressMessage += `\n  *AI Reasoning: ${step.reasoning}*`;
        }
        
        if (step.status === 'completed') {
          progressMessage += ' ✅';
        } else if (step.status === 'failed') {
          progressMessage += ' ❌';
          if (step.error) {
            progressMessage += `\n  Error: ${step.error}`;
          }
        } else if (step.status === 'running') {
          progressMessage += ' ⏳';
        }
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
          const lastMessage = chatContainer.querySelector('.chat-message.assistant-message:last-child .message-content');
          if (lastMessage) {
            if (lastMessage.innerHTML.includes('class="loading"')) {
              lastMessage.innerHTML = progressMessage;
            } else {
              lastMessage.innerHTML += `<br/>${progressMessage}`;
            }
          }
        }
      });
      this.addMessageToChat('assistant', '<div class="loading">🤖 Analyzing page and planning actions with AI...</div>');
      const result = await doAgent.executeTask(taskInstruction);
      const loadingMessages = document.querySelectorAll('.loading');
      loadingMessages.forEach(message => {
        const parentMessage = message.closest('.chat-message');
        if (parentMessage) {
          parentMessage.remove();
        }
      });
      if (result.success) {
        let resultMessage = `✅ **Task completed successfully!**\n⏱️ *Execution time: ${(result.executionTime / 1000).toFixed(2)}s*`;
        
        if (result.data) {
          if (typeof result.data === 'string') {
            resultMessage += `\n\n📄 **Result:**\n${result.data}`;
          } else if (result.data.error) {
            resultMessage += `\n\n⚠️ **Note:** ${result.data.error}`;
          } else if (result.data.url) {
            resultMessage += `\n\n📄 **Extracted from:** ${result.data.url}`;
            if (result.data.headings && result.data.headings.length > 0) {
              resultMessage += '\n\n📋 **Page Structure:**\n';
              result.data.headings.slice(0, 5).forEach((heading: any) => {
                resultMessage += `${'#'.repeat(heading.level === 'h1' ? 1 : heading.level === 'h2' ? 2 : 3)} ${heading.text}\n`;
              });
            }
            if (result.data.textContent && result.data.textContent.length > 0) {
              resultMessage += '\n\n📝 **Main Content:**\n';
              result.data.textContent.slice(0, 3).forEach((content: any, index: number) => {
                if (content.text && content.text.length > 50) {
                  resultMessage += `${index + 1}. ${content.text.substring(0, 200)}${content.text.length > 200 ? '...' : ''}\n`;
                }
              });
            }
            if (result.data.links && result.data.links.length > 0) {
              resultMessage += '\n\n🔗 **Links found:**\n';
              result.data.links.slice(0, 5).forEach((link: any, index: number) => {
                resultMessage += `${index + 1}. [${link.text}](${link.href})\n`;
              });
            }
            if (result.data.lists && result.data.lists.length > 0) {
              resultMessage += '\n\n📝 **Lists found:**\n';
              result.data.lists.slice(0, 2).forEach((list: any, index: number) => {
                resultMessage += `**List ${index + 1}:**\n`;
                list.items.slice(0, 3).forEach((item: string) => {
                  resultMessage += `• ${item}\n`;
                });
              });
            }
            if (result.data.pageStructure) {
              const structure = result.data.pageStructure;
              const pageTypes = [];
              if (structure.hasPosts) pageTypes.push('Posts');
              if (structure.hasBookmarks) pageTypes.push('Bookmarks');
              if (structure.hasProducts) pageTypes.push('Products');
              if (structure.hasFlights) pageTypes.push('Flights');
              if (structure.hasComments) pageTypes.push('Comments');
              if (structure.hasArticles) pageTypes.push('Articles');
              
              if (pageTypes.length > 0) {
                resultMessage += `\n\n🏷️ **Page Type:** ${pageTypes.join(', ')}`;
              }
            }
            if (result.data.fallbackContent && 
                (!result.data.textContent || result.data.textContent.length === 0) &&
                (!result.data.headings || result.data.headings.length === 0)) {
              resultMessage += `\n\n📄 **Page content:**\n${result.data.fallbackContent}`;
            }
          } else {
            resultMessage += `\n\n📄 **Result:**\n${JSON.stringify(result.data, null, 2)}`;
          }
        }
        
        this.addMessageToChat('assistant', resultMessage, result.executionTime / 1000);
      } else {
        this.addMessageToChat('assistant', `❌ **Task failed:** ${result.error}`);
      }
      
    } catch (error) {
      console.error('[processDoTask] Error executing task:', error);
      const loadingMessages = document.querySelectorAll('.loading');
      loadingMessages.forEach(message => {
        const parentMessage = message.closest('.chat-message');
        if (parentMessage) {
          parentMessage.remove();
        }
      });
      
      this.addMessageToChat('assistant', `❌ **Task execution failed:** ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
    }
  }
  
  public async buildConversationHistoryWithMemories(currentUrl: string, query: string): Promise<any[]> {
    const conversationHistory: any[] = [];
    
    try {
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        const messages = chatContainer.querySelectorAll('.chat-message');
        const recentMessages = Array.from(messages).slice(-10);
        recentMessages.forEach(message => {
          if (message.querySelector('.loading')) return;
          let role = 'assistant';
          if (message.classList.contains('user-message')) {
            role = 'user';
          }
          const contentEl = message.querySelector('.message-content');
          let content = '';
          if (contentEl) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contentEl.innerHTML;
            content = tempDiv.textContent || tempDiv.innerText || '';
          }
          
          if (content && !content.includes('class="loading"')) {
            conversationHistory.push({
              role: role,
              content: content
            });
          }
        });
      }
      try {
        const allMemories = JSON.parse(localStorage.getItem(CONSTANTS.MEMORY_KEY) || '[]');
        if (allMemories && allMemories.length > 0) {
          const relevantMemories = allMemories.slice(0, 10).filter((memory: any) => {
            if (!memory) return false;
            const currentDomain = currentUrl ? new URL(currentUrl).hostname : '';
            const memoryDomain = memory.domain || '';
            if (currentDomain && memoryDomain && currentDomain === memoryDomain) {
              return true;
            }
            const queryLower = query.toLowerCase();
            const questionMatch = memory.question && memory.question.toLowerCase().includes(queryLower);
            const answerMatch = memory.answer && memory.answer.toLowerCase().includes(queryLower);
            
            return questionMatch || answerMatch;
          }).slice(0, 5); // Take top 5 relevant memories
          relevantMemories.forEach((memory: any) => {
            conversationHistory.push({
              role: 'user',
              content: memory.question,
              isMemory: true,
              source: {
                url: memory.url,
                domain: memory.domain,
                title: memory.title,
                timestamp: memory.timestamp,
                topic: memory.topic
              }
            });
            conversationHistory.push({
              role: 'assistant',
              content: memory.answer,
              isMemory: true,
              source: {
                url: memory.url,
                domain: memory.domain,
                title: memory.title,
                timestamp: memory.timestamp,
                topic: memory.topic
              }
            });
          });
        }
      } catch (memoryError) {
        console.error('[Memory] Error retrieving memories:', memoryError);
      }
      
       return conversationHistory;
       
     } catch (error) {
       console.error('[Memory] Error building conversation history with memories:', error);
       return conversationHistory; // Return whatever we have so far
     }
   }

  public destroy(): void {
    try {
      this.isExecuting = false;
      this.executeAgentService.destroy();
      
    } catch (error) {
      console.error('[AgentService] Error during destruction:', error);
    }
  }
}