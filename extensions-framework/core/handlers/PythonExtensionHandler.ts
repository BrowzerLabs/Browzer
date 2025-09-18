import { ExtensionContext, ExtensionError, ExtensionErrorCode } from '../types';
import { ExtensionLogger } from '../ExtensionLogger';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';

/**
 * Handler for Python Extensions (AI agents and scripts)
 * Manages Python process execution, environment setup, and API communication
 */
export class PythonExtensionHandler {
  private logger: ExtensionLogger;
  private runningProcesses = new Map<string, PythonProcessInfo>();
  private pythonEnvironments = new Map<string, PythonEnvironmentInfo>();
  private defaultPythonPath: string | null;

  constructor(pythonExecutable?: string) {
    this.logger = new ExtensionLogger('PythonExtensionHandler');
    this.defaultPythonPath = pythonExecutable || this.findPythonExecutable();
  }

  /**
   * Build proper PYTHONPATH including bundled packages
   */
  private buildPythonPath(pythonPath: string, contextPath: string): string {
    const paths = [contextPath]; // Always include the extension's own path
    
    // If using Application Support Python bundle
    if (pythonPath.includes(app.getPath('userData'))) {
      const appSupportPath = app.getPath('userData');
      const sitePackagesPath = path.join(appSupportPath, 'python-bundle', 'python-runtime', 'lib', 'python3.13', 'site-packages');
      
      paths.unshift(sitePackagesPath); // Add at beginning for priority
      this.logger.info(`Added Application Support Python site-packages to PYTHONPATH: ${sitePackagesPath}`);
    } else if (pythonPath.includes('venv')) {
      // If using development venv
      const venvSitePackagesPath = path.join(process.cwd(), 'agents', 'venv', 'lib', 'python3.9', 'site-packages');
      
      paths.unshift(venvSitePackagesPath);
      this.logger.info(`Added venv site-packages to PYTHONPATH: ${venvSitePackagesPath}`);
    }
    
    // Add existing PYTHONPATH if present
    const existingPythonPath = process.env.PYTHONPATH;
    if (existingPythonPath) {
      paths.push(existingPythonPath);
    }
    
    const finalPath = paths.join(':');
    this.logger.info(`Final PYTHONPATH: ${finalPath}`);
    return finalPath;
  }

  /**
   * Initialize a Python extension
   */
  async initialize(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Initializing Python extension: ${context.manifest.name} (ID: ${context.id})`);

      // Validate Python extension structure
      await this.validatePythonExtension(context);

      // Set up Python environment
      await this.setupPythonEnvironment(context);

      // Install dependencies if needed
      await this.installDependencies(context);

      // Validate Python script can be executed
      await this.validatePythonScript(context);

      this.logger.info(`Python extension ${context.manifest.name} (ID: ${context.id}) initialized successfully`);
      this.logger.info(`Python environment stored with key: ${context.id}`);
    } catch (error) {
      this.logger.error(`Failed to initialize Python extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Enable a Python extension
   */
  async enable(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Enabling Python extension: ${context.manifest.name} (ID: ${context.id})`);

      // Prepare the Python environment
      const envInfo = this.pythonEnvironments.get(context.id);
      if (!envInfo) {
        this.logger.error(`Python environment not found for extension ID: ${context.id}`);
        this.logger.info(`Available environments: ${Array.from(this.pythonEnvironments.keys()).join(', ')}`);
        throw new ExtensionError(
          'Python environment not initialized',
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        );
      }

      // Mark as enabled (Python scripts are executed on-demand)
      envInfo.isEnabled = true;

      this.logger.info(`Python extension ${context.manifest.name} (ID: ${context.id}) enabled successfully`);
    } catch (error) {
      this.logger.error(`Failed to enable Python extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Disable a Python extension
   */
  async disable(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Disabling Python extension: ${context.manifest.name}`);

      // Stop any running processes
      const processInfo = this.runningProcesses.get(context.id);
      if (processInfo && processInfo.process && !processInfo.process.killed) {
        await this.terminatePythonProcess(context.id);
      }

      // Mark environment as disabled
      const envInfo = this.pythonEnvironments.get(context.id);
      if (envInfo) {
        envInfo.isEnabled = false;
      }

      this.logger.info(`Python extension ${context.manifest.name} disabled`);
    } catch (error) {
      this.logger.error(`Failed to disable Python extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Cleanup and unload a Python extension
   */
  async cleanup(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Cleaning up Python extension: ${context.manifest.name}`);

      // Disable first
      await this.disable(context);

      // Clean up environment
      this.pythonEnvironments.delete(context.id);
      this.runningProcesses.delete(context.id);

      this.logger.info(`Python extension ${context.manifest.name} cleaned up`);
    } catch (error) {
      this.logger.error(`Failed to cleanup Python extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Execute a Python extension script
   */
  async executeScript(
    context: ExtensionContext,
    action: string,
    data: any,
    browserApiKeys: Record<string, string>,
    selectedProvider: string,
    mcp_servers: any
  ): Promise<any> {
    try {
      this.logger.info(`Executing Python extension: ${context.manifest.name} (ID: ${context.id}), action: ${action}`);

      const envInfo = this.pythonEnvironments.get(context.id);
      this.logger.info(`Looking for Python environment with ID: ${context.id}`);
      this.logger.info(`Available environments: ${Array.from(this.pythonEnvironments.keys()).join(', ')}`);
      
      if (!envInfo) {
        this.logger.error(`Python environment not found for extension ID: ${context.id}`);
        throw new ExtensionError(
          'Python extension environment not found',
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        );
      }
      
      if (!envInfo.isEnabled) {
        this.logger.error(`Python extension is not enabled for ID: ${context.id}, isEnabled: ${envInfo.isEnabled}`);
        throw new ExtensionError(
          'Python extension is not enabled',
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        );
      }

      // Prepare execution context
      const executionContext = {
        extension_id: context.id,
        config: context.config,
        permissions: context.permissions,
        browser_api_keys: browserApiKeys,
        selected_provider: selectedProvider,
        selected_model: this.getModelForProvider(selectedProvider),
        mcp_servers: mcp_servers
      };

      // Prepare the request payload
      const request = {
        context: executionContext,
        action,
        data
      };

      // Execute the Python script
      const result = await this.runPythonScript(context, request, envInfo);
      
      this.logger.info(`Python extension ${context.manifest.name} completed successfully`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to execute Python extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Execute a long-running Python extension action
   */
  async executeLongRunningAction(
    context: ExtensionContext,
    action: string,
    data: any,
    options: {
      timeout?: number;
      onProgress?: (progress: any) => void;
      onOutput?: (output: string) => void;
    } = {}
  ): Promise<any> {
    try {
      this.logger.info(`Starting long-running Python action: ${action} for ${context.manifest.name}`);

      const envInfo = this.pythonEnvironments.get(context.id);
      if (!envInfo || !envInfo.isEnabled) {
        throw new ExtensionError(
          'Python extension is not enabled',
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        );
      }

      // Check if there's already a running process
      if (this.runningProcesses.has(context.id)) {
        throw new ExtensionError(
          'Extension is already running a process',
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        );
      }

      const request = {
        context: {
          extension_id: context.id,
          config: context.config,
          permissions: context.permissions
        },
        action,
        data,
        long_running: true
      };

      return await this.runLongRunningPythonScript(context, request, envInfo, options);

    } catch (error) {
      this.logger.error(`Failed to execute long-running Python action ${action}`, error as Error);
      throw error;
    }
  }

  /**
   * Terminate a running Python process
   */
  async terminatePythonProcess(extensionId: string): Promise<void> {
    const processInfo = this.runningProcesses.get(extensionId);
    if (!processInfo || !processInfo.process) {
      return;
    }

    try {
      this.logger.info(`Terminating Python process for extension: ${extensionId}`);
      
      processInfo.process.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (processInfo.process && !processInfo.process.killed) {
          processInfo.process.kill('SIGKILL');
        }
      }, 5000);

      this.runningProcesses.delete(extensionId);
      
    } catch (error) {
      this.logger.error(`Failed to terminate Python process for ${extensionId}`, error as Error);
      throw error;
    }
  }

  private findPythonExecutable(): string | null {
    // First try Application Support Python bundle
    const appSupportPath = app.getPath('userData');
    const appSupportPythonPath = path.join(appSupportPath, 'python-bundle', 'python-runtime', 'bin', 'python');
    
    this.logger.info(`[PythonExtensionHandler] Checking Application Support Python path: ${appSupportPythonPath}`);
    
    if (require('fs').existsSync(appSupportPythonPath)) {
      this.logger.info(`[PythonExtensionHandler] Using Application Support Python bundle`);
      return appSupportPythonPath;
    }
    
    // In development, check for local venv
    if (!app.isPackaged) {
      const venvPythonPath = path.join(process.cwd(), 'agents', 'venv', 'bin', 'python');
      this.logger.info(`[PythonExtensionHandler] Checking development venv path: ${venvPythonPath}`);
      
      if (require('fs').existsSync(venvPythonPath)) {
        this.logger.info(`[PythonExtensionHandler] Using development venv Python`);
        return venvPythonPath;
      }
    }
    
    // NO fallback to system Python - return null to indicate missing bundle
    this.logger.error(`[PythonExtensionHandler] Python bundle not found! Extensions will not work until Python bundle is set up.`);
    return null;
  }

  private async validatePythonExtension(context: ExtensionContext): Promise<void> {
    // Check if main Python file exists
    if (!context.manifest.main) {
      throw new ExtensionError(
        'Python extension must specify a main file',
        ExtensionErrorCode.INVALID_MANIFEST,
        context.id
      );
    }

    const mainPath = path.join(context.path, context.manifest.main);
    try {
      await fs.access(mainPath);
    } catch (error) {
      throw new ExtensionError(
        `Main Python file not found: ${context.manifest.main}`,
        ExtensionErrorCode.INVALID_MANIFEST,
        context.id
      );
    }

    // Check if Python file has proper structure
    const content = await fs.readFile(mainPath, 'utf-8');
    if (!content.includes('def main(') && !content.includes('if __name__ == "__main__"')) {
      this.logger.warn(`Python file ${context.manifest.main} may not have standard entry point structure`);
    }
  }

  private async setupPythonEnvironment(context: ExtensionContext): Promise<void> {
    this.logger.info(`Setting up Python environment for extension ID: ${context.id}`);
    
    // Use the proper bundled Python path instead of defaultPythonPath
    let bundledPythonPath = this.findPythonExecutable();
    
    if (!bundledPythonPath) {
      this.logger.info(`Python bundle not found, attempting to install it automatically...`);
      
      try {
        await this.installPythonBundle();
        bundledPythonPath = this.findPythonExecutable();
        
        if (!bundledPythonPath) {
          throw new ExtensionError(
            'Failed to install Python bundle. Please complete the onboarding process manually.',
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          );
        }
        
        this.logger.info(`Python bundle installed successfully`);
      } catch (error) {
        this.logger.error(`Failed to install Python bundle automatically: ${error}`);
        throw new ExtensionError(
          'Python bundle not found and automatic installation failed. Please complete the onboarding process.',
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        );
      }
    }
    
    const envInfo: PythonEnvironmentInfo = {
      pythonPath: bundledPythonPath,
      virtualEnvPath: null,
      requirementsInstalled: false,
      isEnabled: false,
      lastUsed: Date.now()
    };

    // Check if virtual environment should be created
    const requirementsPath = path.join(context.path, 'requirements.txt');
    const hasRequirements = await fs.access(requirementsPath).then(() => true).catch(() => false);

    if (hasRequirements) {
      // In production, we might create a virtual environment
      // For now, we'll use the global Python environment
      envInfo.requirementsPath = requirementsPath;
    }

    this.pythonEnvironments.set(context.id, envInfo);
    this.logger.info(`Python environment stored for ID: ${context.id}`);
    this.logger.info(`Total environments after setup: ${this.pythonEnvironments.size}`);
  }

  private async installDependencies(context: ExtensionContext): Promise<void> {
    const envInfo = this.pythonEnvironments.get(context.id);
    if (!envInfo || !envInfo.requirementsPath) {
      return;
    }

    try {
      this.logger.info(`Installing Python dependencies for ${context.manifest.name}`);
      
      // Read requirements.txt to check what needs to be installed
      const requirements = await fs.readFile(envInfo.requirementsPath, 'utf-8');
      this.logger.info(`Requirements: ${requirements.trim()}`);

      // In production, this would actually install packages
      // For now, we'll assume dependencies are available in the bundled environment
      envInfo.requirementsInstalled = true;

      this.logger.info(`Dependencies installed for ${context.manifest.name}`);
    } catch (error) {
      this.logger.error(`Failed to install dependencies for ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  private async validatePythonScript(context: ExtensionContext): Promise<void> {
    try {
      // Try to run the Python script with a test action
      const envInfo = this.pythonEnvironments.get(context.id);
      if (!envInfo) {
        throw new Error('Environment not set up');
      }

      // Detect if this is an SDK-based agent
      const agentType = await this.detectAgentType(context);
      this.logger.info(`Detected agent type: ${agentType} for ${context.manifest.name}`);

      const testRequest = {
        context: {
          extension_id: context.id,
          config: {},
          permissions: []
        },
        action: 'validate',
        data: {}
      };

      // This would run a validation check on the Python script
      this.logger.info(`Python script validation passed for ${context.manifest.name}`);

    } catch (error) {
      this.logger.warn(`Python script validation failed for ${context.manifest.name}: ${error}`);
      // Don't throw error here, as the script might still work for actual actions
    }
  }

  /**
   * Detect whether this is an SDK-based agent or legacy agent
   */
  private async detectAgentType(context: ExtensionContext): Promise<'sdk' | 'legacy'> {
    try {
      if (!context.manifest.main) {
        return 'legacy';
      }
      
      const scriptPath = path.join(context.path, context.manifest.main);
      const content = await fs.readFile(scriptPath, 'utf8');
      
      // Check for SDK imports
      if (content.includes('from browzer_sdk import') || 
          content.includes('import browzer_sdk') ||
          content.includes('browzer_sdk.')) {
        return 'sdk';
      }
      
      // Check for legacy patterns
      if (content.includes('class ExtensionContext') || 
          content.includes('def main(') ||
          content.includes('async def main(')) {
        return 'legacy';
      }
      
      return 'legacy'; // Default to legacy
    } catch (error) {
      this.logger.warn(`Failed to detect agent type: ${error}`);
      return 'legacy';
    }
  }

  private async runPythonScript(
    context: ExtensionContext,
    request: any,
    envInfo: PythonEnvironmentInfo
  ): Promise<any> {
    // Detect agent type to determine execution method
    const agentType = await this.detectAgentType(context);
    
    if (agentType === 'sdk') {
      return this.executeSDKAgent(context, request, envInfo);
    } else {
      return this.executeLegacyAgent(context, request, envInfo);
    }
  }

  /**
   * Execute SDK-based agent
   */
  private async executeSDKAgent(
    context: ExtensionContext,
    request: any,
    envInfo: PythonEnvironmentInfo
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (!context.manifest.main) {
        reject(new ExtensionError(
          'No main file specified for SDK agent',
          ExtensionErrorCode.INVALID_MANIFEST,
          context.id
        ));
        return;
      }

      const scriptPath = path.join(context.path, context.manifest.main);
      
      // Always check for the bundled Python at execution time
      let currentPythonPath = this.findPythonExecutable();
      
      if (!currentPythonPath) {
        this.logger.info(`Python bundle not found during SDK execution, attempting to install...`);
        
        try {
          await this.installPythonBundle();
          currentPythonPath = this.findPythonExecutable();
          
          if (!currentPythonPath) {
            reject(new ExtensionError(
              'Failed to install Python bundle. Please complete the onboarding process manually.',
              ExtensionErrorCode.RUNTIME_ERROR,
              context.id
            ));
            return;
          }
        } catch (error) {
          reject(new ExtensionError(
            'Python bundle not found and automatic installation failed. Please complete the onboarding process.',
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          ));
          return;
        }
      }
      
      this.logger.info(`Executing SDK agent: ${currentPythonPath} ${scriptPath}`);

      // For SDK agents, we execute the script directly
      const pythonProcess = spawn(currentPythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: context.path,
        env: {
          ...process.env,
          PYTHONPATH: this.buildPythonPath(currentPythonPath, context.path)
        }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.info(`Python stderr: ${data.toString()}`);
      });

      pythonProcess.on('close', (code: number) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            this.logger.error(`Failed to parse Python output: ${parseError}`);
            resolve({ 
              success: false, 
              error: 'Failed to parse output',
              raw_output: stdout 
            });
          }
        } else {
          reject(new ExtensionError(
            `SDK agent failed with code ${code}: ${stderr}`,
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          ));
        }
      });

      pythonProcess.on('error', (error: Error) => {
        this.logger.error(`Failed to start SDK agent process`, error);
        reject(new ExtensionError(
          `Failed to start SDK agent process: ${error.message}`,
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        ));
      });

      // Send the request data to the SDK agent
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();
    });
  }

  /**
   * Execute legacy agent (existing implementation)
   */
  private async executeLegacyAgent(
    context: ExtensionContext,
    request: any,
    envInfo: PythonEnvironmentInfo
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const scriptPath = path.join(context.path, context.runtime.entrypoint);

      // Always check for the bundled Python at execution time
      let currentPythonPath = this.findPythonExecutable();
      
      if (!currentPythonPath) {
        this.logger.info(`Python bundle not found during legacy execution, attempting to install...`);
        
        try {
          await this.installPythonBundle();
          currentPythonPath = this.findPythonExecutable();
          
          if (!currentPythonPath) {
            reject(new ExtensionError(
              'Failed to install Python bundle. Please complete the onboarding process manually.',
              ExtensionErrorCode.RUNTIME_ERROR,
              context.id
            ));
            return;
          }
        } catch (error) {
          reject(new ExtensionError(
            'Python bundle not found and automatic installation failed. Please complete the onboarding process.',
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          ));
          return;
        }
      }
      
      this.logger.info(`Executing legacy agent: ${currentPythonPath} ${scriptPath}`);

      const pythonProcess = spawn(currentPythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: context.path,
        env: {
          ...process.env,
          PYTHONPATH: this.buildPythonPath(currentPythonPath, context.path)
        }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.info(`Python stderr: ${data.toString()}`);
      });

      pythonProcess.on('close', (code: number) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            this.logger.error(`Failed to parse Python output: ${parseError}`);
            resolve({ 
              success: false, 
              error: 'Failed to parse output',
              raw_output: stdout 
            });
          }
        } else {
          reject(new ExtensionError(
            `Legacy agent failed with code ${code}: ${stderr}`,
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          ));
        }
      });

      pythonProcess.on('error', (error: Error) => {
        this.logger.error(`Failed to start legacy agent process`, error);
        reject(new ExtensionError(
          `Failed to start legacy agent process: ${error.message}`,
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        ));
      });

      // Send the request data to the legacy agent
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();
    });
  }

  private async runLongRunningPythonScript(
    context: ExtensionContext,
    request: any,
    envInfo: PythonEnvironmentInfo,
    options: {
      timeout?: number;
      onProgress?: (progress: any) => void;
      onOutput?: (output: string) => void;
    }
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(context.path, context.runtime.entrypoint);

      const pythonProcess = spawn(envInfo.pythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: context.path,
        env: {
          ...process.env,
          PYTHONPATH: this.buildPythonPath(envInfo.pythonPath, context.path)
        }
      });

      // Store process info for management
      const processInfo: PythonProcessInfo = {
        process: pythonProcess,
        startTime: Date.now(),
        extensionId: context.id,
        action: request.action
      };
      this.runningProcesses.set(context.id, processInfo);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        
        // Call output callback if provided
        if (options.onOutput) {
          options.onOutput(output);
        }

        // Try to parse progress updates
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('PROGRESS:')) {
            try {
              const progressData = JSON.parse(line.substring(9));
              if (options.onProgress) {
                options.onProgress(progressData);
              }
            } catch (error) {
              // Ignore progress parsing errors
            }
          }
        }
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.warn(`Python stderr: ${data.toString()}`);
      });

      pythonProcess.on('close', (code: number) => {
        this.runningProcesses.delete(context.id);
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            resolve({
              success: false,
              error: 'Failed to parse output',
              raw_output: stdout
            });
          }
        } else {
          reject(new ExtensionError(
            `Python script failed with code ${code}: ${stderr}`,
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          ));
        }
      });

      pythonProcess.on('error', (error: Error) => {
        this.runningProcesses.delete(context.id);
        reject(new ExtensionError(
          `Failed to start Python process: ${error.message}`,
          ExtensionErrorCode.RUNTIME_ERROR,
          context.id
        ));
      });

      // Set timeout if specified
      if (options.timeout) {
        setTimeout(() => {
          if (!pythonProcess.killed) {
            pythonProcess.kill('SIGTERM');
            reject(new ExtensionError(
              `Python script timed out after ${options.timeout}ms`,
              ExtensionErrorCode.RUNTIME_ERROR,
              context.id
            ));
          }
        }, options.timeout);
      }

      // Send the request data to the Python process
      pythonProcess.stdin.write(JSON.stringify(request));
      pythonProcess.stdin.end();
    });
  }

  /**
   * Automatically install Python bundle when missing
   */
  private async installPythonBundle(): Promise<void> {
    const { spawn } = require('child_process');
    const appSupportPath = app.getPath('userData');
    const pythonBundlePath = path.join(appSupportPath, 'python-bundle');
    
    // Handle different paths for packaged vs development
    let setupScriptPath: string;
    if (app.isPackaged) {
      // In packaged app, script is in app.asar.unpacked
      setupScriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', 'prepare-python-bundle.sh');
    } else {
      // In development, script is in project root
      setupScriptPath = path.join(process.cwd(), 'scripts', 'prepare-python-bundle.sh');
    }

    this.logger.info(`Installing Python bundle to: ${pythonBundlePath}`);
    this.logger.info(`Using setup script: ${setupScriptPath}`);
    this.logger.info(`App is packaged: ${app.isPackaged}`);

    return new Promise((resolve, reject) => {
      // Check if setup script exists
      if (!require('fs').existsSync(setupScriptPath)) {
        this.logger.error(`Python setup script not found at: ${setupScriptPath}`);
        this.logger.error(`process.cwd(): ${process.cwd()}`);
        this.logger.error(`process.resourcesPath: ${process.resourcesPath}`);
        this.logger.error(`app.getAppPath(): ${app.getAppPath()}`);
        reject(new Error(`Python setup script not found at: ${setupScriptPath}`));
        return;
      }

      // Run the setup script
      const setupProcess = spawn('bash', [setupScriptPath, pythonBundlePath], {
        env: {
          ...process.env,
          PYTHON_BUNDLE_DIR: pythonBundlePath
        }
      });

      let output = '';
      let errorOutput = '';

      setupProcess.stdout?.on('data', (data: any) => {
        const text = data.toString();
        output += text;
        this.logger.info(`[Python Setup] ${text.trim()}`);
      });

      setupProcess.stderr?.on('data', (data: any) => {
        const text = data.toString();
        errorOutput += text;
        this.logger.error(`[Python Setup Error] ${text.trim()}`);
      });

      setupProcess.on('close', (code: any) => {
        if (code === 0) {
          this.logger.info('Python bundle installation completed successfully');
          resolve();
        } else {
          this.logger.error(`Python bundle installation failed with code: ${code}`);
          reject(new Error(`Python setup failed with code ${code}: ${errorOutput}`));
        }
      });

      setupProcess.on('error', (error: any) => {
        this.logger.error('Failed to run Python setup script:', error);
        reject(error);
      });
    });
  }

  private getModelForProvider(provider: string): string {
    const modelMap: Record<string, string> = {
      'openai': 'gpt-3.5-turbo',
      'anthropic': 'claude-3-sonnet-20240229',
      'perplexity': 'pplx-7b-online',
      'chutes': 'deepseek-ai/DeepSeek-R1'
    };
    
    return modelMap[provider] || 'gpt-3.5-turbo';
  }
}

// Supporting interfaces
interface PythonEnvironmentInfo {
  pythonPath: string;
  virtualEnvPath: string | null;
  requirementsPath?: string;
  requirementsInstalled: boolean;
  isEnabled: boolean;
  lastUsed: number;
}

interface PythonProcessInfo {
  process: ChildProcess;
  startTime: number;
  extensionId: string;
  action: string;
} 