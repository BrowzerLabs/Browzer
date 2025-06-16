import './WorkflowProgress.css';

interface WorkflowStep {
  id: string;
  extensionId: string;
  extensionName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  result?: any;
  error?: string;
}

interface WorkflowProgress {
  workflowId: string;
  type: 'single_extension' | 'workflow';
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStep[];
  isExpanded: boolean;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
}

export class WorkflowProgressIndicator {
  private container: HTMLElement;
  private progressData: WorkflowProgress | null = null;
  private updateInterval: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for workflow progress updates from main process
    window.electronAPI?.onWorkflowProgress((data: any) => {
      this.updateProgress(data);
    });

    window.electronAPI?.onWorkflowComplete((data: any) => {
      this.completeWorkflow(data);
    });

    window.electronAPI?.onWorkflowError((data: any) => {
      this.handleWorkflowError(data);
    });
  }

  public startWorkflow(workflowData: {
    workflowId: string;
    type: 'single_extension' | 'workflow';
    steps: Array<{ extensionId: string; extensionName: string; }>;
  }): void {
    console.log('[WorkflowProgress] Starting workflow:', workflowData);

    this.progressData = {
      workflowId: workflowData.workflowId,
      type: workflowData.type,
      currentStep: 0,
      totalSteps: workflowData.steps.length,
      steps: workflowData.steps.map((step, index) => ({
        id: `${workflowData.workflowId}-step-${index}`,
        extensionId: step.extensionId,
        extensionName: step.extensionName,
        status: (index === 0 ? 'running' : 'pending') as 'pending' | 'running' | 'completed' | 'failed'
      })),
      isExpanded: false,
      startTime: Date.now(),
      status: 'running'
    };

    this.render();
    this.startTimer();
  }

  public updateProgress(data: {
    workflowId: string;
    currentStep: number;
    stepStatus: 'running' | 'completed' | 'failed';
    stepResult?: any;
    stepError?: string;
  }): void {
    if (!this.progressData || this.progressData.workflowId !== data.workflowId) {
      return;
    }

    console.log('[WorkflowProgress] Updating progress:', data);

    // Update current step status
    if (data.currentStep < this.progressData.steps.length) {
      const step = this.progressData.steps[data.currentStep];
      step.status = data.stepStatus;
      
      if (data.stepStatus === 'completed') {
        step.endTime = Date.now();
        step.result = data.stepResult;
        
        // Start next step if available
        if (data.currentStep + 1 < this.progressData.steps.length) {
          this.progressData.steps[data.currentStep + 1].status = 'running';
          this.progressData.steps[data.currentStep + 1].startTime = Date.now();
        }
      } else if (data.stepStatus === 'failed') {
        step.endTime = Date.now();
        step.error = data.stepError;
        this.progressData.status = 'failed';
      } else if (data.stepStatus === 'running') {
        step.startTime = Date.now();
      }
    }

    this.progressData.currentStep = data.currentStep;
    this.render();
  }

  public completeWorkflow(data: { workflowId: string; result: any; }): void {
    if (!this.progressData || this.progressData.workflowId !== data.workflowId) {
      return;
    }

    console.log('[WorkflowProgress] Workflow completed:', data);

    this.progressData.status = 'completed';
    this.progressData.endTime = Date.now();
    
    // Mark all steps as completed
    this.progressData.steps.forEach(step => {
      if (step.status === 'running' || step.status === 'pending') {
        step.status = 'completed';
        step.endTime = Date.now();
      }
    });

    this.render();
    this.stopTimer();

    // Keep workflow progress visible for auditing - removed auto-fadeOut
    // setTimeout(() => {
    //   this.fadeOut();
    // }, 5000);
  }

  public handleWorkflowError(data: { workflowId: string; error: string; }): void {
    if (!this.progressData || this.progressData.workflowId !== data.workflowId) {
      return;
    }

    console.error('[WorkflowProgress] Workflow error:', data);

    this.progressData.status = 'failed';
    this.progressData.endTime = Date.now();
    this.render();
    this.stopTimer();
  }

  private render(): void {
    if (!this.progressData) {
      this.container.innerHTML = '';
      return;
    }
    
    // Use actual end time for completed workflows, otherwise use current time
    const endTime = this.progressData.endTime || Date.now();
    const elapsed = endTime - this.progressData.startTime;
    const completedSteps = this.progressData.steps.filter(s => s.status === 'completed').length;
    const progressPercentage = (completedSteps / this.progressData.totalSteps) * 100;
    
    const currentStepInfo = this.getCurrentStepInfo();

    this.container.innerHTML = `
      <div class="workflow-progress ${this.progressData.status}" data-workflow-id="${this.progressData.workflowId}">
        <div class="workflow-header" data-click-handler="toggle" tabindex="0" role="button" aria-expanded="${this.progressData.isExpanded}" aria-label="Toggle workflow details">
          <div class="workflow-header-top">
            <div class="workflow-main-info">
              <div class="workflow-status-icon">
                ${this.getStatusIcon(this.progressData.status)}
              </div>
              <div class="workflow-info">
                <div class="workflow-title">
                  ${this.getWorkflowTitle()}
                </div>
                <div class="workflow-subtitle">
                  ${currentStepInfo} • ${this.formatTime(elapsed)}
                </div>
              </div>
            </div>
            <div class="workflow-expand-icon ${this.progressData.isExpanded ? 'expanded' : ''}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.427 9.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 9H4.604a.25.25 0 00-.177.427z"/>
              </svg>
            </div>
          </div>
          <div class="workflow-progress-bar">
            <div class="progress-fill" style="width: ${progressPercentage}%"></div>
          </div>
        </div>
        
        ${this.progressData.isExpanded ? this.renderExpandedView() : ''}
      </div>
    `;
    
    // Set up click and keyboard handlers after rendering
    const headerElement = this.container.querySelector('.workflow-header');
    if (headerElement) {
      headerElement.addEventListener('click', () => this.toggleExpanded(this.progressData!.workflowId));
      headerElement.addEventListener('keydown', (e) => {
        const keyEvent = e as KeyboardEvent;
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault();
          this.toggleExpanded(this.progressData!.workflowId);
        }
      });
    }
  }

  private getWorkflowTitle(): string {
    if (!this.progressData) return '';
    
    const workflowType = this.progressData.type === 'workflow' ? 'Multi-Agent Workflow' : 'Single Agent';
    
    switch (this.progressData.status) {
      case 'running':
        return `${workflowType} Executing...`;
      case 'completed':
        return `${workflowType} Completed`;
      case 'failed':
        return `${workflowType} Failed`;
      default:
        return workflowType;
    }
  }

  private renderExpandedView(): string {
    if (!this.progressData) return '';

    const totalDuration = this.progressData.endTime 
      ? this.progressData.endTime - this.progressData.startTime 
      : Date.now() - this.progressData.startTime;

    return `
      <div class="workflow-details">
        <div class="workflow-summary">
          <div class="workflow-summary-item">
            <span class="summary-label">Total Duration:</span>
            <span class="summary-value">${this.formatTime(totalDuration)}</span>
          </div>
          <div class="workflow-summary-item">
            <span class="summary-label">Steps Completed:</span>
            <span class="summary-value">${this.progressData.steps.filter(s => s.status === 'completed').length}/${this.progressData.totalSteps}</span>
          </div>
        </div>
        <div class="workflow-steps">
          <div class="steps-header">Agent Execution Times</div>
          ${this.progressData.steps.map((step, index) => this.renderStep(step, index)).join('')}
        </div>
        <div class="workflow-metadata">
          <div class="workflow-id">Workflow ID: ${this.progressData.workflowId.split('-')[0]}...</div>
          <div class="workflow-timing">
            Started: ${new Date(this.progressData.startTime).toLocaleTimeString()}
            ${this.progressData.endTime ? ` • Completed: ${new Date(this.progressData.endTime).toLocaleTimeString()}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderStep(step: WorkflowStep, index: number): string {
    const duration = step.startTime && step.endTime ? step.endTime - step.startTime : 0;
    const isActive = step.status === 'running';

    return `
      <div class="workflow-step ${step.status} ${isActive ? 'active' : ''}">
        <div class="step-indicator">
          <div class="step-number">${index + 1}</div>
          <div class="step-status-icon">
            ${this.getStepStatusIcon(step.status)}
          </div>
        </div>
        <div class="step-content">
          <div class="step-header">
            <div class="step-title">${step.extensionName}</div>
            <div class="step-timing">
              ${this.getStepTimingText(step, duration)}
            </div>
          </div>
          <div class="step-details">
            <div class="step-extension-id">${step.extensionId}</div>
            ${step.error ? `<div class="step-error">Error: ${step.error}</div>` : ''}
          </div>
          ${isActive ? `<div class="step-progress-indicator">
            <div class="step-spinner"></div>
          </div>` : ''}
        </div>
      </div>
    `;
  }

  private getStepTimingText(step: WorkflowStep, duration: number): string {
    switch (step.status) {
      case 'running':
        if (step.startTime) {
          const elapsed = Date.now() - step.startTime;
          return `Running... ${this.formatTime(elapsed)}`;
        }
        return 'Running...';
      case 'completed':
        return `✓ ${this.formatTime(duration)}`;
      case 'failed':
        return '✗ Failed';
      case 'pending':
        return 'Pending';
      default:
        return '';
    }
  }

  private getCurrentStepInfo(): string {
    if (!this.progressData) return '';

    if (this.progressData.status === 'completed') {
      return `${this.progressData.totalSteps}/${this.progressData.totalSteps} steps completed`;
    } else if (this.progressData.status === 'failed') {
      return `Failed at step ${this.progressData.currentStep + 1}`;
    } else {
      const currentStep = this.progressData.steps[this.progressData.currentStep];
      return `Step ${this.progressData.currentStep + 1}/${this.progressData.totalSteps}: ${currentStep?.extensionName || 'Processing'}`;
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return `<div class="spinner"></div>`;
      case 'completed':
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>`;
      case 'failed':
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>`;
      default:
        return '';
    }
  }

  private getStepStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return `<div class="mini-spinner"></div>`;
      case 'completed':
        return `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>`;
      case 'failed':
        return `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
        </svg>`;
      case 'pending':
        return `<div class="pending-dot"></div>`;
      default:
        return '';
    }
  }

  private formatTime(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private startTimer(): void {
    this.updateInterval = window.setInterval(() => {
      if (this.progressData && this.progressData.status === 'running') {
        this.updateTimingElements();
      }
    }, 1000);
  }

  private updateTimingElements(): void {
    if (!this.progressData) return;

    // Update main workflow timing
    const elapsed = Date.now() - this.progressData.startTime;
    const subtitleElement = this.container.querySelector('.workflow-subtitle');
    if (subtitleElement) {
      const currentStepInfo = this.getCurrentStepInfo();
      subtitleElement.textContent = `${currentStepInfo} • ${this.formatTime(elapsed)}`;
    }

    // Update expanded view timing if visible
    if (this.progressData.isExpanded) {
      // Update total duration in summary
      const totalDurationElement = this.container.querySelector('.workflow-summary .summary-value');
      if (totalDurationElement) {
        totalDurationElement.textContent = this.formatTime(elapsed);
      }

      // Update running step timing
      this.progressData.steps.forEach((step, index) => {
        if (step.status === 'running' && step.startTime) {
          const stepDuration = Date.now() - step.startTime;
          const stepTimingElement = this.container.querySelector(`.workflow-step:nth-child(${index + 1}) .step-timing`);
          if (stepTimingElement) {
            stepTimingElement.textContent = `Running... ${this.formatTime(stepDuration)}`;
          }
        }
      });
    }
  }

  private stopTimer(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private fadeOut(): void {
    this.container.style.transition = 'opacity 1s ease-out';
    this.container.style.opacity = '0';
    
    setTimeout(() => {
      this.container.innerHTML = '';
      this.container.style.opacity = '1';
      this.container.style.transition = '';
    }, 1000);
  }

  public toggleExpanded(workflowId: string): void {
    if (this.progressData && this.progressData.workflowId === workflowId) {
      this.progressData.isExpanded = !this.progressData.isExpanded;
      this.render();
    }
  }

  public destroy(): void {
    this.stopTimer();
    this.container.innerHTML = '';
  }
}

// Global instance for onclick handlers
declare global {
  interface Window {
    workflowProgressInstance?: WorkflowProgressIndicator;
  }
}

export default WorkflowProgressIndicator;