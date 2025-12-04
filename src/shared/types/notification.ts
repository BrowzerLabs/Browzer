export enum NotificationType {
  TOAST = 'toast',
  DIALOG = 'dialog',
  NAVIGATE = 'navigate',
  CALLBACK = 'callback',
  SYSTEM_UPDATE = 'system_update',
  MAINTENANCE = 'maintenance',
}

export type DialogType = 'info' | 'warning' | 'error' | 'question';

export interface DialogButton {
  label: string;
  action?: string;
}

export interface DialogConfig {
  dialog_type: DialogType;
  buttons?: DialogButton[];
  default_button_index?: number;
  cancel_button_index?: number;
  checkbox_label?: string;
  checkbox_checked?: boolean;
}

export interface DialogResult {
  response: number;
  action?: string;
  checkboxChecked?: boolean;
}

export interface ToastAction {
  label: string;
  action: string;
  data?: Record<string, any>;
}

export interface NotificationPayload {
  type: NotificationType;
  message: string;
  detail?: string;

  action?: ToastAction;

  navigate_to?: string;

  callback_name?: string;
  callback_data?: Record<string, any>;

  dialog_config?: DialogConfig;

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
  message: string,
  detail?: string,
  action?: ToastAction,
  metadata?: Record<string, any>,
): NotificationPayload => ({
  type,
  message,
  detail,
  action,
  metadata
});

export const createDialogNotification = (
  message: string,
  detail?: string,
  dialogType: DialogType = 'info',
  buttons?: DialogButton[],
): NotificationPayload => ({
  type: NotificationType.DIALOG,
  message,
  detail,
  dialog_config: {
    dialog_type: dialogType,
    buttons,
  },
});

export const createInfoDialog = (
  message: string,
  detail?: string,
): NotificationPayload =>
  createDialogNotification(message, detail, 'info');

export const createErrorDialog = (
  message: string,
  detail?: string,
): NotificationPayload =>
  createDialogNotification(message, detail, 'error');

export const createWarningDialog = (
  message: string,
  detail?: string,
): NotificationPayload =>
  createDialogNotification(message, detail, 'warning');

export const createConfirmDialog = (
  message: string,
  detail?: string,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
): NotificationPayload =>
  createDialogNotification(message, detail, 'question', [
    { label: confirmLabel, action: 'confirm' },
    { label: cancelLabel, action: 'cancel' },
  ]);

export const createNavigateNotification = (
  message: string,
  navigate_to: string,
  detail?: string,
): NotificationPayload => ({
  type: NotificationType.NAVIGATE,
  message,
  detail,
  navigate_to,
});

export const createCallbackNotification = (
  message: string,
  callback_name: string,
  callback_data?: Record<string, any>,
  detail?: string,
): NotificationPayload => ({
  type: NotificationType.CALLBACK,
  message,
  detail,
  callback_name,
  callback_data,
});
