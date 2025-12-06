import type { NotificationPayload, ToastPayload } from '@/shared/types/notification';

export interface NotificationAPI {
  onNotification: (callback: (notification: NotificationPayload) => void) => () => void;
  onToast: (callback: (toast: ToastPayload) => void) => () => void;
}
