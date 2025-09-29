import { GetItDoneStep } from './types';

export class GetItDoneUI {
  private executionSummaryContainer: HTMLElement | null = null;
  private executionSteps: { [key: string]: string } = {};
  private stepStatuses: { [key: string]: 'pending' | 'running' | 'completed' | 'failed' } = {};
  private toolStatuses: { [key: string]: 'running' | 'completed' | 'failed' } = {};
  private startTime: number = Date.now();
  private stepCount: number = 0;
  private completedSteps: number = 0;
  private animationFrameId: number | null = null;

  // Reset all UI state for a new Get It Done request
  resetForNewRequest(): void {
    console.log('[GetItDoneUI] Resetting UI for new request');

    // Stop any running timer
    this.stopDurationTimer();

    // Clear container reference (forces recreation)
    this.executionSummaryContainer = null;

    // Reset state variables
    this.executionSteps = {};
    this.stepStatuses = {};
    this.toolStatuses = {};
    this.completedSteps = 0;
    this.stepCount = 5; // Standard 5-step workflow
    this.startTime = Date.now();
  }

  async updateStep(step: GetItDoneStep): Promise<void> {
    console.log('[GetItDoneUI] Updating step:', step);

    // Initialize execution summary container if needed
    if (!this.executionSummaryContainer) {
      this.executionSummaryContainer = this.createExecutionSummaryContainer();
    }

    // Update step status and message
    this.executionSteps[step.phase] = step.message;
    this.stepStatuses[step.phase] = step.status;

    if (step.status === 'completed') {
      this.completedSteps++;
    }

    // Update the execution summary (ONLY new UI)
    this.updateExecutionSummary();
  }

  async updateToolExecution(toolName: string, status: 'running' | 'completed' | 'failed', error?: string): Promise<void> {
    console.log('[GetItDoneUI] Tool execution update:', { toolName, status, error });

    // Update tool status tracking
    this.toolStatuses[toolName] = status;

    // Update the execution summary tool progress section (ONLY new UI)
    this.updateToolProgressSection();
  }

  async displayFinalResult(formattedResponse: string): Promise<void> {
    console.log('[GetItDoneUI] Displaying final result:', formattedResponse);

    // Mark the final 'complete' step as completed and increment counter
    if (this.stepStatuses['complete'] !== 'completed') {
      this.stepStatuses['complete'] = 'completed';
      this.completedSteps++;
    }

    // Update the execution summary with final results
    this.updateResultsSection(formattedResponse);

    // Stop the duration timer
    this.stopDurationTimer();

    // Update overall status to completed
    this.updateOverallStatus('completed');

    // Update the execution summary to reflect final step completion
    this.updateExecutionSummary();

    // NO separate chat message - results are shown in the execution summary only
  }

  async handleError(error: any): Promise<void> {
    console.error('[GetItDoneUI] Handling error:', error);

    // Stop the duration timer
    this.stopDurationTimer();

    // Update execution summary with error status (no separate chat message needed)
    this.updateOverallStatus('failed');
    this.updateResultsSection(`❌ Error: ${error.message}`);
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

  // ========================= EXECUTION SUMMARY UI =========================

  private createExecutionSummaryContainer(): HTMLElement {
    const chatContainer = this.getChatContainer();
    if (!chatContainer) {
      throw new Error('Chat container not found');
    }

    const container = document.createElement('div');
    container.className = 'execution-summary-container';
    container.innerHTML = `
      <style>
        .execution-summary-container {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          margin: 16px 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .execution-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #e9ecef;
          background: white;
          border-radius: 8px 8px 0 0;
        }

        .execution-title {
          font-size: 15px;
          font-weight: 600;
          color: #495057;
          margin: 0;
        }

        .status-badge {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        .status-completed {
          color: #10b981;
        }

        .status-running {
          color: #3b82f6;
        }

        .status-failed {
          color: #ef4444;
        }

        .accordion-section {
          border-bottom: 1px solid #e9ecef;
        }

        .accordion-section:last-child {
          border-bottom: none;
        }

        .accordion-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          cursor: pointer;
          background: white;
          transition: background-color 0.2s;
        }

        .accordion-header:hover {
          background: #f8f9fa;
        }

        .accordion-title {
          font-size: 14px;
          font-weight: 500;
          color: #495057;
          margin: 0;
        }

        .accordion-arrow {
          transition: transform 0.25s ease, opacity 0.2s;
          color: #adb5bd;
          font-size: 14px;
          opacity: 0.7;
        }

        .accordion-header:hover .accordion-arrow {
          opacity: 1;
        }

        .accordion-section.collapsed .accordion-arrow {
          transform: rotate(-90deg);
        }

        .accordion-section.collapsed .accordion-content {
          display: none;
        }

        .accordion-content {
          padding: 0 20px 16px 20px;
          background: white;
        }

        .step-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #f1f3f4;
        }

        .step-item:last-child {
          border-bottom: none;
        }

        .step-main {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .step-icon {
          font-size: 18px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          // background: #e8f5e8;
        }

        .step-text {
          color: #495057;
          font-size: 14px;
          font-weight: 500;
        }

        .step-status {
          color: #28a745;
          font-size: 13px;
          font-weight: 600;
          // background: #e8f5e8;
          padding: 4px 8px;
          border-radius: 12px;
        }

        .loading-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid #e3e3e3;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          padding: 0px;
          animation: spin 1s linear infinite;
          display: inline-block;
          vertical-align: middle;
        }

        .loading-spinner::before,
        .loading-spinner::after {
          content: none;
          display: none;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .tool-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #f1f3f4;
        }

        .tool-item:last-child {
          border-bottom: none;
        }

        .tool-name {
          font-family: 'SF Mono', Consolas, monospace;
          color: #495057;
          font-size: 14px;
        }

        .tool-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
        }

        .tool-status.completed {
          color: #28a745;
        }

        .tool-status.running {
          color: #ffc107;
        }

        .tool-status.failed {
          color: #dc3545;
        }

        .result-item {
          padding: 12px 0;
        }

        .result-content {
          color: #495057;
          font-size: 14px;
          line-height: 1.5;
        }

        .result-item.result-error .result-content {
          color: #721c24;
        }

        .result-item.result-warning .result-content {
          color: #856404;
        }

        .execution-footer {
          padding: 12px 20px;
          background: #f8f9fa;
          border-radius: 0 0 8px 8px;
          display: flex;
          justify-content: flex-end;
          font-size: 11px;
          color: #adb5bd;
        }

        #duration {
          display: inline-block;
          min-width: 45px;
          text-align: right;
          font-family: 'SF Mono', Consolas, 'Courier New', monospace;
        }

        #step-counter {
          display: inline-block;
          min-width: 30px;
          text-align: left;
          font-family: 'SF Mono', Consolas, 'Courier New', monospace;
        }
      </style>

      <div class="execution-header">
        <h3 class="execution-title">Execution Summary</h3>
        <div class="status-badge status-running" id="overall-status">
        <span class="loading-spinner"></span>
        </div>
      </div>

      <div class="accordion-section" id="execution-steps-section">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h4 class="accordion-title">Execution Steps</h4>
          <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-content" id="execution-steps-content">
          <!-- Steps will be populated here -->
        </div>
      </div>

      <div class="accordion-section" id="tool-progress-section">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h4 class="accordion-title">Tool Execution Progress</h4>
          <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-content" id="tool-progress-content">
          <!-- Tool progress will be populated here -->
        </div>
      </div>

      <div class="accordion-section" id="results-section">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h4 class="accordion-title">Results</h4>
          <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-content" id="results-content">
          <!-- Results will be populated here -->
        </div>
      </div>

      <div class="execution-footer" id="execution-footer">
        Duration: <span id="duration">0.0s</span> &nbsp;•&nbsp; Steps: <span id="step-counter">0/5</span>
      </div>
    `;

    chatContainer.appendChild(container);
    this.scrollToBottom(chatContainer);

    // Start the real-time duration timer
    this.startDurationTimer();

    return container;
  }

  private updateExecutionSummary(): void {
    if (!this.executionSummaryContainer) return;

    // Update execution steps content
    const stepsContent = this.executionSummaryContainer.querySelector('#execution-steps-content');
    if (stepsContent) {
      stepsContent.innerHTML = this.generateExecutionStepsHTML();
    }

    // Update step counter
    const stepCounter = this.executionSummaryContainer.querySelector('#step-counter');
    if (stepCounter) {
      stepCounter.textContent = `${this.completedSteps}/${this.stepCount}`;
    }

    // Update duration
    this.updateDuration();
  }

  private updateToolProgressSection(): void {
    if (!this.executionSummaryContainer) return;

    const toolProgressContent = this.executionSummaryContainer.querySelector('#tool-progress-content');
    if (toolProgressContent) {
      toolProgressContent.innerHTML = this.generateToolProgressHTML();
    }
  }

  private updateResultsSection(formattedResponse: string): void {
    if (!this.executionSummaryContainer) return;

    const resultsContent = this.executionSummaryContainer.querySelector('#results-content');
    if (resultsContent) {
      resultsContent.innerHTML = this.generateResultsHTML(formattedResponse);
    }
  }

  private updateOverallStatus(status: 'running' | 'completed' | 'failed'): void {
    if (!this.executionSummaryContainer) return;

    const statusBadge = this.executionSummaryContainer.querySelector('#overall-status');
    if (statusBadge) {
      statusBadge.className = `status-badge status-${status}`;

      switch (status) {
        case 'completed':
          statusBadge.innerHTML = '<span>✅</span>';
          break;
        case 'failed':
          statusBadge.innerHTML = '<span>❌</span>';
          break;
        default:
          statusBadge.innerHTML = '<span class="loading-spinner"></span>';
      }
    }
  }

  private updateDuration(): void {
    if (!this.executionSummaryContainer) return;

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const durationElement = this.executionSummaryContainer.querySelector('#duration');
    if (durationElement) {
      durationElement.textContent = `${duration}s`;
    }
  }

  private updateDurationLoop(): void {
    this.updateDuration();
    this.animationFrameId = requestAnimationFrame(() => this.updateDurationLoop());
  }

  private startDurationTimer(): void {
    // Clear any existing timer first
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Start the animation loop
    this.animationFrameId = requestAnimationFrame(() => this.updateDurationLoop());
  }

  private stopDurationTimer(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    // Final update to show exact duration
    this.updateDuration();
  }

  private generateExecutionStepsHTML(): string {
    const steps = [
      { key: 'discovering', defaultLabel: 'Discovering tools...', icon: '🔍' },
      { key: 'mapping', defaultLabel: 'Mapping instructions...', icon: '🎯' },
      { key: 'executing', defaultLabel: 'Executing tools...', icon: '⚡' },
      { key: 'formatting', defaultLabel: 'Formatting results...', icon: '📊' },
      { key: 'complete', defaultLabel: 'Completing execution...', icon: '🎉' }
    ];

    return steps.map(step => {
      const stepMessage = this.executionSteps[step.key];
      const stepStatus = this.stepStatuses[step.key] || 'pending';
      const isCompleted = stepStatus === 'completed';
      const isRunning = stepStatus === 'running';

      let displayText = step.defaultLabel;

      if (stepMessage) {
        // Clean up the message and extract meaningful content
        displayText = stepMessage.replace(/[🔍🎯⚡📊🎉✅]/g, '').trim();

        // Special handling for discovery step to show found tools
        if (step.key === 'discovering' && isCompleted) {
          const toolsMatch = stepMessage.match(/Found (\d+) tools?: (.+)/);
          if (toolsMatch) {
            const toolCount = toolsMatch[1];
            const toolNames = toolsMatch[2];
            displayText = `Found ${toolCount} tool${parseInt(toolCount) > 1 ? 's' : ''}: ${toolNames}`;
          }
        }
      }

      // Create step icon based on status
      let stepIcon;
      if (isCompleted) {
        stepIcon = '✅';
      } else if (stepStatus === 'failed') {
        stepIcon = '❌';
      } else if (isRunning) {
        stepIcon = '<div class="loading-spinner"></div>';
      } else {
        stepIcon = '⏸️'; // Pending/paused icon
      }

      return `
        <div class="step-item">
          <div class="step-main">
            <span class="step-icon">${stepIcon}</span>
            <span class="step-text">${displayText}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  private generateToolProgressHTML(): string {
    return Object.entries(this.toolStatuses).map(([toolName, status]) => `
      <div class="tool-item">
        <span class="tool-name">${toolName}</span>
        <span class="tool-status ${status}">
          ${status === 'running' ? '<span class="loading-spinner"></span>' : status === 'completed' ? '✅' : '❌'}
        </span>
      </div>
    `).join('');
  }

  private generateResultsHTML(formattedResponse: string): string {
    // Show the formatted response as a single result block instead of splitting lines
    const cleanResponse = formattedResponse.replace(/[✅❌📋➡️]/g, '').trim();

    // Determine overall status from the response
    let resultClass = 'success';

    if (formattedResponse.includes('❌') || formattedResponse.toLowerCase().includes('error') || formattedResponse.toLowerCase().includes('failed')) {
      resultClass = 'error';
    } else if (formattedResponse.includes('⚠️') || formattedResponse.toLowerCase().includes('warning')) {
      resultClass = 'warning';
    }

    return `
      <div class="result-item result-${resultClass}">
        <div class="result-content">
          ${cleanResponse.replace(/\n/g, '<br>')}
        </div>
      </div>
    `;
  }
}