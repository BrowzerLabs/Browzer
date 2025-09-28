import { McpClientManager } from '../McpClientManager';
import { ToolInstruction, ToolExecutionResult } from './types';

export class McpExecutor {
  constructor(private mcpManager: McpClientManager) {}

  async executeToolArray(
    toolInstructions: ToolInstruction[],
    progressCallback?: (toolName: string, status: 'running' | 'completed' | 'failed', error?: string) => void
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    console.log('[McpExecutor] Starting execution of', toolInstructions.length, 'tools');

    for (const { toolName, instruction } of toolInstructions) {
      const startTime = Date.now();

      console.log(`[McpExecutor] Executing ${toolName} with instruction:`, instruction);
      progressCallback?.(toolName, 'running');

      try {
        const response = await this.executeToolSimple(toolName, instruction);

        results.push({
          toolName,
          success: true,
          response,
          executionTime: Date.now() - startTime
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

  private async executeToolSimple(toolName: string, instruction: string): Promise<any> {
    try {
      console.log(`[McpExecutor] Simple execution of ${toolName} with instruction:`, instruction);

      // Get the MCP server from localStorage (there's only one)
      const enabledServers = this.mcpManager.loadConfigs().filter(s => s.enabled);

      if (enabledServers.length === 0) {
        throw new Error('No MCP servers are enabled');
      }

      // Use the first (and typically only) enabled server
      const server = enabledServers[0];
      const fullToolName = `${server.name}.${toolName}`;

      console.log(`[McpExecutor] Calling tool ${fullToolName} on server ${server.name}`);

      // Simple direct call with just the instructions parameter
      const response = await this.mcpManager.callTool(fullToolName, {
        instructions: instruction
      });

      console.log(`[McpExecutor] Tool ${fullToolName} response:`, response);
      return response;

    } catch (error) {
      console.error(`[McpExecutor] Simple execution failed for ${toolName}:`, error);
      throw error;
    }
  }
}