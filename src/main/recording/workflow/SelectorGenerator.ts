/**
 * Selector Generator
 *
 * Generates multiple selector strategies for elements to enable
 * self-healing automation.
 */

import { RecordedElement, SelectorStrategy } from '../types';

export class SelectorGenerator {
  generate(element: RecordedElement): SelectorStrategy[] {
    const strategies: SelectorStrategy[] = [];
    let priority = 1;

    // ═══════════════════════════════════════════════════════════════════════
    // SEMANTIC STRATEGIES (Highest Priority - Self-Healing)
    // ═══════════════════════════════════════════════════════════════════════

    // Strategy 1: Exact text match
    if (element.innerText && element.innerText.length < 100) {
      strategies.push({
        type: 'text_exact',
        value: element.innerText,
        priority: priority++,
        metadata: { original: true },
      });
    }

    // Strategy 2: Fuzzy text match (lowercase)
    if (element.innerText) {
      strategies.push({
        type: 'text_fuzzy',
        value: element.innerText.toLowerCase(),
        priority: priority++,
        metadata: { case_insensitive: true },
      });
    }

    // Strategy 3: ARIA label
    if (element.ariaLabel) {
      strategies.push({
        type: 'aria_label',
        value: element.ariaLabel,
        priority: priority++,
        metadata: {},
      });
    }

    // Strategy 4: Placeholder (for inputs)
    if (element.placeholder) {
      strategies.push({
        type: 'placeholder',
        value: element.placeholder,
        priority: priority++,
        metadata: {},
      });
    }

    // Strategy 5: Title attribute
    if (element.title) {
      strategies.push({
        type: 'title',
        value: element.title,
        priority: priority++,
        metadata: {},
      });
    }

    // Strategy 6: Alt text (for images)
    if (element.altText) {
      strategies.push({
        type: 'alt_text',
        value: element.altText,
        priority: priority++,
        metadata: {},
      });
    }

    // Strategy 7: Role + Text combination
    if (element.innerText && element.tagName) {
      strategies.push({
        type: 'role_text',
        value: `${element.tagName}:${element.innerText}`,
        priority: priority++,
        metadata: { tag: element.tagName },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TECHNICAL STRATEGIES (Lower Priority - Fallbacks)
    // ═══════════════════════════════════════════════════════════════════════

    // Strategy 8: Semantic XPath
    const semanticXPath = this.generateSemanticXPath(element);
    if (semanticXPath) {
      strategies.push({
        type: 'xpath',
        value: semanticXPath,
        priority: priority++,
        metadata: { semantic: true },
      });
    }

    // Strategy 9: CSS Selector (if ID exists)
    if (element.id) {
      strategies.push({
        type: 'css',
        value: `#${element.id}`,
        priority: priority++,
        metadata: { has_id: true },
      });
    }

    // Strategy 10: CSS Selector from recorded value
    if (element.cssSelector && element.cssSelector !== element.xpath) {
      strategies.push({
        type: 'css',
        value: element.cssSelector,
        priority: priority++,
        metadata: { generated: true },
      });
    }

    // Strategy 11: Absolute XPath (last resort)
    if (element.xpath) {
      strategies.push({
        type: 'xpath',
        value: element.xpath,
        priority: 99, // Very low priority
        metadata: { absolute: true, fallback: true },
      });
    }

    return strategies;
  }

  private generateSemanticXPath(element: RecordedElement): string | null {
    const tag = element.tagName;

    // For buttons and links with text
    if (['button', 'a'].includes(tag) && element.innerText) {
      const text = element.innerText.substring(0, 50);
      return `//${tag}[contains(normalize-space(.), '${this.escapeXPath(text)}')]`;
    }

    // For inputs with placeholder
    if (tag === 'input' && element.placeholder) {
      return `//input[@placeholder='${this.escapeXPath(element.placeholder)}']`;
    }

    // For elements with aria-label
    if (element.ariaLabel) {
      return `//*[@aria-label='${this.escapeXPath(element.ariaLabel)}']`;
    }

    // For elements with specific name attribute
    if (element.name) {
      return `//${tag}[@name='${this.escapeXPath(element.name)}']`;
    }

    return null;
  }

  private escapeXPath(text: string): string {
    // Escape single quotes in XPath
    if (text.includes("'")) {
      // Use concat for strings with single quotes
      const parts = text.split("'");
      return `concat('${parts.join("', \"'\", '")}')`.slice(8, -1); // Remove concat wrapper for use in attribute
    }
    return text;
  }
}
