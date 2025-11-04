import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { Badge } from '@/renderer/ui/badge';
import { Check, Zap, Crown, Sparkles } from 'lucide-react';
import { PlanDetails, SubscriptionTier } from '@/shared/types/subscription';

export function PricingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const response = await window.subscriptionAPI.getPlans();
      if (response.success && response.plans) {
        setPlans(response.plans);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (tier: SubscriptionTier) => {
    // Navigate to subscription page to manage/upgrade
    window.location.hash = '/subscription';
  };

  const getPlanIcon = (tier: SubscriptionTier) => {
    switch (tier) {
      case SubscriptionTier.FREE:
        return <Sparkles className="w-8 h-8" />;
      case SubscriptionTier.PRO:
        return <Zap className="w-8 h-8" />;
      case SubscriptionTier.BUSINESS:
        return <Crown className="w-8 h-8" />;
    }
  };

  const getPlanColor = (tier: SubscriptionTier) => {
    switch (tier) {
      case SubscriptionTier.FREE:
        return 'from-gray-500 to-gray-600';
      case SubscriptionTier.PRO:
        return 'from-blue-500 to-blue-600';
      case SubscriptionTier.BUSINESS:
        return 'from-purple-500 to-purple-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Unlock the full potential of AI-powered browser automation
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {plans.map((plan) => {
            const isPopular = plan.tier === SubscriptionTier.PRO;
            const isBusiness = plan.tier === SubscriptionTier.BUSINESS;

            return (
              <Card
                key={plan.tier}
                className={`relative p-8 ${
                  isPopular
                    ? 'border-2 border-blue-500 shadow-xl scale-105'
                    : isBusiness
                    ? 'border-2 border-purple-500 shadow-lg'
                    : 'border border-gray-200 dark:border-gray-700'
                } transition-all hover:shadow-2xl`}
              >
                {/* Popular Badge */}
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500">
                    Most Popular
                  </Badge>
                )}

                {/* Plan Icon */}
                <div
                  className={`w-16 h-16 rounded-full bg-gradient-to-br ${getPlanColor(
                    plan.tier
                  )} flex items-center justify-center text-white mb-6`}
                >
                  {getPlanIcon(plan.tier)}
                </div>

                {/* Plan Name */}
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    ${plan.price_monthly}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">/month</span>
                </div>

                {/* Credits */}
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Automation Credits
                  </p>
                  <p className="text-2xl font-bold">
                    {plan.credits_per_month === null
                      ? 'Unlimited'
                      : `${plan.credits_per_month}${
                          plan.tier === SubscriptionTier.FREE ? '/day' : '/month'
                        }`}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  onClick={() => handleSelectPlan(plan.tier)}
                  className={`w-full ${
                    isPopular
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : isBusiness
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                  size="lg"
                >
                  {plan.tier === SubscriptionTier.FREE
                    ? 'Get Started'
                    : 'Upgrade Now'}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            All plans include access to our AI-powered browser automation
          </p>
          <Button
            variant="ghost"
            onClick={() => navigate('/auth/signin')}
            className="text-blue-600 hover:text-blue-700"
          >
            Already have an account? Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
