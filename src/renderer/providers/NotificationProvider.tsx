/**
 * NotificationProvider - Global notification handler
 * 
 * Listens to SSE notification events from the backend and handles them appropriately:
 * - Toast notifications (info, success, warning, error, with actions)
 * - Dialog notifications (info, warning, error, confirm)
 * - Navigation notifications
 * - Callback notifications
 * 
 * This component should be mounted at the app root level to ensure
 * notifications work across all routes.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  NotificationPayload,
  NotificationType,
  isToastNotification,
  isDialogNotification,
  isNavigationNotification,
  isCallbackNotification,
} from '@/shared/types/notification';

interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Registry for custom callback handlers
 * Other parts of the app can register handlers here
 */
const callbackRegistry = new Map<string, (data?: Record<string, any>) => void>();

export const registerNotificationCallback = (
  name: string,
  handler: (data?: Record<string, any>) => void
) => {
  callbackRegistry.set(name, handler);
};

export const unregisterNotificationCallback = (name: string) => {
  callbackRegistry.delete(name);
};

export function NotificationProvider({ children }: NotificationProviderProps) {
  const navigate = useNavigate();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  /**
   * Handle toast notifications
   */
  const handleToastNotification = useCallback((notification: NotificationPayload) => {
    const { type, title, message, duration, action } = notification;

    const toastOptions = {
      duration: duration || 5000,
      description: message,
    };

    // Add action button if present
    if (action) {
      Object.assign(toastOptions, {
        action: {
          label: action.label,
          onClick: () => {
            // Execute the action
            const handler = callbackRegistry.get(action.action);
            if (handler) {
              handler(action.data);
            } else {
              console.warn(`[NotificationProvider] No handler registered for action: ${action.action}`);
            }
          },
        },
      });
    }

    // Show appropriate toast type
    switch (type) {
      case NotificationType.TOAST_INFO:
        toast.info(title, toastOptions);
        break;
      case NotificationType.TOAST_SUCCESS:
        toast.success(title, toastOptions);
        break;
      case NotificationType.TOAST_WARNING:
        toast.warning(title, toastOptions);
        break;
      case NotificationType.TOAST_ERROR:
        toast.error(title, toastOptions);
        break;
      case NotificationType.TOAST_ACTION:
        toast(title, toastOptions);
        break;
      default:
        toast(title, toastOptions);
    }
  }, []);

  /**
   * Handle dialog notifications
   * Uses Electron's native dialog for better UX
   */
  const handleDialogNotification = useCallback(async (notification: NotificationPayload) => {
    const { type, title, message, confirm_label, cancel_label, on_confirm, on_cancel } = notification;

    // For now, use toast with actions as a fallback
    // TODO: Implement proper Electron dialog integration
    const buttons: any = {};

    if (on_confirm) {
      buttons.action = {
        label: confirm_label || 'OK',
        onClick: () => {
          const handler = callbackRegistry.get(on_confirm);
          if (handler) {
            handler();
          }
        },
      };
    }

    if (on_cancel && cancel_label) {
      buttons.cancel = {
        label: cancel_label,
        onClick: () => {
          const handler = callbackRegistry.get(on_cancel);
          if (handler) {
            handler();
          }
        },
      };
    }

    // Show as toast for now
    const toastType = type === NotificationType.DIALOG_ERROR ? 'error' :
                      type === NotificationType.DIALOG_WARNING ? 'warning' : 'info';

    alert(message);
  }, []);

  /**
   * Handle navigation notifications
   */
  const handleNavigationNotification = useCallback((notification: NotificationPayload) => {
    const { navigate_to, title, message } = notification;

    if (navigate_to) {
      // Show toast first
      toast.info(title, {
        description: message,
        duration: 3000,
      });

      // Navigate after a short delay
      setTimeout(() => {
        navigate(navigate_to);
      }, 500);
    }
  }, [navigate]);

  /**
   * Handle callback notifications
   */
  const handleCallbackNotification = useCallback((notification: NotificationPayload) => {
    const { callback_name, callback_data, title, message } = notification;

    if (callback_name) {
      const handler = callbackRegistry.get(callback_name);
      if (handler) {
        handler(callback_data);
        
        // Show success toast
        toast.success(title, {
          description: message,
          duration: 3000,
        });
      } else {
        console.warn(`[NotificationProvider] No handler registered for callback: ${callback_name}`);
        
        // Show error toast
        toast.error('Action Failed', {
          description: `No handler found for: ${callback_name}`,
          duration: 5000,
        });
      }
    }
  }, []);

  /**
   * Main notification handler
   */
  const handleNotification = useCallback((notification: NotificationPayload) => {
    console.log('[NotificationProvider] Received notification:', notification);

    try {
      const { type } = notification;

      if (isToastNotification(type)) {
        handleToastNotification(notification);
      } else if (isDialogNotification(type)) {
        handleDialogNotification(notification);
      } else if (isNavigationNotification(type)) {
        handleNavigationNotification(notification);
      } else if (isCallbackNotification(type)) {
        handleCallbackNotification(notification);
      } else {
        console.warn('[NotificationProvider] Unknown notification type:', type);
        // Show as generic toast
        toast(notification.title, {
          description: notification.message,
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('[NotificationProvider] Error handling notification:', error);
      toast.error('Notification Error', {
        description: 'Failed to process notification',
        duration: 5000,
      });
    }
  }, [handleToastNotification, handleDialogNotification, handleNavigationNotification, handleCallbackNotification]);

  /**
   * Subscribe to notification events on mount
   */
  useEffect(() => {
    console.log('[NotificationProvider] Subscribing to notifications');

    // Subscribe to notification events
    unsubscribeRef.current = window.notificationAPI.onNotification(handleNotification);

    // Cleanup on unmount
    return () => {
      console.log('[NotificationProvider] Unsubscribing from notifications');
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [handleNotification]);

  return <>{children}</>;
}

// Export helper functions for registering callbacks
export { callbackRegistry };
