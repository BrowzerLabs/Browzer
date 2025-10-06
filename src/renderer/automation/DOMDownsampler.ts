export interface DownsampledElement {
  id: string;
  type: string;
  selector: string;
  semanticLabel: string;
  score: number;
  context: string;
}

export interface DownsamplingResult {
  elements: DownsampledElement[];
  summary: {
    originalCount: number;
    downsampledCount: number;
    compressionRatio: number;
    topCategories: string[];
  };
}

export class DOMDownsampler {
  private static instance: DOMDownsampler;

  private constructor() {}

  static getInstance(): DOMDownsampler {
    if (!DOMDownsampler.instance) {
      DOMDownsampler.instance = new DOMDownsampler();
    }
    return DOMDownsampler.instance;
  }

  /**
   * Downsample DOM elements using D2Snap algorithm
   */
  async downsample(
    elements: any[],
    userGoal: string,
    maxElements: number = 80
  ): Promise<DownsamplingResult> {
    console.log(`[DOMDownsampler] Downsampling ${elements.length} elements to ${maxElements}`);

    // Step 1: Score each element
    const scoredElements = elements.map((el) => ({
      ...el,
      score: this.calculateRelevanceScore(el, userGoal),
    }));

    // Step 2: Sort by score (descending)
    scoredElements.sort((a, b) => b.score - a.score);

    // Step 3: Take top N elements
    const topElements = scoredElements.slice(0, maxElements);

    // Step 4: Group by category for better context
    const categorized = this.categorizeElements(topElements);

    // Step 5: Create downsampled representation
    const downsampled: DownsampledElement[] = topElements.map((el, idx) => ({
      id: `elem_${idx}`,
      type: el.role || el.tagName || 'unknown',
      selector: this.generateCompactSelector(el),
      semanticLabel: el.semanticLabel || el.text?.substring(0, 50) || '',
      score: el.score,
      context: this.generateElementContext(el),
    }));

    return {
      elements: downsampled,
      summary: {
        originalCount: elements.length,
        downsampledCount: downsampled.length,
        compressionRatio: Math.round((downsampled.length / elements.length) * 100),
        topCategories: Object.keys(categorized).slice(0, 5),
      },
    };
  }

  /**
   * Calculate relevance score for an element
   * Higher score = more relevant to user's goal
   */
  private calculateRelevanceScore(element: any, userGoal: string): number {
    let score = 0;

    // 1. Viewport visibility (most important)
    if (element.isVisible) score += 50;
    if (element.position?.y < 1000) score += 30; // Above the fold

    // 2. Interaction likelihood
    const interactiveTypes = ['button', 'link', 'input', 'textarea', 'select'];
    if (interactiveTypes.includes(element.role?.toLowerCase())) score += 40;

    // 3. Semantic relevance to user goal
    const goalKeywords = userGoal.toLowerCase().split(' ');
    const elementText = (element.semanticLabel || element.text || '').toLowerCase();
    const matchCount = goalKeywords.filter((kw) => elementText.includes(kw)).length;
    score += matchCount * 20;

    // 4. Element type priority
    if (element.role === 'button') score += 15;
    if (element.role === 'link' && element.href) score += 10;
    if (element.tagName === 'input' || element.tagName === 'textarea') score += 25;
    if (element.role === 'navigation') score += 5;

    // 5. Has clear label/text
    if (element.semanticLabel && element.semanticLabel.length > 0) score += 10;

    // 6. Form elements (high priority)
    if (element.formContext) score += 20;

    // 7. Penalize hidden or off-screen elements
    if (!element.isVisible) score -= 100;
    if (element.position?.y > 3000) score -= 30; // Far below fold

    // 8. Penalize decorative elements
    const decorativeRoles = ['img', 'svg', 'icon', 'decoration'];
    if (decorativeRoles.includes(element.role?.toLowerCase())) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Generate compact, stable selector
   */
  private generateCompactSelector(element: any): string {
    // Priority: ID > data attributes > class > xpath
    if (element.id) return `#${element.id}`;
    
    if (element.stableSelectors && element.stableSelectors.length > 0) {
      return element.stableSelectors[0];
    }

    // Fallback to semantic description
    if (element.semanticLabel) {
      return `[aria-label="${element.semanticLabel}"]`;
    }

    return element.xpath || 'unknown';
  }

  /**
   * Generate concise element context
   */
  private generateElementContext(element: any): string {
    const parts: string[] = [];

    if (element.role) parts.push(`role:${element.role}`);
    if (element.text) parts.push(`text:"${element.text.substring(0, 30)}"`);
    if (element.href) parts.push(`href:"${element.href.substring(0, 40)}"`);
    if (element.placeholder) parts.push(`placeholder:"${element.placeholder}"`);

    return parts.join(', ');
  }

  /**
   * Categorize elements for structured representation
   */
  private categorizeElements(elements: any[]): Record<string, any[]> {
    const categories: Record<string, any[]> = {
      buttons: [],
      links: [],
      inputs: [],
      navigation: [],
      other: [],
    };

    elements.forEach((el) => {
      const role = el.role?.toLowerCase() || '';
      
      if (role === 'button' || el.tagName === 'button') {
        categories.buttons.push(el);
      } else if (role === 'link' || el.tagName === 'a') {
        categories.links.push(el);
      } else if (role === 'textbox' || el.tagName === 'input' || el.tagName === 'textarea') {
        categories.inputs.push(el);
      } else if (role === 'navigation') {
        categories.navigation.push(el);
      } else {
        categories.other.push(el);
      }
    });

    return categories;
  }

  /**
   * Generate compressed text representation for LLM
   */
  generateCompressedPrompt(result: DownsamplingResult): string {
    let prompt = `## Page Context (Compressed)\n\n`;
    prompt += `**Summary:** ${result.summary.downsampledCount} key elements (from ${result.summary.originalCount} total, ${result.summary.compressionRatio}% compression)\n\n`;

    // Group by type
    const byType: Record<string, DownsampledElement[]> = {};
    result.elements.forEach((el) => {
      if (!byType[el.type]) byType[el.type] = [];
      byType[el.type].push(el);
    });

    // Output top elements per category
    Object.entries(byType).forEach(([type, elements]) => {
      if (elements.length === 0) return;
      
      prompt += `### ${type.toUpperCase()} (${elements.length})\n`;
      elements.slice(0, 10).forEach((el, idx) => {
        prompt += `${idx + 1}. "${el.semanticLabel}" - ${el.selector}\n`;
      });
      prompt += `\n`;
    });

    return prompt;
  }
}
