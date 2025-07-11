export interface ParsedAction {
  action: string;
  target?: string;
  value?: string;
  reasoning?: string;
}

export class ResponseParser {
  constructor(private response: string) {}

  parse(): ParsedAction {
    const strategies = [
      () => this.parseStandardJSON(),
      () => this.parseFuzzyJSON(),
      () => this.parseNaturalLanguage(),
      () => this.parsePatternMatching()
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result && this.validateAction(result)) {
          return result;
        }
      } catch (error) {
        console.warn('Parsing strategy failed:', error);
      }
    }

    return this.getFallbackAction();
  }

  private parseStandardJSON(): ParsedAction | null {
    const jsonMatch = this.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  private parseFuzzyJSON(): ParsedAction | null {
    let jsonStr = this.response;
    
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) return null;
    
    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    jsonStr = jsonStr.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}])/g, ':"$1"$2');
    jsonStr = jsonStr.replace(/,\s*}/g, '}');
    jsonStr = jsonStr.replace(/,\s*]/g, ']');

    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  private parseNaturalLanguage(): ParsedAction | null {
    const response = this.response.toLowerCase();
    
    const actionPatterns = {
      click: /(?:click|press|tap)\s+(?:on\s+)?(.+?)(?:\.|$|,)/,
      type: /(?:type|enter|input)\s+['""](.+?)['""](?:\s+(?:in|into)\s+(.+?))?(?:\.|$|,)/,
      navigate: /(?:go\s+to|navigate\s+to|visit)\s+(.+?)(?:\.|$|,)/,
      scroll: /scroll\s+(.+?)(?:\.|$|,)/,
      wait: /wait\s+(?:for\s+)?(.+?)(?:\.|$|,)/,
      extract: /(?:extract|get|find)\s+(.+?)(?:\.|$|,)/,
      complete: /(?:complete|done|finished)/
    };

    for (const [action, pattern] of Object.entries(actionPatterns)) {
      const match = response.match(pattern);
      if (match) {
        return {
          action,
          target: match[2] || match[1] || undefined,
          value: action === 'type' ? match[1] : undefined,
          reasoning: 'Parsed from natural language'
        };
      }
    }

    return null;
  }

  private parsePatternMatching(): ParsedAction | null {
    const patterns = [
      /action['":\s]*['""]?(\w+)['""]?/i,
      /do['":\s]*['""]?(\w+)['""]?/i,
      /next['":\s]*['""]?(\w+)['""]?/i
    ];

    for (const pattern of patterns) {
      const match = this.response.match(pattern);
      if (match) {
        const action = match[1].toLowerCase();
        if (this.isValidAction(action)) {
          return {
            action,
            reasoning: 'Parsed from pattern matching'
          };
        }
      }
    }

    return null;
  }

  private validateAction(action: ParsedAction): boolean {
    return (
      action &&
      typeof action.action === 'string' &&
      this.isValidAction(action.action) &&
      (action.target === undefined || typeof action.target === 'string') &&
      (action.value === undefined || typeof action.value === 'string')
    );
  }

  private isValidAction(action: string): boolean {
    const validActions = ['click', 'type', 'navigate', 'scroll', 'wait', 'extract', 'complete'];
    return validActions.includes(action.toLowerCase());
  }

  private getFallbackAction(): ParsedAction {
    return {
      action: 'wait',
      value: '2000',
      reasoning: 'Fallback action due to parsing failure'
    };
  }
}
