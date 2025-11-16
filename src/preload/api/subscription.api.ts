import type { SubscriptionAPI } from '@/preload/types/subscription.types';
import { invoke, createEventListener } from '@/preload/utils/ipc-helpers';
import type { CheckoutSessionRequest, PortalSessionRequest } from '@/shared/types/subscription';

/**
 * Subscription API implementation
 * Handles subscription plans, payments, and credit management
 */
export const createSubscriptionAPI = (): SubscriptionAPI => ({
  // Plans
  getPlans: () => invoke('subscription:get-plans'),
  
  // Subscription Management
  getCurrentSubscription: () => invoke('subscription:get-current'),
  createCheckoutSession: (request: CheckoutSessionRequest) => 
    invoke('subscription:create-checkout', request),
  createPortalSession: (request: PortalSessionRequest) => 
    invoke('subscription:create-portal', request),
  syncSubscription: () => invoke('subscription:sync'),
  
  // Credit Management
  useCredits: (creditsToUse: number) => invoke('subscription:use-credits', creditsToUse),
  hasCredits: (creditsNeeded: number) => invoke('subscription:has-credits', creditsNeeded),
  getCreditsRemaining: () => invoke('subscription:get-credits-remaining'),
  
  // Event listener for real-time subscription updates
  onSubscriptionUpdate: (callback) => 
    createEventListener('subscription_update', callback),
  
  // Utility
  openExternal: (url: string) => invoke('shell:open-external', url),
});
