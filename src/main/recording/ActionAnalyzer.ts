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
   * Detect standalone useless clicks (clicks on non-interactive elements with no effects)
   */
  private detectUselessClicks(actions: RecordedAction[]): void {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      // Skip if already marked or not a click
      if (action.metadata?.unnecessary || action.type !== 'click') continue;
      
      // Check if it's a click on a useless element with no effects
      const isUseless = this.isUselessClickTarget(action);
      const hasEffects = this.hasSignificantEffect(action);
      
      if (isUseless) {
        const tagName = action.target?.tagName?.toLowerCase() || 'unknown';
        const className = action.target?.className || '';
        const elementInfo = className ? `${tagName}.${className}` : tagName;
        
        console.log(`🔍 Detected potential useless click on ${elementInfo} - Effects: ${hasEffects ? 'YES' : 'NO'}`);
        
        if (!hasEffects) {
          this.markAsUnnecessary(action, 'useless_element_click', 
            `Click on non-interactive ${elementInfo} with no effects`);
        }
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
    if (!effects) return false;
    
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
    
    // If we have any effect summary, assume it's somewhat significant
    return summary.length > 0;
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
    
    // Useless elements that typically shouldn't be clicked
    const uselessTags = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'ul', 'li', 'ol'];
    
    // Interactive elements that are OK to click
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea', 'option', 'summary', 'details'];
    
    // If it's an interactive element, it's probably useful
    if (interactiveTags.includes(tagName || '')) {
      return false;
    }
    
    // If it's a useless tag, check for interactive indicators
    if (uselessTags.includes(tagName || '')) {
      // Check for interactive roles
      const role = target.role?.toLowerCase() || '';
      const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch', 'slider'];
      if (interactiveRoles.includes(role)) {
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
        return false; // Has interactive class, probably useful
      }
      
      // Check for interactive text content
      const interactiveTextPatterns = ['click', 'sign in', 'login', 'register', 'submit', 'continue', 'next', 'back', 'close'];
      const hasInteractiveText = interactiveTextPatterns.some(pattern => text.includes(pattern));
      
      if (hasInteractiveText) {
        return false; // Has interactive text, probably useful
      }
      
      // Check if it has click handlers (from selector analysis)
      const selector = target.selector || '';
      if (selector.includes('[onclick]') || selector.includes('.js-') || selector.includes('[data-action]') || 
          selector.includes('[data-click]') || selector.includes('[data-handler]')) {
        return false; // Likely has JavaScript handlers
      }
      
      // Check for ARIA attributes that indicate interactivity
      const ariaAttributes = ['aria-expanded', 'aria-pressed', 'aria-selected', 'aria-checked'];
      // Note: We'd need to enhance the target capture to include more ARIA attributes
      
      // If we get here, it's probably a useless div/span/etc with no interactive purpose
      return true;
    }
    
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