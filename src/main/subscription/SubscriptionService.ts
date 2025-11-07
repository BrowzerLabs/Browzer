/**
 * Subscription Service
 * Handles subscription management and credit tracking on the Electron main process
 */

import { api } from '@/main/api';
import {
  SubscriptionResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  PortalSessionRequest,
  PortalSessionResponse,
  CreditUsageRequest,
  CreditUsageResponse,
  PlansResponse,
  UserSubscription,
} from '@/shared/types/subscription';

export class SubscriptionService {
  private currentSubscription: UserSubscription | null = null;

  /**
   * Get all available subscription plans
   */
  async getPlans(): Promise<PlansResponse> {
    try {
      const response = await api.get<PlansResponse>('/subscription/plans');
      
      if (!response.success || !response.data) {
        return {
          success: false,
          plans: [],
          error: response.error || 'Failed to fetch plans',
        };
      }

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to get plans:', error);
      return {
        success: false,
        plans: [],
        error: error.message || 'Failed to fetch plans',
      };
    }
  }

  /**
   * Get current user's subscription
   */
  async getCurrentSubscription(): Promise<SubscriptionResponse> {
    try {
      const response = await api.get<SubscriptionResponse>('/subscription/current');
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to fetch subscription',
        };
      }

      // Cache the subscription
      if (response.data.subscription) {
        this.currentSubscription = response.data.subscription;
      }

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to get subscription:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch subscription',
      };
    }
  }

  /**
   * Create Stripe checkout session for subscription upgrade
   */
  async createCheckoutSession(
    request: CheckoutSessionRequest
  ): Promise<CheckoutSessionResponse> {
    try {
      const response = await api.post<CheckoutSessionResponse>(
        '/subscription/checkout',
        request
      );
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to create checkout session',
        };
      }

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to create checkout session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create checkout session',
      };
    }
  }

  /**
   * Create Stripe customer portal session
   */
  async createPortalSession(
    request: PortalSessionRequest
  ): Promise<PortalSessionResponse> {
    try {
      const response = await api.post<PortalSessionResponse>(
        '/subscription/portal',
        request
      );
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to create portal session',
        };
      }

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to create portal session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create portal session',
      };
    }
  }

  /**
   * Use automation credits
   */
  async useCredits(creditsToUse: number = 1): Promise<CreditUsageResponse> {
    try {
      const request: CreditUsageRequest = {
        credits_to_use: creditsToUse,
      };

      const response = await api.post<CreditUsageResponse>(
        '/subscription/use-credits',
        request
      );
      
      if (!response.success || !response.data) {
        return {
          success: false,
          credits_remaining: 0,
          credits_used: 0,
          error: response.error || 'Failed to use credits',
        };
      }

      // Update cached subscription credits
      if (this.currentSubscription) {
        this.currentSubscription.credits_remaining = response.data.credits_remaining;
        this.currentSubscription.credits_used = response.data.credits_used;
      }

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to use credits:', error);
      return {
        success: false,
        credits_remaining: 0,
        credits_used: 0,
        error: error.message || 'Failed to use credits',
      };
    }
  }

  /**
   * Sync subscription with Stripe
   */
  async syncSubscription(): Promise<SubscriptionResponse> {
    try {
      const response = await api.post<SubscriptionResponse>('/subscription/sync');
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to sync subscription',
        };
      }

      // Update cached subscription
      if (response.data.subscription) {
        this.currentSubscription = response.data.subscription;
      }

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to sync subscription:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync subscription',
      };
    }
  }

  /**
   * Get cached subscription (no API call)
   */
  getCachedSubscription(): UserSubscription | null {
    return this.currentSubscription;
  }

  /**
   * Check if user has sufficient credits
   */
  hasCredits(creditsNeeded: number = 1): boolean {
    if (!this.currentSubscription) {
      return false;
    }

    // Unlimited credits
    if (this.currentSubscription.credits_limit === null) {
      return true;
    }

    return this.currentSubscription.credits_remaining >= creditsNeeded;
  }

  /**
   * Get credits remaining
   */
  getCreditsRemaining(): number {
    if (!this.currentSubscription) {
      return 0;
    }

    // Unlimited credits
    if (this.currentSubscription.credits_limit === null) {
      return Infinity;
    }

    return this.currentSubscription.credits_remaining;
  }
}
