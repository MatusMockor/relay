import { describe, expect, it } from 'vitest';
import {
  type NotificationFactory,
  type ShownNotification,
  SystemNotificationPresenter,
} from '../../src/main/native/system-notification-presenter';

class OsNotification implements ShownNotification {
  closed = false;
  private clickListener: () => void = () => undefined;
  private dismissListener: () => void = () => undefined;

  constructor(readonly title: string) {}

  onClick(listener: () => void): void {
    this.clickListener = listener;
  }

  onDismiss(listener: () => void): void {
    this.dismissListener = listener;
  }

  show(): void {
    this.closed = false;
  }

  close(): void {
    this.closed = true;
    this.dismissListener();
  }

  click(): void {
    this.clickListener();
  }
}

class OsNotificationCenter implements NotificationFactory {
  readonly created: OsNotification[] = [];

  isSupported(): boolean {
    return true;
  }

  create(options: { title: string }): ShownNotification {
    const notification = new OsNotification(options.title);
    this.created.push(notification);
    return notification;
  }
}

describe('SystemNotificationPresenter', () => {
  it('keeps shown notifications until clicked and closes the rest on dispose', () => {
    const center = new OsNotificationCenter();
    let focused = 0;
    const presenter = new SystemNotificationPresenter(center, () => {
      focused += 1;
    });

    presenter.show({ title: 'Jana', body: 'Ahoj', threadId: null });
    presenter.show({ title: 'Peter', body: 'Faktúra', threadId: null });
    center.created[0]?.click();
    presenter.dispose();

    expect(focused).toBe(1);
    expect(center.created.map((notification) => notification.closed)).toEqual([false, true]);
  });
});
