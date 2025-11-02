/**
 * Subscription types for Stripe integration
 * Matches backend schemas
 */

export enum SubscriptionTier {
  FREEMIUM = 'freemium',
  PRO = 'pro',
  BUSINESS = 'business',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  PAUSED = 'paused',
}

export interface PlanDetails {
  tier: SubscriptionTier;
  name: string;
  price_monthly: number;
  credits_per_month: number | null; // null = unlimited
  stripe_price_id: string;
  features: string[];
}

export interface UserSubscription {
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  credits_remaining: number;
  credits_used: number;
  credits_limit: number | null; // null = unlimited
  created_at: string;
  updated_at: string;
}

export interface SubscriptionResponse {
  success: boolean;
  subscription?: UserSubscription;
  plan_details?: PlanDetails;
  error?: string;
}

export interface CheckoutSessionRequest {
  tier: SubscriptionTier;
  success_url: string;
  cancel_url: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  checkout_url?: string;
  session_id?: string;
  error?: string;
}

export interface PortalSessionRequest {
  return_url: string;
}

export interface PortalSessionResponse {
  success: boolean;
  portal_url?: string;
  error?: string;
}

export interface CreditUsageRequest {
  credits_to_use: number;
}

export interface CreditUsageResponse {
  success: boolean;
  credits_remaining: number;
  credits_used: number;
  error?: string;
}

export interface PlansResponse {
  success: boolean;
  plans: PlanDetails[];
  error?: string;
}
