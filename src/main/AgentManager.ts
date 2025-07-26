import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AgentParams, AgentResult, IPC_CHANNELS } from '../shared/types';

interface WorkflowProgressEvent {
  type: string;
  timestamp: number;
  data: any;
}

export class AgentManager {
  private readonly agentLogFile: string;
  private readonly rendererLogFile: string;
  private readonly workflowLogFile: string;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.agentLogFile = path.join(process.cwd(), 'agent-execution.log');
    this.rendererLogFile = path.join(process.cwd(), 'renderer_agent.log');
    this.workflowLogFile = path.join(process.cwd(), 'workflow-execution.log');
  }

  initialize(mainWindow?: BrowserWindow): void {
    this.mainWindow = mainWindow || null;
    this.setupIpcHandlers();
  }

  private setupIpcHandlers(): void {
    // Handle agent execution
    ipcMain.handle(IPC_CHANNELS.EXECUTE_AGENT, async (event: IpcMainInvokeEvent, { agentPath, agentParams }: { agentPath: string; agentParams: AgentParams }) => {
      return this.executeAgent(event, agentPath, agentParams);
    });

    // Handle workflow execution
    ipcMain.handle('execute-workflow', async (event: IpcMainInvokeEvent, { query, data }: { query: string; data: any }) => {
      return this.executeWorkflow(event, query, data);
    });

    // Handle renderer logging
    ipcMain.on(IPC_CHANNELS.RENDERER_LOG, (event, message: string) => {
      this.logRendererEvent(message);
    });
  }

  private async executeWorkflow(event: IpcMainInvokeEvent, query: string, data: any): Promise<AgentResult> {
    console.log(`IPC: execute-workflow received with query=${query}`);
    this.logWorkflowEvent(`Starting workflow execution for query: ${query}`);
    
    // Verify sender is still valid
    if (!event.sender || event.sender.isDestroyed()) {
      console.error('The sender webContents was destroyed');
      return { success: false, error: 'The sender webContents was destroyed' };
    }

    try {
      const pythonPath = this.getPythonPath();
      const routerPath = path.join(process.cwd(), 'extensions-framework/core/smart_extension_router.py');
      
      if (!fs.existsSync(routerPath)) {
        const error = `Smart router not found at: ${routerPath}`;
        console.error(error);
        this.logWorkflowEvent(`ERROR: ${error}`);
        return { success: false, error };
      }

      // Prepare workflow parameters
      const workflowParams = {
        query: query,
        pageContent: data.pageContent,
        browserApiKeys: data.browserApiKeys || {},
        selectedProvider: data.selectedProvider || 'anthropic',
        selectedModel: data.selectedModel || 'claude-3-7-sonnet-latest',
        isQuestion: data.isQuestion || false,
        conversationHistory: data.conversationHistory || []
      };

      // Execute the workflow with progress monitoring
      const result = await this.runWorkflowProcess(pythonPath, routerPath, workflowParams, event.sender);
      
      this.logWorkflowEvent(`Workflow completed with result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception in execute-workflow: ${errorMessage}`);
      this.logWorkflowEvent(`Exception in execute-workflow: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private async runWorkflowProcess(pythonPath: string, routerPath: string, params: any, sender: Electron.WebContents): Promise<AgentResult> {
    const extensionsDir = path.join(process.cwd(), 'extensions');
    const pythonArgs = [routerPath, extensionsDir, params.query];
    
    console.log(`Starting workflow process: ${pythonPath} ${pythonArgs.join(' ')}`);
    this.logWorkflowEvent(`Starting workflow process: ${pythonPath} ${pythonArgs.join(' ')}`);
    
    return new Promise((resolve) => {
      const pythonProcess: ChildProcess = spawn(pythonPath, pythonArgs, {
        env: {
          ...process.env,
          WORKFLOW_DATA: JSON.stringify(params)
        }
      });
      
      let result = '';
      let error = '';
      let workflowStarted = false;
      let stderrBuffer = ''; // Buffer for incomplete stderr lines

      pythonProcess.stdout?.on('data', (data) => {
        const dataStr = data.toString();
        result += dataStr;
        console.log(`Workflow stdout: ${dataStr}`);
        this.logWorkflowEvent(`Workflow stdout: ${dataStr}`);
      });

      pythonProcess.stderr?.on('data', (data) => {
        const dataStr = data.toString();
        
        // Add to buffer and process complete lines only
        stderrBuffer += dataStr;
        
        // Process complete lines (ending with \n)
        const lines = stderrBuffer.split('\n');
        
        // Keep the last line in buffer (might be incomplete)
        stderrBuffer = lines.pop() || '';
        
        // Process complete lines
        for (const line of lines) {
          if (line.includes('WORKFLOW_PROGRESS:')) {
            try {
              // Extract just the JSON part after WORKFLOW_PROGRESS:
              const progressStart = line.indexOf('WORKFLOW_PROGRESS:') + 'WORKFLOW_PROGRESS:'.length;
              const progressLine = line.substring(progressStart).trim();
              
              // Only try to parse if we have actual JSON content
              if (progressLine && progressLine.startsWith('{')) {
                const progressEvent: WorkflowProgressEvent = JSON.parse(progressLine);
                
                console.log(`Workflow progress event: ${progressEvent.type}`, progressEvent.data);
                this.logWorkflowEvent(`Progress event: ${progressEvent.type} - ${JSON.stringify(progressEvent.data)}`);
                
                // Send progress event to renderer
                this.sendWorkflowProgressToRenderer(progressEvent, sender);
                
                if (progressEvent.type === 'workflow_start') {
                  workflowStarted = true;
                }
              }
            } catch (e) {
              console.error('Failed to parse workflow progress event:', e);
              this.logWorkflowEvent(`Failed to parse progress event: ${e} - Line was: ${line}`);
            }
          } else if (line.trim()) {
            // Only log non-empty lines as stderr
            error += line + '\n';
            console.error(`Workflow stderr: ${line}`);
            this.logWorkflowEvent(`Workflow stderr: ${line}`);
          }
        }
      });

      // Set timeout
      const timeout = setTimeout(() => {
        if (!pythonProcess.killed) {
          pythonProcess.kill();
          error = 'Workflow timeout: Execution took too long and was terminated.';
          console.error(error);
          this.logWorkflowEvent(error);
          
          // Send timeout event to renderer if workflow was started
          if (workflowStarted && sender && !sender.isDestroyed()) {
            sender.send('workflow-error', { error: 'Workflow execution timed out' });
          }
        }
      }, 120000); // 2 minute timeout for workflows

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        // Process any remaining data in stderr buffer
        if (stderrBuffer.trim()) {
          if (stderrBuffer.includes('WORKFLOW_PROGRESS:')) {
            try {
              const progressStart = stderrBuffer.indexOf('WORKFLOW_PROGRESS:') + 'WORKFLOW_PROGRESS:'.length;
              const progressLine = stderrBuffer.substring(progressStart).trim();
              
              if (progressLine && progressLine.startsWith('{')) {
                const progressEvent: WorkflowProgressEvent = JSON.parse(progressLine);
                
                console.log(`Final workflow progress event: ${progressEvent.type}`, progressEvent.data);
                this.logWorkflowEvent(`Final progress event: ${progressEvent.type} - ${JSON.stringify(progressEvent.data)}`);
                
                this.sendWorkflowProgressToRenderer(progressEvent, sender);
              }
            } catch (e) {
              console.error('Failed to parse final workflow progress event:', e);
              this.logWorkflowEvent(`Failed to parse final progress event: ${e} - Buffer was: ${stderrBuffer}`);
            }
          } else {
            error += stderrBuffer + '\n';
            console.error(`Final workflow stderr: ${stderrBuffer}`);
            this.logWorkflowEvent(`Final workflow stderr: ${stderrBuffer}`);
          }
        }
        
        console.log(`Workflow process exited with code ${code}`);
        this.logWorkflowEvent(`Workflow process exited with code ${code}`);
        
        if (code !== 0) {
          console.error(`Error running workflow: ${error}`);
          this.logWorkflowEvent(`Error running workflow: ${error}`);
          
          // Send error event to renderer if workflow was started
          if (workflowStarted && sender && !sender.isDestroyed()) {
            sender.send('workflow-error', { error: error || `Workflow process exited with code ${code}` });
          }
          
          resolve({ success: false, error: error || `Workflow process exited with code ${code}` });
        } else {
          try {
            console.log(`Parsing workflow result: ${result}`);
            this.logWorkflowEvent(`Parsing workflow result: ${result}`);
            const parsedResult = JSON.parse(result);
            
            // ALWAYS send workflow completion event for successful workflows
            if (sender && !sender.isDestroyed()) {
              console.log(`Sending workflow-complete event for result:`, parsedResult);
              this.logWorkflowEvent(`Sending workflow-complete event for result: ${JSON.stringify(parsedResult)}`);
              
              sender.send('workflow-complete', { 
                workflow_id: parsedResult.workflow_info?.workflow_id || `workflow-${Date.now()}`,
                result: parsedResult 
              });
            }
            
            resolve(parsedResult);
          } catch (e) {
            const parseError = `Failed to parse workflow output: ${(e as Error).message}`;
            console.error(parseError);
            this.logWorkflowEvent(`${parseError} Result was: ${result}`);
            
            if (workflowStarted && sender && !sender.isDestroyed()) {
              sender.send('workflow-error', { error: parseError });
            }
            
            resolve({ success: false, error: parseError });
          }
        }
      });
      
      pythonProcess.on('error', (err) => {
        clearTimeout(timeout);
        const processError = `Workflow process error: ${err.message}`;
        console.error(processError);
        this.logWorkflowEvent(processError);
        
        if (workflowStarted && sender && !sender.isDestroyed()) {
          sender.send('workflow-error', { error: processError });
        }
        
        resolve({ success: false, error: processError });
      });
    });
  }

  private sendWorkflowProgressToRenderer(progressEvent: WorkflowProgressEvent, sender: Electron.WebContents): void {
    if (!sender || sender.isDestroyed()) {
      return;
    }

    try {
      // Send all progress events through workflow-progress channel for context isolation compatibility
      // The renderer will handle different types based on progressEvent.type
      if (progressEvent.type === 'workflow_complete') {
        // Send completion events through dedicated channel
        sender.send('workflow-complete', progressEvent.data);
      } else if (progressEvent.type === 'workflow_error') {
        // Send error events through dedicated channel  
        sender.send('workflow-error', progressEvent.data);
      } else {
        // Send all other progress events (workflow_start, step_start, step_complete) through progress channel
        // Include the type in the data so renderer can differentiate
        const progressData = {
          ...progressEvent.data,
          type: progressEvent.type
        };
        sender.send('workflow-progress', progressData);
      }
    } catch (error) {
      console.error('Failed to send workflow progress to renderer:', error);
      this.logWorkflowEvent(`Failed to send progress event: ${error}`);
    }
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
      
      // Execute the agent with completion notifications
      const result = await this.runPythonProcessWithNotifications(pythonPath, agentPath, processedParams, event.sender);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Exception in execute-agent: ${errorMessage}`);
      this.logAgentEvent(`Exception in execute-agent: ${errorMessage}`);
      
      // Send error event to frontend
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('workflow-error', { error: errorMessage });
      }
      
      return { success: false, error: errorMessage };
    }
  }

  private async runPythonProcessWithNotifications(pythonPath: string, agentPath: string, params: any, sender: Electron.WebContents): Promise<AgentResult> {
    const pythonArgs = [agentPath, JSON.stringify(params)];
    
    console.log(`Starting Python process: ${pythonPath} ${pythonArgs.join(' ')}`);
    this.logAgentEvent(`Starting Python process: ${pythonPath} ${pythonArgs.join(' ')}`);
    
    // Generate workflow ID once and reuse it
    const agentName = path.basename(agentPath, '.py');
    const workflowId = `single-agent-${Date.now()}`;
    
    // Send agent start notification
    if (sender && !sender.isDestroyed()) {
      // Send workflow start event for single agent
      sender.send('workflow-start', {
        workflow_id: workflowId,
        agents: [agentName],
        total_steps: 1
      });
      
      // Send step start event
      sender.send('workflow-step-start', {
        workflow_id: workflowId,
        step_number: 1,
        agent_name: agentName,
        step_type: 'single_agent'
      });
    }
    
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
          
          // Send timeout error to frontend
          if (sender && !sender.isDestroyed()) {
            sender.send('workflow-error', { 
              workflow_id: workflowId,
              error: 'Agent execution timed out' 
            });
          }
        }
      }, 45000);

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        console.log(`Python process exited with code ${code}`);
        this.logAgentEvent(`Python process exited with code ${code}`);
        
        if (code !== 0) {
          console.error(`Error running agent: ${error}`);
          this.logAgentEvent(`Error running agent: ${error}`);
          
          // Send error to frontend
          if (sender && !sender.isDestroyed()) {
            sender.send('workflow-error', { 
              workflow_id: workflowId,
              error: error || `Python process exited with code ${code}` 
            });
          }
          
          resolve({ success: false, error: error || `Python process exited with code ${code}` });
        } else {
          try {
            console.log(`Parsing result: ${result}`);
            this.logAgentEvent(`Parsing result: ${result}`);
            const parsedResult = JSON.parse(result);
            
            // Send completion events to frontend with consistent workflow ID
            if (sender && !sender.isDestroyed()) {
              console.log(`Sending completion events for workflow ID: ${workflowId}`);
              
              // Send step complete event
              sender.send('workflow-step-complete', {
                workflow_id: workflowId,
                step_number: 1,
                agent_name: agentName,
                step_type: 'single_agent',
                result: parsedResult
              });
              
              // Send workflow complete event
              sender.send('workflow-complete', {
                workflow_id: workflowId,
                result: parsedResult
              });
            }
            
            resolve(parsedResult);
          } catch (e) {
            const parseError = `Failed to parse Python output: ${(e as Error).message}`;
            console.error(parseError);
            this.logAgentEvent(`${parseError} Result was: ${result}`);
            
            // Send parse error to frontend
            if (sender && !sender.isDestroyed()) {
              sender.send('workflow-error', { 
                workflow_id: workflowId,
                error: parseError 
              });
            }
            
            resolve({ success: false, error: parseError });
          }
        }
      });
      
      pythonProcess.on('error', (err) => {
        clearTimeout(timeout);
        const processError = `Process error: ${err.message}`;
        console.error(processError);
        this.logAgentEvent(processError);
        
        // Send process error to frontend
        if (sender && !sender.isDestroyed()) {
          sender.send('workflow-error', { 
            workflow_id: workflowId,
            error: processError 
          });
        }
        
        resolve({ success: false, error: processError });
      });
    });
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

  private logWorkflowEvent(message: string): void {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(this.workflowLogFile, `[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Failed to write workflow log:', error);
    }
  }
} 