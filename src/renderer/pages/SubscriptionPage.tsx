import { useState, useEffect } from 'react';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { Badge } from '@/renderer/ui/badge';
import { Progress } from '@/renderer/ui/progress';
import { Separator } from '@/renderer/ui/separator';
import { Alert } from '@/renderer/ui/alert';
import {
  Check,
  Crown,
  CreditCard,
  Calendar,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Loader2Icon,
} from 'lucide-react';
import {
  UserSubscription,
  PlanDetails,
  SubscriptionTier,
  SubscriptionStatus,
} from '@/shared/types/subscription';
import { toast } from 'sonner';

export function SubscriptionPage() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanDetails | null>(null);
  const [allPlans, setAllPlans] = useState<PlanDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    loadSubscription();
    loadPlans();
  }, []);

  const loadSubscription = async () => {
    try {
      const response = await window.subscriptionAPI.getCurrentSubscription();
      if (response.success && response.subscription) {
        setSubscription(response.subscription);
        setCurrentPlan(response.plan_details);
      }
    } catch (error) {
      console.error('Failed to load subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const response = await window.subscriptionAPI.getPlans();
      if (response.success && response.plans) {
        setAllPlans(response.plans);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    }
  };

  const handleUpgrade = async (tier: SubscriptionTier) => {
    setUpgrading(true);
    try {
      const response = await window.subscriptionAPI.createCheckoutSession({
        tier,
        success_url: 'browzer://subscription/success',
        cancel_url: 'browzer://subscription/cancel',
      });

      if (response.success && response.checkout_url) {
        await window.browserAPI.createTab(response.checkout_url);
      } else {
        alert(`Failed to create checkout: ${response.error}`);
      }
    } catch (error) {
      console.error('Failed to create checkout:', error);
      alert('Failed to start upgrade process');
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const response = await window.subscriptionAPI.createPortalSession({
        return_url: 'browzer://subscription',
      });

      if (response.success && response.portal_url) {
        await window.browserAPI.createTab(response.portal_url);
      } else {
        alert(`Failed to open portal: ${response.error}`);
      }
    } catch (error) {
      console.error('Failed to open portal:', error);
      alert('Failed to open subscription portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await window.subscriptionAPI.syncSubscription();
      if (response.success && response.subscription) {
        setSubscription(response.subscription);
        setCurrentPlan(response.plan_details);
      }
      toast.success('Subscription synced successfully');
    } catch (error) {
      console.error('Failed to sync:', error);
      toast.error('Failed to sync subscription');
    } finally {
      setSyncing(false);
    }
  };

  const getCreditsPercentage = () => {
    if (!subscription) return 0;
    if (subscription.credits_limit === null) return 100; // Unlimited
    return (subscription.credits_remaining / subscription.credits_limit) * 100;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: SubscriptionStatus) => {
    const variants: Record<SubscriptionStatus, string> = {
      [SubscriptionStatus.ACTIVE]: 'bg-teal-600',
      [SubscriptionStatus.TRIALING]: 'bg-blue-600',
      [SubscriptionStatus.PAST_DUE]: 'bg-yellow-600',
      [SubscriptionStatus.CANCELED]: 'bg-red-600',
      [SubscriptionStatus.UNPAID]: 'bg-red-600',
      [SubscriptionStatus.INCOMPLETE]: 'bg-gray-600',
      [SubscriptionStatus.INCOMPLETE_EXPIRED]: 'bg-gray-500',
      [SubscriptionStatus.PAUSED]: 'bg-gray-500',
    };

    return (
      <Badge className={variants[status]}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col gap-2 items-center justify-center bg-teal-50 dark:bg-slate-900 text-teal-500 dark:text-teal-400">
        <Loader2Icon className='size-7 animate-spin' />
        <p className='text-xs'>Loading Your Subscription...</p>
      </div>
    );
  }

  if (!subscription || !currentPlan) {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center bg-red-50 dark:bg-slate-900">
        <p className="text-red-600 dark:text-red-400">Failed to load subscription. Please try again.</p>
        <Button onClick={loadSubscription} className="mt-4" variant='outline'>Retry</Button>
      </div>
    );
  }

  const availableUpgrades = allPlans.filter(
    (plan) =>
      plan.tier !== subscription.tier &&
      plan.tier !== SubscriptionTier.FREE
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
       <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div ml-2>
            <h1 className="text-2xl font-semibold mb-2">Subscription</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Manage your plan and billing
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>

        <Card className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">{currentPlan.name}</h2>
              <div className="flex items-center gap-2">
                {currentPlan.actual_price_monthly != null && currentPlan.actual_price_monthly !== currentPlan.price_monthly ? (
                  <>
                    <p className="text-gray-600 dark:text-gray-400 line-through text-sm">
                      ${currentPlan.price_monthly}/month
                    </p>
                    <p className="text-teal-600 dark:text-teal-400 font-semibold">
                      ${currentPlan.actual_price_monthly}/month
                    </p>
                    <Badge className="bg-green-600 text-white text-xs">
                      {Math.round((1 - currentPlan.actual_price_monthly / currentPlan.price_monthly) * 100)}% OFF
                    </Badge>
                  </>
                ) : (
                  <p className="text-gray-600 dark:text-gray-400">
                    ${currentPlan.actual_price_monthly ?? currentPlan.price_monthly}/month
                  </p>
                )}
              </div>
            </div>
            {getStatusBadge(subscription.status)}
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Automation Credits
              </h3>
              <span className="font-semibold">
                {subscription.credits_limit === null
                  ? '∞'
                  : `${subscription.credits_remaining} / ${subscription.credits_limit}`}
              </span>
            </div>

            {subscription.credits_limit !== null && (
              <div>
                <Progress value={getCreditsPercentage()} className="h-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {subscription.credits_used} credits used this period
                </p>
              </div>
            )}

            {subscription.credits_limit === null && (
              <Alert className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
                <Crown className="h-4 w-4 text-purple-600" />
                <p className="text-purple-900 dark:text-purple-100">
                  You have unlimited automation credits!
                </p>
              </Alert>
            )}
          </div>

          <Separator />

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Current Period</span>
              </div>
              <p className="font-medium">
                {formatDate(subscription.current_period_start)} -{' '}
                {formatDate(subscription.current_period_end)}
              </p>
            </div>

            {subscription.stripe_subscription_id && (
              <div>
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-sm">Billing</span>
                </div>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleManageSubscription}
                  className="gap-2"
                  disabled={portalLoading}
                >
                  {
                    portalLoading ? (
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-2">Manage Billing <ExternalLink className="w-4 h-4" /></span>
                    )
                  }
                </Button>
              </div>
            )}
          </div>

          {subscription.cancel_at_period_end && (
            <Alert className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <p className="text-yellow-900 dark:text-yellow-100">
                Your subscription will be canceled at the end of the current period
                ({formatDate(subscription.current_period_end)})
              </p>
            </Alert>
          )}
        </Card>
        {availableUpgrades.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-4 ml-2">
              {subscription.tier !== SubscriptionTier.BUSINESS
                ? 'Upgrade Your Plan'
                : 'Available Plans'}
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {availableUpgrades.map((plan) => (
                <Card key={plan.tier} className="m-2 p-6 hover:bg-slate-100 dark:hover:bg-slate-800 hover:z-20 hover:shadow-lg shadow-slate-200 dark:shadow-slate-800 transition-all">
                   <div>
                      <h3 className="text-xl font-semibold">{plan.name}</h3>
                      <div className="flex items-center gap-2">
                        {plan.actual_price_monthly != null && plan.actual_price_monthly !== plan.price_monthly ? (
                          <>
                            <p className="text-gray-600 dark:text-gray-400 line-through text-sm">
                              ${plan.price_monthly}/month
                            </p>
                            <p className="text-teal-600 dark:text-teal-400 font-semibold">
                              ${plan.actual_price_monthly}/month
                            </p>
                          </>
                        ) : (
                          <p className="text-gray-600 dark:text-gray-400">
                            ${plan.actual_price_monthly ?? plan.price_monthly}/month
                          </p>
                        )}
                      </div>
                    </div>

                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Automation Credits
                    </p>
                    <p className="text-xl font-semibold">
                      {plan.credits_per_month === null
                        ? 'Unlimited'
                        : `${plan.credits_per_month}/month`}
                    </p>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.slice(0, 5).map((feature, index) => (
                      <li key={index} className="flex items-start text-sm">
                        <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-gray-300">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handleUpgrade(plan.tier)}
                    disabled={upgrading}
                  >
                    {
                      (plan.actual_price_monthly ?? plan.price_monthly) > (currentPlan.actual_price_monthly ?? currentPlan.price_monthly) ? 'Upgrade' : 'Downgrade'
                    } to {plan.name}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card className="p-8 mt-6">
          <h3 className="text-xl font-semibold mb-4">Your Plan Includes</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {currentPlan.features.map((feature, index) => (
              <div key={index} className="flex items-start">
                <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        </Card>
       </div>
    </div>
  );
}
