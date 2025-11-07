import { useState, useEffect, useCallback } from 'react';
import {
  UserSubscription,
  PlanDetails,
  SubscriptionTier,
} from '@/shared/types/subscription';

/**
 * Hook for managing subscription state and operations
 */
export function useSubscription() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [planDetails, setPlanDetails] = useState<PlanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await window.subscriptionAPI.getCurrentSubscription();

      if (response.success) {
        setSubscription(response.subscription || null);
        setPlanDetails(response.plan_details || null);
      } else {
        setError(response.error || 'Failed to load subscription');
      }
    } catch (err) {
      setError('Failed to load subscription');
      console.error('Subscription load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncSubscription = useCallback(async () => {
    try {
      const response = await window.subscriptionAPI.syncSubscription();
      if (response.success) {
        setSubscription(response.subscription || null);
        setPlanDetails(response.plan_details || null);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Subscription sync error:', err);
      return false;
    }
  }, []);

  const hasCredits = useCallback(
    (creditsNeeded: number = 1): boolean => {
      if (!subscription) return false;

      // Unlimited credits
      if (subscription.credits_limit === null) return true;

      return subscription.credits_remaining >= creditsNeeded;
    },
    [subscription]
  );

  const getCreditsRemaining = useCallback((): number => {
    if (!subscription) return 0;

    // Unlimited credits
    if (subscription.credits_limit === null) return Infinity;

    return subscription.credits_remaining;
  }, [subscription]);

  const isFree = subscription?.tier === SubscriptionTier.FREE;
  const isPro = subscription?.tier === SubscriptionTier.PRO;
  const isBusiness = subscription?.tier === SubscriptionTier.BUSINESS;

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  return {
    subscription,
    planDetails,
    loading,
    error,
    loadSubscription,
    syncSubscription,
    hasCredits,
    getCreditsRemaining,
    isFree,
    isPro,
    isBusiness,
  };
}
