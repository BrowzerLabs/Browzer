import { ReactNode } from 'react';
import { useSubscription } from '@/renderer/hooks/useSubscription';
import { UpgradePrompt } from './UpgradePrompt';
import { Skeleton } from '@/renderer/ui/skeleton';

interface CreditGuardProps {
  children: ReactNode;
  creditsRequired?: number;
  fallback?: ReactNode;
}

/**
 * Credit Guard Component
 * Wraps components that require credits, showing upgrade prompt if insufficient
 */
export function CreditGuard({
  children,
  creditsRequired = 1,
  fallback,
}: CreditGuardProps) {
  const { subscription, loading, hasCredits } = useSubscription();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <UpgradePrompt message="Please subscribe to use this feature" />
    );
  }

  const hasSufficientCredits = hasCredits(creditsRequired);

  if (!hasSufficientCredits) {
    return fallback || <UpgradePrompt />;
  }

  return <>{children}</>;
}
