import {
  registerNotificationCallback,
  unregisterNotificationCallback,
} from '@/renderer/providers/NotificationProvider';

export const subscriptionProcessingState = {
  listeners: new Set<(data: any) => void>(),

  subscribe(listener: (data: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify(data: any) {
    this.listeners.forEach((listener: (arg0: any) => any) => listener(data));
  },
};

export function registerAppNotificationCallbacks() {
  registerNotificationCallback('subscription_update', (data) => {
    console.log('📬 [Callback: subscription_update]', data);
    subscriptionProcessingState.notify(data);
  });

  registerNotificationCallback('subscription_error', (data) => {
    console.error('❌ [Callback: subscription_error]', data);
    subscriptionProcessingState.notify(data);
  });

  console.log('✅ [notificationCallbacks] Subscription callbacks registered');
}

export function unregisterAppNotificationCallbacks() {
  unregisterNotificationCallback('subscription_update');
  unregisterNotificationCallback('subscription_error');

  subscriptionProcessingState.listeners.clear();

  console.log('🧹 [notificationCallbacks] Subscription callbacks unregistered');
}
