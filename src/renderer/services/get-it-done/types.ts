export interface ToolInstruction {
  toolName: string;
  instruction: string;
}

export interface GetItDoneStep {
  phase: 'discovering' | 'mapping' | 'executing' | 'formatting' | 'complete';
  message: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  data?: any;
  timestamp: number;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  response: any;
  error?: string;
  executionTime: number;
}

export interface GetItDoneResult {
  success: boolean;
  steps: GetItDoneStep[];
  toolResults: ToolExecutionResult[];
  finalFormattedResponse: string;
  executionTime: number;
  userQuery: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  serverName: string;
  inputSchema?: any;
}

export interface ClaudeAPIResponse {
  success: boolean;
  data?: any;
  error?: string;
}