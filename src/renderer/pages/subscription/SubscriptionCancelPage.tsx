import { XCircle } from 'lucide-react';

import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';

export function SubscriptionCancelPage() {
  const handleViewPlans = () => {
    window.location.hash = '/subscription';
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="p-12 max-w-md text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-gray-600 dark:text-gray-400" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Checkout Cancelled</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          No worries! You can upgrade your plan anytime you're ready.
        </p>
        <div className="space-y-3">
          <Button onClick={handleViewPlans} className="w-full" size="lg">
            View Plans
          </Button>
          <Button onClick={handleGoBack} variant="outline" className="w-full">
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
}
