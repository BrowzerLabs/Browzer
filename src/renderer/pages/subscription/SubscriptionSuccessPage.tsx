import { useEffect, useState } from 'react';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Sync subscription with backend after successful payment
    syncSubscription();
  }, []);

  const syncSubscription = async () => {
    try {
      // Wait a bit for Stripe webhook to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = await window.subscriptionAPI.syncSubscription();
      if (!response.success) {
        setError(response.error || 'Failed to sync subscription');
      }
    } catch (err) {
      setError('Failed to sync subscription');
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleViewSubscription = () => {
    navigate('/');
  };

  if (syncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <Card className="p-12 max-w-md text-center">
          <Loader2 className="size-7 mb-6 animate-spin" />
          <h1 className="text-2xl font-bold mb-2">Processing Payment...</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please wait while we confirm your subscription
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800">
        <Card className="p-12 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Sync Error</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Payment was successful, but we couldn't sync your subscription. Please try
            syncing manually.
          </p>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <Button onClick={handleViewSubscription} className="w-full">
            View Subscription
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <Card className="p-12 max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Welcome Aboard! 🎉</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Your subscription has been activated successfully. You now have access to all
          premium features!
        </p>
        <Button onClick={handleViewSubscription} className="w-full" size="lg">
          View Subscription Details
        </Button>
      </Card>
    </div>
  );
}
