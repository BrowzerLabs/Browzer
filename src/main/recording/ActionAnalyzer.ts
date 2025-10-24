import { RecordedAction } from '@/shared/types';

/**
 * ActionAnalyzer - Determines usefulness of actions and identifies unnecessary steps
 * 
 * Analyzes action sequences to identify and flag actions that don't contribute
 * to the workflow goal (accidental clicks, failed attempts, redundant actions)
 */
export class ActionAnalyzer {
  
  /**
   * Analyze actions and mark unnecessary ones for removal
   */
  public analyzeActionUsefulness(actions: RecordedAction[]): RecordedAction[] {
    console.log(`🔍 Analyzing ${actions.length} actions for usefulness...`);
    
    const analyzedActions = actions.map(action => ({ ...action }));
    
    // Mark actions as unnecessary based on various criteria
    this.detectAccidentalClicks(analyzedActions);
    this.detectEmptyClickSequences(analyzedActions);
    this.detectUselessClicks(analyzedActions);
    this.detectFailedAttempts(analyzedActions);
    this.detectRedundantActions(analyzedActions);
    this.detectNavigationBacktracks(analyzedActions);
    
    const unnecessaryCount = analyzedActions.filter(a => a.metadata?.unnecessary).length;
    console.log(`🎯 Marked ${unnecessaryCount}/${actions.length} actions as unnecessary`);
    
    return analyzedActions;
  }
  
  /**
   * Detect accidental clicks (quick click followed by immediate different action)
   */
  private detectAccidentalClicks(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length - 1; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      
      // Skip if already marked or not a click
      if (current.metadata?.unnecessary || current.type !== 'click') continue;
      
      const timeDiff = next.timestamp - current.timestamp;
      
      // Enhanced detection: Check for useless element types
      const isUselessElement = this.isUselessClickTarget(current);
      
      // If click is followed by another click within 1 second on different element
      if (timeDiff < 1000 && next.type === 'click' && 
          current.target?.selector !== next.target?.selector) {
        
        // Check if the first click had no visible effect OR was on useless element
        if (!this.hasSignificantEffect(current) || isUselessElement) {
          this.markAsUnnecessary(current, 'accidental_click', 
            `Quick click followed by different action within ${timeDiff}ms`);
        }
      }
      
      // Also flag clicks on useless elements that have no effects (regardless of timing)
      else if (isUselessElement && !this.hasSignificantEffect(current)) {
        this.markAsUnnecessary(current, 'useless_click', 
          `Click on non-interactive element: ${current.target?.tagName?.toLowerCase() || 'unknown'}`);
      }
    }
  }
  
  /**
   * Detect empty click sequences - pattern where empty click is followed by meaningful click
   */
  private detectEmptyClickSequences(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length - 1; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      
      // Skip if already marked or not clicks
      if (current.metadata?.unnecessary || current.type !== 'click' || next.type !== 'click') continue;
      
      const timeDiff = next.timestamp - current.timestamp;
      
      // Look for pattern: empty/useless click followed quickly by meaningful click
      if (timeDiff < 2000) { // Within 2 seconds
        const currentIsEmpty = this.isEmptyClick(current);
        const currentIsUseless = this.isUselessClickTarget(current);
        const nextIsMeaningful = this.isMeaningfulClick(next);
        
        if ((currentIsEmpty || currentIsUseless) && nextIsMeaningful) {
          const currentSelector = current.target?.selector || 'unknown';
          const nextSelector = next.target?.selector || 'unknown';
          
          console.log(`🎯 Empty click sequence detected:`);
          console.log(`   Current: ${currentSelector} (empty: ${currentIsEmpty}, useless: ${currentIsUseless})`);
          console.log(`   Next: ${nextSelector} (meaningful: ${nextIsMeaningful})`);
          console.log(`   Time gap: ${timeDiff}ms`);
          
          this.markAsUnnecessary(current, 'empty_click_sequence', 
            `Empty/useless click followed by meaningful click on ${nextSelector} after ${timeDiff}ms`);
        }
      }
    }
  }

  /**
   * Check if this is a meaningful click (on interactive elements)
   */
  private isMeaningfulClick(action: RecordedAction): boolean {
    if (action.type !== 'click') return false;
    
    const target = action.target;
    if (!target) return false;
    
    // Interactive elements are meaningful
    const interactiveTags = ['input', 'button', 'a', 'select', 'textarea'];
    if (interactiveTags.includes(target.tagName?.toLowerCase() || '')) {
      return true;
    }
    
    // Elements with interactive roles
    const interactiveRoles = ['button', 'link', 'tab', 'menuitem'];
    if (interactiveRoles.includes(target.role?.toLowerCase() || '')) {
      return true;
    }
    
    // Elements with IDs (often interactive)
    if (target.id && target.id.length > 0) {
      return true;
    }
    
    // Elements with meaningful text/labels
    if (target.text || target.ariaLabel) {
      return true;
    }
    
    return false;
  }

  /**
   * Detect standalone useless clicks (clicks on non-interactive elements with no effects)
   */
  private detectUselessClicks(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      // Skip if already marked or not a click
      if (action.metadata?.unnecessary || action.type !== 'click') continue;
      
      // Enhanced empty click detection
      const isEmpty = this.isEmptyClick(action);
      const isUseless = this.isUselessClickTarget(action);
      const hasEffects = this.hasSignificantEffect(action);
      
      // Log detailed analysis for debugging
      const selector = action.target?.selector || 'no-selector';
      const tagName = action.target?.tagName?.toLowerCase() || 'unknown';
      const className = action.target?.className || '';
      const elementInfo = className ? `${tagName}.${className}` : tagName;
      
      console.log(`🔍 Analyzing click on ${elementInfo} (${selector})`);
      console.log(`   Empty: ${isEmpty}, Useless: ${isUseless}, Has Effects: ${hasEffects}`);
      
      // Flag as unnecessary if it's empty OR (useless AND no effects) OR (div with undefined value and no effects)
      if (isEmpty) {
        this.markAsUnnecessary(action, 'empty_click', 
          `Empty click with undefined value on ${elementInfo}`);
      } else if (isUseless && !hasEffects) {
        this.markAsUnnecessary(action, 'useless_element_click', 
          `Click on non-interactive ${elementInfo} with no effects`);
      } else if (tagName === 'div' && action.value === undefined && !hasEffects) {
        // Special case: div clicks with undefined value and no effects (even if not flagged as "useless")
        this.markAsUnnecessary(action, 'ineffective_div_click', 
          `Div click with undefined value and no measurable effects`);
      }
    }
  }
  
  /**
   * Detect failed attempts (action with no effect followed by retry)
   */
  private detectFailedAttempts(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length - 2; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      const afterNext = actions[i + 2];
      
      if (current.metadata?.unnecessary) continue;
      
      // Pattern: Action -> Similar action on different element -> Success
      if (this.isSimilarAction(current, afterNext) && 
          current.target?.selector !== afterNext.target?.selector &&
          !this.hasSignificantEffect(current) &&
          this.hasSignificantEffect(afterNext)) {
        
        this.markAsUnnecessary(current, 'failed_attempt',
          `Failed attempt, succeeded later with ${afterNext.target?.selector}`);
      }
    }
  }
  
  /**
   * Detect redundant actions (same action repeated immediately)
   */
  private detectRedundantActions(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length - 1; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      
      if (current.metadata?.unnecessary) continue;
      
      // Same element, same action type, within 2 seconds
      if (current.type === next.type &&
          current.target?.selector === next.target?.selector &&
          next.timestamp - current.timestamp < 2000) {
        
        // For inputs, check if values are different (progressive typing is OK)
        if (current.type === 'input') {
          const currentVal = current.value?.toString() || '';
          const nextVal = next.value?.toString() || '';
          
          // If next value doesn't build on current value, mark current as redundant
          if (!nextVal.startsWith(currentVal)) {
            this.markAsUnnecessary(current, 'redundant_input',
              `Replaced by newer input: "${currentVal}" -> "${nextVal}"`);
          }
        } else {
          // For other actions, mark first as redundant
          this.markAsUnnecessary(current, 'redundant_action',
            `Repeated ${current.type} on same element`);
        }
      }
    }
  }
  
  /**
   * Detect navigation backtracks (go to page then immediately back)
   */
  private detectNavigationBacktracks(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length - 1; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      
      if (current.metadata?.unnecessary) continue;
      
      // Navigation followed by back navigation within 5 seconds
      if (current.type === 'navigate' && 
          (next.type === 'navigate' || this.isBackNavigation(next)) &&
          next.timestamp - current.timestamp < 5000) {
        
        this.markAsUnnecessary(current, 'navigation_backtrack',
          `Navigation immediately reversed`);
      }
    }
  }
  
  /**
   * Check if action had significant effect (navigation, form submission, etc.)
   */
  private hasSignificantEffect(action: RecordedAction): boolean {
    const effects = action.effects;
    
    // If no effects data at all, check metadata for clues
    if (!effects) {
      // Look at standard metadata for effect indicators
      const metadata = action.metadata as any;
      if (metadata) {
        // Check if focus changed (indicates interaction)
        if (metadata.preClickState && metadata.postClickState) {
          const focusChanged = metadata.preClickState.activeElement !== metadata.postClickState?.activeElement;
          if (focusChanged) return true;
        }
        
        // Check if it's a direct click with actual element interaction
        if (metadata.isDirectClick && metadata.clickedElement) {
          return true;
        }
      }
      
      // No effects data and no metadata indicators = likely no effects
      return false;
    }
    
    // Check for obvious significant effects
    const hasObviousEffects = !!(
      effects.navigation?.occurred ||
      effects.formSubmit?.occurred ||
      effects.modal?.appeared ||
      effects.stateChange?.occurred ||
      (effects.network && effects.network.requestCount > 0) ||
      effects.focus?.changed ||
      (effects.scroll && effects.scroll.occurred)
    );
    
    if (hasObviousEffects) return true;
    
    // If no obvious effects, check the summary
    const summary = effects.summary?.toLowerCase() || '';
    
    // If summary explicitly says "no significant effects", it's truly useless
    if (summary.includes('no significant effects') || summary.includes('none')) {
      return false;
    }
    
    // If we have any effect summary that's not "none", assume it's somewhat significant
    return summary.length > 0 && summary !== 'none';
  }
  
  /**
   * Check if two actions are similar (same intent, different targets)
   */
  private isSimilarAction(action1: RecordedAction, action2: RecordedAction): boolean {
    if (action1.type !== action2.type) return false;
    
    // For clicks, check if targeting similar elements (buttons, links)
    if (action1.type === 'click') {
      const tag1 = action1.target?.tagName?.toLowerCase();
      const tag2 = action2.target?.tagName?.toLowerCase();
      return tag1 === tag2 && ['button', 'a', 'input'].includes(tag1 || '');
    }
    
    return false;
  }
  
  /**
   * Check if action is a back navigation
   */
  private isBackNavigation(action: RecordedAction): boolean {
    if (action.type !== 'click') return false;
    
    const text = action.target?.text?.toLowerCase() || '';
    const selector = action.target?.selector?.toLowerCase() || '';
    
    return text.includes('back') || selector.includes('back') || 
           text.includes('previous') || selector.includes('prev');
  }
  
  /**
   * Check if this is an empty/meaningless click
   */
  private isEmptyClick(action: RecordedAction): boolean {
    if (action.type !== 'click') return false;
    
    const target = action.target;
    if (!target) return true;
    
    const tagName = target.tagName?.toLowerCase() || '';
    const selector = target.selector || '';
    const className = target.className || '';
    
    console.log(`   🔍 isEmptyClick analysis:`);
    console.log(`      Value: ${action.value} (${typeof action.value})`);
    console.log(`      TagName: ${tagName}`);
    console.log(`      Selector: ${selector}`);
    console.log(`      ClassName: ${className}`);
    
    // Check for undefined/null values which indicate empty clicks
    const hasUndefinedValue = action.value === undefined || action.value === null;
    console.log(`      Has undefined value: ${hasUndefinedValue}`);
    
    if (hasUndefinedValue) {
      // Clicks on html/body are almost always empty/accidental
      if (tagName === 'html' || tagName === 'body') {
        console.log(`      -> Detected as empty: html/body click`);
        return true;
      }
      
      // Clicks on generic divs with complex nth-child selectors are suspicious
      if (tagName === 'div' && selector.includes(':nth-child(')) {
        // Check if it has any interactive indicators
        const hasInteractiveIndicators = !!(
          target.role ||
          target.ariaLabel ||
          target.text ||
          (className && (
            className.includes('btn') ||
            className.includes('button') ||
            className.includes('click') ||
            className.includes('interactive')
          ))
        );
        
        console.log(`      -> Generic div with nth-child, interactive indicators: ${hasInteractiveIndicators}`);
        
        if (!hasInteractiveIndicators) {
          console.log(`      -> Detected as empty: generic div with no interactive purpose`);
          return true; // Generic div with no interactive purpose
        }
      }
      
      // Clicks with no target information are empty
      if (!selector || selector.trim() === '') {
        console.log(`      -> Detected as empty: no selector`);
        return true;
      }
    }
    
    console.log(`      -> Not detected as empty`);
    return false;
  }

  /**
   * Check if click target is a useless/non-interactive element
   */
  private isUselessClickTarget(action: RecordedAction): boolean {
    if (action.type !== 'click') return false;
    
    const target = action.target;
    if (!target) return false;
    
    const tagName = target.tagName?.toLowerCase();
    const className = target.className?.toLowerCase() || '';
    const id = target.id?.toLowerCase() || '';
    const text = target.text?.toLowerCase() || '';
    const selector = target.selector || '';
    
    console.log(`   🔍 isUselessClickTarget analysis:`);
    console.log(`      TagName: ${tagName}`);
    console.log(`      ClassName: ${className}`);
    console.log(`      Selector: ${selector}`);
    console.log(`      Text: ${text}`);
    
    // Useless elements that typically shouldn't be clicked
    const uselessTags = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'ul', 'li', 'ol'];
    
    // Interactive elements that are OK to click
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea', 'option', 'summary', 'details'];
    
    // If it's an interactive element, it's probably useful
    if (interactiveTags.includes(tagName || '')) {
      console.log(`      -> Not useless: interactive tag (${tagName})`);
      return false;
    }
    
    // If it's a useless tag, check for interactive indicators
    if (uselessTags.includes(tagName || '')) {
      console.log(`      -> Potentially useless tag: ${tagName}`);
      
      // Check for interactive roles
      const role = target.role?.toLowerCase() || '';
      const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch', 'slider'];
      if (interactiveRoles.includes(role)) {
        console.log(`      -> Not useless: has interactive role (${role})`);
        return false; // Has interactive role, probably useful
      }
      
      // Check for interactive classes (common patterns including Google-specific)
      const interactiveClassPatterns = [
        'btn', 'button', 'link', 'clickable', 'interactive', 'tab', 'menu',
        'gb_', 'goog-', 'VfPpkd-', 'ytp-', // Google-specific patterns
        'click', 'press', 'touch', 'tap', 'select',
        'action', 'trigger', 'toggle', 'switch'
      ];
      const hasInteractiveClass = interactiveClassPatterns.some(pattern => 
        className.includes(pattern) || id.includes(pattern)
      );
      
      if (hasInteractiveClass) {
        console.log(`      -> Not useless: has interactive class pattern`);
        return false; // Has interactive class, probably useful
      }
      
      // Check for interactive text content
      const interactiveTextPatterns = ['click', 'sign in', 'login', 'register', 'submit', 'continue', 'next', 'back', 'close'];
      const hasInteractiveText = interactiveTextPatterns.some(pattern => text.includes(pattern));
      
      if (hasInteractiveText) {
        console.log(`      -> Not useless: has interactive text`);
        return false; // Has interactive text, probably useful
      }
      
      // Check if it has click handlers (from selector analysis)
      if (selector.includes('[onclick]') || selector.includes('.js-') || selector.includes('[data-action]') || 
          selector.includes('[data-click]') || selector.includes('[data-handler]')) {
        console.log(`      -> Not useless: likely has JavaScript handlers`);
        return false; // Likely has JavaScript handlers
      }
      
      // Special case: Generic div containers with complex selectors and no clear purpose
      if (tagName === 'div') {
        // Complex nth-child selectors often indicate layout containers
        if (selector.includes(':nth-child(')) {
          console.log(`      -> Detected as useless: generic div with nth-child selector`);
          return true;
        }
        
        // Divs with only generic class names like "BDEI9 LZgQXe" (random/generated)
        const classNames = className.split(' ').filter(c => c.length > 0);
        if (classNames.length > 0) {
          const hasRandomClasses = classNames.every(cls => {
            // Check if class looks generated/random (mix of letters/numbers, no clear meaning)
            // Patterns like: BDEI9, LZgQXe, etc.
            return /^[A-Za-z0-9]{4,8}$/.test(cls) && 
                   !/btn|button|click|menu|nav|content|header|footer|main|form|input|field/.test(cls.toLowerCase());
          });
          
          console.log(`      -> Class analysis: ${classNames.join(', ')} - Random classes: ${hasRandomClasses}`);
          
          if (hasRandomClasses) {
            console.log(`      -> Detected as useless: div with generated/random class names`);
            return true;
          }
        }
        
        // Empty div (no text, no meaningful content)
        if (!text || text.trim().length === 0) {
          console.log(`      -> Detected as useless: empty div with no text content`);
          return true;
        }
      }
      
      // If we get here with a useless tag and no interactive indicators, it's useless
      console.log(`      -> Detected as useless: no interactive indicators found`);
      return true;
    }
    
    console.log(`      -> Not useless: unknown element, assuming useful`);
    return false; // Unknown element, assume it's useful to be safe
  }

  /**
   * Mark action as unnecessary with reason
   */
  private markAsUnnecessary(action: RecordedAction, reason: string, details: string): void {
    if (!action.metadata) action.metadata = {};
    
    action.metadata.unnecessary = true;
    action.metadata.unnecessaryReason = reason;
    action.metadata.unnecessaryDetails = details;
    
    console.log(`🗑️ Marked action ${action.type} as unnecessary: ${reason} - ${details}`);
  }
}