export interface LLMResponse {
  content: string;
  success: boolean;
  error?: string;
}

export type QueryClassification = 'ask' | 'do';

export interface QueryClassificationResponse {
  classification: QueryClassification;
  success: boolean;
  error?: string;
}

export type LLMContext =
  | { type: 'tab'; tabId: string; title?: string; url?: string; markdown?: string };

export interface LLMRequestOptions {
  /**
   * When provided, model should prefer using these contexts for grounding.
   * If omitted or empty, treat as no context.
   */
  contexts?: LLMContext[];
}

export function messageWithContext(message: string, contexts?: LLMContext[]): string {
  if (!contexts?.length) return message;

  const contextText = contexts
    .map(ctx => {
      if (ctx.type === 'tab') {
        const lines: string[] = [];
        if (ctx.title) lines.push(`# Title: ${ctx.title}`);
        if (ctx.url) lines.push(`URL: ${ctx.url}`);
        if (ctx.markdown) lines.push(ctx.markdown);
        return lines.join('\n');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n---\n\n');

  return contextText ? `${contextText}\n\n${message}` : message;
}

export async function classifyQuery(query: string): Promise<QueryClassificationResponse> {
  try {
    const classificationPrompt = `Classify the following user query as either 'ask' or 'do'. 
    - 'ask' means the user is seeking information.
    - 'do' means the user wants an action to be performed.
    If it has both, classify it as 'do'.
    
    User query: "${query}"
    
    Respond with only one word: either 'ask' or 'do'.`;

    const response = await window.aiAPI.sendClaude(classificationPrompt);
    
    const classification = response.trim().toLowerCase();
    if (classification === 'ask' || classification === 'do') {
      return { classification: classification as QueryClassification, success: true };
    }
    
    return { classification: 'ask', success: true };
  } catch (error) {
    return {
      classification: 'ask',
      success: false,
      error: (error as Error)?.message ?? 'Unknown error occurred',
    };
  }
}

export async function handleAskQuery(fullMessage: string, contexts?: LLMContext[]): Promise<LLMResponse> {
  try {
    const result = await window.aiAPI.sendClaude(fullMessage, contexts);
    return { content: result, success: true };
  } catch (error) {
    return {
      content: '',
      success: false,
      error: (error as Error)?.message ?? 'Unknown error occurred',
    };
  }
}

export async function handleDoQuery(
  query: string, 
  contexts?: LLMContext[]
): Promise<LLMResponse> {
  // TODO: Implement do query handling
  console.log('Do query received:', query, contexts);
  return {
    content: "It's a do query",
    success: true,
  }
}
