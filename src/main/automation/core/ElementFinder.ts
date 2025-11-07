/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from './BaseHandler';
import type { HandlerContext, AdvancedFindResult, FindStrategyResult, ElementQueryResult } from './types';
import type { ClickParams } from '@/shared/types';

/**
 * ElementFinder - Advanced element finding with multiple strategies
 * 
 * Provides robust element location using:
 * - CSS selectors with fallbacks
 * - Text content matching
 * - Bounding box coordinates
 * - CDP-based querying
 * 
 * This module centralizes all element finding logic for consistent behavior
 * across all automation handlers.
 */
export class ElementFinder extends BaseHandler {
  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * ENHANCED Advanced element finding with scoring and uniqueness validation
   * 
   * New approach:
   * 1. Collect ALL matching elements from ALL selectors
   * 2. Score each match based on multiple criteria
   * 3. Pick the best match (highest score)
   * 4. Validate uniqueness and warn if multiple high-scoring matches
   */
  async advancedFind(
    selectors: string[],
    params: ClickParams
  ): Promise<AdvancedFindResult> {
    const sanitizedSelectors = this.sanitizeSelectors(selectors);
    
    console.log(`[ElementFinder] 🔍 Finding element with ${sanitizedSelectors.length} selectors...`);

    // NEW: Collect all candidates from all selectors
    const allCandidates = await this.findAllCandidates(sanitizedSelectors, params);
    
    if (allCandidates.length === 0) {
      console.log(`[ElementFinder] ❌ No elements found with any selector`);
      return {
        success: false,
        error: `None of ${sanitizedSelectors.length} selectors found a matching element`,
        details: `Attempted selectors: ${sanitizedSelectors.join(', ')}`
      };
    }

    console.log(`[ElementFinder] 📊 Found ${allCandidates.length} candidate(s), scoring...`);

    // NEW: Score all candidates
    const scoredCandidates = await this.scoreElements(allCandidates, params);
    
    // Sort by score (highest first)
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredCandidates[0];
    const secondBest = scoredCandidates[1];
    
    // Log scoring results
    console.log(`[ElementFinder] 🏆 Best match: ${bestMatch.selector} (score: ${bestMatch.score.toFixed(2)})`);
    if (secondBest) {
      console.log(`[ElementFinder] 🥈 Second best: ${secondBest.selector} (score: ${secondBest.score.toFixed(2)})`);
    }
    
    // Warn if multiple high-scoring matches (ambiguous)
    if (secondBest && Math.abs(bestMatch.score - secondBest.score) < 10) {
      console.warn(`[ElementFinder] ⚠️ Multiple similar matches found! Scores are close. Using best match but this may be ambiguous.`);
    }
    console.log("scoredCandidates: ", scoredCandidates);

    return {
      success: true,
      usedSelector: bestMatch.selector,
      selectorType: bestMatch.selectorType,
      element: bestMatch.element,
      matchScore: bestMatch.score,
      totalCandidates: allCandidates.length
    };
  }

  /**
   * NEW: Find all candidate elements from all selectors
   */
  private async findAllCandidates(
    selectors: string[],
    params: ClickParams
  ): Promise<Array<{ selector: string; selectorType: 'primary' | 'backup' | 'text-match' | 'position-match'; element: any }>> {
    const candidates: Array<{ selector: string; selectorType: 'primary' | 'backup' | 'text-match' | 'position-match'; element: any }> = [];

    // Try each selector
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const selectorType = i === 0 ? 'primary' : 'backup';

      try {
        // Use querySelectorAll to find ALL matches
        const result = await this.findAllWithQuerySelector(selector);
        
        if (result.found && result.elements && result.elements.length > 0) {
          for (const element of result.elements) {
            candidates.push({ selector, selectorType, element });
          }
        }
      } catch (error) {
        console.log(`[ElementFinder] ⚠️ Selector failed: ${selector}`);
        continue;
      }
    }

    // Also try text-based matching if text provided
    if (params.text) {
      try {
        const textResult = await this.findAllByText(params.text);
        if (textResult.found && textResult.elements && textResult.elements.length > 0) {
          for (const element of textResult.elements) {
            candidates.push({ 
              selector: `text="${params.text}"`, 
              selectorType: 'text-match', 
              element 
            });
          }
        }
      } catch (error) {
        console.log(`[ElementFinder] ⚠️ Text matching failed`);
      }
    }

    // Also try bounding box if provided
    if (params.boundingBox) {
      try {
        const boxResult = await this.findByBoundingBox(params.boundingBox);
        if (boxResult.found && boxResult.element) {
          candidates.push({
            selector: boxResult.computedSelector || 'boundingBox',
            selectorType: 'position-match',
            element: boxResult.element
          });
        }
      } catch (error) {
        console.log(`[ElementFinder] ⚠️ Bounding box matching failed`);
      }
    }

    return candidates;
  }

  /**
   * ENHANCED: Score elements based on multiple criteria with uniqueness detection
   * Returns scored candidates with breakdown
   */
  private async scoreElements(
    candidates: Array<{ selector: string; selectorType: 'primary' | 'backup' | 'text-match' | 'position-match'; element: any }>,
    params: ClickParams
  ): Promise<Array<{ selector: string; selectorType: 'primary' | 'backup' | 'text-match' | 'position-match'; element: any; score: number; breakdown: any }>> {
    const scored = [];

    for (const candidate of candidates) {
      let score = 0;
      const breakdown: any = {};

      // 1. Selector type priority (50 points max)
      if (candidate.selectorType === 'primary') {
        score += 50;
        breakdown.selectorType = 50;
      } else if (candidate.selectorType === 'backup') {
        score += 30;
        breakdown.selectorType = 30;
      } else if (candidate.selectorType === 'text-match') {
        score += 20;
        breakdown.selectorType = 20;
      } else if (candidate.selectorType === 'position-match') {
        score += 40;
        breakdown.selectorType = 40;
      }

      // 2. Text content match (30 points max)
      if (params.text && candidate.element.text) {
        const elementText = candidate.element.text.toLowerCase().trim();
        const targetText = params.text.toLowerCase().trim();
        
        if (elementText === targetText) {
          score += 30;
          breakdown.textMatch = 30;
        } else if (elementText.includes(targetText) || targetText.includes(elementText)) {
          score += 15;
          breakdown.textMatch = 15;
        }
      }

      // 3. Bounding box proximity (40 points max)
      if (params.boundingBox && candidate.element.boundingBox) {
        const targetBox = params.boundingBox;
        const elementBox = candidate.element.boundingBox;
        
        // Calculate position difference
        const xDiff = Math.abs(elementBox.x - targetBox.x);
        const yDiff = Math.abs(elementBox.y - targetBox.y);
        const totalDiff = xDiff + yDiff;
        
        // Perfect match (within 5px)
        if (totalDiff < 5) {
          score += 40;
          breakdown.positionMatch = 40;
        } else if (totalDiff < 20) {
          score += 30;
          breakdown.positionMatch = 30;
        } else if (totalDiff < 50) {
          score += 15;
          breakdown.positionMatch = 15;
        } else if (totalDiff < 100) {
          score += 5;
          breakdown.positionMatch = 5;
        }
      }

      // 4. Visibility bonus (10 points)
      if (candidate.element.isVisible) {
        score += 10;
        breakdown.visibility = 10;
      }

      // 5. Attribute matching (20 points max)
      if (params.text && candidate.element.attributes) {
        const attrs = candidate.element.attributes;
        let attrScore = 0;
        
        // Check aria-label
        if (attrs['aria-label'] && attrs['aria-label'].toLowerCase().includes(params.text.toLowerCase())) {
          attrScore += 10;
        }
        
        // Check placeholder
        if (attrs['placeholder'] && attrs['placeholder'].toLowerCase().includes(params.text.toLowerCase())) {
          attrScore += 5;
        }
        
        // Check title
        if (attrs['title'] && attrs['title'].toLowerCase().includes(params.text.toLowerCase())) {
          attrScore += 5;
        }
        
        score += attrScore;
        breakdown.attributeMatch = attrScore;
      }

      const selectorSpecificity = this.calculateSelectorSpecificity(candidate.selector);
      score += selectorSpecificity;
      breakdown.specificity = selectorSpecificity;

      if (candidate.element.isInViewport) {
        score += 5;
        breakdown.inViewport = 5;
      }

      scored.push({
        ...candidate,
        score,
        breakdown
      });
    }

    const textGroups = new Map<string, typeof scored>();
    for (const candidate of scored) {
      const text = candidate.element.text?.toLowerCase().trim() || '';
      if (!textGroups.has(text)) {
        textGroups.set(text, []);
      }
      textGroups.get(text)!.push(candidate);
    }

    for (const [text, group] of textGroups) {
      if (group.length > 1 && text) {
        console.warn(`[ElementFinder] ⚠️ Found ${group.length} elements with text "${text}" - using specificity to disambiguate`);
        
        const maxSpecificity = Math.max(...group.map(c => c.breakdown.specificity || 0));
        
        for (const candidate of group) {
          const specificity = candidate.breakdown.specificity || 0;
          if (specificity < maxSpecificity) {
            const penalty = (maxSpecificity - specificity) * 2; // 2x penalty
            candidate.score -= penalty;
            candidate.breakdown.ambiguityPenalty = -penalty;
          }
        }
      }
    }

    return scored;
  }

  /**
   * Calculate selector specificity score (higher = more specific)
   * Helps disambiguate when multiple elements match
   */
  private calculateSelectorSpecificity(selector: string): number {
    let score = 0;
    
    if (selector.includes('#')) score += 20;
    
    if (selector.includes('[data-')) score += 15;
    
    if (selector.includes('[aria-')) score += 12;
    
    if (selector.includes('[name=') || selector.includes('[type=')) score += 8;
    
    const classCount = (selector.match(/\./g) || []).length;
    score += Math.min(classCount * 3, 15);
    
    const childCombinators = (selector.match(/>/g) || []).length;
    score += Math.min(childCombinators * 2, 10);
    
    if (selector.includes(':nth-')) score += 10;
    
    return score;
  }

  /**
   * NEW: Find ALL elements matching selector (not just first)
   */
  private async findAllWithQuerySelector(selector: string): Promise<{ found: boolean; elements?: any[] }> {
    const script = `
      (function() {
        try {
          const elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
          if (elements.length === 0) return { found: false };

          const results = elements.map(element => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            
            return {
              tagName: element.tagName,
              text: element.textContent?.trim().substring(0, 100),
              attributes: {
                id: element.id || undefined,
                className: element.className || undefined,
                name: element.name || undefined,
                type: element.type || undefined,
                role: element.getAttribute('role') || undefined,
                'aria-label': element.getAttribute('aria-label') || undefined,
                placeholder: element.getAttribute('placeholder') || undefined,
                title: element.getAttribute('title') || undefined
              },
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0 && 
                         style.display !== 'none' && 
                         style.visibility !== 'hidden' &&
                         style.opacity !== '0',
              isInViewport: rect.top >= 0 && rect.left >= 0 &&
                           rect.bottom <= window.innerHeight &&
                           rect.right <= window.innerWidth
            };
          });

          return { found: true, elements: results };
        } catch (e) {
          return { found: false, error: e.message };
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * NEW: Find all elements by text content
   */
  private async findAllByText(text: string): Promise<{ found: boolean; elements?: any[] }> {
    const script = `
      (function() {
        try {
          const targetText = ${JSON.stringify(text)}.toLowerCase().trim();
          const allElements = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"], [onclick]'));
          
          const matches = allElements.filter(el => {
            const elText = (el.textContent || el.value || '').toLowerCase().trim();
            return elText === targetText || elText.includes(targetText);
          });

          if (matches.length === 0) return { found: false };

          const results = matches.map(element => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            
            return {
              tagName: element.tagName,
              text: element.textContent?.trim().substring(0, 100),
              attributes: {
                id: element.id || undefined,
                className: element.className || undefined,
                type: element.type || undefined
              },
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0 &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden',
              isInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
            };
          });

          return { found: true, elements: results };
        } catch (e) {
          return { found: false, error: e.message };
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * Find element using standard CSS querySelector
   */
  async findWithQuerySelector(selector: string): Promise<FindStrategyResult> {
    const script = `
      (function() {
        try {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) return { found: false };

          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          return {
            found: true,
            element: {
              tagName: element.tagName,
              text: element.textContent?.trim().substring(0, 100),
              attributes: {
                id: element.id || undefined,
                className: element.className || undefined,
                name: element.name || undefined,
                type: element.type || undefined,
                role: element.getAttribute('role') || undefined,
                'aria-label': element.getAttribute('aria-label') || undefined
              },
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0 && 
                         style.display !== 'none' && 
                         style.visibility !== 'hidden' &&
                         style.opacity !== '0',
              isInViewport: rect.top >= 0 && rect.left >= 0 &&
                           rect.bottom <= window.innerHeight &&
                           rect.right <= window.innerWidth
            }
          };
        } catch (e) {
          return { found: false, error: e.message };
        }
      })();
    `;

    const result = await this.view.webContents.executeJavaScript(script);
    return result;
  }

  /**
   * Find element by text content matching
   */
  async findByText(baseSelector: string, text: string): Promise<FindStrategyResult> {
    const script = `
      (function() {
        try {
          // Try base selector first
          let elements = Array.from(document.querySelectorAll(${JSON.stringify(baseSelector)}));
          
          // If no base selector match, try common clickable elements
          if (elements.length === 0) {
            elements = Array.from(document.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"]'));
          }

          const targetText = ${JSON.stringify(text)}.toLowerCase().trim();
          
          for (const el of elements) {
            const elText = (el.textContent || el.value || '').toLowerCase().trim();
            
            // Exact match or contains
            if (elText === targetText || elText.includes(targetText)) {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              
              return {
                found: true,
                element: {
                  tagName: el.tagName,
                  text: el.textContent?.trim().substring(0, 100),
                  attributes: {
                    id: el.id || undefined,
                    className: el.className || undefined,
                    type: el.type || undefined
                  },
                  boundingBox: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  },
                  isVisible: rect.width > 0 && rect.height > 0 &&
                            style.display !== 'none' &&
                            style.visibility !== 'hidden',
                  isInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
                }
              };
            }
          }
          
          return { found: false };
        } catch (e) {
          return { found: false, error: e.message };
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * Find element by bounding box coordinates
   */
  async findByBoundingBox(box: { x: number; y: number; width: number; height: number }): Promise<FindStrategyResult> {
    const script = `
      (function() {
        try {
          const targetBox = ${JSON.stringify(box)};
          const centerX = targetBox.x + targetBox.width / 2;
          const centerY = targetBox.y + targetBox.height / 2;
          
          // Get element at center point
          const element = document.elementFromPoint(centerX, centerY);
          if (!element) return { found: false };

          const rect = element.getBoundingClientRect();
          
          // Verify it's roughly the same position (within 20px tolerance)
          const xMatch = Math.abs(rect.x - targetBox.x) < 20;
          const yMatch = Math.abs(rect.y - targetBox.y) < 20;
          
          if (!xMatch || !yMatch) {
            return { found: false, reason: 'position_mismatch' };
          }

          const style = window.getComputedStyle(element);
          
          // Compute a selector for this element
          let computedSelector = '';
          if (element.id) {
            computedSelector = '#' + CSS.escape(element.id);
          } else if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\\s+/).slice(0, 2);
            computedSelector = element.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
          } else {
            computedSelector = element.tagName.toLowerCase();
          }
          
          return {
            found: true,
            computedSelector,
            element: {
              tagName: element.tagName,
              text: element.textContent?.trim().substring(0, 100),
              attributes: {
                id: element.id || undefined,
                className: element.className || undefined
              },
              boundingBox: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              isVisible: rect.width > 0 && rect.height > 0 &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden',
              isInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
            }
          };
        } catch (e) {
          return { found: false, error: e.message };
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * CDP-based element finding (for operations requiring node IDs)
   * Used by operations that need direct CDP access
   */
  async findWithCDP(selectors: string[], verifyVisible: boolean): Promise<ElementQueryResult> {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const selectorType = i === 0 ? 'primary' : 'backup';

      // Validate selector - reject Playwright/jQuery syntax
      const invalidPatterns = [':has-text(', ':visible', ':enabled', ':contains(', ':has('];
      const hasInvalidSyntax = invalidPatterns.some(pattern => selector.includes(pattern));
      
      if (hasInvalidSyntax) {
        console.log(`[ElementFinder] ⚠️ Selector "${selector}" contains invalid syntax - skipping`);
        continue;
      }

      try {
        const { nodeId } = await this.debugger.sendCommand('DOM.querySelector', {
          nodeId: await this.getRootNodeId(),
          selector
        });

        if (!nodeId) continue;

        const { model } = await this.debugger.sendCommand('DOM.getBoxModel', { nodeId });
        const attributes = await this.getNodeAttributes(nodeId);
        const { node } = await this.debugger.sendCommand('DOM.describeNode', { nodeId });

        const isVisible = model.width > 0 && model.height > 0;
        if (verifyVisible && !isVisible) continue;

        const textResult = await this.debugger.sendCommand('Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(selector)})?.innerText || ''`
        });
        const text = textResult.result.value || '';

        const isEnabled = !attributes.disabled && attributes['aria-disabled'] !== 'true';

        return {
          found: true,
          nodeId,
          selector,
          selectorType,
          element: {
            tagName: node.nodeName,
            text,
            attributes,
            boundingBox: {
              x: model.content[0],
              y: model.content[1],
              width: model.width,
              height: model.height
            },
            isVisible,
            isEnabled
          }
        };

      } catch (error) {
        console.log(`[ElementFinder] Selector "${selector}" failed`);
        continue;
      }
    }

    return {
      found: false,
      selector: selectors[0],
      selectorType: 'primary',
      error: `None of the ${selectors.length} selector(s) found a matching element`
    };
  }
}
