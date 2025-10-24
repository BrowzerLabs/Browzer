import { RecordedAction } from '../../shared/types/recording';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

/**
 * VLM Analysis Request payload
 */
export interface VLMAnalysisRequest {
  recordingId: string;
  actionIndex: number;
  action: RecordedAction;
  screenshot: {
    base64: string;
    timestamp: number;
    dimensions: { width: number; height: number };
  };
  context: {
    url: string;
    pageTitle: string;
    formContext?: any;
    previousActions: RecordedAction[];
    
    // Element-specific context for accurate VLM analysis
    targetElement?: {
      selector: string;
      tagName: string;
      type?: string;
      name?: string;
      id?: string;
      placeholder?: string;
      value?: any;
      boundingRect?: { x: number; y: number; width: number; height: number };
    };
  };
  analysisTypes: ('variable-detection' | 'error-detection' | 'form-intelligence' | 'page-readiness')[];
}

/**
 * Smart Variable Detection results
 * 
 * IMPORTANT: The VLM should analyze the specific targetElement provided in the request context
 * rather than trying to discover new elements. This ensures accurate element-to-variable mapping.
 */
export interface SmartVariableDetection {
  variables: Array<{
    fieldSelector: string; // Should match the targetElement.selector from request
    originalName: string;  // targetElement.name || targetElement.id
    semanticName: string;  // VLM-suggested meaningful name
    purpose: string;       // What this field is used for
    businessContext: string; // Business process context
    substitutionHints: string[]; // Alternative values for testing
    dataClassification: 'personal-identifier' | 'sensitive' | 'public' | 'system-generated';
    requiredFormat?: string; // Expected data format
    confidence: number;    // 0-1 confidence in the analysis
  }>;
}

/**
 * Error State Detection results
 */
export interface ErrorStateDetection {
  errorDetected: boolean;
  errorType?: 'validation-failure' | 'network-error' | 'permission-denied' | 'timeout' | 'unknown';
  visualCues: string[];
  errorMessage?: string;
  errorCause?: string;
  recoverySuggestions: string[];
  alternativeActions: string[];
  errorSeverity: 'blocking' | 'warning' | 'info';
  confidence: number;
}

/**
 * VLM Analysis Response
 */
export interface VLMAnalysisResponse {
  success: boolean;
  analysisId: string;
  timestamp: number;
  processingTimeMs: number;
  
  // Phase 1 results
  variableDetection?: SmartVariableDetection;
  errorDetection?: ErrorStateDetection;
  
  // Metadata
  modelUsed: string;
  confidence: number;
  rawResponse?: string; // For debugging
}

/**
 * VLM Service for local model inference via subprocess
 */
export class VLMService {
  private static instance: VLMService;
  private readonly enabled: boolean;
  private readonly modelPath: string;
  private readonly mlEnvironmentPath: string;
  private vlmProcess: ChildProcess | null = null;
  private isModelLoaded: boolean = false;
  private pendingRequests: Map<string, { resolve: Function, reject: Function }> = new Map();
  private requestCounter: number = 0;

  constructor() {
    // Feature flag
    this.enabled = process.env.VLM_ENABLED === 'true' || false;
    
    // Local model configuration - use relative paths or environment variables
    this.modelPath = this.expandPath(process.env.VLM_MODEL_PATH) || path.join(process.env.HOME || '', 'Desktop/ml-fastvlm/checkpoints/llava-fastvithd_1.5b_stage3');
    this.mlEnvironmentPath = this.expandPath(process.env.VLM_ML_PATH) || path.join(process.env.HOME || '', 'Desktop/ml-fastvlm');
    
    if (this.enabled) {
      console.log('🧠 VLM Service: Starting model...');
      this.startVLMServerAndPreload().catch(error => {
        console.error('❌ VLM Service: Model startup failed:', error);
      });
    } else {
      console.log('🧠 VLM Service: Disabled');
    }
  }

  public static getInstance(): VLMService {
    if (!VLMService.instance) {
      VLMService.instance = new VLMService();
    }
    return VLMService.instance;
  }

  /**
   * Start VLM server and immediately begin model loading (non-blocking startup)
   */
  private async startVLMServerAndPreload(): Promise<void> {
    try {
      // Start the server process
      await this.startVLMServer();
      
      // Immediately begin model loading in background
      this.preloadModel().catch((error: any) => {
        console.error('⚠️ Model preload failed:', error);
      });
      
    } catch (error) {
      console.error('⚠️ Failed to start VLM server for preloading:', error);
    }
  }

  /**
   * Preload the model by sending a test analysis request
   */
  private async preloadModel(): Promise<void> {
    try {
      // Triggering model preload
      
      // Create a valid 8x8 solid blue test image (proper RGB format)
      const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAE0lEQVR4nGNkYGBgGAWjYBSQCwAA4AABAPRrnC8AAAAASUVORK5CYII=';
      
      const testRequest = {
        action: 'analyze',
        image_b64: testImage,
        prompt: 'Describe this image briefly.',
        max_new_tokens: 8,
        temperature: 0.0
      };
      
      const startTime = Date.now();
      const response = await this.sendVLMRequest(testRequest);
      const loadTime = Date.now() - startTime;
      
      if (response.success) {
        console.log(`🧠 Model ready (${loadTime}ms)`);
        this.isModelLoaded = true;
        
        // Verify model is loaded with health check
        const healthResponse = await this.sendVLMRequest({ action: 'health' });
        if (healthResponse.model_loaded) {
          // Model verified
        }
      } else {
        console.warn(`⚠️ Model preload test failed: ${response.error}`);
        console.warn('🧠 Model will load on first real analysis request instead');
      }
      
    } catch (error: any) {
      console.warn('⚠️ Model preload failed:', error.message || error);
      console.warn('🧠 Model will load lazily on first analysis request');
    }
  }

  /**
   * Quick test method for debugging VLM parsing (faster than full analysis)
   */
  public async testVLMParsing(): Promise<void> {
    if (!this.enabled || !this.vlmProcess) {
      console.log('🧠 VLM not available for testing');
      return;
    }
    
    // Testing JSON parsing
    
    const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAE0lEQVR4nGNkYGBgGAWjYBSQCwAA4AABAPRrnC8AAAAASUVORK5CYII=';
    
    const testPrompt = `Return ONLY this JSON: {"semanticName": "Test Field", "purpose": "testing", "confidence": 0.9}`;
    
    try {
      const response = await this.sendVLMRequest({
        action: 'analyze',
        image_b64: testImage,
        prompt: testPrompt,
        max_new_tokens: 64,
        temperature: 0.0
      });
      
      const extracted = this.extractJSONFromResponse(response.result || '');
      
      if (extracted) {
        console.log('✅ JSON parsing successful');
      } else {
        console.log('❌ JSON parsing failed');
      }
      
    } catch (error) {
      console.error('❌ VLM test failed:', error);
    }
  }

  /**
   * Check if VLM model is loaded and ready for analysis
   */
  public isModelReady(): boolean {
    return this.enabled && this.vlmProcess !== null && this.isModelLoaded;
  }

  /**
   * Get VLM status for UI display
   */
  public getVLMStatus(): { enabled: boolean; serverRunning: boolean; modelLoaded: boolean; status: string } {
    if (!this.enabled) {
      return { enabled: false, serverRunning: false, modelLoaded: false, status: 'VLM Disabled' };
    }
    
    if (!this.vlmProcess) {
      return { enabled: true, serverRunning: false, modelLoaded: false, status: 'Server Starting...' };
    }
    
    if (!this.isModelLoaded) {
      return { enabled: true, serverRunning: true, modelLoaded: false, status: 'Loading Model...' };
    }
    
    return { enabled: true, serverRunning: true, modelLoaded: true, status: 'Ready' };
  }

  /**
   * Start VLM server process (non-blocking, called at app startup)
   */
  public async startVLMServer(): Promise<void> {
    if (!this.enabled) {
      console.log('🧠 VLM Server startup skipped - feature disabled');
      return;
    }

    try {
      // Starting VLM server process
      
      // Spawn Python VLM server process - use src/vlm-image directory
      const vlmServerScript = path.join(process.cwd(), 'src/vlm-image/vlm_server.py');
      
      this.vlmProcess = spawn('python3', [
        vlmServerScript,
        '--model-path', this.modelPath,
        '--device', 'mps'
      ], {
        cwd: this.mlEnvironmentPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Set up process event handlers
      this.vlmProcess.on('error', (error) => {
        console.error('❌ VLM Process error:', error);
        this.isModelLoaded = false;
      });

      this.vlmProcess.on('exit', (code, signal) => {
        console.log(`🧠 VLM Process exited with code ${code}, signal ${signal}`);
        this.isModelLoaded = false;
        this.vlmProcess = null;
      });

      // Handle responses from VLM server
      this.vlmProcess.stdout?.on('data', (data) => {
        // VLM stdout received
        const responses = data.toString().trim().split('\n');
        responses.forEach((responseStr: string) => {
          if (responseStr) {
            try {
              const response = JSON.parse(responseStr);
              const requestId = response.requestId;
              // Response parsed
              
              if (this.pendingRequests.has(requestId)) {
                const { resolve } = this.pendingRequests.get(requestId)!;
                resolve(response);
                this.pendingRequests.delete(requestId);
                // Request resolved
              } else {
                console.warn('🧠 VLM response for unknown request:', requestId);
              }
            } catch (error) {
              console.error('❌ Failed to parse VLM response:', error, 'Raw data:', responseStr);
            }
          }
        });
      });

      // Handle stderr (model loading logs, etc.)
      this.vlmProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message.includes('VLM model loaded in')) {
          this.isModelLoaded = true;
          // Model ready message logged elsewhere
        } else if (message.includes('VLM Server ready')) {
          // Server ready - no need for additional logging
        } else if (message.includes('Loading VLM model into memory')) {
          // Loading started - no need for logging
        } else if (message.includes('Error') || message.includes('Failed') || message.includes('Exception')) {
          console.error('❌ VLM Error:', message);
        } else if (message.includes('Traceback')) {
          console.error('❌ VLM Traceback detected:', message);
        } else if (message.length > 0) {
          console.log('🧠 VLM:', message);
        }
      });

      // VLM server process started

    } catch (error) {
      console.error('❌ Failed to start VLM server:', error);
    }
  }

  /**
   * Analyze action with local VLM for Phase 1 improvements
   */
  public async analyzeAction(request: VLMAnalysisRequest): Promise<VLMAnalysisResponse | null> {
    if (!this.enabled) {
      console.log('🧠 VLM Analysis skipped - feature disabled');
      return null;
    }

    if (!this.vlmProcess) {
      console.warn('🧠 VLM Analysis skipped - server not running');
      return null;
    }

    try {
      console.log(`🧠 Analyzing action ${request.actionIndex} with local VLM...`);
      
      const startTime = Date.now();
      
      // Create analysis prompt based on action type and context
      const prompt = this.createAnalysisPrompt(request);
      
      // Send request to VLM server
      const response = await this.sendVLMRequest({
        action: 'analyze',
        image_b64: request.screenshot.base64,
        prompt: prompt,
        max_new_tokens: 256,
        temperature: 0.0
      });

      if (!response.success) {
        throw new Error(response.error || 'VLM analysis failed');
      }

      // Parse VLM response into structured metadata
      const analysisResult = this.parseVLMResponse(response.result, request);
      const processingTime = Date.now() - startTime;

      console.log(`✅ VLM analysis completed in ${processingTime}ms`);
      
      return {
        success: true,
        analysisId: `vlm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        processingTimeMs: processingTime,
        variableDetection: analysisResult.variableDetection,
        errorDetection: analysisResult.errorDetection,
        modelUsed: 'llava-fastvithd_1.5b',
        confidence: analysisResult.confidence,
        rawResponse: response.result
      };

    } catch (error) {
      console.error('❌ VLM analysis failed:', error);
      return null;
    }
  }

  /**
   * Send request to VLM server via stdin/stdout
   */
  private async sendVLMRequest(request: any): Promise<any> {
    if (!this.vlmProcess) {
      throw new Error('VLM process not available');
    }

    return new Promise((resolve, reject) => {
      const requestId = `req-${++this.requestCounter}`;
      const requestWithId = { ...request, requestId };
      
      // Store promise handlers
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('VLM request timeout'));
      }, 60000); // Increased to 60s for model inference
      
      // Clean up timeout when resolved
      const originalResolve = resolve;
      const wrappedResolve = (result: any) => {
        clearTimeout(timeout);
        originalResolve(result);
      };
      this.pendingRequests.set(requestId, { resolve: wrappedResolve, reject });
      
      // Send request
      console.log('🧠 Sending VLM request:', { action: requestWithId.action, requestId });
      this.vlmProcess.stdin?.write(JSON.stringify(requestWithId) + '\n');
      console.log('🧠 VLM request sent to stdin');
    });
  }

  /**
   * Create structured analysis prompt that returns JSON
   */
  private createAnalysisPrompt(request: VLMAnalysisRequest): string {
    const { action, context } = request;
    const element = context.targetElement;
    
    if (!element) {
      return this.createErrorDetectionPrompt();
    }
    
    // Build context information
    const elementInfo = this.buildElementContext(element, action);
    const formContext = context.formContext ? `Form context: ${JSON.stringify(context.formContext)}` : '';
    
    return `Analyze the form field in this screenshot and return your analysis as valid JSON.

Element Information:
- Selector: ${element.selector}
- Type: ${element.type || 'unknown'}
- Name/ID: ${element.name || element.id || 'none'}
- Placeholder: ${element.placeholder || 'none'}
- User Input: ${action.value || 'none'}
${formContext}

Return ONLY valid JSON in this exact format:
{
  "semanticName": "A human-readable name for this field (e.g., 'Primary Email', 'Account Password')",
  "purpose": "The field's purpose (e.g., 'user-identification', 'authentication', 'contact-info')",
  "businessContext": "Business context (e.g., 'login-credential', 'user-profile', 'payment-info')",
  "dataType": "Data classification ('personal-identifier', 'sensitive', 'public', 'system-generated')",
  "substitutionHints": [
    "Alternative test values that would work for this field"
  ],
  "hasError": false,
  "errorType": null,
  "errorMessage": null,
  "confidence": 0.85
}

Focus on the visual context, surrounding labels, and field characteristics to provide accurate analysis.`;
  }

  /**
   * Create error detection prompt for general UI analysis
   */
  private createErrorDetectionPrompt(): string {
    return `Analyze this screenshot for UI errors, validation issues, or problems and return valid JSON:

{
  "hasError": false,
  "errorType": null,
  "errorMessage": null,
  "visualCues": [],
  "confidence": 0.8
}

Look for: error messages, validation warnings, broken UI elements, failed loading states.`;
  }

  /**
   * Build comprehensive element context for better VLM analysis
   */
  private buildElementContext(element: any, action: any): string {
    const context = [];
    
    if (element.tagName) context.push(`Tag: ${element.tagName}`);
    if (element.boundingRect) {
      const rect = element.boundingRect;
      context.push(`Position: ${rect.x},${rect.y} (${rect.width}x${rect.height})`);
    }
    
    return context.join(', ');
  }

  /**
   * Parse structured JSON response from VLM
   */
  private parseVLMResponse(vlmText: string, request: VLMAnalysisRequest): {
    variableDetection?: SmartVariableDetection;
    errorDetection?: ErrorStateDetection;
    confidence: number;
  } {
    try {
      // Extract JSON from response (handle cases where VLM adds extra text)
      const jsonResponse = this.extractJSONFromResponse(vlmText);
      
      if (!jsonResponse) {
        console.warn('⚠️ No valid JSON found in VLM response, using fallback parsing');
        return this.fallbackParseResponse(vlmText, request);
      }

      const element = request.context.targetElement;
      const action = request.action;
      
      let variableDetection: SmartVariableDetection | undefined;
      let errorDetection: ErrorStateDetection | undefined;
      
      // Process variable detection for eligible actions
      console.log(`🔍 VLM Parse Debug - Element: ${!!element}, ActionType: ${action.type}, Eligible: ${element && this.isVariableDetectionEligible(action)}`);
      
      if (element && this.isVariableDetectionEligible(action)) {
        variableDetection = this.buildVariableDetection(jsonResponse, element, action);
        console.log(`✅ Variable detection created for ${element.selector}: ${variableDetection.variables[0].semanticName}`);
      } else {
        console.log(`⏭️ Skipping variable detection - Element: ${!!element}, ActionType: ${action.type}`);
      }
      
      // Process error detection
      errorDetection = this.buildErrorDetection(jsonResponse);
      
      const result = {
        variableDetection,
        errorDetection,
        confidence: jsonResponse.confidence || 0.8
      };
      
      console.log(`🧠 VLM parseResponse result: hasVariables=${!!result.variableDetection}, hasErrors=${!!result.errorDetection}`);
      return result;
      
    } catch (error) {
      console.warn('⚠️ Failed to parse VLM JSON response:', error);
      return this.fallbackParseResponse(vlmText, request);
    }
  }

  /**
   * Extract JSON from VLM response text
   */
  private extractJSONFromResponse(text: string): any {
    try {
      // Try direct JSON parse first
      return JSON.parse(text.trim());
    } catch {
      // Find the first complete JSON object in the text
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;
      
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
          if (jsonStart === -1) jsonStart = i;
          braceCount++;
        } else if (text[i] === '}') {
          braceCount--;
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i;
            break;
          }
        }
      }
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (parseError) {
          console.warn('⚠️ Failed to parse extracted JSON:', jsonStr.substring(0, 100) + '...');
          return null;
        }
      }
      
      return null;
    }
  }

  /**
   * Check if action is eligible for variable detection
   */
  private isVariableDetectionEligible(action: any): boolean {
    return ['input', 'select', 'checkbox', 'radio'].includes(action.type);
  }

  /**
   * Build structured variable detection from JSON response
   */
  private buildVariableDetection(jsonResponse: any, element: any, action: any): SmartVariableDetection {
    return {
      variables: [{
        fieldSelector: element.selector,
        originalName: element.name || element.id || 'unnamed-field',
        semanticName: jsonResponse.semanticName || this.generateFallbackSemanticName(element),
        purpose: jsonResponse.purpose || 'user-input',
        businessContext: jsonResponse.businessContext || 'general-form-data',
        substitutionHints: Array.isArray(jsonResponse.substitutionHints) 
          ? jsonResponse.substitutionHints 
          : this.generateFallbackSubstitutionHints(element, action),
        dataClassification: jsonResponse.dataType || this.classifyDataType(element),
        requiredFormat: this.determineRequiredFormat(element),
        confidence: jsonResponse.confidence || 0.7
      }]
    };
  }

  /**
   * Build error detection from JSON response
   */
  private buildErrorDetection(jsonResponse: any): ErrorStateDetection {
    const hasError = jsonResponse.hasError === true;
    
    return {
      errorDetected: hasError,
      errorType: hasError ? (jsonResponse.errorType || 'validation-failure') : undefined,
      visualCues: jsonResponse.visualCues || [],
      errorMessage: jsonResponse.errorMessage,
      recoverySuggestions: hasError ? ['Check input format', 'Verify field requirements'] : [],
      alternativeActions: hasError ? ['retry-input', 'use-different-value'] : [],
      errorSeverity: hasError ? 'warning' : 'info',
      confidence: jsonResponse.confidence || 0.8
    };
  }

  /**
   * Fallback to simple text parsing when JSON parsing fails
   */
  private fallbackParseResponse(vlmText: string, request: VLMAnalysisRequest): {
    variableDetection?: SmartVariableDetection;
    errorDetection?: ErrorStateDetection;
    confidence: number;
  } {
    const element = request.context.targetElement;
    const action = request.action;
    
    let variableDetection: SmartVariableDetection | undefined;
    let errorDetection: ErrorStateDetection | undefined;
    
    if (element && this.isVariableDetectionEligible(action)) {
      variableDetection = {
        variables: [{
          fieldSelector: element.selector,
          originalName: element.name || element.id || 'unnamed-field',
          semanticName: this.extractSemanticName(vlmText, element),
          purpose: this.extractPurpose(vlmText),
          businessContext: this.extractBusinessContext(vlmText),
          substitutionHints: this.extractSubstitutionHints(vlmText),
          dataClassification: this.classifyDataType(element),
          requiredFormat: this.determineRequiredFormat(element),
          confidence: 0.6 // Lower confidence for fallback parsing
        }]
      };
    }
    
    const hasError = this.detectErrorInText(vlmText);
    errorDetection = {
      errorDetected: hasError,
      errorType: hasError ? 'validation-failure' : undefined,
      visualCues: hasError ? ['visual-error-indicator'] : [],
      errorMessage: hasError ? this.extractErrorMessage(vlmText) : undefined,
      recoverySuggestions: hasError ? ['Check input format'] : [],
      alternativeActions: hasError ? ['retry-input'] : [],
      errorSeverity: hasError ? 'warning' : 'info',
      confidence: 0.6
    };
    
    return {
      variableDetection,
      errorDetection,
      confidence: 0.6
    };
  }

  /**
   * Extract semantic name from VLM response
   */
  private extractSemanticName(vlmText: string, element: any): string {
    // Simple pattern matching to extract semantic names
    const patterns = [
      /semantic name[:\s]+["']?([^"'\n]+)["']?/i,
      /suggest[^:]*name[:\s]+["']?([^"'\n]+)["']?/i,
      /call[^:]*field[:\s]+["']?([^"'\n]+)["']?/i,
    ];
    
    for (const pattern of patterns) {
      const match = vlmText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Fallback based on element characteristics
    if (element.type === 'email' || element.name?.includes('email')) {
      return 'Email Address';
    } else if (element.type === 'password') {
      return 'Password';
    } else if (element.name?.includes('name')) {
      return 'Name Field';
    }
    
    return 'Input Field';
  }

  /**
   * Extract purpose from VLM response
   */
  private extractPurpose(vlmText: string): string {
    const patterns = [
      /purpose[:\s]+["']?([^"'\n]+)["']?/i,
      /used for[:\s]+["']?([^"'\n]+)["']?/i,
    ];
    
    for (const pattern of patterns) {
      const match = vlmText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return 'data-input';
  }

  /**
   * Extract business context from VLM response
   */
  private extractBusinessContext(vlmText: string): string {
    const patterns = [
      /business context[:\s]+["']?([^"'\n]+)["']?/i,
      /context[:\s]+["']?([^"'\n]+)["']?/i,
    ];
    
    for (const pattern of patterns) {
      const match = vlmText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return 'user-input';
  }

  /**
   * Extract substitution hints from VLM response
   */
  private extractSubstitutionHints(vlmText: string): string[] {
    const patterns = [
      /alternative[^:]*values?[:\s]+([^.\n]+)/i,
      /test values?[:\s]+([^.\n]+)/i,
      /suggest[^:]*values?[:\s]+([^.\n]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = vlmText.match(pattern);
      if (match && match[1]) {
        return match[1].split(',').map(hint => hint.trim().replace(/["']/g, ''));
      }
    }
    
    return ['test-value', 'sample-input', 'demo-data'];
  }

  /**
   * Extract data classification from VLM response
   */
  private extractDataClassification(vlmText: string): 'personal-identifier' | 'sensitive' | 'public' | 'system-generated' {
    if (/personal|identifier|private/i.test(vlmText)) {
      return 'personal-identifier';
    } else if (/sensitive|password|secret/i.test(vlmText)) {
      return 'sensitive';
    } else if (/public/i.test(vlmText)) {
      return 'public';
    }
    
    return 'public';
  }

  /**
   * Detect if VLM response indicates an error
   */
  private detectErrorInResponse(vlmText: string): boolean {
    const errorIndicators = [
      /error/i, /invalid/i, /wrong/i, /incorrect/i, /failed/i,
      /red/i, /warning/i, /alert/i, /problem/i
    ];
    
    return errorIndicators.some(pattern => pattern.test(vlmText));
  }

  /**
   * Extract error message from VLM response
   */
  private extractErrorMessage(vlmText: string): string {
    const patterns = [
      /error[^:]*:[:\s]+["']?([^"'\n]+)["']?/i,
      /message[^:]*:[:\s]+["']?([^"'\n]+)["']?/i,
    ];
    
    for (const pattern of patterns) {
      const match = vlmText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return 'Visual error detected';
  }

  /**
   * Determines if an action needs VLM analysis or can be skipped
   */
  private shouldAnalyzeWithVLM(action: RecordedAction): boolean {
    // Skip analysis for simple keypress events (except special keys)
    if (action.type === 'keypress') {
      const key = action.metadata?.key || action.value;
      // Only analyze keypress for special keys or when targeting input fields
      return key && ['Enter', 'Tab', 'Escape'].includes(key as string);
    }

    // Skip common navigation and form submission clicks
    if (action.type === 'click') {
      const selector = action.target?.selector?.toLowerCase();
      const text = action.target?.text?.toLowerCase();
      
      if (selector || text) {
        // Skip submit buttons, navigation links, close buttons
        const skipPatterns = ['submit', 'btn-close', 'nav-', 'breadcrumb', 'close', 'cancel', 'back'];
        if (skipPatterns.some(pattern => 
          (selector && selector.includes(pattern)) || 
          (text && text.includes(pattern))
        )) {
          return false;
        }
      }
    }

    // Skip simple tab switching and navigation
    if (['navigate', 'tab-switch'].includes(action.type)) {
      return false;
    }

    // Analyze all other interactions (input, select, checkbox, radio, toggle, file-upload)
    return true;
  }

  /**
   * Batch analyze multiple actions (for post-recording analysis)
   */
  public async batchAnalyzeRecording(
    recordingId: string,
    actions: RecordedAction[],
    screenshots: Array<{ base64: string; timestamp: number; dimensions: any }>,
    context: { url: string; pageTitle: string }
  ): Promise<VLMAnalysisResponse[]> {
    
    if (!this.enabled) {
      console.log('🧠 VLM Batch analysis skipped - feature disabled');
      return [];
    }

    const results: VLMAnalysisResponse[] = [];
    
    // Filter actions that actually need VLM analysis
    const actionsToAnalyze = actions.filter((action) => this.shouldAnalyzeWithVLM(action));
    
    if (actionsToAnalyze.length > 0) {
      console.log(`🧠 Analyzing ${actionsToAnalyze.length}/${actions.length} actions`);
    }
    
    // Process filtered actions sequentially to avoid overwhelming the model
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const originalIndex = i;
      
      // Check if this action should be analyzed
      if (!this.shouldAnalyzeWithVLM(action)) {
        results.push(null); // Keep array alignment
        continue;
      }
      
      const screenshot = screenshots[originalIndex];
      
      // Handle missing screenshot with fallback analysis
      if (!screenshot || !screenshot.base64) {
        const fallbackResult = this.generateFallbackAnalysis(action, originalIndex, context);
        results.push(fallbackResult);
        continue;
      }

      const request: VLMAnalysisRequest = {
        recordingId,
        actionIndex: originalIndex,
        action,
        screenshot,
        context: {
          ...context,
          formContext: action.metadata?.formContext,
          previousActions: actions.slice(0, originalIndex),
          
          // Include exact element context for precise VLM analysis
          targetElement: action.target ? {
            selector: action.target.selector,
            tagName: action.target.tagName,
            type: action.target.type,
            name: action.target.name,
            id: action.target.id,
            placeholder: action.target.placeholder,
            value: action.value,
            boundingRect: action.target.boundingRect
          } : undefined
        },
        analysisTypes: ['variable-detection', 'error-detection']
      };

      try {
        const result = await this.analyzeAction(request);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`⚠️ VLM analysis failed for action ${originalIndex}:`, error);
        const fallbackResult = this.generateFallbackAnalysis(action, originalIndex, context);
        results.push(fallbackResult);
      }
    }

    console.log(`✅ VLM batch analysis completed: ${results.length}/${actions.length} successful`);
    
    // Print detailed enhanced metadata report
    this.printEnhancedMetadataReport(results, actions);
    
    return results;
  }

  /**
   * Print detailed enhanced metadata report after VLM analysis
   */
  private printEnhancedMetadataReport(results: VLMAnalysisResponse[], actions: any[]): void {
    console.log('\n================================================================================');
    console.log('🧠 VLM ENHANCED METADATA DETAILED REPORT');
    console.log('================================================================================');
    
    const enhancedVariables: Array<{
      action: any;
      original: string;
      enhanced: string;
      selector: string;
      purpose: string;
      suggestions: string[];
    }> = [];
    
    const detectedErrors: Array<{
      action: any;
      errorType: string;
      message?: string;
      recovery: string[];
    }> = [];
    
    // Process each analysis result
    results.forEach((result, index) => {
      const action = actions[index];
      
      // Skip null results (parsing failures)
      if (!result) {
        console.warn(`⚠️ Skipping null result for action ${index}`);
        return;
      }
      
      if (result.variableDetection?.variables) {
        result.variableDetection.variables.forEach(variable => {
          enhancedVariables.push({
            action,
            original: variable.originalName,
            enhanced: variable.semanticName,
            selector: variable.fieldSelector,
            purpose: variable.purpose,
            suggestions: variable.substitutionHints
          });
        });
      }
      
      if (result.errorDetection?.errorDetected) {
        detectedErrors.push({
          action,
          errorType: result.errorDetection.errorType || 'unknown',
          message: result.errorDetection.errorMessage,
          recovery: result.errorDetection.recoverySuggestions || []
        });
      }
    });
    
    // Print enhanced variables
    if (enhancedVariables.length > 0) {
      console.log('\n🎯 ENHANCED VARIABLES:');
      enhancedVariables.forEach((variable, i) => {
        console.log(`  ${i + 1}. ${variable.original} → ${variable.enhanced}`);
        console.log(`     Selector: ${variable.selector}`);
        console.log(`     Purpose: ${variable.purpose}`);
        console.log(`     Action: ${variable.action.type} (${variable.action.value || 'no value'})`);
        console.log(`     Suggestions: ${variable.suggestions.join(', ')}`);
        console.log('');
      });
    }
    
    // Print detected errors
    if (detectedErrors.length > 0) {
      console.log('\n🚨 DETECTED ERRORS:');
      detectedErrors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.errorType}`);
        console.log(`     Action: ${error.action.type} on ${error.action.target?.selector || 'unknown'}`);
        if (error.message) console.log(`     Message: ${error.message}`);
        console.log(`     Recovery: ${error.recovery.join(', ')}`);
        console.log('');
      });
    }
    
    // Summary stats
    const enhancementRate = ((enhancedVariables.length / results.length) * 100).toFixed(1);
    const errorRate = ((detectedErrors.length / results.length) * 100).toFixed(1);
    
    console.log('📊 FINAL STATISTICS:');
    console.log(`  • Total Actions Analyzed: ${results.length}/${actions.length}`);
    console.log(`  • Variables Enhanced: ${enhancedVariables.length} (${enhancementRate}% enhancement rate)`);
    console.log(`  • Errors Detected: ${detectedErrors.length} (${errorRate}% error rate)`);
    console.log(`  • JSON Parsing Success: ${results.filter(r => r && r.confidence > 0.7).length}/${results.length}`);
    
    console.log('================================================================================\n');
  }

  /**
   * Stop VLM server process
   */
  public async stopVLMServer(): Promise<void> {
    if (this.vlmProcess) {
      console.log('🧠 Stopping VLM server...');
      
      // Send shutdown request
      try {
        await this.sendVLMRequest({ action: 'shutdown' });
      } catch (error) {
        console.warn('Failed to send shutdown request:', error);
      }
      
      // Kill process if still running
      if (!this.vlmProcess.killed) {
        this.vlmProcess.kill('SIGTERM');
      }
      
      this.vlmProcess = null;
      this.isModelLoaded = false;
      this.pendingRequests.clear();
      
      console.log('✅ VLM server stopped');
    }
  }

  /**
   * Check if VLM service is available and configured
   */
  public isAvailable(): boolean {
    // VLM is available if enabled and process is running (model loads lazily on first request)
    return this.enabled && !!this.vlmProcess;
  }

  /**
   * Get service configuration status
   */
  public getStatus() {
    return {
      enabled: this.enabled,
      modelLoaded: this.isModelLoaded,
      processRunning: !!this.vlmProcess,
      modelPath: this.modelPath,
      mlEnvironmentPath: this.mlEnvironmentPath
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Generate fallback analysis when screenshot is missing
   * Uses heuristics based on action metadata and element context
   */
  private generateFallbackAnalysis(
    action: RecordedAction, 
    actionIndex: number, 
    context: { url: string; pageTitle: string }
  ): VLMAnalysisResponse {
    
    // Fallback analysis without screenshot
    
    const response: VLMAnalysisResponse = {
      success: true,
      analysisId: `fallback-${actionIndex}-${Date.now()}`,
      timestamp: Date.now(),
      processingTimeMs: 0, // Instant fallback
      modelUsed: 'fallback_metadata_analysis',
      confidence: 0.6, // Lower confidence for fallback analysis
      rawResponse: `Fallback analysis for ${action.type} - no screenshot available`
    };

    // Smart variable detection for form fields (screenshot-independent)
    if (action.target && this.isFormField(action.type, action.target)) {
      const variable = this.generateSmartVariableFromMetadata(action);
      if (variable) {
        response.variableDetection = {
          variables: [variable]
        };
        // Variable detected via fallback
      }
    }

    // Error detection based on action metadata
    if (this.hasErrorIndicators(action)) {
      response.errorDetection = {
        errorDetected: true,
        errorType: 'unknown', // Use valid enum value
        visualCues: ['Metadata indicators suggest error state'],
        errorMessage: 'Error detected from action metadata (no visual confirmation)',
        recoverySuggestions: ['Review action metadata for error indicators'],
        alternativeActions: ['Capture screenshot for visual error confirmation'],
        errorSeverity: 'warning',
        confidence: 0.7
      };
      console.log('⚠️ Fallback error detection from metadata');
    }

    return response;
  }

  /**
   * Check if action is a form field based on type and target
   */
  private isFormField(actionType: string, target: any): boolean {
    const formActionTypes = ['input', 'click', 'keypress', 'select', 'checkbox', 'radio'];
    const formTagNames = ['input', 'select', 'textarea', 'button'];
    
    return formActionTypes.includes(actionType) && 
           target && 
           formTagNames.includes(target.tagName?.toLowerCase());
  }

  /**
   * Generate smart variable from action metadata without screenshot
   */
  private generateSmartVariableFromMetadata(action: RecordedAction) {
    if (!action.target) return null;

    const { target } = action;
    
    // Use existing attributes to infer semantic meaning
    let semanticName = target.name || target.id || target.placeholder || 'field';
    let purpose = 'User input field';
    let dataClassification: 'personal-identifier' | 'sensitive' | 'public' | 'system-generated' = 'public';
    
    // Enhance based on patterns
    if (target.type === 'email' || /email/i.test(semanticName)) {
      semanticName = 'email';
      purpose = 'Email address input';
      dataClassification = 'personal-identifier';
    } else if (target.type === 'password' || /password/i.test(semanticName)) {
      semanticName = 'password';
      purpose = 'Password authentication';
      dataClassification = 'sensitive';
    } else if (/phone|tel/i.test(semanticName)) {
      semanticName = 'phone';
      purpose = 'Phone number input';
      dataClassification = 'personal-identifier';
    } else if (/name|full.*name/i.test(semanticName)) {
      semanticName = 'fullName';
      purpose = 'Full name input';
      dataClassification = 'personal-identifier';
    }

    if (semanticName && semanticName.length > 0) {
      return {
        fieldSelector: target.selector,
        originalName: target.name || target.id || 'unnamed',
        semanticName: semanticName,
        purpose: purpose,
        businessContext: `Inferred from ${target.tagName} metadata - no screenshot available`,
        substitutionHints: [`dynamic_${semanticName}`, `test_${semanticName}`],
        dataClassification: dataClassification,
        requiredFormat: target.type === 'email' ? 'email@domain.com' : undefined,
        confidence: 0.5 // Lower confidence without visual context
      };
    }

    return null;
  }

  /**
   * Test model loading by sending a simple health check
   */
  private async testModelLoading(): Promise<void> {
    if (!this.vlmProcess) {
      throw new Error('VLM process not running');
    }

    console.log('🔍 Testing VLM model loading...');
    
    try {
      // Send health check request
      const healthRequest = {
        requestId: `health-${Date.now()}`,
        action: 'health'
      };

      const response = await this.sendVLMRequest(healthRequest);
      console.log('✅ VLM health check response:', response);
      
      // If health check succeeds, model should now be loaded 
      if (response.success) {
        console.log('🔄 Checking if model loaded after initialization...');
        
        // Send another health check to see if model is now loaded
        const secondHealthRequest = {
          requestId: `health-check-2-${Date.now()}`,
          action: 'health'
        };
        
        const secondResponse = await this.sendVLMRequest(secondHealthRequest);
        if (secondResponse.success && secondResponse.model_loaded) {
          console.log('✅ VLM model loaded and ready for inference');
          this.isModelLoaded = true;
        } else {
          console.log('ℹ️ VLM server ready but model will load on first analysis request');
        }
      }
      
    } catch (error: any) {
      console.error('❌ VLM health check failed:', error.message);
      throw error;
    }
  }

  /**
   * Expand paths - handle ~, relative paths, and absolute paths
   */
  private expandPath(filePath: string | undefined): string | undefined {
    if (!filePath) return undefined;
    
    // Handle ~ (home directory)
    if (filePath.startsWith('~/')) {
      return path.join(process.env.HOME || '', filePath.slice(2));
    }
    
    // Handle relative paths (./ or just relative)
    if (filePath.startsWith('./') || !path.isAbsolute(filePath)) {
      return path.resolve(process.cwd(), filePath);
    }
    
    // Return absolute paths as-is
    return filePath;
  }

  /**
   * Check for error indicators in action metadata
   */
  private hasErrorIndicators(action: RecordedAction): boolean {
    // Check for common error patterns in URLs, effects, or metadata
    const url = action.tabUrl || '';
    const effects = action.effects || {};
    
    // URL-based error detection
    if (/error|fail|404|500|unauthorized|forbidden/i.test(url)) {
      return true;
    }
    
    // Network error detection
    if (effects.network && Array.isArray(effects.network.requests)) {
      const errorRequests = effects.network.requests.filter((req: any) => 
        req.status && (req.status >= 400 || req.status === 0)
      );
      if (errorRequests.length > 0) {
        return true;
      }
    }
    
    // Form validation errors (common patterns)
    if (action.target && /error|invalid|required|missing/i.test(action.target.className || '')) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate fallback semantic name when VLM doesn't provide one
   */
  private generateFallbackSemanticName(element: any): string {
    if (element.type === 'email' || element.name?.includes('email')) {
      return 'Email Address';
    } else if (element.type === 'password') {
      return 'Password';
    } else if (element.name?.includes('name')) {
      return 'Name Field';
    } else if (element.placeholder) {
      return element.placeholder.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
    return 'Input Field';
  }

  /**
   * Generate fallback substitution hints when VLM doesn't provide them
   */
  private generateFallbackSubstitutionHints(element: any, action: any): string[] {
    if (element.type === 'email') {
      return ['test@example.com', 'demo@company.org', 'user@domain.net'];
    } else if (element.type === 'password') {
      return ['SecurePass123!', 'TestPassword456', 'DemoSecret789'];
    } else if (element.type === 'text') {
      return ['Sample Text', 'Test Input', 'Demo Value'];
    }
    return ['test-value', 'sample-input'];
  }

  /**
   * Classify data type based on element characteristics
   */
  private classifyDataType(element: any): 'personal-identifier' | 'sensitive' | 'public' | 'system-generated' {
    if (element.type === 'password' || element.name?.includes('password')) {
      return 'sensitive';
    } else if (element.type === 'email' || element.name?.includes('email')) {
      return 'personal-identifier';
    } else if (element.name?.includes('name') || element.name?.includes('user')) {
      return 'personal-identifier';
    }
    return 'public';
  }

  /**
   * Determine required format for input validation
   */
  private determineRequiredFormat(element: any): string | undefined {
    if (element.type === 'email') return 'email-address';
    if (element.type === 'url') return 'url';
    if (element.type === 'tel') return 'phone-number';
    return undefined;
  }

  /**
   * Detect error indicators in text (fallback method)
   */
  private detectErrorInText(text: string): boolean {
    return this.detectErrorInResponse(text);
  }
}

/**
 * Local VLM Model Configuration:
 * 
 * Model: llava-fastvithd_1.5b_stage3 (FastVLM optimized for Apple Silicon)
 * Communication: JSON over stdin/stdout with subprocess
 * 
 * Environment Variables:
 * - VLM_ENABLED=true/false (feature flag)
 * - VLM_MODEL_PATH=/path/to/model/checkpoints/llava-fastvithd_1.5b_stage3
 * - VLM_ML_PATH=/path/to/ml-fastvlm (working directory)
 * 
 * Local Model Capabilities:
 * - FastVLM inference optimized for Apple MPS
 * - Keeps model loaded in memory to avoid cold starts
 * - Analyze the SPECIFIC targetElement provided in request context
 * - Enhance existing elements rather than discovering new ones
 * - Visual error state detection from screenshots
 * - Understanding of business context from visual cues
 * 
 * VLM Prompt Strategy:
 * - "Analyze the form field at selector '{targetElement.selector}'"
 * - "This field currently has name '{targetElement.name}' and type '{targetElement.type}'"
 * - "Suggest a semantic name and purpose based on visual context"
 * - "DO NOT suggest different selectors, enhance the provided element"
 * 
 * Performance Characteristics:
 * - Model loading: ~2-3 seconds (at app startup, before user starts recording)
 * - Inference: ~200-500ms per image (after model is loaded)
 * - Memory usage: ~5GB RAM (model stays loaded)
 * - Max concurrent requests: 1 (sequential processing)
 * - Startup behavior: Model preloads automatically, ready by first recording
 * 
 * Setup Requirements:
 * 1. FastVLM environment at ~/Desktop/ml-fastvlm
 * 2. Model checkpoints downloaded
 * 3. Python dependencies installed (torch, transformers, etc.)
 * 4. Apple Silicon Mac for MPS acceleration
 */