/**
 * Element Finder
 *
 * Multi-strategy element location with fallback support.
 */

import {
  ElementLocator,
  FoundElement,
  SelectorStrategy,
  SelectorType,
} from './types';

export class ElementFinder {
  private readonly TIMEOUT_MS = 10000;
  private readonly RETRY_INTERVAL_MS = 500;

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN FINDING METHOD
  // ═══════════════════════════════════════════════════════════════════════════

  async findElement(
    locator: ElementLocator,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.TIMEOUT_MS) {
      // Sort strategies by priority
      const strategies = this.prioritizeStrategies(locator);

      for (const strategy of strategies) {
        const element = await this.tryStrategy(strategy, locator, webContents);
        if (element) {
          console.log(
            `[ElementFinder] Found element using strategy: ${strategy.type}`
          );
          return element;
        }
      }

      // If no strategy worked, wait and retry
      await this.sleep(this.RETRY_INTERVAL_MS);
    }

    console.warn('[ElementFinder] Element not found after timeout');
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  private async tryStrategy(
    strategy: SelectorStrategy,
    locator: ElementLocator,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    try {
      switch (strategy.type) {
        case 'text_exact':
          return this.findByExactText(strategy.value, webContents);

        case 'text_fuzzy':
          return this.findByFuzzyText(strategy.value, webContents);

        case 'text_contains':
          return this.findByTextContains(strategy.value, webContents);

        case 'aria_label':
          return this.findByAriaLabel(strategy.value, webContents);

        case 'placeholder':
          return this.findByPlaceholder(strategy.value, webContents);

        case 'title':
          return this.findByTitle(strategy.value, webContents);

        case 'role_text':
          return this.findByRoleAndText(strategy.value, webContents);

        case 'css':
          return this.findByCss(strategy.value, webContents);

        case 'xpath':
          return this.findByXpath(strategy.value, webContents);

        case 'data_testid':
          return this.findByDataTestId(strategy.value, webContents);

        case 'nth_item':
          return this.findNthItem(
            parseInt(strategy.value),
            strategy.metadata?.containerSelector,
            webContents
          );

        case 'ai_visual':
          return this.findByAIVisual(strategy.value, locator, webContents);

        default:
          return null;
      }
    } catch (error) {
      console.warn(`[ElementFinder] Strategy ${strategy.type} failed:`, error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT-BASED STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  private async findByExactText(
    text: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const searchText = ${JSON.stringify(text)};

        // Find all visible, clickable elements
        const selectors = 'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"], span, div, label';
        const elements = document.querySelectorAll(selectors);

        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Check various text sources
          const texts = [
            el.innerText?.trim(),
            el.textContent?.trim(),
            el.value,
            el.getAttribute('aria-label'),
            el.getAttribute('title')
          ].filter(Boolean);

          for (const t of texts) {
            if (t === searchText) {
              return {
                selector: generateUniqueSelector(el),
                strategyUsed: { type: 'text_exact', value: searchText, priority: 0 },
                confidence: 1.0,
                boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                attributes: getAttributes(el),
                innerText: el.innerText?.trim() || ''
              };
            }
          }
        }

        return null;

        function generateUniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          const path = [];
          let current = el;
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            if (current.id) {
              selector = '#' + CSS.escape(current.id);
              path.unshift(selector);
              break;
            }
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += ':nth-of-type(' + index + ')';
              }
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }

        function getAttributes(el) {
          const attrs = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        }
      })();
    `);
  }

  private async findByFuzzyText(
    text: string,
    webContents: Electron.WebContents,
    options: { threshold?: number } = {}
  ): Promise<FoundElement | null> {
    const threshold = options.threshold ?? 0.7;

    return webContents.executeJavaScript(`
      (function() {
        const searchText = ${JSON.stringify(text.toLowerCase())};
        const threshold = ${threshold};

        const candidates = [];
        const elements = document.querySelectorAll('button, a, [role="button"], input[type="submit"], span, div, p, label');

        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const elText = (el.innerText || el.value || '').toLowerCase().trim();
          if (!elText) continue;

          const score = calculateSimilarity(searchText, elText);

          if (score >= threshold) {
            candidates.push({ element: el, score, rect });
          }
        }

        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
          const best = candidates[0];
          return {
            selector: generateUniqueSelector(best.element),
            strategyUsed: { type: 'text_fuzzy', value: ${JSON.stringify(text)}, priority: 1 },
            confidence: best.score,
            boundingBox: { x: best.rect.x, y: best.rect.y, width: best.rect.width, height: best.rect.height },
            attributes: getAttributes(best.element),
            innerText: best.element.innerText?.trim() || ''
          };
        }

        return null;

        function calculateSimilarity(s1, s2) {
          if (s1 === s2) return 1;
          if (s1.length === 0 || s2.length === 0) return 0;
          if (s2.includes(s1)) return 0.9;
          if (s1.includes(s2)) return 0.8;

          // Levenshtein distance
          const matrix = [];
          for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
          for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

          for (let i = 1; i <= s1.length; i++) {
            for (let j = 1; j <= s2.length; j++) {
              if (s1[i-1] === s2[j-1]) {
                matrix[i][j] = matrix[i-1][j-1];
              } else {
                matrix[i][j] = Math.min(
                  matrix[i-1][j-1] + 1,
                  matrix[i][j-1] + 1,
                  matrix[i-1][j] + 1
                );
              }
            }
          }

          const distance = matrix[s1.length][s2.length];
          const maxLength = Math.max(s1.length, s2.length);
          return 1 - (distance / maxLength);
        }

        function generateUniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          const path = [];
          let current = el;
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += ':nth-of-type(' + index + ')';
              }
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }

        function getAttributes(el) {
          const attrs = {};
          for (const attr of el.attributes) attrs[attr.name] = attr.value;
          return attrs;
        }
      })();
    `);
  }

  private async findByTextContains(
    text: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const searchText = ${JSON.stringify(text.toLowerCase())};
        const elements = document.querySelectorAll('button, a, [role="button"], span, div, p, label');

        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const elText = (el.innerText || '').toLowerCase();
          if (elText.includes(searchText)) {
            return {
              selector: generateUniqueSelector(el),
              strategyUsed: { type: 'text_contains', value: ${JSON.stringify(text)}, priority: 2 },
              confidence: 0.85,
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              attributes: {},
              innerText: el.innerText?.trim() || ''
            };
          }
        }

        return null;

        function generateUniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          const path = [];
          let current = el;
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += ':nth-of-type(' + index + ')';
              }
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }
      })();
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTRIBUTE-BASED STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  private async findByAriaLabel(
    label: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const label = ${JSON.stringify(label)};
        const el = document.querySelector('[aria-label="' + CSS.escape(label) + '"]') ||
                   document.querySelector('[aria-label*="' + CSS.escape(label) + '"]');

        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        return {
          selector: '[aria-label="' + CSS.escape(label) + '"]',
          strategyUsed: { type: 'aria_label', value: label, priority: 0 },
          confidence: 0.95,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
          innerText: el.innerText?.trim() || ''
        };
      })();
    `);
  }

  private async findByPlaceholder(
    placeholder: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const placeholder = ${JSON.stringify(placeholder)};
        const el = document.querySelector('[placeholder="' + CSS.escape(placeholder) + '"]') ||
                   document.querySelector('[placeholder*="' + CSS.escape(placeholder) + '"]');

        if (!el) return null;

        const rect = el.getBoundingClientRect();

        return {
          selector: '[placeholder="' + CSS.escape(placeholder) + '"]',
          strategyUsed: { type: 'placeholder', value: placeholder, priority: 0 },
          confidence: 0.95,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
          innerText: ''
        };
      })();
    `);
  }

  private async findByTitle(
    title: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const title = ${JSON.stringify(title)};
        const el = document.querySelector('[title="' + CSS.escape(title) + '"]') ||
                   document.querySelector('[title*="' + CSS.escape(title) + '"]');

        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        return {
          selector: '[title="' + CSS.escape(title) + '"]',
          strategyUsed: { type: 'title', value: title, priority: 1 },
          confidence: 0.9,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
          innerText: el.innerText?.trim() || ''
        };
      })();
    `);
  }

  private async findByRoleAndText(
    roleText: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    // roleText format: "role:text" e.g., "button:Submit"
    const [role, text] = roleText.includes(':')
      ? roleText.split(':')
      : ['button', roleText];

    return webContents.executeJavaScript(`
      (function() {
        const role = ${JSON.stringify(role)};
        const text = ${JSON.stringify(text)};

        const elements = document.querySelectorAll('[role="' + role + '"]');

        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          if (el.innerText?.trim() === text || el.getAttribute('aria-label') === text) {
            return {
              selector: '[role="' + role + '"]',
              strategyUsed: { type: 'role_text', value: ${JSON.stringify(roleText)}, priority: 1 },
              confidence: 0.9,
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
              innerText: el.innerText?.trim() || ''
            };
          }
        }

        return null;
      })();
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTOR-BASED STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  private async findByCss(
    selector: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const selector = ${JSON.stringify(selector)};
        try {
          const el = document.querySelector(selector);
          if (!el) return null;

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null;

          return {
            selector: selector,
            strategyUsed: { type: 'css', value: selector, priority: 2 },
            confidence: 0.9,
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
            innerText: el.innerText?.trim() || ''
          };
        } catch (e) {
          return null;
        }
      })();
    `);
  }

  private async findByXpath(
    xpath: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const xpath = ${JSON.stringify(xpath)};
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const el = result.singleNodeValue;

          if (!el) return null;

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null;

          return {
            selector: xpath,
            strategyUsed: { type: 'xpath', value: xpath, priority: 3 },
            confidence: 0.85,
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
            innerText: el.innerText?.trim() || ''
          };
        } catch (e) {
          return null;
        }
      })();
    `);
  }

  private async findByDataTestId(
    testId: string,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const testId = ${JSON.stringify(testId)};
        const el = document.querySelector('[data-testid="' + CSS.escape(testId) + '"]') ||
                   document.querySelector('[data-test-id="' + CSS.escape(testId) + '"]') ||
                   document.querySelector('[data-cy="' + CSS.escape(testId) + '"]');

        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        return {
          selector: '[data-testid="' + testId + '"]',
          strategyUsed: { type: 'data_testid', value: testId, priority: 0 },
          confidence: 0.98,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          attributes: Object.fromEntries([...el.attributes].map(a => [a.name, a.value])),
          innerText: el.innerText?.trim() || ''
        };
      })();
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NTH-ITEM STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════

  private async findNthItem(
    index: number,
    containerSelector: string | undefined,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    return webContents.executeJavaScript(`
      (function() {
        const index = ${index};
        const containerSelector = ${JSON.stringify(containerSelector || '')};

        let items;
        if (containerSelector) {
          items = document.querySelectorAll(containerSelector);
        } else {
          // Try common list item patterns
          items = document.querySelectorAll('li, [role="listitem"], .item, .card, article');
        }

        // Handle negative index (from end)
        const actualIndex = index < 0 ? items.length + index : index;

        if (actualIndex < 0 || actualIndex >= items.length) return null;

        const el = items[actualIndex];
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        // Find clickable element within the item
        const clickable = el.querySelector('a, button, [role="button"]') || el;
        const clickableRect = clickable.getBoundingClientRect();

        return {
          selector: generateUniqueSelector(clickable),
          strategyUsed: { type: 'nth_item', value: String(index), priority: 0 },
          confidence: 0.9,
          boundingBox: { x: clickableRect.x, y: clickableRect.y, width: clickableRect.width, height: clickableRect.height },
          attributes: Object.fromEntries([...clickable.attributes].map(a => [a.name, a.value])),
          innerText: clickable.innerText?.trim() || el.innerText?.trim() || ''
        };

        function generateUniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          const path = [];
          let current = el;
          while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            const parent = current.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
              if (siblings.length > 1) {
                const idx = siblings.indexOf(current) + 1;
                selector += ':nth-of-type(' + idx + ')';
              }
            }
            path.unshift(selector);
            current = current.parentElement;
          }
          return path.join(' > ');
        }
      })();
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI-BASED STRATEGY (Placeholder)
  // ═══════════════════════════════════════════════════════════════════════════

  private async findByAIVisual(
    description: string,
    _locator: ElementLocator,
    webContents: Electron.WebContents
  ): Promise<FoundElement | null> {
    // Take screenshot
    const screenshot = await webContents.capturePage();
    const _base64Image = screenshot.toDataURL();

    // Get all clickable elements with their positions
    const elements = await webContents.executeJavaScript(`
      (function() {
        const elements = [];
        const clickable = document.querySelectorAll('button, a, input, select, [role="button"], [onclick]');

        clickable.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            elements.push({
              index,
              text: el.innerText?.trim().substring(0, 100) || '',
              ariaLabel: el.getAttribute('aria-label'),
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            });
          }
        });

        return elements;
      })();
    `);

    // TODO: Call AI to identify the element based on screenshot and description
    // For now, try to find by description as fuzzy text
    console.log(
      `[ElementFinder] AI visual matching for "${description}" with ${elements.length} candidates`
    );

    return null; // Placeholder - implement AI matching
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private prioritizeStrategies(locator: ElementLocator): SelectorStrategy[] {
    const strategies = [...locator.strategies];

    // Add text-based strategy if target_text is provided
    if (
      locator.targetText &&
      !strategies.some((s) => s.type === 'text_exact')
    ) {
      strategies.unshift({
        type: 'text_exact',
        value: locator.targetText,
        priority: 0,
      });
    }

    // Sort by priority (lower = higher priority)
    return strategies.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
