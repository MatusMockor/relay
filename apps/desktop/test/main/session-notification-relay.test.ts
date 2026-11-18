import { type ThreadId, ThreadIdSchema } from '@relay/shared/domain';
import type { NotificationRequest, TrayReport } from '@relay/shared/ipc';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { EventHub } from '../../src/main/events/event-hub';
import { NotificationPause } from '../../src/main/native/notification-pause';
import { RendererView } from '../../src/main/native/renderer-view';
import { SessionNotificationRelay } from '../../src/main/native/session-notification-relay';
import {
  type NotificationFactory,
  type ShownNotification,
  SystemNotificationPresenter,
} from '../../src/main/native/system-notification-presenter';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';
import { ManualTime } from './support/manual-time';

class OsNotification implements ShownNotification {
  closed = false;
  private clicked: () => void = () => undefined;

  constructor(readonly title: string) {}

  onClick(listener: () => void): void {
    this.clicked = listener;
  }

  onDismiss(): void {
    return undefined;
  }

  show(): void {
    this.closed = false;
  }

  close(): void {
    this.closed = true;
  }

  click(): void {
    this.clicked();
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

const report = (session: string | null): TrayReport => ({ session, scope: 'all', accounts: [] });

const request = (session: string, threadId: string): NotificationRequest => ({
  title: `Vlákno ${threadId}`,
  body: 'Ponuka',
  threadId: ThreadIdSchema.parse(threadId),
  session,
});

const setup = () => {
  const time = new ManualTime();
  const view = new RendererView();
  const pause = new NotificationPause(time, time);
  const center = new OsNotificationCenter();
  const opened: ThreadId[] = [];
  const relay = new SessionNotificationRelay({
    view,
    gate: pause,
    createPresenter: (openThread) =>
      new SystemNotificationPresenter(center, () => undefined, openThread),
    openThread: (threadId) => opened.push(threadId),
  });
  relay.start();
  const hub = new EventHub<NotificationRequest>();
  hub.subscribe((incoming) => {
    relay.show(incoming);
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(
      composeIpc({
        app: {
          name: 'Relay',
          version: '0.1.5',
          isPackaged: true,
          platform: 'darwin',
          electronVersion: '45.3.2',
        },
        rendererView: view,
        rendererNotifications: hub,
      }),
    ),
    () => 'relay-stream',
  );
  return { view, pause, center, opened, relay, bridge };
};

describe('SessionNotificationRelay', () => {
  it('opens the thread of a renderer notification clicked in the same session', async () => {
    const { view, center, opened, bridge } = setup();
    view.update(report('server-a'));
    expect(await bridge.invoke('app.notification.show', request('server-a', 'thr-a'))).toEqual({
      ok: true,
      data: { ok: true },
    });
    center.created[0]?.click();
    expect(opened).toEqual(['thr-a']);
  });

  it('closes notifications of an ended session and ignores their clicks', async () => {
    const { view, center, opened, bridge } = setup();
    view.update(report('server-a'));
    await bridge.invoke('app.notification.show', request('server-a', 'thr-a'));
    view.update(report('server-b'));
    const [fromA] = center.created;
    expect(fromA?.closed).toBe(true);
    fromA?.click();

    await bridge.invoke('app.notification.show', request('server-b', 'thr-b'));
    center.created[1]?.click();

    expect(opened).toEqual(['thr-b']);
  });

  it('does not queue a thread for the next session when clicked while logged out', async () => {
    const { view, center, opened, bridge } = setup();
    view.update(report('server-a'));
    await bridge.invoke('app.notification.show', request('server-a', 'thr-a'));
    view.update(report(null));
    center.created[0]?.click();
    expect(center.created[0]?.closed).toBe(true);
    expect(opened).toEqual([]);
  });

  it('drops notifications from another session or while notifications are paused', async () => {
    const { view, pause, center, bridge } = setup();
    view.update(report('server-b'));
    await bridge.invoke('app.notification.show', request('server-a', 'thr-a'));
    pause.pause('indefinite');
    await bridge.invoke('app.notification.show', request('server-b', 'thr-b'));
    pause.resume();
    await bridge.invoke('app.notification.show', request('server-b', 'thr-c'));
    expect(center.created.map((notification) => notification.title)).toEqual(['Vlákno thr-c']);
  });

  it('closes the shown notifications when it stops', async () => {
    const { view, center, relay, bridge } = setup();
    view.update(report('server-a'));
    await bridge.invoke('app.notification.show', request('server-a', 'thr-a'));
    relay.stop();
    expect(center.created[0]?.closed).toBe(true);
  });
});
