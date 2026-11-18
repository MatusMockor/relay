import type { NotificationRequest } from '@relay/shared/ipc';
import { NOTIFICATION_BODY_MAX, NOTIFICATION_TITLE_MAX } from '@relay/shared/ipc';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { EventHub } from '../../src/main/events/event-hub';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { InMemoryIpc } from '../main/in-memory-ipc';

const setup = (handlers: { readonly withRelay: boolean }) => {
  const hub = new EventHub<NotificationRequest>();
  const received: NotificationRequest[] = [];
  hub.subscribe((request) => received.push(request));
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
        ...(handlers.withRelay ? { rendererNotifications: hub } : {}),
      }),
    ),
    () => 'fit-stream',
  );
  return { platform: createElectronPlatform(bridge), received };
};

describe('renderer notifications relayed to the main process', () => {
  it('shortens a long sender name and subject to the IPC limits instead of losing them', async () => {
    const { platform, received } = setup({ withRelay: true });
    const sender = `Ján ${'Novák-'.repeat(83)}`;
    const subject = `Re: ${'veľmi dlhý predmet 😀 '.repeat(200)}`;

    await platform.showNotification({
      title: sender,
      body: subject,
      threadId: null,
      session: 'session-1',
    });

    const [shown] = received;
    expect(sender.length).toBeGreaterThan(NOTIFICATION_TITLE_MAX);
    expect(subject.length).toBeGreaterThan(NOTIFICATION_BODY_MAX);
    expect(shown?.title.length).toBeLessThanOrEqual(NOTIFICATION_TITLE_MAX);
    expect(shown?.body.length).toBeLessThanOrEqual(NOTIFICATION_BODY_MAX);
    expect(shown?.title.endsWith('…')).toBe(true);
    expect(shown?.body.endsWith('…')).toBe(true);
    expect(sender.startsWith(shown?.title.slice(0, -1) ?? '-')).toBe(true);
    expect(subject.startsWith(shown?.body.slice(0, -1) ?? '-')).toBe(true);
  });

  it('keeps a notification within the limits unchanged', async () => {
    const { platform, received } = setup({ withRelay: true });
    const notification = { title: 'Tibor', body: 'Ponuka', threadId: null, session: 'session-1' };
    await platform.showNotification(notification);
    expect(received).toEqual([notification]);
  });

  it('rejects when the main process refuses the notification', async () => {
    const { platform } = setup({ withRelay: false });
    await expect(
      platform.showNotification({ title: 'Tibor', body: '', threadId: null, session: 's' }),
    ).rejects.toMatchObject({ code: 'not_implemented' });
  });
});
