/**
 * Self-Healing Service
 *
 * Provides recovery strategies when element selectors fail.
 * Uses multiple fallback approaches to find elements that have changed.
 */

import { ElementFinder } from '../automation/ElementFinder';
import {
  WorkflowStep,
  ExecutionContext,
  HealingResult,
  HealingStrategy,
  FoundElement,
} from '../automation/types';

export class SelfHealingService {
  private elementFinder: ElementFinder;
  private strategies: HealingStrategy[];

  constructor() {
    this.elementFinder = new ElementFinder();
    this.strategies = this.initializeStrategies();
  }

  /**
   * Attempt to recover from an element not found error
   */
  async attemptRecovery(
    step: WorkflowStep,
    webContents: Electron.WebContents,
    context: ExecutionContext
  ): Promise<{ strategy: string } | null> {
    console.log(
      '[SelfHealingService] Attempting recovery for step:',
      step.description
    );

    for (const strategy of this.strategies) {
      try {
        console.log(`[SelfHealingService] Trying strategy: ${strategy.name}`);
        const result = await strategy.attempt(step, webContents, context);

        if (result.success && result.element) {
          console.log(
            `[SelfHealingService] Strategy "${strategy.name}" succeeded`
          );

          // Execute the action on the found element
          await this.executeOnElement(step, result.element, webContents);

          return { strategy: strategy.name };
        }
      } catch (error) {
        console.log(
          `[SelfHealingService] Strategy "${strategy.name}" failed:`,
          error
        );
      }
    }

    console.log('[SelfHealingService] All recovery strategies exhausted');
    return null;
  }

  /**
   * Initialize recovery strategies in priority order
   */
  private initializeStrategies(): HealingStrategy[] {
    return [
      // Strategy 1: Try fuzzy text matching
      {
        name: 'fuzzy_text_match',
        attempt: async (step, webContents) => {
          if (!step.target_text) {
            return { success: false };
          }

          const element = await this.elementFinder.findElement(
            {
              strategies: [
                { type: 'text_fuzzy', value: step.target_text, priority: 1 },
              ],
              targetText: step.target_text,
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'fuzzy_text_match',
          };
        },
      },

      // Strategy 2: Try text contains matching
      {
        name: 'text_contains_match',
        attempt: async (step, webContents) => {
          if (!step.target_text) {
            return { success: false };
          }

          const element = await this.elementFinder.findElement(
            {
              strategies: [
                { type: 'text_contains', value: step.target_text, priority: 1 },
              ],
              targetText: step.target_text,
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'text_contains_match',
          };
        },
      },

      // Strategy 3: Try aria-label fallback
      {
        name: 'aria_label_fallback',
        attempt: async (step, webContents) => {
          const ariaLabel = step.target_text || step.description;
          if (!ariaLabel) {
            return { success: false };
          }

          const element = await this.elementFinder.findElement(
            {
              strategies: [
                { type: 'aria_label', value: ariaLabel, priority: 1 },
              ],
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'aria_label_fallback',
          };
        },
      },

      // Strategy 4: Try role-based finding
      {
        name: 'role_based_search',
        attempt: async (step, webContents) => {
          const targetText = step.target_text;
          if (!targetText) {
            return { success: false };
          }

          const element = await this.elementFinder.findElement(
            {
              strategies: [
                { type: 'role_text', value: targetText, priority: 1 },
              ],
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'role_based_search',
          };
        },
      },

      // Strategy 5: Try placeholder text (for inputs)
      {
        name: 'placeholder_fallback',
        attempt: async (step, webContents) => {
          if (step.type !== 'input' && step.type !== 'click') {
            return { success: false };
          }

          const placeholder = step.target_text || step.description;
          if (!placeholder) {
            return { success: false };
          }

          const element = await this.elementFinder.findElement(
            {
              strategies: [
                { type: 'placeholder', value: placeholder, priority: 1 },
              ],
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'placeholder_fallback',
          };
        },
      },

      // Strategy 6: Try XPath with partial text
      {
        name: 'xpath_partial_text',
        attempt: async (step, webContents) => {
          if (!step.target_text) {
            return { success: false };
          }

          // Build XPath to find element containing text
          const xpath = `//*[contains(normalize-space(.), '${step.target_text.replace(/'/g, "\\'")}')]`;

          const element = await this.elementFinder.findElement(
            {
              strategies: [{ type: 'xpath', value: xpath, priority: 1 }],
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'xpath_partial_text',
          };
        },
      },

      // Strategy 7: Visual similarity search (simplified - looks for similar structure)
      {
        name: 'structural_similarity',
        attempt: async (step, webContents) => {
          // Extract tag info from original selector strategies
          const cssStrategy = step.selectorStrategies?.find(
            (s) => s.type === 'css'
          );
          if (!cssStrategy) {
            return { success: false };
          }

          // Try to find similar elements by tag and class pattern
          const element = await this.findBySimilarStructure(
            cssStrategy.value,
            step.target_text || '',
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'structural_similarity',
          };
        },
      },

      // Strategy 8: Nth item fallback (for list items)
      {
        name: 'nth_item_search',
        attempt: async (step, webContents) => {
          // Look for nth_item metadata in the step
          const nthStrategy = step.selectorStrategies?.find(
            (s) => s.type === 'nth_item'
          );
          if (!nthStrategy || !nthStrategy.metadata) {
            return { success: false };
          }

          const { containerSelector, index } = nthStrategy.metadata;
          if (!containerSelector || index === undefined) {
            return { success: false };
          }

          const element = await this.elementFinder.findElement(
            {
              strategies: [
                {
                  type: 'nth_item',
                  value: containerSelector,
                  priority: 1,
                  metadata: { index },
                },
              ],
            },
            webContents
          );

          return {
            success: !!element,
            element: element || undefined,
            strategy: 'nth_item_search',
          };
        },
      },
    ];
  }

  /**
   * Find element by similar DOM structure
   */
  private async findBySimilarStructure(
    originalSelector: string,
    targetText: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    // Extract tag name from selector
    const tagMatch = originalSelector.match(/^(\w+)/);
    const tagName = tagMatch ? tagMatch[1].toLowerCase() : '*';

    // Extract class patterns
    const classMatches = originalSelector.match(/\.[\w-]+/g) || [];
    const partialClasses = classMatches.slice(0, 2).map((c) => c.substring(1));

    const result = await webContents.executeJavaScript(`
      (function() {
        const tagName = ${JSON.stringify(tagName)};
        const partialClasses = ${JSON.stringify(partialClasses)};
        const targetText = ${JSON.stringify(targetText)};

        // Find all elements of the same tag
        const elements = document.querySelectorAll(tagName === '*' ? '*' : tagName);

        for (const el of elements) {
          // Check if element has similar classes
          const hasMatchingClass = partialClasses.length === 0 ||
            partialClasses.some(cls => el.className.includes(cls));

          if (!hasMatchingClass) continue;

          // Check if text matches
          const text = el.textContent?.trim() || '';
          if (targetText && !text.toLowerCase().includes(targetText.toLowerCase())) continue;

          // Check if element is visible
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Generate a unique selector for this element
          let selector = tagName;
          if (el.id) {
            selector = '#' + el.id;
          } else if (el.className) {
            const classes = el.className.split(' ').filter(c => c).slice(0, 2);
            if (classes.length > 0) {
              selector = tagName + '.' + classes.join('.');
            }
          }

          return {
            selector: selector,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            innerText: text.substring(0, 200),
            attributes: {
              tagName: el.tagName,
              className: el.className || '',
              id: el.id || ''
            }
          };
        }

        return null;
      })();
    `);

    if (result) {
      return {
        selector: result.selector,
        strategyUsed: { type: 'css', value: result.selector, priority: 1 },
        confidence: 0.6,
        boundingBox: result.boundingBox,
        attributes: result.attributes,
        innerText: result.innerText,
      };
    }

    return null;
  }

  /**
   * Execute action on the healed element
   */
  private async executeOnElement(
    step: WorkflowStep,
    element: FoundElement,
    webContents: Electron.WebContents
  ): Promise<void> {
    const selector = element.selector;

    switch (step.type) {
      case 'click':
        await webContents.executeJavaScript(`
          (function() {
            const selector = ${JSON.stringify(selector)};
            let el;
            try {
              el = document.querySelector(selector);
            } catch (e) {
              if (selector.startsWith('//') || selector.startsWith('/')) {
                const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                el = result.singleNodeValue;
              }
            }
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                el.click();
              }, 100);
            }
          })();
        `);
        break;

      case 'input': {
        const value = step.value || '';
        await webContents.executeJavaScript(`
          (function() {
            const selector = ${JSON.stringify(selector)};
            const value = ${JSON.stringify(value)};
            let el;
            try {
              el = document.querySelector(selector);
            } catch (e) {
              if (selector.startsWith('//') || selector.startsWith('/')) {
                const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                el = result.singleNodeValue;
              }
            }
            if (el) {
              el.focus();
              if (el.value !== undefined) {
                el.value = '';
                el.value = value;
              } else if (el.isContentEditable) {
                el.textContent = value;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })();
        `);
        break;
      }

      case 'hover':
        await webContents.executeJavaScript(`
          (function() {
            const selector = ${JSON.stringify(selector)};
            const el = document.querySelector(selector);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const rect = el.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: centerX, clientY: centerY }));
              el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: centerX, clientY: centerY }));
            }
          })();
        `);
        break;

      default:
        console.log(
          `[SelfHealingService] No action handler for step type: ${step.type}`
        );
    }

    // Wait for action to complete
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  /**
   * Register a custom healing strategy
   */
  registerStrategy(strategy: HealingStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): HealingStrategy[] {
    return [...this.strategies];
  }
}
