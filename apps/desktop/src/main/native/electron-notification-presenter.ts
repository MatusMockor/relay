import { Notification } from 'electron';
import type { MailNotification, NotificationPresenter } from './new-mail-notifier';

export class ElectronNotificationPresenter implements NotificationPresenter {
  constructor(private readonly focusApp: () => void) {}

  show(notification: MailNotification): void {
    if (!Notification.isSupported()) {
      return;
    }
    const native = new Notification({
      title: notification.title,
      body: notification.body,
      silent: false,
    });
    native.on('click', this.focusApp);
    native.show();
  }
}
