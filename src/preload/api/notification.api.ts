import type { NotificationAPI } from '@/preload/types/notification.types';
import { createEventListener } from '@/preload/utils/ipc-helpers';
import type { NotificationPayload } from '@/shared/types/notification';

/**
 * Notification API implementation
 * Handles in-app notification events
 */
export const createNotificationAPI = (): NotificationAPI => ({
  onNotification: (callback) => 
    createEventListener<NotificationPayload>('notification', callback),
});
