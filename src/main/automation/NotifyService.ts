import { Notification } from 'electron';

import { ToolExecutionResult } from '@/shared/types';

export interface NotifyParams {
  message: string;
  title?: string;
  urgency?: 'low' | 'normal' | 'critical';
}

export class NotifyService {
  public async execute(params: NotifyParams): Promise<ToolExecutionResult> {
    try {
      if (!params.message || params.message.trim() === '') {
        return {
          success: false,
          error: 'Notification message cannot be empty',
        };
      }

      const title = params.title || 'User Action Required';
      const urgency = params.urgency || 'normal';
      if (!Notification.isSupported()) {
        return {
          success: false,
          error: 'Notifications are not supported on this platform',
        };
      }
      const notification = new Notification({
        title,
        body: params.message,
        urgency,
        timeoutType: urgency === 'critical' ? 'never' : 'default',
      });

      notification.show();

      return {
        success: true,
      };
    } catch (error) {
      console.error('[NotifyService] Error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown notification error',
      };
    }
  }
}
