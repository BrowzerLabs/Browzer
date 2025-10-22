import { RecordedAction } from '../../shared/types/recording';

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
 * VLM Service for cloud-based visual analysis
 */
export class VLMService {
  private static instance: VLMService;
  private readonly enabled: boolean;
  private readonly apiEndpoint: string;
  private readonly apiKey: string;

  constructor() {
    // Feature flag - set to false until cloud instance is ready
    this.enabled = process.env.VLM_ENABLED === 'true' || false;
    
    // Cloud API configuration (assumptions)
    this.apiEndpoint = process.env.VLM_API_ENDPOINT || 'https://vlm-api.browzer.cloud/v1/analyze';
    this.apiKey = process.env.VLM_API_KEY || '';
    
    console.log(`🧠 VLM Service initialized - Enabled: ${this.enabled}`);
  }

  public static getInstance(): VLMService {
    if (!VLMService.instance) {
      VLMService.instance = new VLMService();
    }
    return VLMService.instance;
  }

  /**
   * Analyze action with VLM for Phase 1 improvements
   */
  public async analyzeAction(request: VLMAnalysisRequest): Promise<VLMAnalysisResponse | null> {
    if (!this.enabled) {
      console.log('🧠 VLM Analysis skipped - feature disabled');
      return null;
    }

    if (!this.apiKey) {
      console.warn('🧠 VLM Analysis skipped - no API key configured');
      return null;
    }

    try {
      console.log(`🧠 Sending VLM analysis request for action ${request.actionIndex}...`);
      
      const startTime = Date.now();
      
      // Make API call to cloud VLM service with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Browzer-Version': '1.0.0'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`VLM API error: ${response.status} ${response.statusText}`);
      }

      const result: VLMAnalysisResponse = await response.json();
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ VLM analysis completed in ${processingTime}ms`);
      console.log(`🎯 Confidence: ${result.confidence}`, 
        result.variableDetection ? `Variables: ${result.variableDetection.variables.length}` : '',
        result.errorDetection?.errorDetected ? 'Errors detected' : '');

      return result;

    } catch (error) {
      console.error('❌ VLM analysis failed:', error);
      return null;
    }
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

    console.log(`🧠 Starting batch VLM analysis for ${actions.length} actions...`);
    
    const results: VLMAnalysisResponse[] = [];
    
    // Process actions in parallel (with concurrency limit)
    const concurrency = 3; // Limit concurrent requests
    const chunks = this.chunkArray(actions, concurrency);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (action, index) => {
        const screenshot = screenshots[index];
        if (!screenshot) return null;

        const request: VLMAnalysisRequest = {
          recordingId,
          actionIndex: index,
          action,
          screenshot,
          context: {
            ...context,
            formContext: action.metadata?.formContext,
            previousActions: actions.slice(0, index),
            
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

        return await this.analyzeAction(request);
      });

      const chunkResults = await Promise.allSettled(promises);
      
      chunkResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });
    }

    console.log(`✅ VLM batch analysis completed: ${results.length}/${actions.length} successful`);
    return results;
  }

  /**
   * Check if VLM service is available and configured
   */
  public isAvailable(): boolean {
    return this.enabled && !!this.apiKey;
  }

  /**
   * Get service configuration status
   */
  public getStatus() {
    return {
      enabled: this.enabled,
      configured: !!this.apiKey,
      endpoint: this.apiEndpoint
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Cloud API Assumptions and Configuration:
 * 
 * API Endpoint: https://vlm-api.browzer.cloud/v1/analyze
 * Method: POST
 * 
 * Headers:
 * - Content-Type: application/json
 * - Authorization: Bearer {API_KEY}
 * - X-Browzer-Version: 1.0.0
 * 
 * Request Body: VLMAnalysisRequest (as defined above)
 * 
 * Response Body: VLMAnalysisResponse (as defined above)
 * 
 * Environment Variables:
 * - VLM_ENABLED=true/false (feature flag)
 * - VLM_API_ENDPOINT=https://vlm-api.browzer.cloud/v1/analyze
 * - VLM_API_KEY=your-api-key
 * 
 * Expected VLM Model Capabilities:
 * - GPT-4 Vision or Claude-3 Vision level understanding
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
 * Rate Limits (assumed):
 * - 100 requests per minute per API key
 * - 30 second timeout per request
 * - Max 3 concurrent requests
 * 
 * Pricing (assumed):
 * - $0.01 per image analysis
 * - Batch discounts available for recordings with 10+ actions
 */