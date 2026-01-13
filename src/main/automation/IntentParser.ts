/**
 * Intent Parser
 *
 * Parses natural language prompts to extract structured intent
 * for workflow generalization.
 */

import { ParsedIntent, IntentType, ContextInsights } from './types';

export class IntentParser {
  /**
   * Parse a natural language prompt into structured intent
   */
  async parse(
    prompt: string,
    contextInsights?: Partial<ContextInsights>
  ): Promise<ParsedIntent> {
    console.log('[IntentParser] Parsing prompt:', prompt);

    const normalizedPrompt = prompt.toLowerCase().trim();

    // Try to match known patterns
    const patterns: Array<{
      regex: RegExp;
      type: IntentType;
      extractor: (match: RegExpMatchArray) => Record<string, any>;
    }> = [
      // Ordinal patterns: "3rd repo", "first item", "second button"
      {
        regex: /(?:the\s+)?(\d+)(?:st|nd|rd|th)\s+(\w+)/i,
        type: 'select_nth_item',
        extractor: (match) => ({
          index: parseInt(match[1], 10) - 1, // Convert to 0-based
          itemType: match[2],
        }),
      },
      {
        regex: /(?:the\s+)?(first|second|third|fourth|fifth|last)\s+(\w+)/i,
        type: 'select_nth_item',
        extractor: (match) => ({
          index: this.ordinalToIndex(match[1]),
          itemType: match[2],
        }),
      },

      // Change target patterns: "change X to Y", "set X to Y"
      {
        regex: /(?:change|set|update)\s+(?:the\s+)?(.+?)\s+(?:to|=)\s+(.+)/i,
        type: 'change_target',
        extractor: (match) => ({
          target: match[1].trim(),
          newValue: match[2].trim(),
        }),
      },

      // Conditional patterns: "if X then Y", "when X do Y"
      {
        regex: /(?:if|when)\s+(.+?)\s+(?:then|do)\s+(.+)/i,
        type: 'add_condition',
        extractor: (match) => ({
          condition: match[1].trim(),
          action: match[2].trim(),
        }),
      },

      // Loop patterns: "for each X", "loop through X"
      {
        regex: /(?:for\s+each|loop\s+through|iterate\s+over)\s+(.+)/i,
        type: 'loop_items',
        extractor: (match) => ({
          itemType: match[1].trim(),
        }),
      },

      // Filter patterns: "only X", "filter by X"
      {
        regex: /(?:only|filter\s+by|where)\s+(.+)/i,
        type: 'filter_items',
        extractor: (match) => ({
          filterCondition: match[1].trim(),
        }),
      },
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const match = prompt.match(pattern.regex);
      if (match) {
        const parameters = pattern.extractor(match);
        console.log(
          `[IntentParser] Matched pattern: ${pattern.type}`,
          parameters
        );

        return {
          type: pattern.type,
          rawPrompt: prompt,
          parameters,
          confidence: 0.8,
        };
      }
    }

    // Extract any numbers that might indicate indices
    const numberMatch = normalizedPrompt.match(/\b(\d+)\b/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1], 10);

      // Check if the context suggests this is about selecting an item
      const itemKeywords = [
        'repo',
        'repository',
        'item',
        'row',
        'entry',
        'result',
        'button',
        'link',
        'option',
        'element',
        'card',
        'post',
      ];

      const hasItemKeyword = itemKeywords.some((kw) =>
        normalizedPrompt.includes(kw)
      );

      if (hasItemKeyword) {
        const itemType =
          itemKeywords.find((kw) => normalizedPrompt.includes(kw)) || 'item';

        return {
          type: 'select_nth_item',
          rawPrompt: prompt,
          parameters: {
            index: num - 1, // Convert to 0-based
            itemType,
          },
          confidence: 0.6,
        };
      }
    }

    // Check for visibility-related intents
    if (
      normalizedPrompt.includes('visibility') ||
      normalizedPrompt.includes('private') ||
      normalizedPrompt.includes('public') ||
      normalizedPrompt.includes('hidden') ||
      normalizedPrompt.includes('show') ||
      normalizedPrompt.includes('hide')
    ) {
      return {
        type: 'change_target',
        rawPrompt: prompt,
        parameters: {
          target: 'visibility',
          action: this.extractVisibilityAction(normalizedPrompt),
        },
        confidence: 0.7,
      };
    }

    // Default to custom intent
    console.log('[IntentParser] No pattern matched, using custom intent');
    return {
      type: 'custom',
      rawPrompt: prompt,
      parameters: {
        originalPrompt: prompt,
        keywords: this.extractKeywords(prompt),
      },
      confidence: 0.3,
    };
  }

  /**
   * Convert ordinal word to index
   */
  private ordinalToIndex(ordinal: string): number {
    const ordinals: Record<string, number> = {
      first: 0,
      second: 1,
      third: 2,
      fourth: 3,
      fifth: 4,
      sixth: 5,
      seventh: 6,
      eighth: 7,
      ninth: 8,
      tenth: 9,
      last: -1, // Special value meaning "last item"
    };

    return ordinals[ordinal.toLowerCase()] ?? 0;
  }

  /**
   * Extract visibility action from prompt
   */
  private extractVisibilityAction(prompt: string): string {
    if (prompt.includes('private') || prompt.includes('hide')) {
      return 'make_private';
    }
    if (prompt.includes('public') || prompt.includes('show')) {
      return 'make_public';
    }
    return 'toggle';
  }

  /**
   * Extract significant keywords from prompt
   */
  private extractKeywords(prompt: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'up',
      'down',
      'out',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
      'what',
      'which',
      'who',
      'whom',
      'when',
      'where',
      'why',
      'how',
      'please',
    ]);

    const words = prompt.toLowerCase().split(/\s+/);
    return words.filter(
      (word) => word.length > 2 && !stopWords.has(word) && !/^\d+$/.test(word) // Exclude pure numbers
    );
  }

  /**
   * Parse a selector hint from prompt (e.g., "the button labeled Submit")
   */
  parseTargetHint(prompt: string): {
    elementType?: string;
    text?: string;
    position?: string;
  } {
    const result: { elementType?: string; text?: string; position?: string } =
      {};

    // Element type patterns
    const elementTypes = [
      'button',
      'link',
      'input',
      'field',
      'checkbox',
      'dropdown',
      'menu',
      'tab',
      'item',
      'row',
      'card',
      'icon',
      'image',
    ];

    for (const type of elementTypes) {
      if (prompt.toLowerCase().includes(type)) {
        result.elementType = type;
        break;
      }
    }

    // Text patterns: "labeled X", "with text X", "named X", "called X"
    const textPatterns = [
      /(?:labeled|with\s+text|named|called|saying)\s+["']?(.+?)["']?(?:\s|$)/i,
      /["'](.+?)["']/,
    ];

    for (const pattern of textPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        result.text = match[1].trim();
        break;
      }
    }

    // Position patterns
    const positionPatterns = [
      { pattern: /\b(top|upper)\b/i, value: 'top' },
      { pattern: /\b(bottom|lower)\b/i, value: 'bottom' },
      { pattern: /\b(left|leftmost)\b/i, value: 'left' },
      { pattern: /\b(right|rightmost)\b/i, value: 'right' },
      { pattern: /\b(center|middle)\b/i, value: 'center' },
    ];

    for (const { pattern, value } of positionPatterns) {
      if (pattern.test(prompt)) {
        result.position = value;
        break;
      }
    }

    return result;
  }
}
