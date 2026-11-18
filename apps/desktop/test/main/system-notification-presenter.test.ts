import { type ThreadId, ThreadIdSchema } from '@relay/shared/domain';
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
    const presenter = new SystemNotificationPresenter(
      center,
      () => {
        focused += 1;
      },
      () => undefined,
    );

    presenter.show({ title: 'Jana', body: 'Ahoj', threadId: null });
    presenter.show({ title: 'Peter', body: 'Faktúra', threadId: null });
    center.created[0]?.click();
    presenter.dispose();

    expect(focused).toBe(1);
    expect(center.created.map((notification) => notification.closed)).toEqual([false, true]);
  });

  const clickRecorder = () => {
    const center = new OsNotificationCenter();
    const activity: string[] = [];
    const opened: ThreadId[] = [];
    const presenter = new SystemNotificationPresenter(
      center,
      () => {
        activity.push('focus');
      },
      (threadId) => {
        activity.push('open');
        opened.push(threadId);
      },
    );
    return { center, activity, opened, presenter };
  };

  it('focuses the app and opens the thread when a mail notification is clicked', () => {
    const { center, activity, opened, presenter } = clickRecorder();
    presenter.show({ title: 'Jana', body: 'Ahoj', threadId: ThreadIdSchema.parse('thr_1') });
    center.created[0]?.click();
    expect(activity).toEqual(['focus', 'open']);
    expect(opened).toEqual([ThreadIdSchema.parse('thr_1')]);
  });

  it('only focuses the app when a digest notification is clicked', () => {
    const { center, activity, presenter } = clickRecorder();
    presenter.show({ title: 'Relay', body: 'Máš 2 nové správy', threadId: null });
    center.created[0]?.click();
    expect(activity).toEqual(['focus']);
  });
});
