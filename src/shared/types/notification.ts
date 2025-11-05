/**
 * Notification types for real-time push notifications
 * 
 * These types MUST be kept in sync with backend schemas:
 * service/app/schemas/notification.py
 */

/**
 * All supported notification types
 * Must match backend NotificationType enum
 */
export enum NotificationType {
  // Toast notifications
  TOAST_INFO = 'toast_info',
  TOAST_SUCCESS = 'toast_success',
  TOAST_WARNING = 'toast_warning',
  TOAST_ERROR = 'toast_error',
  
  // Action notifications (toast with action button)
  TOAST_ACTION = 'toast_action',
  
  // Dialog notifications
  DIALOG_INFO = 'dialog_info',
  DIALOG_WARNING = 'dialog_warning',
  DIALOG_ERROR = 'dialog_error',
  DIALOG_CONFIRM = 'dialog_confirm',
  
  // Navigation notifications
  NAVIGATE = 'navigate',
  
  // Custom callback notifications
  CALLBACK = 'callback',
  
  // System notifications
  SYSTEM_UPDATE = 'system_update',
  MAINTENANCE = 'maintenance',
}

/**
 * Action button for toast notifications
 */
export interface ToastAction {
  label: string;
  action: string;
  data?: Record<string, any>;
}

/**
 * Base notification payload
 * All notifications must include these fields
 */
export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  
  // Optional fields
  duration?: number; // Duration in ms (for toasts)
  icon?: string; // Icon name or URL
  
  // For toast with action
  action?: ToastAction;
  
  // For navigation
  navigate_to?: string;
  
  // For callback
  callback_name?: string;
  callback_data?: Record<string, any>;
  
  // For dialog
  confirm_label?: string;
  cancel_label?: string;
  on_confirm?: string;
  on_cancel?: string;
  
  // Additional metadata
  metadata?: Record<string, any>;
  timestamp?: string;
}

/**
 * SSE notification event wrapper
 */
export interface NotificationEvent {
  event: string;
  data: NotificationPayload;
}

/**
 * Notification handler callback type
 */
export type NotificationHandler = (notification: NotificationPayload) => void;

/**
 * Notification action handler type
 */
export type NotificationActionHandler = (action: string, data?: Record<string, any>) => void;

/**
 * Type guards for notification types
 */
export const isToastNotification = (type: NotificationType): boolean => {
  return [
    NotificationType.TOAST_INFO,
    NotificationType.TOAST_SUCCESS,
    NotificationType.TOAST_WARNING,
    NotificationType.TOAST_ERROR,
    NotificationType.TOAST_ACTION,
  ].includes(type);
};

export const isDialogNotification = (type: NotificationType): boolean => {
  return [
    NotificationType.DIALOG_INFO,
    NotificationType.DIALOG_WARNING,
    NotificationType.DIALOG_ERROR,
    NotificationType.DIALOG_CONFIRM,
  ].includes(type);
};

export const isNavigationNotification = (type: NotificationType): boolean => {
  return type === NotificationType.NAVIGATE;
};

export const isCallbackNotification = (type: NotificationType): boolean => {
  return type === NotificationType.CALLBACK;
};

/**
 * Helper functions to create notifications (for testing/examples)
 */
export const createToastNotification = (
  type: NotificationType,
  title: string,
  message: string,
  duration: number = 5000,
  icon?: string,
  action?: ToastAction,
): NotificationPayload => ({
  type,
  title,
  message,
  duration,
  icon,
  action,
});

export const createDialogNotification = (
  type: NotificationType,
  title: string,
  message: string,
  confirm_label: string = 'OK',
  cancel_label?: string,
  on_confirm?: string,
  on_cancel?: string,
): NotificationPayload => ({
  type,
  title,
  message,
  confirm_label,
  cancel_label,
  on_confirm,
  on_cancel,
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
