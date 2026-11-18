import { type ThreadId, ThreadIdSchema } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { ThreadOpenRequests } from '../../src/main/native/thread-open-requests';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { InMemoryIpc } from '../main/in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.0',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streams = 0;

const startDesktop = () => {
  const threadOpens = new ThreadOpenRequests();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, threadOpens })),
    () => {
      streams += 1;
      return `notification-open-${String(streams)}`;
    },
  );
  const received: string[] = [];
  const listener = (name: string) => (threadId: ThreadId) => {
    received.push(`${name}:${threadId}`);
  };
  return { threadOpens, platform: createElectronPlatform(bridge), received, listener };
};

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const THREAD = ThreadIdSchema.parse('thr_clicked');

describe('notification clicks reaching the renderer over IPC', () => {
  it('delivers a click made before the window listened once a remounted listener is back', async () => {
    const { threadOpens, platform, received, listener } = startDesktop();
    threadOpens.request(THREAD);
    const strictModeCleanup = platform.subscribeToThreadOpens(listener('first'));
    strictModeCleanup();
    const stop = platform.subscribeToThreadOpens(listener('second'));
    await settle();
    expect(received).toEqual(['second:thr_clicked']);
    stop();
  });

  it('keeps a click that arrives between an unsubscribe and the next subscribe', async () => {
    const { threadOpens, platform, received, listener } = startDesktop();
    threadOpens.request(THREAD);
    platform.subscribeToThreadOpens(listener('first'))();
    await settle();
    expect(received).toEqual([]);
    const stop = platform.subscribeToThreadOpens(listener('second'));
    expect(received).toEqual(['second:thr_clicked']);
    stop();
  });

  it('forwards later clicks to the active listener only', async () => {
    const { threadOpens, platform, received, listener } = startDesktop();
    const stop = platform.subscribeToThreadOpens(listener('shell'));
    await settle();
    threadOpens.request(THREAD);
    await settle();
    expect(received).toEqual(['shell:thr_clicked']);
    stop();
  });
});
