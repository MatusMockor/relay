import type { ThreadId } from '@relay/shared/domain';
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
    private readonly openThread: (threadId: ThreadId) => void,
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
      this.activate(notification.threadId);
    });
    native.onDismiss(() => {
      this.active.delete(native);
    });
    native.show();
  }

  private activate(threadId: ThreadId | null): void {
    this.focusApp();
    if (threadId === null) {
      return;
    }
    this.openThread(threadId);
  }

  dispose(): void {
    const remaining = [...this.active];
    this.active.clear();
    remaining.forEach((native) => {
      native.close();
    });
  }
}
