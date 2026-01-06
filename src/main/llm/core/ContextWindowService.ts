import Anthropic from '@anthropic-ai/sdk';

export class ContextWindowService {
  public static compressMessages(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    let compressedMessages: Anthropic.MessageParam[] = [];
    compressedMessages = this.removeUnexecutedToolCalls(messages);
    compressedMessages = this.removeObservationTools(compressedMessages);
    compressedMessages = this.compressAnalysisResults(compressedMessages);
    compressedMessages = this.compressErrorMessages(compressedMessages);
    return compressedMessages;
  }

  private static removeUnexecutedToolCalls(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    const unExecutedToolIds = new Set<string>();

    messages.forEach((message) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        message.content.forEach((block) => {
          if (
            block.type === 'tool_result' &&
            typeof block.content === 'string' &&
            block.content.includes('❌')
          ) {
            unExecutedToolIds.add(block.tool_use_id);
          }
        });
      }
    });

    if (unExecutedToolIds.size === 0) return messages;
    return messages.map((message) => {
      if (Array.isArray(message.content)) {
        const filteredContent = message.content.filter((block) => {
          if (
            block.type === 'tool_result' &&
            unExecutedToolIds.has(block.tool_use_id)
          )
            return false;
          if (block.type === 'tool_use' && unExecutedToolIds.has(block.id))
            return false;
          return true;
        });
        return { ...message, content: filteredContent };
      }
      return message;
    });
  }

  private static removeObservationTools(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    const observationTools = new Set(['wait']);
    const observationToolIds = new Set<string>();

    messages.forEach((message) => {
      if (Array.isArray(message.content)) {
        message.content.forEach((block) => {
          if (block.type === 'tool_use' && observationTools.has(block.name)) {
            observationToolIds.add(block.id);
          }
        });
      }
    });

    return messages.map((message) => {
      if (Array.isArray(message.content)) {
        const filteredContent = message.content.filter((block) => {
          if (block.type === 'tool_use' && observationTools.has(block.name)) {
            return false;
          }
          if (
            block.type === 'tool_result' &&
            observationToolIds.has(block.tool_use_id)
          ) {
            return false;
          }
          return true;
        });
        return { ...message, content: filteredContent };
      }
      return message;
    });
  }

  private static compressAnalysisResults(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    let analysisToolIdSet = new Set<string>();
    messages.forEach((message) => {
      if (Array.isArray(message.content)) {
        message.content.forEach((block) => {
          if (
            block.type === 'tool_use' &&
            (block.name === 'extract_context' || block.name === 'take_snapshot')
          ) {
            analysisToolIdSet.add(block.id);
          }
        });
      }
    });

    return messages.map((message) => {
      if (Array.isArray(message.content)) {
        const modifiedContent = message.content.map((block) => {
          if (
            block.type === 'tool_result' &&
            analysisToolIdSet.has(block.tool_use_id)
          ) {
            return { ...block, content: '✅' };
          }
          return block;
        });
        return { ...message, content: modifiedContent };
      }
      return message;
    });
  }

  private static compressErrorMessages(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    return messages.map((message) => {
      if (Array.isArray(message.content)) {
        const modifiedContent = message.content.map((block) => {
          if (
            block.type === 'text' &&
            block.text.includes('AUTOMATION ERROR ENCOUNTERED')
          ) {
            return { ...block, text: 'compressed error message' };
          }
          return block;
        });
        return { ...message, content: modifiedContent };
      }
      return message;
    });
  }
}
