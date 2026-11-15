import { Notification } from 'electron';
import type { NotificationFactory } from './system-notification-presenter';

export const electronNotifications: NotificationFactory = {
  isSupported: () => Notification.isSupported(),
  create: (options) => {
    const native = new Notification(options);
    return {
      onClick: (listener) => {
        native.on('click', listener);
      },
      onDismiss: (listener) => {
        native.on('close', listener);
        native.on('failed', listener);
      },
      show: () => {
        native.show();
      },
      close: () => {
        native.close();
      },
    };
  },
};
