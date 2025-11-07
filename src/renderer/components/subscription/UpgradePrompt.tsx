import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { Alert } from '@/renderer/ui/alert';
import { Zap, Crown, AlertCircle } from 'lucide-react';
import { useSubscription } from '@/renderer/hooks/useSubscription';

interface UpgradePromptProps {
  message?: string;
  onUpgrade?: () => void;
}

/**
 * Upgrade Prompt Component
 * Shows when user runs out of credits or needs premium features
 */
export function UpgradePrompt({ message, onUpgrade }: UpgradePromptProps) {
  const { subscription, isFree } = useSubscription();

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Navigate to subscription page
      window.location.hash = '/subscription';
    }
  };

  if (!subscription) return null;

  const hasNoCredits =
    subscription.credits_limit !== null && subscription.credits_remaining <= 0;

  if (!hasNoCredits && !message) return null;

  return (
    <Alert className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
      <AlertCircle className="h-5 w-5 text-blue-600" />
      <div className="flex-1">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          {hasNoCredits ? 'Out of Credits' : 'Upgrade Required'}
        </h4>
        <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
          {message ||
            (hasNoCredits
              ? `You've used all ${subscription.credits_limit} credits for this period. Upgrade to get more!`
              : 'This feature requires a premium subscription.')}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={handleUpgrade}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {isFree ? (
              <>
                <Zap className="w-4 h-4" />
                Upgrade to Pro
              </>
            ) : (
              <>
                <Crown className="w-4 h-4" />
                Upgrade to Business
              </>
            )}
          </Button>
          <Button
            onClick={() => window.location.hash = '/subscription'}
            size="sm"
            variant="outline"
          >
            View Plans
          </Button>
        </div>
      </div>
    </Alert>
  );
}
