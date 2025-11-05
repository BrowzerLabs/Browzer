import { toast } from 'sonner';
import { registerNotificationCallback, unregisterNotificationCallback } from '@/renderer/providers/NotificationProvider';

/**
 * Register all application-specific notification callbacks
 * This function should be called when the app initializes
 */
export function registerAppNotificationCallbacks() {
  // Test callback: Console logging
  registerNotificationCallback('test_console_log', (data) => {
    console.log('🔔 [Callback: test_console_log] Triggered with data:', data);
    console.log('  - Message from backend:', data?.message);
    console.log('  - Timestamp:', data?.timestamp);
    console.log('  - Custom data:', data?.custom);
  });

  // Test callback: Show toast notification
  registerNotificationCallback('test_show_toast', (data) => {
    console.log('🔔 [Callback: test_show_toast] Triggered with data:', data);
    
    toast.success('Callback Toast!', {
      description: `Backend sent: ${data?.message || 'No message'}`,
      duration: 5000,
    });
  });

  // Test callback: Show alert dialog
  registerNotificationCallback('test_show_alert', (data) => {
    console.log('🔔 [Callback: test_show_alert] Triggered with data:', data);
    
    const message = data?.message || 'Callback triggered!';
    const details = data?.details ? `\n\nDetails: ${JSON.stringify(data.details, null, 2)}` : '';
    
    alert(`🔔 Callback Alert!\n\n${message}${details}`);
  });

  // Production callback: Refresh subscription data
  registerNotificationCallback('refresh_subscription', async (data) => {
    console.log('🔔 [Callback: refresh_subscription] Triggered with data:', data);
    
    try {
      const result = await window.subscriptionAPI.syncSubscription();
      
      console.log('✅ Subscription refreshed:', result);
      
      toast.success('Subscription Refreshed', {
        description: 'Your subscription data has been updated',
        duration: 3000,
      });
    } catch (error) {
      console.error('❌ Failed to refresh subscription:', error);
      
      toast.error('Refresh Failed', {
        description: 'Could not refresh subscription data',
        duration: 5000,
      });
    }
  });

  // Production callback: Handle complex data structures
  registerNotificationCallback('handle_complex_data', (data) => {
    console.log('🔔 [Callback: handle_complex_data] Triggered with data:', data);
    
    if (data?.items && Array.isArray(data.items)) {
      console.log(`  - Processing ${data.items.length} items:`);
      data.items.forEach((item: any, index: number) => {
        console.log(`    ${index + 1}. ${item.name}: ${item.value}`);
      });
    }
    
    if (data?.config) {
      console.log('  - Config:', data.config);
    }
    
    toast.info('Data Processed', {
      description: `Processed ${data?.items?.length || 0} items`,
      duration: 4000,
    });
  });

  console.log('✅ [NotificationCallbacks] All callbacks registered successfully');
  console.log('   Available callbacks:');
  console.log('   - test_console_log');
  console.log('   - test_show_toast');
  console.log('   - test_show_alert');
  console.log('   - refresh_subscription');
  console.log('   - handle_complex_data');
}

/**
 * Unregister all application-specific notification callbacks
 * This function should be called when the app unmounts/cleanup
 */
export function unregisterAppNotificationCallbacks() {
  console.log('[NotificationCallbacks] Unregistering callbacks...');
  
  unregisterNotificationCallback('test_console_log');
  unregisterNotificationCallback('test_show_toast');
  unregisterNotificationCallback('test_show_alert');
  unregisterNotificationCallback('refresh_subscription');
  unregisterNotificationCallback('handle_complex_data');
  
  console.log('✅ [NotificationCallbacks] All callbacks unregistered');
}

/**
 * Get list of all registered callback names
 * Useful for debugging and documentation
 */
export function getRegisteredCallbackNames(): string[] {
  return [
    'test_console_log',
    'test_show_toast',
    'test_show_alert',
    'refresh_subscription',
    'handle_complex_data',
  ];
}