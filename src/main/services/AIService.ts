import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { AI_SYSTEM_MESSAGE } from '@/main/constants';

export interface AIResponse {
  text: string;
}

export interface AIContext {
  type: 'tab';
  tabId: string;
  title?: string;
  url?: string;
  markdown?: string;
}

export interface AIRequest {
  fullMessage: string;
  contexts?: AIContext[];
}

export class AIService {
  private apiKey: string | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not found, AI service will not be available');
      return;
    }

    this.apiKey = apiKey;
  }

  isInitialized(): boolean {
    return this.apiKey !== null;
  }

  async buildMemoryContext(fullMessage: string, memoryService: any): Promise<string> {
    try {
      if (!memoryService.isInitialized()) {
        console.warn('MemoryService not initialized, skipping memory context');
        return '';
      }

      const memoryResults = await memoryService.query([fullMessage], 3);
      if (memoryResults.documents && memoryResults.documents[0].length > 0) {
        const contextMessages = memoryResults.documents[0].map((doc: string, index: number) => {
          const metadata = memoryResults.metadatas?.[0]?.[index];
          const speaker = metadata?.type === 'user' ? 'User' : 'Assistant';
          return `${speaker}: ${doc}`;
        });
        return '\n\n<system-note>\nRelevant context from previous conversations:\n' + 
               contextMessages.join('\n') + '\n</system-note>';
      }
    } catch (error) {
      console.warn('Memory query failed:', error);
    }
    return '';
  }

  buildWebContext(contexts?: AIContext[]): string {
    if (!contexts || contexts.length === 0) return '';

    const contextSections = contexts.map(ctx => {
      if (ctx.type === 'tab') {
        const sections: string[] = [];
        if (ctx.title) sections.push(`Title: ${ctx.title}`);
        if (ctx.url) sections.push(`URL: ${ctx.url}`);
        if (ctx.markdown) sections.push(`Content:\n${ctx.markdown}`);
        return sections.join('\n');
      }
      return '';
    }).filter(Boolean);

    if (contextSections.length === 0) return '';

    return '\n\n<system-message>\nCurrent web content context:\n' +
           contextSections.join('\n\n---\n\n') + '\n</system-message>';
  }

  async callClaudeAPI(messageWithContext: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI service not initialized - ANTHROPIC_API_KEY required');
    }

    const systemMessage = AI_SYSTEM_MESSAGE;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemMessage,
      prompt: messageWithContext,
    });

    return text;
  }

  async storeConversationInMemory(
    userMessage: string, 
    assistantResponse: string, 
    memoryService: any
  ): Promise<void> {
    try {
      if (!memoryService.isInitialized()) {
        console.warn('MemoryService not initialized, skipping memory storage');
        return;
      }

      await memoryService.add(
        [userMessage, assistantResponse],
        [
          { type: 'user', timestamp: Date.now() },
          { type: 'assistant', timestamp: Date.now() }
        ]
      );
    } catch (error) {
      console.warn('Failed to store conversation in memory:', error);
    }
  }

  async processRequest(request: AIRequest, memoryService: any): Promise<string> {
    try {
      const [memoryContext, webContext] = await Promise.all([
        this.buildMemoryContext(request.fullMessage, memoryService),
        Promise.resolve(this.buildWebContext(request.contexts))
      ]);

      const messageWithContext = request.fullMessage + webContext + memoryContext;
      const responseText = await this.callClaudeAPI(messageWithContext);

      await this.storeConversationInMemory(request.fullMessage, responseText, memoryService);

      return responseText;
    } catch (error) {
      console.error('AI request processing failed:', error);
      throw new Error(`Failed to get AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
