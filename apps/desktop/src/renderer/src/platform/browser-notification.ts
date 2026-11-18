import type { NotificationRequest } from '@relay/shared';

export const showBrowserNotification = (notification: NotificationRequest): void => {
  if (typeof Notification === 'undefined' || Notification.permission === 'denied') {
    return;
  }
  new Notification(notification.title, { body: notification.body });
};
