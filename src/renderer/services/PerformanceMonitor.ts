export interface PerformanceMetrics {
  stepExecutionTimes: Record<string, number[]>;
  totalExecutionTime: number;
  successRate: number;
  errorRate: number;
  retryRate: number;
  averageStepTime: number;
  memoryUsage?: number;
  pageLoadTimes: number[];
  llmCallTimes: number[];
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private startTime: number = 0;
  private stepStartTimes: Map<string, number> = new Map();

  constructor() {
    this.metrics = {
      stepExecutionTimes: {},
      totalExecutionTime: 0,
      successRate: 0,
      errorRate: 0,
      retryRate: 0,
      averageStepTime: 0,
      pageLoadTimes: [],
      llmCallTimes: []
    };
  }

  startTask(): void {
    this.startTime = Date.now();
    this.resetMetrics();
  }

  endTask(): void {
    this.metrics.totalExecutionTime = Date.now() - this.startTime;
    this.calculateAverages();
  }

  startStep(stepId: string, action: string): void {
    this.stepStartTimes.set(stepId, Date.now());
    if (!this.metrics.stepExecutionTimes[action]) {
      this.metrics.stepExecutionTimes[action] = [];
    }
  }

  endStep(stepId: string, action: string, success: boolean): void {
    const startTime = this.stepStartTimes.get(stepId);
    if (startTime) {
      const executionTime = Date.now() - startTime;
      this.metrics.stepExecutionTimes[action].push(executionTime);
      this.stepStartTimes.delete(stepId);
    }
  }

  recordPageLoad(loadTime: number): void {
    this.metrics.pageLoadTimes.push(loadTime);
  }

  recordLLMCall(callTime: number): void {
    this.metrics.llmCallTimes.push(callTime);
  }

  recordMemoryUsage(): void {
    if ((performance as any).memory) {
      this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getAverageStepTime(action?: string): number {
    if (action && this.metrics.stepExecutionTimes[action]) {
      const times = this.metrics.stepExecutionTimes[action];
      return times.reduce((sum, time) => sum + time, 0) / times.length;
    }
    
    const allTimes = Object.values(this.metrics.stepExecutionTimes).flat();
    if (allTimes.length === 0) return 0;
    
    return allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length;
  }

  getSuccessRate(): number {
    return this.metrics.successRate;
  }

  private resetMetrics(): void {
    this.metrics = {
      stepExecutionTimes: {},
      totalExecutionTime: 0,
      successRate: 0,
      errorRate: 0,
      retryRate: 0,
      averageStepTime: 0,
      pageLoadTimes: [],
      llmCallTimes: []
    };
    this.stepStartTimes.clear();
  }

  private calculateAverages(): void {
    this.metrics.averageStepTime = this.getAverageStepTime();
    
    if (this.metrics.pageLoadTimes.length > 0) {
      const avgPageLoad = this.metrics.pageLoadTimes.reduce((sum, time) => sum + time, 0) / this.metrics.pageLoadTimes.length;
      console.log(`[PerformanceMonitor] Average page load time: ${avgPageLoad}ms`);
    }
    
    if (this.metrics.llmCallTimes.length > 0) {
      const avgLLMCall = this.metrics.llmCallTimes.reduce((sum, time) => sum + time, 0) / this.metrics.llmCallTimes.length;
      console.log(`[PerformanceMonitor] Average LLM call time: ${avgLLMCall}ms`);
    }
  }

  logSummary(): void {
    console.log('[PerformanceMonitor] Task Summary:', {
      totalTime: this.metrics.totalExecutionTime,
      averageStepTime: this.metrics.averageStepTime,
      stepBreakdown: Object.entries(this.metrics.stepExecutionTimes).map(([action, times]) => ({
        action,
        count: times.length,
        average: times.reduce((sum, time) => sum + time, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times)
      }))
    });
  }
}
