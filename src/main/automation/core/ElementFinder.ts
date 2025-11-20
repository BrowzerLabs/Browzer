/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElementFinderParams } from '@/shared/types';
import { BaseHandler } from './BaseHandler';
import type { HandlerContext, AdvancedFindResult } from './types';

/**
 * SIMPLIFIED ELEMENT FINDER - Attribute-Priority Matching
 * 
 * Strategy (in priority order):
 * 1. Tag name - Filter by HTML tag
 * 2. Stable attributes - Match id, data-*, aria-*, name, type, role, etc.
 * 3. Text content - Match visible text
 * 4. Position - Match bounding box coordinates
 * 5. Element index - Use nth-element for disambiguation
 */


interface ScoredCandidate {
  element: any;
  score: number;
  matchedBy: string[];
}

export class ElementFinder extends BaseHandler {
  // Attributes that change dynamically - IGNORE these
  private static readonly DYNAMIC_ATTRIBUTES = [
    'class',
    'style',
    'aria-expanded',
    'aria-selected',
    'aria-checked',
    'aria-pressed',
    'aria-hidden',
    'aria-current',
    'tabindex',
    'data-state',
    'data-active',
    'data-selected',
    'data-focus',
    'data-hover',
    'value',  // Changes with user input
    'checked',
    'selected',
    'disabled',
    'readonly'
  ];

  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * Find element using attribute-priority matching
   */
  async advancedFind(params: ElementFinderParams): Promise<AdvancedFindResult> {
    console.log("params: ", JSON.stringify(params));
    
    // Find all candidates
    const candidates = await this.findCandidates(params);
    console.log("candidates: ", candidates);

    if (candidates.length === 0) {
      return {
        success: false,
        error: `No matching elements found. Searched with: tag=${params.tag}, text="${params.text}"`
      };
    }

    // Score and rank
    const scored = this.scoreAndRank(candidates, params);

    if (scored.length === 0) {
      return {
        success: false,
        error: `No candidates passed scoring. Found ${candidates.length} elements but none matched well`,
      };
    }

    const best = scored[0];
    console.log(`[ElementFinder] 🏆 Best: score=${best.score}, matched by: ${best.matchedBy.join(', ')}`);

    return {
      success: true,
      element: best.element,
      totalCandidates: candidates.length
    };
  }

  /**
   * Find all candidate elements
   */
  private async findCandidates(params: ElementFinderParams): Promise<any[]> {
    const script = `
      (function() {
        try {
          const tag = ${JSON.stringify(params.tag)};
          const targetText = ${JSON.stringify(params.text || '')}.toLowerCase().trim();
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const targetBox = ${JSON.stringify(params.boundingBox)};
          
          // Get all elements with matching tag
          let elements = Array.from(document.getElementsByTagName(tag));
          
          // If no tag match, try broader search
          if (elements.length === 0 && targetText) {
            elements = Array.from(document.querySelectorAll('button, a, input, label, span, div, [role="button"]'));
          }
          
          // Filter by text if provided
          if (targetText) {
            elements = elements.filter(el => {
              const elText = (el.innerText || el.textContent || '').toLowerCase().trim();
              const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
              const placeholder = (el.getAttribute('placeholder') || '').toLowerCase().trim();
              const title = (el.getAttribute('title') || '').toLowerCase().trim();
              
              return elText.includes(targetText) || 
                     ariaLabel.includes(targetText) ||
                     placeholder.includes(targetText) ||
                     title.includes(targetText);
            });
          }
          
          // Filter by stable attributes if provided
          if (Object.keys(targetAttrs).length > 0) {
            const dynamicAttrs = ${JSON.stringify(ElementFinder.DYNAMIC_ATTRIBUTES)};
            
            elements = elements.filter(el => {
              let matches = 0;
              for (const [key, value] of Object.entries(targetAttrs)) {
                // Skip dynamic attributes
                if (dynamicAttrs.includes(key)) continue;
                if (!value) continue;
                
                const elValue = el.getAttribute(key);
                if (elValue === value) matches++;
              }
              return matches > 0; // At least one stable attribute matches
            });
          }
          
          // Filter by position if provided
          if (targetBox) {
            const centerX = targetBox.x + targetBox.width / 2;
            const centerY = targetBox.y + targetBox.height / 2;
            
            // Find element at position
            const elAtPos = document.elementFromPoint(centerX, centerY);
            if (elAtPos) {
              // Only keep elements near this position
              elements = elements.filter(el => {
                const rect = el.getBoundingClientRect();
                const elCenterX = rect.x + rect.width / 2;
                const elCenterY = rect.y + rect.height / 2;
                const distance = Math.abs(elCenterX - centerX) + Math.abs(elCenterY - centerY);
                return distance < 100; // Within 100px
              });
            }
          }
          
          // Map to structured data
          return elements.map(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            
            const attributes = {};
            for (const attr of el.attributes) {
              attributes[attr.name] = attr.value;
            }
            
            const elementIndex = el.parentElement 
              ? Array.from(el.parentElement.children).indexOf(el)
              : 0;
            
            return {
              tagName: el.tagName,
              text: (el.innerText || el.textContent || '').trim().substring(0, 200),
              attributes: attributes,
              boundingBox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },
              isVisible: rect.width > 0 && rect.height > 0 && 
                         style.display !== 'none' && 
                         style.visibility !== 'hidden' &&
                         style.opacity !== '0',
              isInViewport: rect.top >= 0 && rect.left >= 0 &&
                           rect.bottom <= window.innerHeight &&
                           rect.right <= window.innerWidth,
              elementIndex: elementIndex
            };
          }).filter(el => el.isVisible); // Only visible elements
          
        } catch (e) {
          console.error('ElementFinder error:', e);
          return [];
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * Score and rank candidates
   */
  private scoreAndRank(candidates: any[], params: ElementFinderParams): ScoredCandidate[] {
    const scored: ScoredCandidate[] = [];

    for (const candidate of candidates) {
      let score = 0;
      const matchedBy: string[] = [];

      // 1. Tag match (20 points)
      if (candidate.tagName?.toUpperCase() === params.tag.toUpperCase()) {
        score += 20;
        matchedBy.push('tag');
      }

      // 2. Stable attribute matches (up to 60 points)
      if (params.attributes) {
        const attrScore = this.scoreAttributes(candidate.attributes, params.attributes);
        if (attrScore > 0) {
          score += attrScore;
          matchedBy.push('attributes');
        }
      }

      // 3. Text match (up to 30 points)
      if (params.text && candidate.text) {
        const textScore = this.scoreText(candidate.text, params.text);
        if (textScore > 0) {
          score += textScore;
          matchedBy.push('text');
        }
      }

      // 4. Position match (up to 40 points)
      if (params.boundingBox && candidate.boundingBox) {
        const posScore = this.scorePosition(candidate.boundingBox, params.boundingBox);
        if (posScore > 0) {
          score += posScore;
          matchedBy.push('position');
        }
      }

      // 5. Visibility bonus (10 points)
      if (candidate.isVisible) {
        score += 10;
      }

      // 6. In viewport bonus (5 points)
      if (candidate.isInViewport) {
        score += 5;
      }

      scored.push({ element: candidate, score, matchedBy });
    }

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Apply element index disambiguation if multiple high scores
    if (params.elementIndex !== undefined && scored.length > 1) {
      const topScore = scored[0].score;
      const closeMatches = scored.filter(s => Math.abs(s.score - topScore) < 10);
      
      if (closeMatches.length > 1) {
        for (const candidate of closeMatches) {
          if (candidate.element.elementIndex === params.elementIndex) {
            candidate.score += 50; // Huge bonus for exact index match
            candidate.matchedBy.push('elementIndex');
            console.log(`[ElementFinder] 🎯 Using elementIndex=${params.elementIndex} to disambiguate`);
            break;
          }
        }
        scored.sort((a, b) => b.score - a.score);
      }
    }

    return scored;
  }

  /**
   * Score attribute matches (ignore dynamic attributes)
   */
  private scoreAttributes(elementAttrs: Record<string, string>, targetAttrs: Record<string, string>): number {
    let score = 0;

    for (const [key, value] of Object.entries(targetAttrs)) {
      // Skip dynamic attributes
      if (ElementFinder.DYNAMIC_ATTRIBUTES.includes(key)) continue;
      if (!value) continue;

      const elementValue = elementAttrs[key];
      if (!elementValue) continue;

      // Exact match
      if (elementValue === value) {
        // Higher score for more stable attributes
        if (key === 'id') score += 20;
        else if (key.startsWith('data-')) score += 15;
        else if (key.startsWith('aria-')) score += 12;
        else if (['name', 'type', 'role'].includes(key)) score += 10;
        else score += 5;
      }
      // Partial match
      else if (elementValue.includes(value) || value.includes(elementValue)) {
        score += 3;
      }
    }

    return Math.min(score, 60); // Cap at 60
  }

  /**
   * Score text match
   */
  private scoreText(elementText: string, targetText: string): number {
    const elText = elementText.toLowerCase().trim();
    const tgtText = targetText.toLowerCase().trim();

    if (elText === tgtText) return 30; // Exact
    if (elText.includes(tgtText)) return 20; // Contains
    if (tgtText.includes(elText)) return 15; // Reverse contains
    
    // Word overlap
    const elWords = new Set(elText.split(/\s+/));
    const tgtWords = new Set(tgtText.split(/\s+/));
    const overlap = [...elWords].filter(w => tgtWords.has(w)).length;
    if (overlap > 0) return Math.min(overlap * 3, 10);

    return 0;
  }

  /**
   * Score position match
   */
  private scorePosition(
    elementBox: { x: number; y: number; width: number; height: number },
    targetBox: { x: number; y: number; width: number; height: number }
  ): number {
    const xDiff = Math.abs(elementBox.x - targetBox.x);
    const yDiff = Math.abs(elementBox.y - targetBox.y);
    const totalDiff = xDiff + yDiff;

    if (totalDiff < 5) return 40;   // Perfect
    if (totalDiff < 20) return 30;  // Very close
    if (totalDiff < 50) return 20;  // Close
    if (totalDiff < 100) return 10; // Near
    if (totalDiff < 200) return 5;  // Nearby

    return 0;
  }

  /**
   * Generate selector for logging
   */
  private generateSelector(element: any): string {
    const attrs = element.attributes || {};
    
    if (attrs.id && !attrs.id.match(/^(:r[0-9a-z]+:|mui-|mat-)/)) {
      return `#${attrs.id}`;
    }
    if (attrs['data-testid']) {
      return `[data-testid="${attrs['data-testid']}"]`;
    }
    if (attrs['aria-label']) {
      return `[aria-label="${attrs['aria-label']}"]`;
    }
    if (attrs.name) {
      return `[name="${attrs.name}"]`;
    }
    
    return element.tagName?.toLowerCase() || 'unknown';
  }
}
