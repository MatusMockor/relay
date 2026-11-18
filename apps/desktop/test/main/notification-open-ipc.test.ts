import { ThreadIdSchema } from '@relay/shared/domain';
import type { NotificationOpened } from '@relay/shared/ipc';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { ThreadOpenRequests } from '../../src/main/native/thread-open-requests';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.0',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streamCounter = 0;
const nextStreamId = () => {
  streamCounter += 1;
  return `notification-stream-${String(streamCounter)}`;
};

const setup = () => {
  const threadOpens = new ThreadOpenRequests();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, threadOpens })),
    nextStreamId,
  );
  const received: NotificationOpened[] = [];
  const listen = () =>
    bridge.subscribe('app.notification.opened', {
      onEvent: (event) => {
        received.push(event);
      },
    });
  return { threadOpens, received, listen };
};

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('opening a thread from a notification over IPC', () => {
  it('forwards a clicked notification to the subscribed renderer', async () => {
    const { threadOpens, received, listen } = setup();
    const unsubscribe = listen();
    await settle();
    threadOpens.request(ThreadIdSchema.parse('thr_1'));
    await settle();
    expect(received).toEqual([{ threadId: ThreadIdSchema.parse('thr_1') }]);
    unsubscribe();
  });

  it('keeps the last click until a renderer subscribes and delivers it once', async () => {
    const { threadOpens, received, listen } = setup();
    threadOpens.request(ThreadIdSchema.parse('thr_old'));
    threadOpens.request(ThreadIdSchema.parse('thr_new'));
    const first = listen();
    await settle();
    first();
    await settle();
    const second = listen();
    await settle();
    expect(received).toEqual([{ threadId: ThreadIdSchema.parse('thr_new') }]);
    second();
  });
});
