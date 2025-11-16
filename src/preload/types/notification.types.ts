import type { NotificationPayload } from '@/shared/types/notification';

/**
 * Notification API - Handles in-app notifications
 */
export interface NotificationAPI {
  onNotification: (callback: (notification: NotificationPayload) => void) => () => void;
}
