/**
 * ToolRegistry - Central registry for all browser automation tools
 * 
 * Manages all available tools and provides MCP-compatible interface.
 * Acts as the bridge between LLM requests and tool execution.
 * 
 * Features:
 * - Tool registration and discovery
 * - Parameter validation
 * - Execution routing
 * - MCP format conversion
 * - Execution statistics and monitoring
 */

import { WebContentsView } from 'electron';
import { NavigationTools } from './NavigationTools';
import { InteractionTools } from './InteractionTools';
import { ObservationTools } from './ObservationTools';
import { 
  ToolDefinition, 
  ToolResult, 
  MCPTool, 
  MCPToolResult,
  ToolExecutionStats 
} from './types';

export class ToolRegistry {
  private navigationTools: NavigationTools;
  private interactionTools: InteractionTools;
  private observationTools: ObservationTools;
  
  private toolDefinitions: Map<string, ToolDefinition> = new Map();
  private executionStats: Map<string, ToolExecutionStats> = new Map();

  constructor(view: WebContentsView) {
    this.navigationTools = new NavigationTools(view);
    this.interactionTools = new InteractionTools(view);
    this.observationTools = new ObservationTools(view);
    
    this.registerTools();
  }

  /**
   * Register all tools
   */
  private registerTools(): void {
    // Register navigation tools
    for (const tool of NavigationTools.getToolDefinitions()) {
      this.toolDefinitions.set(tool.name, tool);
      this.initializeStats(tool.name);
    }

    // Register interaction tools
    for (const tool of InteractionTools.getToolDefinitions()) {
      this.toolDefinitions.set(tool.name, tool);
      this.initializeStats(tool.name);
    }

    // Register observation tools
    for (const tool of ObservationTools.getToolDefinitions()) {
      this.toolDefinitions.set(tool.name, tool);
      this.initializeStats(tool.name);
    }

    console.log(`✅ Registered ${this.toolDefinitions.size} tools`);
  }

  /**
   * Initialize execution statistics for a tool
   */
  private initializeStats(toolName: string): void {
    this.executionStats.set(toolName, {
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      errorsByCode: {}
    });
  }

  /**
   * Get all tool definitions
   */
  public getAllTools(): ToolDefinition[] {
    return Array.from(this.toolDefinitions.values());
  }

  /**
   * Get tools by category
   */
  public getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * Get tool definition by name
   */
  public getTool(name: string): ToolDefinition | undefined {
    return this.toolDefinitions.get(name);
  }

  /**
   * Execute a tool
   */
  public async executeTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    console.log(`🔧 Executing tool: ${toolName}`, parameters);

    // Validate tool exists
    if (!this.toolDefinitions.has(toolName)) {
      return {
        success: false,
        message: `Unknown tool: ${toolName}`,
        error: {
          code: 'INVALID_TOOL',
          message: `Tool '${toolName}' does not exist`,
          recoverable: false,
          suggestions: ['Check available tools using getAllTools()']
        }
      };
    }

    // Validate parameters
    const validationResult = this.validateParameters(toolName, parameters);
    if (!validationResult.valid) {
      return {
        success: false,
        message: `Invalid parameters for ${toolName}`,
        error: {
          code: 'INVALID_PARAMETERS',
          message: validationResult.error || 'Parameter validation failed',
          details: validationResult.details,
          recoverable: false
        }
      };
    }

    // Execute tool
    let result: ToolResult;
    try {
      result = await this.routeExecution(toolName, parameters);
    } catch (error) {
      result = {
        success: false,
        message: `Tool execution failed: ${(error as Error).message}`,
        error: {
          code: 'EXECUTION_ERROR',
          message: (error as Error).message,
          recoverable: false
        }
      };
    }

    // Update statistics
    const executionTime = Date.now() - startTime;
    this.updateStats(toolName, result, executionTime);

    console.log(
      result.success 
        ? `✅ Tool executed successfully in ${executionTime}ms` 
        : `❌ Tool execution failed: ${result.message}`
    );

    return result;
  }

  /**
   * Route execution to the appropriate tool
   */
  private async routeExecution(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<ToolResult> {
    // Navigation tools
    if (toolName === 'navigate_to_url') {
      return this.navigationTools.navigateToURL(parameters.url, {
        waitForLoad: parameters.wait_for_load,
        waitForNetworkIdle: parameters.wait_for_network_idle,
        timeout: parameters.timeout
      });
    }

    if (toolName === 'go_back') {
      return this.navigationTools.goBack();
    }

    if (toolName === 'go_forward') {
      return this.navigationTools.goForward();
    }

    if (toolName === 'reload_page') {
      return this.navigationTools.reloadPage({
        ignoreCache: parameters.ignore_cache
      });
    }

    // Interaction tools
    if (toolName === 'click_element') {
      return this.interactionTools.clickElement(
        {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        },
        {
          verify: parameters.verify,
          timeout: parameters.timeout
        }
      );
    }

    if (toolName === 'type_text') {
      return this.interactionTools.typeText(
        {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        },
        parameters.text,
        {
          clear: parameters.clear,
          submit: parameters.submit,
          delay: parameters.delay
        }
      );
    }

    if (toolName === 'press_key') {
      return this.interactionTools.pressKey(parameters.key);
    }

    if (toolName === 'select_option') {
      return this.interactionTools.selectOption(
        {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        },
        parameters.option_value
      );
    }

    if (toolName === 'check_checkbox') {
      return this.interactionTools.checkCheckbox(
        {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        },
        parameters.checked
      );
    }

    if (toolName === 'submit_form') {
      return this.interactionTools.submitForm({
        strategy: parameters.selector_strategy,
        value: parameters.selector_value
      });
    }

    // Observation tools
    if (toolName === 'get_page_info') {
      return this.observationTools.getPageInfo();
    }

    if (toolName === 'find_element') {
      return this.observationTools.findElement(parameters.description);
    }

    if (toolName === 'verify_element_exists') {
      return this.observationTools.verifyElementExists({
        strategy: parameters.selector_strategy,
        value: parameters.selector_value
      });
    }

    if (toolName === 'verify_text_present') {
      return this.observationTools.verifyTextPresent(
        parameters.text,
        parameters.selector_strategy ? {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        } : undefined
      );
    }

    if (toolName === 'get_element_text') {
      return this.observationTools.getElementText({
        strategy: parameters.selector_strategy,
        value: parameters.selector_value
      });
    }

    if (toolName === 'get_element_attribute') {
      return this.observationTools.getElementAttribute(
        {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        },
        parameters.attribute
      );
    }

    if (toolName === 'wait_for_element') {
      return this.observationTools.waitForElement(
        {
          strategy: parameters.selector_strategy,
          value: parameters.selector_value
        },
        parameters.timeout
      );
    }

    if (toolName === 'take_screenshot') {
      return this.observationTools.takeScreenshot(parameters.full_page);
    }

    // Should never reach here if tool exists
    throw new Error(`Execution routing not implemented for: ${toolName}`);
  }

  /**
   * Validate tool parameters
   */
  private validateParameters(
    toolName: string,
    parameters: Record<string, any>
  ): { valid: boolean; error?: string; details?: any } {
    const tool = this.toolDefinitions.get(toolName);
    if (!tool) {
      return { valid: false, error: 'Tool not found' };
    }

    // Check required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && !(paramName in parameters)) {
        return {
          valid: false,
          error: `Missing required parameter: ${paramName}`,
          details: { parameter: paramName }
        };
      }

      // Validate type if parameter is provided
      if (paramName in parameters) {
        const value = parameters[paramName];
        const expectedType = paramDef.type;

        if (!this.validateParameterType(value, expectedType)) {
          return {
            valid: false,
            error: `Invalid type for parameter '${paramName}': expected ${expectedType}, got ${typeof value}`,
            details: { parameter: paramName, expectedType, actualType: typeof value }
          };
        }

        // Validate enum values
        if (paramDef.enum && !paramDef.enum.includes(value)) {
          return {
            valid: false,
            error: `Invalid value for parameter '${paramName}': must be one of ${paramDef.enum.join(', ')}`,
            details: { parameter: paramName, allowedValues: paramDef.enum, providedValue: value }
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, expectedType: string): boolean {
    const actualType = typeof value;

    switch (expectedType) {
      case 'string':
        return actualType === 'string';
      case 'number':
        return actualType === 'number';
      case 'boolean':
        return actualType === 'boolean';
      case 'object':
        return actualType === 'object' && value !== null;
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Update execution statistics
   */
  private updateStats(
    toolName: string,
    result: ToolResult,
    executionTime: number
  ): void {
    const stats = this.executionStats.get(toolName);
    if (!stats) return;

    stats.totalExecutions++;
    
    if (result.success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
      
      // Track error codes
      if (result.error?.code) {
        stats.errorsByCode[result.error.code] = 
          (stats.errorsByCode[result.error.code] || 0) + 1;
      }
    }

    // Update average execution time
    stats.averageExecutionTime = 
      (stats.averageExecutionTime * (stats.totalExecutions - 1) + executionTime) / 
      stats.totalExecutions;
  }

  /**
   * Get execution statistics for a tool
   */
  public getToolStats(toolName: string): ToolExecutionStats | undefined {
    return this.executionStats.get(toolName);
  }

  /**
   * Get all execution statistics
   */
  public getAllStats(): Record<string, ToolExecutionStats> {
    const stats: Record<string, ToolExecutionStats> = {};
    for (const [name, stat] of this.executionStats) {
      stats[name] = stat;
    }
    return stats;
  }

  /**
   * Convert tools to MCP format
   */
  public getToolsAsMCP(): MCPTool[] {
    return this.getAllTools().map(tool => this.convertToMCPFormat(tool));
  }

  /**
   * Convert single tool to MCP format
   */
  private convertToMCPFormat(tool: ToolDefinition): MCPTool {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      properties[paramName] = {
        type: paramDef.type,
        description: paramDef.description,
        ...(paramDef.enum ? { enum: paramDef.enum } : {}),
        ...(paramDef.default !== undefined ? { default: paramDef.default } : {})
      };

      if (paramDef.required) {
        required.push(paramName);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {})
      }
    };
  }

  /**
   * Convert ToolResult to MCP format
   */
  public convertResultToMCP(result: ToolResult): MCPToolResult {
    if (result.success) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: result.message,
            data: result.data,
            metadata: result.metadata
          }, null, 2)
        }],
        isError: false
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: result.message,
            error: result.error
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

