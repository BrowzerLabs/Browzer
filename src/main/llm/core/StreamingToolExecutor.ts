import { EventEmitter } from 'events';
import { BrowserAutomationExecutor } from '@/main/automation/BrowserAutomationExecutor';
import { ExecutedStep } from './types';

interface QueuedTool {
  index: number;
  toolUseId: string;
  toolName: string;
  input: any;
  status: 'buffering' | 'ready' | 'executing' | 'completed' | 'error';
}

export class StreamingToolExecutor extends EventEmitter {
  private executor: BrowserAutomationExecutor;
  private toolQueue: Map<number, QueuedTool> = new Map();
  private nextExecutionIndex: number = 0;
  private isExecuting: boolean = false;
  private totalSteps: number = 0;

  constructor(executor: BrowserAutomationExecutor) {
    super();
    this.executor = executor;
  }

  /**
   * Handle tool_use_start event - creates a new tool in the queue
   */
  public handleToolStart(data: { index: number; tool_use_id: string; tool_name: string }): void {
    console.log(`🔧 [StreamExecutor] Tool started: ${data.tool_name} (index: ${data.index})`);
    
    this.toolQueue.set(data.index, {
      index: data.index,
      toolUseId: data.tool_use_id,
      toolName: data.tool_name,
      input: null,
      status: 'buffering'
    });
  }

  /**
   * Handle tool_input_delta event - buffers partial JSON input
   * Note: We don't need to manually parse JSON, backend sends complete input in tool_use_complete
   */
  public handleToolInputDelta(data: { index: number; partial_json: string }): void {
    // Just for logging/UI updates - actual input comes in tool_use_complete
    const tool = this.toolQueue.get(data.index);
    if (tool) {
      console.log(`📝 [StreamExecutor] Buffering input for ${tool.toolName}... partial json ${data.partial_json}`);
    }
  }

  /**
   * Handle tool_use_complete event - marks tool as ready and triggers execution
   */
  public handleToolComplete(data: { 
    index: number; 
    tool_use_id: string; 
    tool_name: string; 
    input: any 
  }): void {
    console.log(`✅ [StreamExecutor] Tool complete: ${data.tool_name} (index: ${data.index})`);
    
    const tool = this.toolQueue.get(data.index);
    if (tool) {
      tool.input = data.input;
      tool.status = 'ready';
      
      // Trigger execution check
      this.processQueue();
    } else {
      console.warn(`⚠️ [StreamExecutor] Tool ${data.index} not found in queue`);
    }
  }

  /**
   * Handle message_stop event - indicates stream is complete
   */
  public handleStreamComplete(data: { message?: any }): void {
    console.log(`🏁 [StreamExecutor] Stream complete, total tools: ${this.toolQueue.size}`);
    this.totalSteps = this.toolQueue.size;
    
    // Ensure all remaining tools are processed
    this.processQueue();
  }

  /**
   * Process the queue - executes tools in order as they become ready
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent execution
    if (this.isExecuting) {
      return;
    }

    this.isExecuting = true;

    try {
      while (true) {
        const tool = this.toolQueue.get(this.nextExecutionIndex);
        
        // No tool at this index yet, wait for more stream data
        if (!tool) {
          break;
        }

        // Tool not ready yet, wait for completion
        if (tool.status !== 'ready') {
          break;
        }

        // Execute the tool
        await this.executeTool(tool);
        
        // Move to next index
        this.nextExecutionIndex++;
      }
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Execute a single tool and emit progress events
   */
  private async executeTool(tool: QueuedTool): Promise<void> {
    tool.status = 'executing';
    
    const stepNumber = tool.index + 1;
    
    console.log(`⚡ [StreamExecutor] Executing: ${tool.toolName} (${stepNumber}/${this.totalSteps || '?'})`);
    
    // Emit step start event
    this.emit('step_start', {
      stepNumber,
      totalSteps: this.totalSteps,
      toolName: tool.toolName,
      toolUseId: tool.toolUseId,
      params: tool.input,
      status: 'running'
    });

    try {
      const startTime = Date.now();
      const result = await this.executor.executeTool(tool.toolName, tool.input);
      const duration = Date.now() - startTime;

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: tool.toolName,
        success: result.success,
        result,
        error: result.success ? undefined : (result.error?.message || 'Unknown error')
      };

      if (!result.success || result.error) {
        console.error(`❌ [StreamExecutor] Step ${stepNumber} failed: ${result.error?.message}`);
        tool.status = 'error';

        this.emit('step_error', {
          stepNumber,
          totalSteps: this.totalSteps,
          toolName: tool.toolName,
          toolUseId: tool.toolUseId,
          error: result.error,
          duration,
          status: 'error',
          executedStep
        });
      } else {
        console.log(`✅ [StreamExecutor] Step ${stepNumber} completed in ${duration}ms`);
        tool.status = 'completed';

        this.emit('step_complete', {
          stepNumber,
          totalSteps: this.totalSteps,
          toolName: tool.toolName,
          toolUseId: tool.toolUseId,
          result: result,
          duration,
          status: 'success',
          executedStep
        });
      }
    } catch (error: any) {
      console.error(`❌ [StreamExecutor] Step ${stepNumber} exception:`, error);
      tool.status = 'error';

      const executedStep: ExecutedStep = {
        stepNumber,
        toolName: tool.toolName,
        success: false,
        error: error.message
      };

      this.emit('step_error', {
        stepNumber,
        totalSteps: this.totalSteps,
        toolName: tool.toolName,
        toolUseId: tool.toolUseId,
        error: { message: error.message },
        duration: 0,
        status: 'error',
        executedStep
      });
    }
  }

  /**
   * Wait for all queued tools to complete execution
   */
  public async waitForCompletion(): Promise<void> {
    console.log(`⏳ [StreamExecutor] Waiting for completion...`);
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const allCompleted = Array.from(this.toolQueue.values()).every(
          tool => tool.status === 'completed' || tool.status === 'error'
        );

        if (allCompleted && this.toolQueue.size > 0) {
          clearInterval(checkInterval);
          console.log(`✅ [StreamExecutor] All tools completed`);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Get all executed steps in order
   */
  public getExecutedSteps(): ExecutedStep[] {
    const steps: ExecutedStep[] = [];
    
    for (let i = 0; i < this.nextExecutionIndex; i++) {
      const tool = this.toolQueue.get(i);
      if (tool) {
        // Steps are emitted via events, this is just for reference
        steps.push({
          stepNumber: i + 1,
          toolName: tool.toolName,
          success: tool.status === 'completed',
          error: tool.status === 'error' ? 'Tool execution failed' : undefined
        });
      }
    }
    
    return steps;
  }

  /**
   * Check if there are any failed tools
   */
  public hasErrors(): boolean {
    return Array.from(this.toolQueue.values()).some(tool => tool.status === 'error');
  }

  /**
   * Get the last error if any
   */
  public getLastError(): { tool: QueuedTool; stepNumber: number } | null {
    for (const tool of Array.from(this.toolQueue.values()).reverse()) {
      if (tool.status === 'error') {
        return { tool, stepNumber: tool.index + 1 };
      }
    }
    return null;
  }

  /**
   * Reset the executor for a new stream
   */
  public reset(): void {
    this.toolQueue.clear();
    this.nextExecutionIndex = 0;
    this.isExecuting = false;
    this.totalSteps = 0;
    console.log(`🔄 [StreamExecutor] Reset`);
  }

  /**
   * Get current execution stats
   */
  public getStats() {
    return {
      totalTools: this.toolQueue.size,
      executed: this.nextExecutionIndex,
      pending: this.toolQueue.size - this.nextExecutionIndex,
      isExecuting: this.isExecuting
    };
  }
}
