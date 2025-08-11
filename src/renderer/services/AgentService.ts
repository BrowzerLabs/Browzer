import { AgentParams, AgentResult, PageContent, ConversationMessage } from '../../shared/types';
import { ContentExtraction } from '../utils/contentExtraction';
import { URLUtils } from '../utils/urlUtils';

export class AgentService {
  private currentConversation: ConversationMessage[] = [];
  private isExecuting = false;

  async executeAgent(agentType: string, params: AgentParams): Promise<AgentResult> {
    if (this.isExecuting) {
      return { success: false, error: 'Agent is already executing' };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      // console.log(`Executing ${agentType} agent with params:`, params);
      
      const agentPath = this.getAgentPath(agentType);
      if (!agentPath) {
        throw new Error(`Unknown agent type: ${agentType}`);
      }

      // Use the electronAPI from preload
      const result = await (window as any).electronAPI.executeAgent(agentPath, params);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (result.success) {
        // Add to conversation history
        this.addToConversation('user', params.query, startTime);
        if (result.data && result.data.summary) {
          this.addToConversation('assistant', result.data.summary, endTime);
        }

        return {
          ...result,
          timing: {
            start: startTime,
            end: endTime,
            duration: duration
          }
        };
      } else {
        console.error('Agent execution failed:', result.error);
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Agent execution error:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        timing: {
          start: startTime,
          end: Date.now(),
          duration: Date.now() - startTime
        }
      };
    } finally {
      this.isExecuting = false;
    }
  }

  private getAgentPath(agentType: string): string | null {
    const agentPaths: Record<string, string> = {
      'crypto': './agents/crypto_agent.py',
      'topic': './agents/topic_agent.py',
      'flight': './agents/flight_agent.py'
    };

    return agentPaths[agentType] || null;
  }

  private addToConversation(role: 'user' | 'assistant', content: string, timestamp: number): void {
    this.currentConversation.push({
      role,
      content,
      timestamp
    });

    // Keep only the last 20 messages to prevent memory bloat
    if (this.currentConversation.length > 20) {
      this.currentConversation = this.currentConversation.slice(-20);
    }
  }

  async extractPageContent(webview: any, options: { 
    includeHtml?: boolean; 
    preserveLinks?: boolean;
    detectContentType?: boolean;
  } = {}): Promise<PageContent | null> {
    try {
      const extracted = await ContentExtraction.extractPageContent(webview, options);
      return extracted ? {
        title: extracted.title,
        content: extracted.content,
        url: extracted.url
      } : null;
    } catch (error) {
      console.error('Error extracting page content:', error);
      return null;
    }
  }

  async autoSummarizePage(url: string, webview: any): Promise<void> {
    if (!url || !url.startsWith('http')) {
      // console.log('Skipping auto-summarize for non-HTTP URL:', url);
      return;
    }

    try {
      // console.log('Auto-summarizing page:', url);
      
      // Extract page content
      const pageContent = await this.extractPageContent(webview, {
        includeHtml: false,
        preserveLinks: true,
        detectContentType: true
      });

      if (!pageContent || !pageContent.content) {
        // console.log('No content extracted for auto-summarization');
        return;
      }

      // Determine appropriate agent based on content
      let agentType = 'topic'; // default
      if (url.includes('crypto') || url.includes('bitcoin') || url.includes('ethereum')) {
        agentType = 'crypto';
      } else if (url.includes('flight') || url.includes('airline') || url.includes('travel')) {
        agentType = 'flight';
      }

      // Prepare agent parameters
      const agentParams: AgentParams = {
        query: `Summarize this page: ${pageContent.title}`,
        pageContent: pageContent,
        isQuestion: false
      };

      // Execute summarization
      const result = await this.executeAgent(agentType, agentParams);
      
      if (result.success) {
        // console.log('Auto-summarization completed');
        // The result will be handled by the UI components
      } else {
        console.error('Auto-summarization failed:', result.error);
      }
    } catch (error) {
      console.error('Error in auto-summarization:', error);
    }
  }

  clearConversationHistory(): void {
    this.currentConversation = [];
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.currentConversation];
  }

  isAgentExecuting(): boolean {
    return this.isExecuting;
  }

  getModelInfo(): { provider: string; model: string } {
    // This could be made configurable in the future
    return {
      provider: 'openai',
      model: 'gpt-4'
    };
  }
} 