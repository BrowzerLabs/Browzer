import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { Badge } from '@/renderer/ui/badge';
import { Check, Loader2Icon } from 'lucide-react';
import { PlanDetails, SubscriptionTier } from '@/shared/types/subscription';
import { Link } from 'react-router-dom';
import ThemeToggle from '@/renderer/ui/theme-toggle';

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

  const handleSelectPlan = () => {
    navigate('/');
    window.browserAPI.showAllTabs();
    window.browserAPI.navigateToTab('browzer://subscription');
  };

  if (loading) {
    return (
      <div className="min-h-screen">
       <Loader2Icon className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen mx-auto px-4 py-12 relative">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="text-center mb-16">
          <h1 className="text-2xl font-semibold">
            Choose Your Plan
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Unlock the full potential of AI-powered browser automation
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const isPopular = plan.tier === SubscriptionTier.PRO;
            const isBusiness = plan.tier === SubscriptionTier.BUSINESS;

            return (
              <Card
                key={plan.tier}
                className={`relative p-6 ${
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

                {/* Plan Name */}
                <h3 className="text-2xl font-semibold">{plan.name}</h3>

                <h5 className="text-xl font-bold">
                    ${plan.price_monthly}<span className='text-sm text-gray-500 dark:text-gray-500'>/month</span>
                </h5>

                {/* Credits */}
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Automation Credits
                  </p>
                  <p className="text-2xl font-bold">
                    {plan.credits_per_month === null
                      ? 'Unlimited'
                      : `${plan.credits_per_month}`}
                      {plan.credits_per_month === null ? '' : <span className='text-sm text-gray-600 dark:text-gray-400'>/month</span>}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2">
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
                  onClick={() => handleSelectPlan()}
                  className={`w-full ${
                    isPopular
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : isBusiness
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-slate-600 hover:bg-slate-700'
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

        <section className="text-center mt-16">
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
             Not able to find what you want ?
          </p>
          <Button variant='outline'>
            Contact Us
          </Button>
          <br />
        </section>

        {/* Footer */}
        <footer className="text-center mt-16 flex items-center justify-between px-4">
          <Link to="/auth/signin" className="text-blue-600 hover:text-blue-700 text-sm">
            Already have an account? Sign in
          </Link>

          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            BrowzerLabs Inc. &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>
  );
}
