export interface DoAgentConfig {
  maxSteps: number;
  stepTimeout: number;
  retryAttempts: number;
  defaultWaitTime: number;
  navigationTimeout: number;
  elementDetectionTimeout: number;
  llmProvider: 'anthropic' | 'openai';
  llmModel: string;
  maxTokens: number;
  enableRetryLogic: boolean;
  enableFallbackStrategies: boolean;
  enablePerformanceMonitoring: boolean;
  debugMode: boolean;
}

export const DEFAULT_CONFIG: DoAgentConfig = {
  maxSteps: 20,
  stepTimeout: 30000,
  retryAttempts: 3,
  defaultWaitTime: 2000,
  navigationTimeout: 10000,
  elementDetectionTimeout: 5000,
  llmProvider: 'anthropic',
  llmModel: 'claude-sonnet-4-20250514',
  maxTokens: 1000,
  enableRetryLogic: true,
  enableFallbackStrategies: true,
  enablePerformanceMonitoring: true,
  debugMode: false
};

export class DoAgentConfigManager {
  private config: DoAgentConfig;

  constructor(customConfig?: Partial<DoAgentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig };
  }

  getConfig(): DoAgentConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<DoAgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  getMaxSteps(): number {
    return this.config.maxSteps;
  }

  getStepTimeout(): number {
    return this.config.stepTimeout;
  }

  getRetryAttempts(): number {
    return this.config.retryAttempts;
  }

  getLLMProvider(): 'anthropic' | 'openai' {
    return this.config.llmProvider;
  }

  getLLMModel(): string {
    return this.config.llmModel;
  }

  getMaxTokens(): number {
    return this.config.maxTokens;
  }

  isRetryLogicEnabled(): boolean {
    return this.config.enableRetryLogic;
  }

  areFallbackStrategiesEnabled(): boolean {
    return this.config.enableFallbackStrategies;
  }

  isPerformanceMonitoringEnabled(): boolean {
    return this.config.enablePerformanceMonitoring;
  }

  isDebugMode(): boolean {
    return this.config.debugMode;
  }
}
