import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AgentParams, AgentResult } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';

export class AgentManager {
  private readonly agentLogFile: string;
  private readonly rendererLogFile: string;

  constructor() {
    this.agentLogFile = path.join(process.cwd(), 'agent-execution.log');
    this.rendererLogFile = path.join(process.cwd(), 'renderer_agent.log');
  }

  initialize(): void {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers(): void {
    // Handle agent execution
    ipcMain.handle(IPC_CHANNELS.EXECUTE_AGENT, async (event: IpcMainInvokeEvent, { agentPath, agentParams }: { agentPath: string; agentParams: AgentParams }) => {
      return this.executeAgent(event, agentPath, agentParams);
    });

    // Handle renderer logging
    ipcMain.on(IPC_CHANNELS.RENDERER_LOG, (event, message: string) => {
      this.logRendererEvent(message);
    });
  }

  private async executeAgent(event: IpcMainInvokeEvent, agentPath: string, agentParams: AgentParams): Promise<AgentResult> {
    console.log(`IPC: execute-agent received with path=${agentPath} params=`, agentParams);
    
    // Verify sender is still valid
    if (!event.sender || event.sender.isDestroyed()) {
      console.error('The sender webContents was destroyed');
      return { success: false, error: 'The sender webContents was destroyed' };
    }
    
    // Get and clean query
    const query = agentParams.query || '';
    const cleanedQuery = this.cleanQueryString(query);
    console.log(`Using cleaned query: ${cleanedQuery}`);
    
    // Log execution start
    this.logAgentEvent(`Executing: ${agentPath} with params: ${JSON.stringify(agentParams)}`);
    
    try {
      // Get Python path
      const pythonPath = this.getPythonPath();
      
      // Validate paths
      if (!fs.existsSync(pythonPath) && !this.isSystemPython(pythonPath)) {
        const fallbackPython = this.getFallbackPython();
        console.log(`Python not found at ${pythonPath}, falling back to: ${fallbackPython}`);
        this.logAgentEvent(`Python not found at ${pythonPath}, falling back to: ${fallbackPython}`);
      }
      
      if (!fs.existsSync(agentPath)) {
        const error = `Agent script not found at: ${agentPath}`;
        console.error(error);
        this.logAgentEvent(`ERROR: ${error}`);
        return { success: false, error };
      }
      
      // Prepare agent parameters
      const processedParams = this.prepareAgentParams(agentParams, cleanedQuery);
      
      // Execute the agent
      const result = await this.runPythonProcess(pythonPath, agentPath, processedParams);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception in execute-agent: ${errorMessage}`);
      this.logAgentEvent(`Exception in execute-agent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private cleanQueryString(query: string): string {
    // Extract search term from Google URLs
    if (query.includes('google.com/search')) {
      try {
        const urlObj = new URL(query);
        const searchQuery = urlObj.searchParams.get('q');
        if (searchQuery) {
          console.log(`Extracted search query from URL: ${searchQuery}`);
          return searchQuery;
        }
      } catch (err) {
        console.error('Error extracting search query:', err);
      }
    }
    
    // Truncate very long queries
    if (query.length > 500) {
      console.log(`Truncating long query: ${query.length} chars`);
      return query.substring(0, 500);
    }
    
    return query;
  }

  private getPythonPath(): string {
    if (os.platform() === 'win32') {
      return path.join(process.cwd(), 'agents/venv/Scripts/python.exe');
    } else {
      return path.join(process.cwd(), 'agents/venv/bin/python');
    }
  }

  private getFallbackPython(): string {
    return os.platform() === 'win32' ? 'python.exe' : 'python3';
  }

  private isSystemPython(pythonPath: string): boolean {
    return pythonPath === 'python.exe' || pythonPath === 'python3' || pythonPath === 'python';
  }

  private prepareAgentParams(agentParams: AgentParams, cleanedQuery: string): any {
    // Sanitize page content if present
    if (agentParams.pageContent) {
      const maxContentLength = agentParams.isQuestion ? 500000 : 100000;
      
      if (agentParams.pageContent.content && agentParams.pageContent.content.length > maxContentLength) {
        agentParams.pageContent.content = agentParams.pageContent.content.substring(0, maxContentLength) + 
          "... [content truncated due to length]";
        
        console.log(`Page content truncated to ${maxContentLength} characters`);
        this.logAgentEvent(`Content truncated to ${maxContentLength} characters`);
      }
    }
    
    // Prepare the parameter object
    if (agentParams.pageContent) {
      return {
        query: cleanedQuery,
        pageContent: agentParams.pageContent,
        isDirectPage: true,
        modelInfo: agentParams.modelInfo,
        conversationHistory: agentParams.conversationHistory || null
      };
    } else if (agentParams.urls && agentParams.urls.length > 0) {
      return {
        query: cleanedQuery,
        urls: agentParams.urls,
        modelInfo: agentParams.modelInfo,
        conversationHistory: agentParams.conversationHistory || null
      };
    } else {
      return {
        query: cleanedQuery,
        modelInfo: agentParams.modelInfo,
        conversationHistory: agentParams.conversationHistory || null
      };
    }
  }

  private async runPythonProcess(pythonPath: string, agentPath: string, params: any): Promise<AgentResult> {
    const pythonArgs = [agentPath, JSON.stringify(params)];
    
    console.log(`Starting Python process: ${pythonPath} ${pythonArgs.join(' ')}`);
    this.logAgentEvent(`Starting Python process: ${pythonPath} ${pythonArgs.join(' ')}`);
    
    return new Promise((resolve) => {
      const pythonProcess: ChildProcess = spawn(pythonPath, pythonArgs);
      let result = '';
      let error = '';

      pythonProcess.stdout?.on('data', (data) => {
        const dataStr = data.toString();
        result += dataStr;
        console.log(`Python stdout: ${dataStr}`);
        this.logAgentEvent(`Python stdout: ${dataStr}`);
      });

      pythonProcess.stderr?.on('data', (data) => {
        const dataStr = data.toString();
        error += dataStr;
        console.error(`Python stderr: ${dataStr}`);
        this.logAgentEvent(`Python stderr: ${dataStr}`);
      });

      // Set timeout
      const timeout = setTimeout(() => {
        if (!pythonProcess.killed) {
          pythonProcess.kill();
          error = 'Process timeout: Agent execution took too long and was terminated.';
          console.error(error);
          this.logAgentEvent(error);
        }
      }, 45000);

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        console.log(`Python process exited with code ${code}`);
        this.logAgentEvent(`Python process exited with code ${code}`);
        
        if (code !== 0) {
          console.error(`Error running agent: ${error}`);
          this.logAgentEvent(`Error running agent: ${error}`);
          resolve({ success: false, error: error || `Python process exited with code ${code}` });
        } else {
          try {
            console.log(`Parsing result: ${result}`);
            this.logAgentEvent(`Parsing result: ${result}`);
            const parsedResult = JSON.parse(result);
            resolve(parsedResult);
          } catch (e) {
            const parseError = `Failed to parse Python output: ${(e as Error).message}`;
            console.error(parseError);
            this.logAgentEvent(`${parseError} Result was: ${result}`);
            resolve({ success: false, error: parseError });
          }
        }
      });
      
      pythonProcess.on('error', (err) => {
        clearTimeout(timeout);
        const processError = `Process error: ${err.message}`;
        console.error(processError);
        this.logAgentEvent(processError);
        resolve({ success: false, error: processError });
      });
    });
  }

  private logAgentEvent(message: string): void {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(this.agentLogFile, `[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Failed to write agent log:', error);
    }
  }

  private logRendererEvent(message: string): void {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(this.rendererLogFile, `[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Failed to write renderer log:', error);
    }
  }
} 