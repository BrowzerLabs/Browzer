import { toast } from 'sonner';
import { registerNotificationCallback, unregisterNotificationCallback } from '@/renderer/providers/NotificationProvider';

/**
 * Register all application-specific notification callbacks
 * This function should be called when the app initializes
 */
export function registerAppNotificationCallbacks() {

}

/**
 * Unregister all application-specific notification callbacks
 * This function should be called when the app unmounts/cleanup
 */
export function unregisterAppNotificationCallbacks() {
}