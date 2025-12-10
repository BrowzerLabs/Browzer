import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  NotificationPayload,
  NotificationType,
  ToastPayload,
} from '@/shared/types/notification';
import { 
  registerAppNotificationCallbacks, 
  unregisterAppNotificationCallbacks 
} from '@/renderer/notification/notificationCallbacks';

interface NotificationProviderProps {
  children: React.ReactNode;
}

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

  const handleToastNotification = useCallback((notification: NotificationPayload) => {
    const { title, message, action, metadata } = notification;

    const toastOptions = {
      description: message,
    };

    if (action) {
      Object.assign(toastOptions, {
        action: {
          label: action.label,
          onClick: () => {
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

    switch (metadata?.variant) {
      case 'success':
        toast.success(title, toastOptions);
        break;
      case 'warning':
        toast.warning(title, toastOptions);
        break;
      case 'error':
        toast.error(title, toastOptions);
        break;
      default:
        toast.info(title, toastOptions);
    }
  }, []);

  const handleToastNotification2 = useCallback((payload: ToastPayload) => {
    const { message, description, variant } = payload;
    switch(variant){
      case 'error': 
        toast.error(message, { description })
        break;
      case 'success':
        toast.success(message, { description })
        break;
      case 'warning':
        toast.warning(message, { description })
        break;
      default:
        toast.info(message, { description })
    }
  }, []);

  const handleDialogNotification = useCallback(async (notification: NotificationPayload) => {
    const { title, message } = notification;
    toast.info(title)
    alert(message);
  }, []);

  const handleNavigationNotification = useCallback((notification: NotificationPayload) => {
    const { navigate_to, title, message } = notification;

    if (navigate_to) {
      toast.info(title, {
        description: message,
      });

      setTimeout(() => {
        window.browserAPI.hideAllTabs();
        navigate(navigate_to);
      }, 200);
    }
  }, [navigate]);

  const handleCallbackNotification = useCallback((notification: NotificationPayload) => {
    const { callback_name, callback_data, title, message } = notification;

    if (callback_name) {
      const handler = callbackRegistry.get(callback_name);
      if (handler) {
        handler(callback_data);
        
        toast.success(title, { description: message });
      } else {
        console.warn(`[NotificationProvider] No handler registered for callback: ${callback_name}`);
        toast.error('Action Failed', { description: `No handler found for: ${callback_name}` });
      }
    }
  }, []);

  const handleNotification = useCallback((notification: NotificationPayload) => {
    try {
      const { type } = notification;

      switch (type) {
        case NotificationType.TOAST:
          handleToastNotification(notification);
          break;
        case NotificationType.DIALOG:
          handleDialogNotification(notification);
          break;
        case NotificationType.NAVIGATE:
          handleNavigationNotification(notification);
          break;
        case NotificationType.CALLBACK:
          handleCallbackNotification(notification);
          break;
        default:
          console.warn('[NotificationProvider] Unknown notification type:', type);
          toast.info(notification.title, {
            description: notification.message,
          });
      }
    } catch (error) {
      console.error('[NotificationProvider] Error handling notification:', error);
      toast.error('Notification Error', {description: 'Failed to process notification'});
    }
  }, [handleToastNotification, handleDialogNotification, handleNavigationNotification, handleCallbackNotification]);

  useEffect(() => {
    unsubscribeRef.current = window.notificationAPI.onNotification(handleNotification);
    registerAppNotificationCallbacks();

    const unsubscribeToast = window.notificationAPI.onToast(handleToastNotification2);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      
      unregisterAppNotificationCallbacks();
      unsubscribeToast();
    };
  }, [handleNotification]);

  return <>{children}</>;
}

export { callbackRegistry };