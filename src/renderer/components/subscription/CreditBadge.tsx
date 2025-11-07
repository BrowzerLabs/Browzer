import { useSubscription } from '@/renderer/hooks/useSubscription';
import { Badge } from '@/renderer/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/renderer/ui/tooltip';
import { Zap, Infinity } from 'lucide-react';

/**
 * Credit Badge Component
 * Displays user's remaining automation credits
 */
export function CreditBadge() {
  const { subscription, loading } = useSubscription();

  if (loading || !subscription) {
    return null;
  }

  const isUnlimited = subscription.credits_limit === null;
  const creditsRemaining = subscription.credits_remaining;
  const creditsLimit = subscription.credits_limit;

  // Color based on credit percentage
  const getColorClass = () => {
    if (isUnlimited) return 'bg-purple-500 hover:bg-purple-600';
    
    const percentage = (creditsRemaining / (creditsLimit || 1)) * 100;
    
    if (percentage > 50) return 'bg-green-500 hover:bg-green-600';
    if (percentage > 20) return 'bg-yellow-500 hover:bg-yellow-600';
    return 'bg-red-500 hover:bg-red-600';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${getColorClass()} text-white cursor-pointer gap-1`}>
            <Zap className="w-3 h-3" />
            {isUnlimited ? (
              <>
                <Infinity className="w-4 h-4" />
                <span className="ml-1">Credits</span>
              </>
            ) : (
              <span>{creditsRemaining}</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            {isUnlimited ? (
              <p>Unlimited automation credits</p>
            ) : (
              <>
                <p className="font-semibold">
                  {creditsRemaining} / {creditsLimit} credits remaining
                </p>
                <p className="text-gray-400 mt-1">
                  {subscription.credits_used} used this period
                </p>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
