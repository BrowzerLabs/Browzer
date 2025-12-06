export enum NotificationType {
  TOAST = 'toast',
  DIALOG = 'dialog',
  NAVIGATE = 'navigate',
  CALLBACK = 'callback',
  SYSTEM_UPDATE = 'system_update',
  MAINTENANCE = 'maintenance',
}

export interface ToastAction {
  label: string;
  action: string;
  data?: Record<string, any>;
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  
  action?: ToastAction;
  
  navigate_to?: string;
  
  callback_name?: string;
  callback_data?: Record<string, any>;
  
  metadata?: Record<string, any>;
  timestamp?: string;
}

export interface NotificationEvent {
  event: string;
  data: NotificationPayload;
}

export type NotificationHandler = (notification: NotificationPayload) => void;

export type NotificationActionHandler = (action: string, data?: Record<string, any>) => void;

export const createToastNotification = (
  type: NotificationType,
  title: string,
  message: string,
  action?: ToastAction,
  metadata?: Record<string, any>,
): NotificationPayload => ({
  type,
  title,
  message,
  action,
  metadata
});

export const createDialogNotification = (
  type: NotificationType,
  title: string,
  message: string,
): NotificationPayload => ({
  type,
  title,
  message,
  
});

export const createNavigateNotification = (
  title: string,
  message: string,
  navigate_to: string,
): NotificationPayload => ({
  type: NotificationType.NAVIGATE,
  title,
  message,
  navigate_to,
});

export const createCallbackNotification = (
  title: string,
  message: string,
  callback_name: string,
  callback_data?: Record<string, any>,
): NotificationPayload => ({
  type: NotificationType.CALLBACK,
  title,
  message,
  callback_name,
  callback_data,
});


export interface ToastPayload {
  message: string;
  description?: string;
  variant?: 'info' | 'error' | 'success' | 'warning'
}