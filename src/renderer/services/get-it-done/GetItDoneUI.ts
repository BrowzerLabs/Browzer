import { GetItDoneStep } from './types';

export class GetItDoneUI {
  private currentMessageElement: HTMLElement | null = null;
  private toolExecutionContainer: HTMLElement | null = null;

  async updateStep(step: GetItDoneStep): Promise<void> {
    console.log('[GetItDoneUI] Updating step:', step);

    // Add or update the main step message
    this.addOrUpdateMessage(step.message, 'assistant', `get-it-done-${step.phase}`, step.status);

    // Create tool execution container if we're in the executing phase
    if (step.phase === 'executing' && !this.toolExecutionContainer) {
      this.toolExecutionContainer = this.createToolExecutionContainer();
    }
  }

  async updateToolExecution(toolName: string, status: 'running' | 'completed' | 'failed', error?: string): Promise<void> {
    console.log('[GetItDoneUI] Tool execution update:', { toolName, status, error });

    const message = this.formatToolExecutionMessage(toolName, status, error);
    const messageClass = `tool-execution-${status}`;

    // Add to tool execution container if it exists, otherwise add as regular message
    if (this.toolExecutionContainer) {
      this.addMessageToContainer(this.toolExecutionContainer, message, messageClass);
    } else {
      this.addMessageToChat(message, 'assistant', messageClass);
    }
  }

  async displayFinalResult(formattedResponse: string): Promise<void> {
    console.log('[GetItDoneUI] Displaying final result:', formattedResponse);
    this.addMessageToChat(formattedResponse, 'assistant', 'get-it-done-result');

    // Clean up containers
    this.toolExecutionContainer = null;
    this.currentMessageElement = null;
  }

  async handleError(error: any): Promise<void> {
    console.error('[GetItDoneUI] Handling error:', error);
    const errorMessage = `❌ Get it done mode failed: ${error.message}`;
    this.addMessageToChat(errorMessage, 'assistant', 'get-it-done-error');

    // Clean up containers
    this.toolExecutionContainer = null;
    this.currentMessageElement = null;
  }

  private formatToolExecutionMessage(toolName: string, status: 'running' | 'completed' | 'failed', error?: string): string {
    switch (status) {
      case 'running':
        return `🔄 Executing ${toolName}...`;
      case 'completed':
        return `✅ ${toolName} completed`;
      case 'failed':
        return `❌ ${toolName} failed${error ? ': ' + error : ''}`;
      default:
        return `• ${toolName}: ${status}`;
    }
  }

  private addOrUpdateMessage(content: string, sender: string, type: string, status: string): void {
    const chatContainer = this.getChatContainer();
    if (!chatContainer) return;

    // If this is an update to the current message, update it
    if (this.currentMessageElement && status === 'completed') {
      this.currentMessageElement.innerHTML = this.formatMessageContent(content);
      return;
    }

    // Create new message
    const messageElement = this.createMessageElement(content, sender, type);
    chatContainer.appendChild(messageElement);
    this.scrollToBottom(chatContainer);

    // Store reference if this is a running step
    if (status === 'running') {
      this.currentMessageElement = messageElement;
    }
  }

  private addMessageToChat(content: string, sender: string, type: string): void {
    const chatContainer = this.getChatContainer();
    if (!chatContainer) return;

    const messageElement = this.createMessageElement(content, sender, type);
    chatContainer.appendChild(messageElement);
    this.scrollToBottom(chatContainer);
  }

  private addMessageToContainer(container: HTMLElement, content: string, className: string): void {
    const messageElement = document.createElement('div');
    messageElement.className = `tool-execution-item ${className}`;
    messageElement.innerHTML = this.formatMessageContent(content);
    container.appendChild(messageElement);

    // Scroll the chat container
    const chatContainer = this.getChatContainer();
    if (chatContainer) {
      this.scrollToBottom(chatContainer);
    }
  }

  private createMessageElement(content: string, sender: string, type: string): HTMLElement {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message ${type}`;
    messageElement.innerHTML = this.formatMessageContent(content);
    return messageElement;
  }

  private createToolExecutionContainer(): HTMLElement {
    const chatContainer = this.getChatContainer();
    if (!chatContainer) {
      throw new Error('Chat container not found');
    }

    const container = document.createElement('div');
    container.className = 'tool-execution-container';
    container.innerHTML = `
      <div class="tool-execution-header">
        <strong>Tool Execution Progress:</strong>
      </div>
    `;

    chatContainer.appendChild(container);
    this.scrollToBottom(chatContainer);

    return container;
  }

  private formatMessageContent(content: string): string {
    // Convert markdown-style formatting to HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  private getChatContainer(): HTMLElement | null {
    // Try multiple possible chat container IDs/classes used in the app
    const possibleIds = ['chatContainer', 'chat-container', 'messages-container'];
    const possibleClasses = ['chat-container', 'messages-container', 'chat-messages'];

    // Try by ID first
    for (const id of possibleIds) {
      const element = document.getElementById(id);
      if (element) return element;
    }

    // Try by class name
    for (const className of possibleClasses) {
      const element = document.querySelector(`.${className}`);
      if (element) return element as HTMLElement;
    }

    // Fallback: look for any element that looks like a chat container
    const container = document.querySelector('[class*="chat"], [class*="message"], [id*="chat"], [id*="message"]');
    if (container) return container as HTMLElement;

    console.error('[GetItDoneUI] No chat container found');
    return null;
  }

  private scrollToBottom(container: HTMLElement): void {
    try {
      container.scrollTop = container.scrollHeight;
    } catch (error) {
      console.warn('[GetItDoneUI] Failed to scroll to bottom:', error);
    }
  }
}