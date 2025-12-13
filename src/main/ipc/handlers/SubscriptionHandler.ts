import { BaseHandler } from './base';
import { CheckoutSessionRequest, PortalSessionRequest } from '@/shared/types/subscription';

export class SubscriptionHandler extends BaseHandler {
  register(): void {
    const { subscriptionService } = this.context;

    this.handle('subscription:get-plans', async () => {
      return subscriptionService.getPlans();
    });

    this.handle('subscription:get-current', async () => {
      return subscriptionService.getCurrentSubscription();
    });

    this.handle('subscription:create-checkout', async (_, request: CheckoutSessionRequest) => {
      return subscriptionService.createCheckoutSession(request);
    });

    this.handle('subscription:create-portal', async (_, request: PortalSessionRequest) => {
      return subscriptionService.createPortalSession(request);
    });

    this.handle('subscription:use-credits', async (_, creditsToUse: number) => {
      return subscriptionService.useCredits(creditsToUse);
    });

    this.handle('subscription:sync', async () => {
      return subscriptionService.syncSubscription();
    });

    this.handle('subscription:has-credits', async (_, creditsNeeded: number) => {
      return subscriptionService.hasCredits(creditsNeeded);
    });

    this.handle('subscription:get-credits-remaining', async () => {
      return subscriptionService.getCreditsRemaining();
    });

    this.handle('subscription:cancel', async () => {
      return subscriptionService.cancelSubscription();
    });

    this.handle('subscription:reactivate', async () => {
      return subscriptionService.reactivateSubscription();
    });
  }
}
