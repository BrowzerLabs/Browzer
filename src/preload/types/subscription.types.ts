import type {
  PlansResponse,
  SubscriptionResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  PortalSessionRequest,
  PortalSessionResponse,
  CreditUsageResponse,
  CancelSubscriptionResponse,
  ReactivateSubscriptionResponse,
} from '@/shared/types/subscription';

/**
 * Subscription API - Handles subscription plans, payments, and credit management
 */
export interface SubscriptionAPI {
  // Plans
  getPlans: () => Promise<PlansResponse>;
  
  // Subscription Management
  getCurrentSubscription: () => Promise<SubscriptionResponse>;
  createCheckoutSession: (request: CheckoutSessionRequest) => Promise<CheckoutSessionResponse>;
  createPortalSession: (request: PortalSessionRequest) => Promise<PortalSessionResponse>;
  syncSubscription: () => Promise<SubscriptionResponse>;
  cancelSubscription: () => Promise<CancelSubscriptionResponse>;
  reactivateSubscription: () => Promise<ReactivateSubscriptionResponse>;
  
  // Credit Management
  useCredits: (creditsToUse: number) => Promise<CreditUsageResponse>;
  hasCredits: (creditsNeeded: number) => Promise<boolean>;
  getCreditsRemaining: () => Promise<number>;
  
  // Event Listeners
  onSubscriptionUpdate: (callback: (data: any) => void) => () => void;
  
  // Utility
  openExternal: (url: string) => Promise<void>;
}
