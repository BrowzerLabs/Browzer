/**
 * Notification types for real-time push notifications
 * 
 * These types MUST be kept in sync with backend schemas:
 * service/app/schemas/notification.py
 */

import { FaExpandArrowsAlt } from "react-icons/fa";

/**
 * All supported notification types
 * Must match backend NotificationType enum
 */
export enum NotificationType {
  // Toast notifications
  TOAST = 'toast',
  
  // Dialog notifications
  DIALOG = 'dialog',
  
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
  
  action?: ToastAction;
  
  // For navigation
  navigate_to?: string;
  
  // For callback
  callback_name?: string;
  callback_data?: Record<string, any>;
  
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
 * Helper functions to create notifications (for testing/examples)
 */
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
