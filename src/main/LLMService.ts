import * as https from 'https';
import * as http from 'http';

export interface LLMRequest {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  prompt: string;
  systemPrompt?: string; // New: Optional system prompt
  model?: string;
  maxTokens?: number;
}

export interface LLMResponse {
  success: boolean;
  response?: string;
  error?: string;
}

export class LLMService {
  constructor() {}

  async callLLM(request: LLMRequest): Promise<LLMResponse> {
    try {
      // console.log('[LLMService] Making API call to:', request.provider);
      
      if (request.provider === 'anthropic') {
        return await this.callAnthropicAPI(request);
      } else if (request.provider === 'openai') {
        return await this.callOpenAIAPI(request);
      } else {
        return {
          success: false,
          error: `Unsupported provider: ${request.provider}`
        };
      }
    } catch (error) {
      console.error('[LLMService] Error calling LLM:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async makeHttpsRequest(hostname: string, path: string, headers: Record<string, string>, body: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });
  }

  private async callAnthropicAPI(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Build messages array with optional system message
      const messages: any[] = [];
      
      // Add system message if provided (Anthropic supports system parameter)
      const requestBody: any = {
        model: request.model || 'claude-sonnet-4-20250514',
        max_tokens: request.maxTokens || 1000,
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ]
      };

      // Add system prompt if provided
      if (request.systemPrompt) {
        requestBody.system = request.systemPrompt;
      }

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': request.apiKey,
        'anthropic-version': '2023-06-01'
      };

      const data = await this.makeHttpsRequest(
        'api.anthropic.com',
        '/v1/messages',
        headers,
        JSON.stringify(requestBody)
      );
      
      if (!data.content || !data.content[0] || !data.content[0].text) {
        return {
          success: false,
          error: 'Invalid response format from Anthropic API'
        };
      }

      return {
        success: true,
        response: data.content[0].text
      };
    } catch (error) {
      console.error('[LLMService] Anthropic API call failed:', error);
      return {
        success: false,
        error: `Anthropic API call failed: ${(error as Error).message}`
      };
    }
  }

  private async callOpenAIAPI(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Build messages array with optional system message
      const messages: any[] = [];
      
      // Add system message if provided (OpenAI format)
      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt
        });
      }

      // Add user message
      messages.push({
        role: 'user',
        content: request.prompt
      });

      const requestBody = JSON.stringify({
        model: request.model || 'gpt-4o',
        max_tokens: request.maxTokens || 1000,
        messages: messages
      });

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`
      };

      const data = await this.makeHttpsRequest(
        'api.openai.com',
        '/v1/chat/completions',
        headers,
        requestBody
      );
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        return {
          success: false,
          error: 'Invalid response format from OpenAI API'
        };
      }

      return {
        success: true,
        response: data.choices[0].message.content
      };
    } catch (error) {
      console.error('[LLMService] OpenAI API call failed:', error);
      return {
        success: false,
        error: `OpenAI API call failed: ${(error as Error).message}`
      };
    }
  }
} 