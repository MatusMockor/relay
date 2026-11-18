import type { NotificationRequest } from '@relay/shared';

export const showBrowserNotification = (notification: NotificationRequest): Promise<void> => {
  if (typeof Notification === 'undefined' || Notification.permission === 'denied') {
    return Promise.resolve();
  }
  new Notification(notification.title, { body: notification.body });
  return Promise.resolve();
};
