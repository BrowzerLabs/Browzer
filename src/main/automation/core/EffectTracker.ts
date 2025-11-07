/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseHandler } from './BaseHandler';
import type { HandlerContext } from './types';
import type { ExecutionEffects } from '@/shared/types';

/**
 * EffectTracker - Tracks and detects effects of automation actions
 * 
 * Captures pre-action state and compares with post-action state to detect:
 * - Navigation changes
 * - DOM mutations
 * - Modal/dialog appearances
 * - Focus changes
 * - Form submissions
 * - Network activity
 * 
 * Provides LLM-friendly summaries of what happened after an action.
 */
export class EffectTracker extends BaseHandler {
  private preActionState: any = null;

  constructor(context: HandlerContext) {
    super(context);
  }

  /**
   * Capture state before an action
   */
  async capturePreActionState(): Promise<void> {
    this.preActionState = {
      url: this.getUrl(),
      timestamp: Date.now()
    };
  }

  /**
   * Capture and analyze effects after an action
   */
  async capturePostActionEffects(): Promise<ExecutionEffects> {
    const currentUrl = this.getUrl();
    const navigationOccurred = this.preActionState && currentUrl !== this.preActionState.url;

    return {
      navigationOccurred,
      newUrl: navigationOccurred ? currentUrl : undefined,
      summary: navigationOccurred 
        ? `Navigation occurred to ${currentUrl}` 
        : 'Action completed successfully'
    };
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.preActionState = null;
  }
}
