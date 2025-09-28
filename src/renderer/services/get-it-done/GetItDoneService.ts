import { McpClientManager } from '../McpClientManager';
import { ClaudeToolAnalyzer } from './ClaudeToolAnalyzer';
import { McpExecutor } from './McpExecutor';
import { GetItDoneUI } from './GetItDoneUI';
import {
  GetItDoneResult,
  ToolInstruction,
  GetItDoneStep,
  McpToolInfo
} from './types';

export class GetItDoneService {
  private mcpManager: McpClientManager;
  private claudeAnalyzer: ClaudeToolAnalyzer;
  private mcpExecutor: McpExecutor;
  private ui: GetItDoneUI;
  private steps: GetItDoneStep[] = [];

  constructor() {
    this.mcpManager = new McpClientManager();
    this.claudeAnalyzer = new ClaudeToolAnalyzer();
    this.mcpExecutor = new McpExecutor(this.mcpManager, this.claudeAnalyzer);
    this.ui = new GetItDoneUI();
  }

  async processQuery(userQuery: string): Promise<GetItDoneResult> {
    const startTime = Date.now();
    this.steps = [];

    try {
      console.log('[GetItDone] Starting query processing:', userQuery);

      // Step 1: Tool Discovery
      await this.addStep('discovering', '🔍 Discovering tools for your request...', 'running');
      const allTools = await this.getAllAvailableTools();
      console.log('[GetItDone] Available tools:', allTools.map(t => t.name));

      const requiredTools = await this.claudeAnalyzer.discoverRequiredTools(userQuery, allTools);
      console.log('[GetItDone] Required tools:', requiredTools);

      await this.updateLastStep(`✅ Found ${requiredTools.length} tools: ${requiredTools.join(', ')}`, 'completed');

      if (requiredTools.length === 0) {
        throw new Error('No suitable tools found for this query');
      }

      // Step 2: Instruction Mapping
      await this.addStep('mapping', '🎯 Mapping instructions to each tool...', 'running');
      const toolInstructions = await this.claudeAnalyzer.mapToolInstructions(userQuery, requiredTools);
      console.log('[GetItDone] Tool instructions:', toolInstructions);

      await this.updateLastStep('✅ Mapped instructions to all tools', 'completed');

      // Step 3: Tool Execution
      await this.addStep('executing', '⚡ Executing tools via MCP servers...', 'running');

      // Create tool schema map for enhanced execution
      const toolSchemaMap = new Map<string, McpToolInfo>();
      allTools.forEach(tool => {
        if (requiredTools.includes(tool.name)) {
          toolSchemaMap.set(tool.name, tool);
        }
      });

      console.log('[GetItDone] Tool schemas for execution:', Array.from(toolSchemaMap.keys()));

      const executionResults = await this.mcpExecutor.executeToolArray(
        toolInstructions,
        (toolName, status, error) => {
          this.ui.updateToolExecution(toolName, status, error);
        },
        toolSchemaMap
      );
      console.log('[GetItDone] Execution results:', executionResults);

      await this.updateLastStep('✅ All tools executed successfully', 'completed');

      // Step 4: Response Formatting
      await this.addStep('formatting', '📊 Merging responses and formatting result...', 'running');
      const finalResponse = await this.claudeAnalyzer.formatFinalResponse(executionResults, userQuery);
      console.log('[GetItDone] Final response:', finalResponse);

      await this.updateLastStep('✅ Result formatted and ready', 'completed');

      // Step 5: Display Final Result
      await this.ui.displayFinalResult(finalResponse);

      const result: GetItDoneResult = {
        success: true,
        steps: this.steps,
        toolResults: executionResults,
        finalFormattedResponse: finalResponse,
        executionTime: Date.now() - startTime,
        userQuery
      };

      console.log('[GetItDone] Process completed successfully:', result);
      return result;

    } catch (error) {
      console.error('[GetItDone] Process failed:', error);
      await this.handleError(error);

      return {
        success: false,
        steps: this.steps,
        toolResults: [],
        finalFormattedResponse: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime,
        userQuery
      };
    }
  }

  private async getAllAvailableTools(): Promise<McpToolInfo[]> {
    const servers = this.mcpManager.loadConfigs().filter(s => s.enabled);
    const allTools: McpToolInfo[] = [];

    console.log('[GetItDone] Checking servers:', servers.map(s => s.name));

    for (const server of servers) {
      try {
        console.log(`[GetItDone] Getting tools from ${server.name}...`);
        const tools = await this.mcpManager.getToolsForServer(server.name);

        const mcpTools: McpToolInfo[] = tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          serverName: server.name,
          inputSchema: tool.inputSchema
        }));

        allTools.push(...mcpTools);
        console.log(`[GetItDone] Got ${mcpTools.length} tools from ${server.name}`);
      } catch (error) {
        console.warn(`[GetItDone] Failed to get tools from ${server.name}:`, error);
      }
    }

    console.log('[GetItDone] Total tools available:', allTools.length);
    return allTools;
  }

  private async addStep(phase: GetItDoneStep['phase'], message: string, status: GetItDoneStep['status'], data?: any): Promise<void> {
    const step: GetItDoneStep = {
      phase,
      message,
      status,
      data,
      timestamp: Date.now()
    };

    this.steps.push(step);
    await this.ui.updateStep(step);
  }

  private async updateLastStep(message: string, status: GetItDoneStep['status'], data?: any): Promise<void> {
    if (this.steps.length > 0) {
      const lastStep = this.steps[this.steps.length - 1];
      lastStep.message = message;
      lastStep.status = status;
      lastStep.data = data;

      await this.ui.updateStep(lastStep);
    }
  }

  private async handleError(error: any): Promise<void> {
    await this.addStep('complete', `❌ Error: ${error instanceof Error ? error.message : String(error)}`, 'failed');
    await this.ui.handleError(error);
  }
}