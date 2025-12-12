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
  CancelSubscriptionResponse,
  ReactivateSubscriptionResponse,
} from '@/shared/types/subscription';

export class SubscriptionService {
  private currentSubscription: UserSubscription | null = null;

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

  async getCurrentSubscription(): Promise<SubscriptionResponse> {
    try {
      const response = await api.get<SubscriptionResponse>('/subscription/current');
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to fetch subscription',
        };
      }
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

  async syncSubscription(): Promise<SubscriptionResponse> {
    try {
      const response = await api.post<SubscriptionResponse>('/subscription/sync');
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to sync subscription',
        };
      }
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

  getCachedSubscription(): UserSubscription | null {
    return this.currentSubscription;
  }

  hasCredits(creditsNeeded: number = 1): boolean {
    if (!this.currentSubscription) {
      return false;
    }
    if (this.currentSubscription.credits_limit === null) {
      return true;
    }

    return this.currentSubscription.credits_remaining >= creditsNeeded;
  }

  getCreditsRemaining(): number {
    if (!this.currentSubscription) {
      return 0;
    }
    if (this.currentSubscription.credits_limit === null) {
      return Infinity;
    }

    return this.currentSubscription.credits_remaining;
  }

  async cancelSubscription(): Promise<CancelSubscriptionResponse> {
    try {
      const response = await api.post<CancelSubscriptionResponse>(
        '/subscription/cancel'
      );
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to cancel subscription',
        };
      }
      this.currentSubscription = null;

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to cancel subscription:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel subscription',
      };
    }
  }

  async reactivateSubscription(): Promise<ReactivateSubscriptionResponse> {
    try {
      const response = await api.post<ReactivateSubscriptionResponse>(
        '/subscription/reactivate'
      );
      
      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to reactivate subscription',
        };
      }
      this.currentSubscription = null;

      return response.data;
    } catch (error: any) {
      console.error('[SubscriptionService] Failed to reactivate subscription:', error);
      return {
        success: false,
        error: error.message || 'Failed to reactivate subscription',
      };
    }
  }
}
