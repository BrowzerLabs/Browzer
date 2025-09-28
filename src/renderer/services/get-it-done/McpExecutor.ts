import { McpClientManager } from '../McpClientManager';
import { ToolInstruction, ToolExecutionResult, McpToolInfo } from './types';

export class McpExecutor {
  constructor(
    private mcpManager: McpClientManager,
    private claudeAnalyzer?: any // Optional dependency for parameter enhancement
  ) {}

  async executeToolArray(
    toolInstructions: ToolInstruction[],
    progressCallback?: (toolName: string, status: 'running' | 'completed' | 'failed', error?: string) => void,
    toolSchemas?: Map<string, McpToolInfo> // Optional tool schemas for enhanced execution
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const executionContext: any[] = []; // Store all previous tool results for context

    console.log('[McpExecutor] Starting execution of', toolInstructions.length, 'tools');
    const isMultiTool = toolInstructions.length > 1;

    if (isMultiTool) {
      console.log('[McpExecutor] Multi-tool execution detected - enabling context chaining');
    }

    for (let i = 0; i < toolInstructions.length; i++) {
      const { toolName, instruction } = toolInstructions[i];
      const startTime = Date.now();

      console.log(`[McpExecutor] Executing ${toolName} with instruction:`, instruction);
      progressCallback?.(toolName, 'running');

      try {
        // Enhanced parameter extraction for multi-tool scenarios
        let enhancedParams: any = { instructions: instruction };

        if (isMultiTool && executionContext.length > 0 && this.claudeAnalyzer && toolSchemas?.has(toolName)) {
          try {
            console.log(`[McpExecutor] Attempting parameter enhancement for ${toolName} with context:`, executionContext);
            const toolSchema = toolSchemas.get(toolName);
            enhancedParams = await this.claudeAnalyzer.enhanceParametersFromContext(
              toolSchema,
              executionContext,
              instruction
            );
            console.log(`[McpExecutor] Enhanced parameters for ${toolName}:`, enhancedParams);
          } catch (enhanceError) {
            console.warn(`[McpExecutor] Parameter enhancement failed for ${toolName}, using fallback:`, enhanceError);
            // Fallback to original instruction-only approach
          }
        }

        const response = await this.executeToolWithParams(toolName, enhancedParams);

        const result = {
          toolName,
          success: true,
          response,
          executionTime: Date.now() - startTime
        };

        results.push(result);

        // Add result to execution context for future tools
        executionContext.push({
          toolName,
          result: response,
          timestamp: Date.now()
        });

        console.log(`[McpExecutor] ${toolName} completed successfully:`, response);
        progressCallback?.(toolName, 'completed');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push({
          toolName,
          success: false,
          response: null,
          error: errorMessage,
          executionTime: Date.now() - startTime
        });

        console.error(`[McpExecutor] ${toolName} failed:`, error);
        progressCallback?.(toolName, 'failed', errorMessage);
      }
    }

    console.log('[McpExecutor] All tools executed. Results:', results);
    return results;
  }

  private async executeToolWithParams(toolName: string, params: any): Promise<any> {
    try {
      console.log(`[McpExecutor] Executing ${toolName} with params:`, params);

      // Get the MCP server from localStorage (there's only one)
      const enabledServers = this.mcpManager.loadConfigs().filter(s => s.enabled);

      if (enabledServers.length === 0) {
        throw new Error('No MCP servers are enabled');
      }

      // Use the first (and typically only) enabled server
      const server = enabledServers[0];
      const fullToolName = `${server.name}.${toolName}`;

      console.log(`[McpExecutor] Calling tool ${fullToolName} on server ${server.name}`);

      // Call with enhanced or original parameters
      const response = await this.mcpManager.callTool(fullToolName, params);

      console.log(`[McpExecutor] Tool ${fullToolName} response:`, response);
      return response;

    } catch (error) {
      console.error(`[McpExecutor] Execution failed for ${toolName}:`, error);
      throw error;
    }
  }

  // Maintain backward compatibility for simple execution
  private async executeToolSimple(toolName: string, instruction: string): Promise<any> {
    return this.executeToolWithParams(toolName, { instructions: instruction });
  }
}