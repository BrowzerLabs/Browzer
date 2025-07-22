import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface LLMLogEntry {
  timestamp: string;
  sessionId: string;
  provider: string;
  model?: string;
  instruction?: string;
  promptLength: number;
  prompt?: string; // Optional full prompt for debugging
  promptHash?: string; // Hash for deduplication
  responseLength: number;
  response?: string; // Optional full response for debugging
  responseHash?: string; // Hash for deduplication
  success: boolean;
  error?: string;
  executionTime: number;
  estimatedTokens?: {
    prompt: number;
    response: number;
    total: number;
  };
  estimatedCost?: {
    input: number;
    output: number;
    total: number;
  };
  context?: {
    currentUrl?: string;
    stepNumber?: number;
    previousActions?: string[];
  };
}

export class LLMLogger {
  private static instance: LLMLogger;
  private logFilePath: string;
  private sessionId: string;
  private promptHashes: Set<string> = new Set(); // Track duplicates

  // Rough token estimation (Claude: ~4 chars per token, GPT: ~4 chars per token)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Rough cost estimation (as of 2025)
  private estimateCost(provider: string, promptTokens: number, responseTokens: number): { input: number; output: number; total: number } {
    let inputRate = 0;
    let outputRate = 0;

    // Rough pricing per 1K tokens (update these as needed)
    if (provider === 'anthropic') {
      inputRate = 0.003;  // Claude Sonnet
      outputRate = 0.015;
    } else if (provider === 'openai') {
      inputRate = 0.0005; // GPT-3.5-turbo
      outputRate = 0.0015;
    }

    const inputCost = (promptTokens / 1000) * inputRate;
    const outputCost = (responseTokens / 1000) * outputRate;
    
    return {
      input: Math.round(inputCost * 10000) / 10000, // Round to 4 decimals
      output: Math.round(outputCost * 10000) / 10000,
      total: Math.round((inputCost + outputCost) * 10000) / 10000
    };
  }

  private generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
  }

  private constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create timestamped log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = path.join(logsDir, `llm-calls-${timestamp}.log`);
    this.sessionId = `session-${Date.now()}`;

    // Write header
    this.writeToFile('='.repeat(80));
    this.writeToFile(`LLM Request/Response Log - Session: ${this.sessionId}`);
    this.writeToFile(`Started: ${new Date().toISOString()}`);
    this.writeToFile('='.repeat(80));
  }

  static getInstance(): LLMLogger {
    if (!LLMLogger.instance) {
      LLMLogger.instance = new LLMLogger();
    }
    return LLMLogger.instance;
  }

  logRequest(entry: Partial<LLMLogEntry>): void {
    const promptTokens = entry.prompt ? this.estimateTokens(entry.prompt) : 0;
    const responseTokens = entry.response ? this.estimateTokens(entry.response) : 0;
    
    const promptHash = entry.prompt ? this.generateHash(entry.prompt) : '';
    const responseHash = entry.response ? this.generateHash(entry.response) : '';
    const isDuplicate = this.promptHashes.has(promptHash);
    
    if (promptHash) {
      this.promptHashes.add(promptHash);
    }

    const logEntry: LLMLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      provider: entry.provider || 'unknown',
      model: entry.model || 'default',
      instruction: entry.instruction || '',
      promptLength: entry.promptLength || 0,
      prompt: entry.prompt,
      promptHash: promptHash,
      responseLength: entry.responseLength || 0,
      response: entry.response,
      responseHash: responseHash,
      success: entry.success || false,
      error: entry.error,
      executionTime: entry.executionTime || 0,
      estimatedTokens: {
        prompt: promptTokens,
        response: responseTokens,
        total: promptTokens + responseTokens
      },
      estimatedCost: this.estimateCost(entry.provider || 'anthropic', promptTokens, responseTokens),
      context: entry.context
    };

    this.writeLogEntry(logEntry, isDuplicate);
  }

  private writeLogEntry(entry: LLMLogEntry, isDuplicate: boolean): void {
    const separator = '-'.repeat(60);
    
    this.writeToFile(`\n${separator}`);
    this.writeToFile(`TIMESTAMP: ${entry.timestamp}`);
    this.writeToFile(`PROVIDER: ${entry.provider} (${entry.model})`);
    this.writeToFile(`INSTRUCTION: ${entry.instruction}`);
    this.writeToFile(`SUCCESS: ${entry.success}`);
    this.writeToFile(`EXECUTION TIME: ${entry.executionTime}ms`);
    
    // Token and cost info
    if (entry.estimatedTokens) {
      this.writeToFile(`ESTIMATED TOKENS: ${entry.estimatedTokens.prompt} + ${entry.estimatedTokens.response} = ${entry.estimatedTokens.total}`);
    }
    if (entry.estimatedCost) {
      this.writeToFile(`ESTIMATED COST: $${entry.estimatedCost.input} + $${entry.estimatedCost.output} = $${entry.estimatedCost.total}`);
    }

    // Duplicate detection
    if (isDuplicate) {
      this.writeToFile(`⚠️  DUPLICATE PROMPT DETECTED (hash: ${entry.promptHash})`);
    }
    
    if (entry.context) {
      this.writeToFile(`CONTEXT:`);
      if (entry.context.currentUrl) {
        this.writeToFile(`  URL: ${entry.context.currentUrl}`);
      }
      if (entry.context.stepNumber !== undefined) {
        this.writeToFile(`  STEP: ${entry.context.stepNumber}`);
      }
      if (entry.context.previousActions && entry.context.previousActions.length > 0) {
        this.writeToFile(`  PREVIOUS ACTIONS: ${entry.context.previousActions.join(', ')}`);
      }
    }

    if (entry.error) {
      this.writeToFile(`ERROR: ${entry.error}`);
    }

    this.writeToFile(`PROMPT LENGTH: ${entry.promptLength} characters`);
    if (entry.prompt) {
      this.writeToFile(`PROMPT HASH: ${entry.promptHash}`);
      this.writeToFile(`FULL PROMPT:\n${entry.prompt}`);
    }

    this.writeToFile(`RESPONSE LENGTH: ${entry.responseLength} characters`);
    if (entry.response) {
      this.writeToFile(`RESPONSE HASH: ${entry.responseHash}`);
      this.writeToFile(`RESPONSE:\n${entry.response}`);
    }
    
    this.writeToFile(separator);
  }

  private writeToFile(content: string): void {
    try {
      fs.appendFileSync(this.logFilePath, content + '\n', 'utf8');
    } catch (error) {
      console.error('[LLMLogger] Failed to write to log file:', error);
    }
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }

  // Get session statistics
  getSessionStats(): { totalCalls: number; duplicates: number; avgTokens: number } {
    return {
      totalCalls: this.promptHashes.size,
      duplicates: 0, // Would need to track separately
      avgTokens: 0   // Would need to track separately
    };
  }
} 