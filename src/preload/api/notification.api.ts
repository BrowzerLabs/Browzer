import type { NotificationAPI } from '@/preload/types/notification.types';
import { createEventListener } from '@/preload/utils/ipc-helpers';
import type { NotificationPayload, ToastPayload } from '@/shared/types/notification';

export const createNotificationAPI = (): NotificationAPI => ({
  onNotification: (callback) => 
    createEventListener<NotificationPayload>('notification', callback),
  onToast: (callback) => 
    createEventListener<ToastPayload>('toast', callback),
});
