import Anthropic from '@anthropic-ai/sdk';

export class ContextWindowService {
  public static compressMessages(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    return this.removeTextAndImages(messages);
  }

  public static removeUnexecutedToolCalls(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    const unExecutedToolIds = new Set<string>();

    messages.forEach((message) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        message.content.forEach((block) => {
          if (
            block.type === 'tool_result' &&
            typeof block.content === 'string' &&
            block.content === '❌'
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

  private static removeTextAndImages(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    return messages.map((message) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        const filteredContent = message.content.filter((block) => {
          if (block.type === 'text') return false;
          if (block.type === 'image') return false;
          return true;
        });
        return { ...message, content: filteredContent };
      }
      return message;
    });
  }
}
