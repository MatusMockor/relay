import type { MailNotification, NotificationPresenter } from './new-mail-notifier';

export interface ShownNotification {
  onClick(listener: () => void): void;
  onDismiss(listener: () => void): void;
  show(): void;
  close(): void;
}

export interface NotificationFactory {
  isSupported(): boolean;
  create(options: { title: string; body: string; silent: boolean }): ShownNotification;
}

export class SystemNotificationPresenter implements NotificationPresenter {
  private readonly active = new Set<ShownNotification>();

  constructor(
    private readonly notifications: NotificationFactory,
    private readonly focusApp: () => void,
  ) {}

  show(notification: MailNotification): void {
    if (!this.notifications.isSupported()) {
      return;
    }
    const native = this.notifications.create({
      title: notification.title,
      body: notification.body,
      silent: false,
    });
    this.active.add(native);
    native.onClick(() => {
      this.active.delete(native);
      this.focusApp();
    });
    native.onDismiss(() => {
      this.active.delete(native);
    });
    native.show();
  }

  dispose(): void {
    const remaining = [...this.active];
    this.active.clear();
    remaining.forEach((native) => {
      native.close();
    });
  }
}
