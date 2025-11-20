/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElementFinderParams } from '@/shared/types';
import { BaseHandler } from './BaseHandler';
import type { HandlerContext, AdvancedFindResult } from './types';

interface ScoredCandidate {
  element: any;
  score: number;
  matchedBy: string[];
  breakdown: Record<string, number>;
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
  ];

  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * Find element using attribute-priority matching with comprehensive scoring
   */
  async advancedFind(params: ElementFinderParams): Promise<AdvancedFindResult> {
    console.log('[ElementFinder] 🔍 Searching with params:', {
      tag: params.tag,
      text: params.text?.substring(0, 50),
      attributeCount: Object.keys(params.attributes || {}).length,
      hasPosition: !!params.boundingBox,
      elementIndex: params.elementIndex
    });
    
    // Step 1: Find all candidates matching basic criteria
    const candidates = await this.findCandidates(params);
    console.log(`candidate(s): `, candidates);

    if (candidates.length === 0) {
      return {
        success: false,
        error: `No matching elements found. Searched with: tag=${params.tag}, text="${params.text || 'none'}", attributes=${JSON.stringify(params.attributes || {})}`
      };
    }

    // Step 2: Score and rank all candidates
    const scored = this.scoreAndRank(candidates, params);

    if (scored.length === 0) {
      return {
        success: false,
        error: `No candidates passed scoring. Found ${candidates.length} elements but none matched criteria`,
      };
    }

    // Step 3: Get best match
    const best = scored[0];
    const secondBest = scored[1];
    console.log(`best: `, best);
    console.log(`secondBest: `, secondBest);

    // Log results
    if (secondBest) {
      console.log(`[ElementFinder] 🥈 Second best: score=${secondBest.score.toFixed(1)}, matched by: ${secondBest.matchedBy.join(', ')}`);
      
      // Warn if ambiguous
      if (Math.abs(best.score - secondBest.score) < 10) {
        console.warn(`[ElementFinder] ⚠️ AMBIGUOUS MATCH! Scores are very close. Using best but this may be wrong.`);
      }
    }

    return {
      success: true,
      element: best.element,
      totalCandidates: candidates.length,
    };
  }

  /**
   * Find all candidate elements matching basic criteria
   * 
   * This searches the ENTIRE DOM, not just viewport.
   * Filters by tag, text (if provided), and stable attributes (if provided).
   */
  private async findCandidates(params: ElementFinderParams): Promise<any[]> {
    const script = `
      (function() {
        try {
          const tag = ${JSON.stringify(params.tag)};
          const targetText = ${JSON.stringify(params.text || '')}.toLowerCase().trim();
          const targetAttrs = ${JSON.stringify(params.attributes || {})};
          const dynamicAttrs = ${JSON.stringify(ElementFinder.DYNAMIC_ATTRIBUTES)};
          
          // Step 1: Get all elements with matching tag
          let elements = Array.from(document.getElementsByTagName(tag));
          
          // If no tag match, try broader search for interactive elements
          if (elements.length === 0 && targetText) {
            elements = Array.from(document.querySelectorAll('button, a, input, label, span, div, [role="button"], [role="link"]'));
          }
          
          console.log('[ElementFinder] Initial candidates by tag:', elements.length);
          
          // Step 2: Filter by text if provided
          if (targetText) {
            elements = elements.filter(el => {
              const elText = (el.innerText || el.textContent || '').toLowerCase().trim();
              const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
              const placeholder = (el.getAttribute('placeholder') || '').toLowerCase().trim();
              const title = (el.getAttribute('title') || '').toLowerCase().trim();
              const value = (el.value || '').toLowerCase().trim();
              
              return elText.includes(targetText) || 
                     ariaLabel.includes(targetText) ||
                     placeholder.includes(targetText) ||
                     title.includes(targetText) ||
                     value.includes(targetText);
            });
            console.log('[ElementFinder] After text filter:', elements.length);
          }
          
          // Step 3: Filter by stable attributes if provided
          // CRITICAL: Only filter if we have at least ONE stable attribute
          // If all attributes are dynamic (class, style, etc.), skip filtering
          if (Object.keys(targetAttrs).length > 0) {
            // First, check if we have ANY stable attributes
            const hasAnyStableAttr = Object.keys(targetAttrs).some(key => 
              !dynamicAttrs.includes(key) && targetAttrs[key]
            );
            
            if (hasAnyStableAttr) {
              // Only filter if we have stable attributes to match
              elements = elements.filter(el => {
                let hasStableMatch = false;
                
                for (const [key, value] of Object.entries(targetAttrs)) {
                  // Skip dynamic attributes
                  if (dynamicAttrs.includes(key)) continue;
                  if (!value) continue;
                  
                  const elValue = el.getAttribute(key);
                  if (elValue === value) {
                    hasStableMatch = true;
                    break; // At least one stable attribute matches
                  }
                }
                
                return hasStableMatch;
              });
              console.log('[ElementFinder] After attribute filter:', elements.length);
            } else {
              console.log('[ElementFinder] All attributes are dynamic, skipping attribute filter');
            }
          }
          
          // Step 4: Map to structured data
          // NOTE: We deliberately DO NOT filter by position here
          // Reason: Elements outside viewport are still valid targets
          // Position is used for SCORING, not filtering
          return elements.map(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            
            // Collect all attributes
            const attributes = {};
            for (const attr of el.attributes) {
              attributes[attr.name] = attr.value;
            }
            
            // Get element index among siblings
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
              elementIndex: elementIndex,
              // Store reference for debugging
              _debugPath: el.id || el.className || el.tagName
            };
          });
          
        } catch (e) {
          console.error('[ElementFinder] Error in findCandidates:', e);
          return [];
        }
      })();
    `;

    return await this.view.webContents.executeJavaScript(script);
  }

  /**
   * Score and rank candidates using comprehensive criteria
   * 
   * Scoring breakdown (max 200+ points):
   * - Tag match: 20 points
   * - Stable attributes: up to 60 points (id=20, data-*=15, aria-*=12, name/type/role=10)
   * - Text match: up to 30 points (exact=30, contains=20, word overlap=10)
   * - Position match: up to 40 points (perfect=40, close=30, near=20)
   * - Visibility: 10 points
   * - In viewport: 5 points
   * - Element index match: 50 points (huge bonus for disambiguation)
   */
  private scoreAndRank(candidates: any[], params: ElementFinderParams): ScoredCandidate[] {
    const scored: ScoredCandidate[] = [];

    for (const candidate of candidates) {
      let score = 0;
      const matchedBy: string[] = [];
      const breakdown: Record<string, number> = {};

      // 1. Tag match (20 points) - Should always match since we filter by tag
      if (candidate.tagName?.toUpperCase() === params.tag.toUpperCase()) {
        score += 20;
        breakdown.tag = 20;
        matchedBy.push('tag');
      }

      // 2. Stable attribute matches (up to 60 points)
      if (params.attributes) {
        const attrScore = this.scoreAttributes(candidate.attributes, params.attributes);
        if (attrScore > 0) {
          score += attrScore;
          breakdown.attributes = attrScore;
          matchedBy.push('attributes');
        }
      }

      // 3. Text match (up to 30 points)
      if (params.text && candidate.text) {
        const textScore = this.scoreText(candidate.text, params.text);
        if (textScore > 0) {
          score += textScore;
          breakdown.text = textScore;
          matchedBy.push('text');
        }
      }

      // 4. Position match (up to 40 points)
      // Lower weight than attributes/text because positions change with responsive design
      if (params.boundingBox && candidate.boundingBox) {
        const posScore = this.scorePosition(candidate.boundingBox, params.boundingBox);
        if (posScore > 0) {
          score += posScore;
          breakdown.position = posScore;
          matchedBy.push('position');
        }
      }

      // 5. Visibility bonus (10 points)
      if (candidate.isVisible) {
        score += 10;
        breakdown.visibility = 10;
      }

      // 6. In viewport bonus (5 points)
      if (candidate.isInViewport) {
        score += 5;
        breakdown.inViewport = 5;
      }

      scored.push({ element: candidate, score, matchedBy, breakdown });
    }

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    // 7. Apply element index disambiguation if multiple high scores
    // This is the FINAL tiebreaker when everything else is similar
    if (params.elementIndex !== undefined && scored.length > 1) {
      const topScore = scored[0].score;
      const closeMatches = scored.filter(s => Math.abs(s.score - topScore) < 15);
      
      if (closeMatches.length > 1) {
        console.log(`[ElementFinder] 🎯 Multiple close matches (${closeMatches.length}), using elementIndex=${params.elementIndex} to disambiguate`);
        
        for (const candidate of closeMatches) {
          if (candidate.element.elementIndex === params.elementIndex) {
            candidate.score += 50; // HUGE bonus for exact index match
            candidate.breakdown.elementIndex = 50;
            candidate.matchedBy.push('elementIndex');
            console.log(`[ElementFinder] ✅ Found exact elementIndex match!`);
            break;
          }
        }
        
        // Re-sort after applying index bonus
        scored.sort((a, b) => b.score - a.score);
      }
    }

    return scored;
  }

  /**
   * Score attribute matches (ignore dynamic attributes)
   * 
   * Prioritizes stable attributes:
   * - id: 20 points (most stable)
   * - data-*: 15 points (very stable)
   * - aria-*: 12 points (stable)
   * - name/type/role: 10 points (stable)
   * - others: 5 points
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
      // Partial match (lower score)
      else if (elementValue.includes(value) || value.includes(elementValue)) {
        score += 3;
      }
    }

    return Math.min(score, 60); // Cap at 60
  }

  /**
   * Score text match
   * 
   * - Exact match: 30 points
   * - Contains: 20 points
   * - Reverse contains: 15 points
   * - Word overlap: up to 10 points
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
   * 
   * Lower weight than attributes/text because:
   * - Positions change with responsive design
   * - Positions change with dynamic content
   * - Positions change with screen size
   * 
   * Use for disambiguation, not primary matching.
   */
  private scorePosition(
    elementBox: { x: number; y: number; width: number; height: number },
    targetBox: { x: number; y: number; width: number; height: number }
  ): number {
    const xDiff = Math.abs(elementBox.x - targetBox.x);
    const yDiff = Math.abs(elementBox.y - targetBox.y);
    const totalDiff = xDiff + yDiff;

    if (totalDiff < 5) return 40;   // Perfect (within 5px)
    if (totalDiff < 20) return 30;  // Very close
    if (totalDiff < 50) return 20;  // Close
    if (totalDiff < 100) return 10; // Near
    if (totalDiff < 200) return 5;  // Nearby

    return 0;
  }
}
