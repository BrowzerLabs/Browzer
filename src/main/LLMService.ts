import * as https from 'https';
import { GoogleGenAI } from '@google/genai';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MultiModalContent[];
}

export interface MultiModalContent {
  type: 'text' | 'image';
  text?: string;
  image?: {
    base64: string;
    mimeType: string;
  };
}

export interface LLMRequest {
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  prompt?: string; // Deprecated, use messages instead
  systemPrompt?: string; // Deprecated, use messages instead
  messages?: LLMMessage[]; // NEW: Conversation history
  conversationHistory?: Array<{ role: string; content: string }>; // Legacy support
  model?: string;
  maxTokens?: number;
  temperature?: number;
  safetySettings?: GeminiSafetySettings[];
  thinkingBudget?: number;
}

export interface GeminiSafetySettings {
  category: 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT' | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
}

export interface LLMResponse {
  success: boolean;
  response?: string;
  error?: string;
  finishReason?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class LLMService {
  constructor() {}

  async callLLM(request: LLMRequest): Promise<LLMResponse> {
    try {
      const messages = this.normalizeMessages(request);
      
      if (request.provider === 'anthropic') {
        return await this.callGeminiAPI(request, messages);
      } else if (request.provider === 'openai') {
        return await this.callOpenAIAPI(request, messages);
      } else if (request.provider === 'gemini') {
        return await this.callGeminiAPI(request, messages);
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

  private normalizeMessages(request: LLMRequest): LLMMessage[] {
    if (request.messages && request.messages.length > 0) {
      return request.messages;
    }

    const messages: LLMMessage[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      request.conversationHistory.forEach((msg) => {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      });
    }

    if (request.prompt) {
      messages.push({
        role: 'user',
        content: request.prompt,
      });
    }

    return messages;
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

  private async callAnthropicAPI(request: LLMRequest, messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const anthropicMessages: any[] = [];
      let systemPrompt: string | undefined;

      messages.forEach((msg) => {
        if (msg.role === 'system') {
          systemPrompt = typeof msg.content === 'string' ? msg.content : '';
        } else {
          const content = this.convertToAnthropicContent(msg.content);
          anthropicMessages.push({
            role: msg.role,
            content,
          });
        }
      });

      const requestBody: any = {
        model: request.model || 'claude-sonnet-4-20250514',
        max_tokens: request.maxTokens || 4000,
        messages: anthropicMessages,
      };

      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      if (request.temperature !== undefined) {
        requestBody.temperature = request.temperature;
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
      
      if (!data.content || !data.content[0]) {
        return {
          success: false,
          error: 'Invalid response format from Anthropic API'
        };
      }

      const responseText = data.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');

      return {
        success: true,
        response: responseText,
        finishReason: data.stop_reason,
        usageMetadata: {
          promptTokenCount: data.usage?.input_tokens,
          candidatesTokenCount: data.usage?.output_tokens,
          totalTokenCount: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      };
    } catch (error) {
      console.error('[LLMService] Anthropic API call failed:', error);
      return {
        success: false,
        error: `Anthropic API call failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Convert content to Anthropic format
   */
  private convertToAnthropicContent(content: string | MultiModalContent[]): any {
    if (typeof content === 'string') {
      return content;
    }

    return content.map((item) => {
      if (item.type === 'text') {
        return {
          type: 'text',
          text: item.text,
        };
      } else if (item.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: item.image!.mimeType,
            data: item.image!.base64,
          },
        };
      }
      return item;
    });
  }

  /**
   * Call OpenAI API with multi-modal support
   */
  private async callOpenAIAPI(request: LLMRequest, messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const openaiMessages = messages.map((msg) => ({
        role: msg.role,
        content: this.convertToOpenAIContent(msg.content),
      }));

      const requestBody: any = {
        model: request.model || 'gpt-4o',
        max_tokens: request.maxTokens || 4000,
        messages: openaiMessages,
      };

      if (request.temperature !== undefined) {
        requestBody.temperature = request.temperature;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`
      };

      const data = await this.makeHttpsRequest(
        'api.openai.com',
        '/v1/chat/completions',
        headers,
        JSON.stringify(requestBody)
      );
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        return {
          success: false,
          error: 'Invalid response format from OpenAI API'
        };
      }

      return {
        success: true,
        response: data.choices[0].message.content,
        finishReason: data.choices[0].finish_reason,
        usageMetadata: {
          promptTokenCount: data.usage?.prompt_tokens,
          candidatesTokenCount: data.usage?.completion_tokens,
          totalTokenCount: data.usage?.total_tokens,
        },
      };
    } catch (error) {
      console.error('[LLMService] OpenAI API call failed:', error);
      return {
        success: false,
        error: `OpenAI API call failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Convert content to OpenAI format
   */
  private convertToOpenAIContent(content: string | MultiModalContent[]): any {
    if (typeof content === 'string') {
      return content;
    }

    return content.map((item) => {
      if (item.type === 'text') {
        return {
          type: 'text',
          text: item.text,
        };
      } else if (item.type === 'image') {
        return {
          type: 'image_url',
          image_url: {
            url: `data:${item.image!.mimeType};base64,${item.image!.base64}`,
          },
        };
      }
      return item;
    });
  }

  /**
   * Call Gemini API with multi-modal support
   */
  private async callGeminiAPI(request: LLMRequest, messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      const genAI = new GoogleGenAI({ apiKey: request.apiKey });

      // Convert messages to Gemini format
      const geminiContents: any[] = [];
      let systemInstruction: string | undefined;

      messages.forEach((msg) => {
        if (msg.role === 'system') {
          systemInstruction = typeof msg.content === 'string' ? msg.content : '';
        } else {
          geminiContents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: this.convertToGeminiParts(msg.content),
          });
        }
      });

      const config: any = {
        generationConfig: {
          maxOutputTokens: request.maxTokens || 4000,
          temperature: request.temperature !== undefined ? request.temperature : 0.1,
        },
      };

      if (request.safetySettings) {
        config.safetySettings = request.safetySettings;
      }

      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }

      config.thinkingConfig = {
        thinkingBudget: 0
      };

      const model = request.model || 'gemini-2.5-flash';

      const response = await genAI.models.generateContent({
        model,
        contents: geminiContents,
        config,
      });

      const responseText = response.text;

      if (!responseText) {
        return {
          success: false,
          error: 'Empty response from Gemini API'
        };
      }

      return {
        success: true,
        response: responseText,
        usageMetadata: {
          promptTokenCount: response.usageMetadata?.promptTokenCount,
          candidatesTokenCount: response.usageMetadata?.candidatesTokenCount,
          totalTokenCount: response.usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      console.error('[LLMService] Gemini API call failed:', error);
      
      let errorMessage = `Gemini API call failed: ${(error as Error).message}`;
      
      if (error instanceof Error && error.message.includes('SAFETY')) {
        errorMessage = 'Content blocked due to safety filters';
        return {
          success: false,
          error: errorMessage,
          finishReason: 'SAFETY'
        };
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Convert content to Gemini parts format
   */
  private convertToGeminiParts(content: string | MultiModalContent[]): any[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    return content.map((item) => {
      if (item.type === 'text') {
        return { text: item.text };
      } else if (item.type === 'image') {
        // // Clean base64 data - remove any whitespace, newlines, or data URI prefix
        // let cleanBase64 = item.image!.base64;
        
        // // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
        // if (cleanBase64.includes(',')) {
        //   cleanBase64 = cleanBase64.split(',')[1];
        // }
        
        // // Remove all whitespace and newlines
        // cleanBase64 = cleanBase64.replace(/\s/g, '');
        
        return {
          inlineData: {
            mimeType: item.image!.mimeType,
            data: ''
          },
        };
      }
      return item;
    });
  }
}
