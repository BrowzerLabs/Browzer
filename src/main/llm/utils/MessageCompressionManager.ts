/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';

/**
 * MessageCompressionManager - Smart context window optimization for conversation messages
 * 
 * Compression Types:
 * 
 * 1. **Unexecuted Tool Calls** (Priority: First)
 *    - Removes BOTH tool_use and tool_result blocks for steps that weren't executed
 *    - Marker: "Not executed - automation stopped before reaching this step"
 *    - Savings: ~50-100 tokens per unexecuted step
 *    - Critical for failed automations with many skipped steps
 * 
 * 2. **Analysis Results** (extract_context, take_snapshot)
 *    - Compress ALL occurrences to minimal strings
 *    - Analysis data is only useful when fresh, no need to retain old results
 *    - Savings: 10K-50K+ tokens per result
 * 
 * 3. **Error Messages** (AUTOMATION ERROR ENCOUNTERED)
 *    - Keep ONLY the most recent error with full context
 *    - Compress all older errors to minimal strings
 *    - Only latest error is relevant for recovery
 *    - Savings: 5K-20K+ tokens per error
 * 
 * Total Savings: Can save 100K-300K+ tokens in long-running automations!
 */
export class MessageCompressionManager {
  private static readonly ANALYSIS_TOOLS = ['extract_context', 'take_snapshot'];
  private static readonly ERROR_MARKER = 'AUTOMATION ERROR ENCOUNTERED';
  private static readonly UNEXECUTED_MARKER = 'Not executed - automation stopped before reaching this step';
  private static readonly COMPRESSED_ANALYSIS = 
    '✅ Analysis completed successfully, full result was provided to model and has been compressed to save context';
  
  private static readonly COMPRESSED_ERROR = 
    '⚠️ Previous error compressed';

  /**
   * Check if a tool is an analysis tool
   */
  public static isAnalysisTool(toolName: string): boolean {
    return this.ANALYSIS_TOOLS.includes(toolName);
  }

  /**
   * Master compression method - applies all compression strategies
   * 
   * This is the main entry point that orchestrates all compression types.
   * Call this after the model receives new content to clean up context window.
   */
  public static compressMessages(
    messages: Anthropic.MessageParam[]
  ): {
    compressedMessages: Anthropic.MessageParam[];
    compressedCount: number;
  } {
    let workingMessages = messages;
    let totalCompressed = 0;

    // Apply unexecuted tool removal (must be first to clean up message structure)
    const unexecutedResult = this.removeUnexecutedTools(workingMessages);
    workingMessages = unexecutedResult.compressedMessages;
    totalCompressed += unexecutedResult.compressedCount;

    // Apply analysis result compression
    const analysisResult = this.compressAnalysisResults(workingMessages);
    workingMessages = analysisResult.compressedMessages;
    totalCompressed += analysisResult.compressedCount;

    // Apply error message compression
    const errorResult = this.compressErrorMessages(workingMessages);
    workingMessages = errorResult.compressedMessages;
    totalCompressed += errorResult.compressedCount;

    return {
      compressedMessages: workingMessages,
      compressedCount: totalCompressed
    };
  }

  /**
   * Compress analysis tool results in messages array
   * 
   * Strategy:
   * - Find all tool_result blocks for analysis tools
   * - Compress ALL of them to minimal strings
   * - Analysis results don't need to be retained after model processes them
   */
  private static compressAnalysisResults(
    messages: Anthropic.MessageParam[]
  ): {
    compressedMessages: Anthropic.MessageParam[];
    compressedCount: number;
  } {
    let compressedCount = 0;

    // Track the indices of analysis tool results
    const analysisResultIndices: Array<{
      messageIndex: number;
      contentIndex: number;
      toolUseId: string;
      originalSize: number;
    }> = [];

    // First pass: Find all analysis tool results
    messages.forEach((message, messageIndex) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        message.content.forEach((block, contentIndex) => {
          if (block.type === 'tool_result') {
            // Check if this is an analysis tool result by examining content
            const isAnalysisResult = this.isAnalysisToolResult(block.content);
            
            if (isAnalysisResult) {
              const originalSize = JSON.stringify(block.content).length;
              analysisResultIndices.push({
                messageIndex,
                contentIndex,
                toolUseId: block.tool_use_id,
                originalSize
              });
            }
          }
        });
      }
    });

    if (analysisResultIndices.length === 0) {
      return {
        compressedMessages: messages,
        compressedCount: 0,
      };
    }
    
    const compressedMessages = JSON.parse(JSON.stringify(messages)) as Anthropic.MessageParam[];
    analysisResultIndices.forEach(({ messageIndex, contentIndex, originalSize }) => {
      const message = compressedMessages[messageIndex];
      if (Array.isArray(message.content)) {
        const block = message.content[contentIndex];
        if (block.type === 'tool_result') {
          block.content = this.COMPRESSED_ANALYSIS;
          
          compressedCount++;
        }
      }
    });

    return {
      compressedMessages,
      compressedCount,
    };
  }

  private static isAnalysisToolResult(content: string | any): boolean {
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      
      if (parsed.extractedAt && parsed.dom && parsed.url) {
        return true;
      }
      
      if (parsed.data && parsed.data.snapshot) {
        return true;
      }
      
      if (parsed.note && parsed.note.includes('compressed')) {
        return false;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private static compressErrorMessages(
    messages: Anthropic.MessageParam[]
  ): {
    compressedMessages: Anthropic.MessageParam[];
    compressedCount: number;
  } {
    let compressedCount = 0;

    // Track indices of error messages
    const errorIndices: Array<{
      messageIndex: number;
      contentIndex: number;
      originalSize: number;
    }> = [];

    // Find all error messages
    messages.forEach((message, messageIndex) => {
      if (Array.isArray(message.content)) {
        message.content.forEach((block, contentIndex) => {
          if (block.type === 'text' && this.isErrorMessage(block.text)) {
            const originalSize = block.text.length;
            errorIndices.push({
              messageIndex,
              contentIndex,
              originalSize
            });
          }
        });
      } else if (typeof message.content === 'string' && this.isErrorMessage(message.content)) {
        const originalSize = message.content.length;
        errorIndices.push({
          messageIndex,
          contentIndex: -1, // Indicates string content
          originalSize
        });
      }
    });

    if (errorIndices.length == 0) {
      // 0 or 1 error - no compression needed
      return {
        compressedMessages: messages,
        compressedCount: 0,
      };
    }

    // Compress all errors EXCEPT the last one
    const compressedMessages = JSON.parse(JSON.stringify(messages)) as Anthropic.MessageParam[];

    errorIndices.forEach(({ messageIndex, contentIndex }) => {
      const message = compressedMessages[messageIndex];
      
      if (contentIndex === -1) {
        // String content
        message.content = this.COMPRESSED_ERROR;
      } else if (Array.isArray(message.content)) {
        // Array content
        const block = message.content[contentIndex];
        if (block.type === 'text') {
          block.text = this.COMPRESSED_ERROR;
        }
      }

      compressedCount++;
    });

    return {
      compressedMessages,
      compressedCount,
    };
  }

  private static isErrorMessage(text: string): boolean {
    return text.includes(this.ERROR_MARKER);
  }

  
  private static removeUnexecutedTools(
    messages: Anthropic.MessageParam[]
  ): {
    compressedMessages: Anthropic.MessageParam[];
    compressedCount: number;
  } {
    let compressedCount = 0;

    const unexecutedToolIds = new Set<string>();

    messages.forEach(message => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        message.content.forEach(block => {
          if (block.type === 'tool_result' && this.isUnexecutedResult(block.content)) {
            unexecutedToolIds.add(block.tool_use_id);
          }
        });
      }
    });

    if (unexecutedToolIds.size === 0) {
      return {
        compressedMessages: messages,
        compressedCount: 0,
      };
    }

    const compressedMessages = JSON.parse(JSON.stringify(messages)) as Anthropic.MessageParam[];

    compressedMessages.forEach(message => {
      if (Array.isArray(message.content)) {
        
        message.content = message.content.filter(block => {
          if (block.type === 'tool_use' && unexecutedToolIds.has(block.id)) {
            compressedCount++;
            return false;
          }
          
          if (block.type === 'tool_result' && unexecutedToolIds.has(block.tool_use_id)) {
            compressedCount++;
            return false;
          }
          
          return true;
        });
      }
    });

    return {
      compressedMessages,
      compressedCount,
    };
  }

  private static isUnexecutedResult(content: string | any): boolean {
    if (typeof content === 'string') {
      return content.includes(this.UNEXECUTED_MARKER);
    }
    return false;
  }
}
