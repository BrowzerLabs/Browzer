import { useEffect, useState } from 'react';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SubscriptionUpdate {
  type: string;
  step: string;
  message: string;
  tier?: string;
  credits_limit?: number;
  timestamp: string;
}

export function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<string>('waiting');
  const [currentMessage, setCurrentMessage] = useState<string>('Waiting for payment confirmation...');
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    // Listen for real-time subscription updates via SSE
    const unsubscribe = window.subscriptionAPI.onSubscriptionUpdate((data: SubscriptionUpdate) => {
      
      setCurrentStep(data.step);
      setCurrentMessage(data.message);

      if (data.step === 'complete') {
        setIsComplete(true);
        setTier(data.tier || null);
      } else if (data.step === 'error') {
        setError(data.message);
      }
    });

    // Fallback: If no SSE update after 30 seconds, try polling
    const fallbackTimer = setTimeout(() => {
      console.log('[SubscriptionSuccessPage] No SSE update received, falling back to polling');
      syncSubscriptionFallback();
    }, 30000);

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  const syncSubscriptionFallback = async () => {
    try {
      setCurrentStep('polling');
      setCurrentMessage('⏳ Checking subscription status...');

      const response = await window.subscriptionAPI.syncSubscription();
      if (response.success) {
        setIsComplete(true);
        setCurrentStep('complete');
        setCurrentMessage('🎉 Subscription activated successfully!');
        setTier(response.subscription?.tier || null);
      } else {
        setError(response.error || 'Failed to sync subscription');
      }
    } catch (err) {
      setError('Failed to sync subscription');
      console.error('Sync error:', err);
    }
  };

  const handleViewSubscription = () => {
    navigate('/');
  };

  // Show processing state
  if (!isComplete && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <Card className="p-12 max-w-md text-center">
          <Loader2 className="size-16 mb-6 animate-spin mx-auto text-blue-600" />
          <h1 className="text-2xl font-bold mb-4">Processing Subscription</h1>
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-lg">
              {currentStep === 'payment_confirmed' && '✅'}
              {currentStep === 'creating_subscription' && '⏳'}
              {currentStep === 'syncing_database' && '⏳'}
              {currentStep === 'waiting' && '⏳'}
              {currentStep === 'polling' && '⏳'}
              <span className="font-medium">{currentMessage}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This usually takes just a few seconds
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
        <Card className="p-12 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Subscription Error</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            We encountered an issue processing your subscription.
          </p>
          <p className="text-sm text-red-600 mb-6 font-mono bg-red-50 dark:bg-red-900/10 p-3 rounded">
            {error}
          </p>
          <Button onClick={handleViewSubscription} className="w-full">
            Go to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <Card className="p-12 max-w-md text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Welcome Aboard! 🎉</h1>
        {tier && (
          <div className="inline-block px-4 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm font-semibold mb-4">
            {tier.toUpperCase()} Plan
          </div>
        )}
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Your subscription has been activated successfully! You now have access to all
          premium features.
        </p>
        <Button onClick={handleViewSubscription} className="w-full" size="lg">
          View Subscription Details
        </Button>
      </Card>
    </div>
  );
}
