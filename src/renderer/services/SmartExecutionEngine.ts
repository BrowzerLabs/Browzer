import { DoAgent } from './DoAgent';
import { DoAgentConfigManager } from './DoAgentConfig';
import { PerformanceMonitor } from './PerformanceMonitor';

export interface DoTask {
  id: string;
  instruction: string;
  steps: any[];
  status: 'running' | 'completed' | 'failed';
}

export interface DoResult {
  success: boolean;
  steps: any[];
  extractedContent?: any;
  error?: string;
  executionTime: number;
}

export class SmartExecutionEngine {
  private config: DoAgentConfigManager;
  private performanceMonitor: PerformanceMonitor;

  constructor(private doAgent: DoAgent, config?: DoAgentConfigManager) {
    this.config = config || new DoAgentConfigManager();
    this.performanceMonitor = new PerformanceMonitor();
  }

  async execute(task: DoTask, instruction: string): Promise<DoResult> {
    const startTime = Date.now();
    const steps: any[] = [];
    let extractedContent: any = null;

    if (this.config.isPerformanceMonitoringEnabled()) {
      this.performanceMonitor.startTask();
    }

    try {
      for (let stepCount = 0; stepCount < this.config.getMaxSteps(); stepCount++) {
        const pageState = await this.doAgent.analyzePageState();
        const prompt = this.doAgent.buildPrompt(instruction, pageState, steps);
        
        const action = await this.doAgent.getNextActionFromLLM(instruction, pageState, steps);
        if (!action || !action.action) {
          throw new Error('Failed to get valid action from LLM');
        }
        
        if (action.action === 'complete') {
          task.status = 'completed';
          break;
        }

        const stepId = `step-${stepCount}`;
        if (this.config.isPerformanceMonitoringEnabled()) {
          this.performanceMonitor.startStep(stepId, action.action);
        }

        const stepResult = await this.executeStepWithRetry(action, stepCount);
        steps.push(stepResult);

        if (this.config.isPerformanceMonitoringEnabled()) {
          this.performanceMonitor.endStep(stepId, action.action, !stepResult.error);
        }

        if (stepResult.action === 'extract' && stepResult.result) {
          extractedContent = stepResult.result;
        }

        if (stepResult.error && this.isCriticalError(stepResult.error)) {
          throw new Error(`Critical error in step ${stepCount + 1}: ${stepResult.error}`);
        }

        await this.adaptiveWait(stepCount, stepResult);
      }

      if (task.status !== 'completed') {
        task.status = 'failed';
        throw new Error('Task did not complete within maximum steps');
      }

      if (this.config.isPerformanceMonitoringEnabled()) {
        this.performanceMonitor.endTask();
        this.performanceMonitor.logSummary();
      }

      return {
        success: true,
        steps,
        extractedContent,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      task.status = 'failed';
      
      if (this.config.isPerformanceMonitoringEnabled()) {
        this.performanceMonitor.endTask();
        this.performanceMonitor.logSummary();
      }

      return {
        success: false,
        steps,
        extractedContent,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executeStepWithRetry(action: any, stepIndex: number): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.getRetryAttempts(); attempt++) {
      try {
        const stepResult = await this.executeStepWithTimeout(action, stepIndex, attempt);
        return stepResult;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[SmartExecutionEngine] Step ${stepIndex + 1}, attempt ${attempt} failed:`, error);
        
        if (attempt < this.config.getRetryAttempts()) {
          await this.retryBackoff(attempt);
          
          if (action.action === 'click' || action.action === 'type') {
            await this.tryAlternativeStrategies(action);
          }
        }
      }
    }

    return {
      action: action.action,
      target: action.target,
      value: action.value,
      error: lastError?.message || 'Unknown error',
      timestamp: Date.now()
    };
  }

  private async executeStepWithTimeout(action: any, stepIndex: number, attempt: number): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Step execution timeout after ${this.config.getStepTimeout()}ms`));
      }, this.config.getStepTimeout());

      try {
        const result = await this.doAgent.executeStep(action);
        clearTimeout(timeout);
        resolve({
          action: action.action,
          target: action.target,
          value: action.value,
          result: result,
          timestamp: Date.now(),
          attempt
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private async tryAlternativeStrategies(action: any): Promise<void> {
    if (!action.target) return;

    const strategies = [
      () => this.scrollElementIntoView(action.target),
      () => this.waitForElementToBeReady(action.target),
      () => this.tryFuzzyElementMatching(action.target)
    ];

    for (const strategy of strategies) {
      try {
        await strategy();
        break;
      } catch (error) {
        console.warn('Alternative strategy failed:', error);
      }
    }
  }

  private async scrollElementIntoView(selector: string): Promise<void> {
    await this.doAgent.webview.executeJavaScript(`
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        return false;
      })();
    `);
  }

  private async waitForElementToBeReady(selector: string): Promise<void> {
    await this.doAgent.webview.executeJavaScript(`
      (function() {
        return new Promise((resolve) => {
          const checkElement = () => {
            const element = document.querySelector('${selector}');
            if (element && element.offsetParent !== null) {
              resolve(true);
            } else {
              setTimeout(checkElement, 100);
            }
          };
          checkElement();
        });
      })();
    `);
  }

  private async tryFuzzyElementMatching(selector: string): Promise<void> {
    await this.doAgent.webview.executeJavaScript(`
      (function() {
        const originalSelector = '${selector}';
        const elements = document.querySelectorAll('*');
        
        for (const element of elements) {
          if (element.textContent && element.textContent.includes(originalSelector)) {
            element.setAttribute('data-fuzzy-match', 'true');
            return true;
          }
        }
        return false;
      })();
    `);
  }

  private async retryBackoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async adaptiveWait(stepIndex: number, stepResult: any): Promise<void> {
    let waitTime = 1000;

    if (stepResult.action === 'navigate') {
      waitTime = 3000;
    } else if (stepResult.action === 'click' && stepResult.target?.includes('submit')) {
      waitTime = 2000;
    } else if (stepResult.error) {
      waitTime = 2000;
    }

    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  private isCriticalError(error: string): boolean {
    const criticalPatterns = [
      'page not found',
      'network error',
      'timeout',
      'access denied',
      'authentication required'
    ];

    return criticalPatterns.some(pattern => 
      error.toLowerCase().includes(pattern)
    );
  }
}
