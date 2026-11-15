import { AccountIdSchema } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../src/main/composition/compose-ipc';
import { IpcInvokeRouter } from '../src/main/ipc/invoke-router';
import { IpcStreamRouter } from '../src/main/ipc/stream-router';
import { createRelayBridge } from '../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.0',
  isPackaged: false,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streamCounter = 0;
const nextStreamId = () => {
  streamCounter += 1;
  return `stream-${String(streamCounter)}`;
};

const accountStatus = (status: 'syncing' | 'connected'): RealtimeEvent => ({
  type: 'account.status',
  at: '2026-11-15T10:00:00.000Z',
  data: { accountId: AccountIdSchema.parse('acc_1'), status, lastSyncedAt: null, error: null },
});

describe('renderer bridge over IPC', () => {
  it('invokes app.getInfo through the composed main process routers', async () => {
    const bridge = createRelayBridge(
      new InMemoryIpc(composeIpc({ app: appMetadata })),
      nextStreamId,
    );
    const result = await bridge.invoke('app.getInfo');
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Relay',
        version: '0.1.0',
        platform: 'macos',
        electronVersion: '45.3.2',
        isPackaged: false,
      },
    });
  });

  it('reports channels without a handler as not implemented', async () => {
    const bridge = createRelayBridge(
      new InMemoryIpc(composeIpc({ app: appMetadata })),
      nextStreamId,
    );
    const result = await bridge.invoke('local.accounts.list');
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'not_implemented',
        message: 'IPC channel "local.accounts.list" is not implemented yet',
      },
    });
  });

  it('streams validated events until the handler completes', async () => {
    const routers = {
      invoke: new IpcInvokeRouter({}),
      streams: new IpcStreamRouter({
        'local.events': async function* () {
          await Promise.resolve();
          yield accountStatus('syncing');
          yield accountStatus('connected');
        },
      }),
    };
    const bridge = createRelayBridge(new InMemoryIpc(routers), nextStreamId);
    const received: string[] = [];
    await new Promise<void>((resolve) => {
      bridge.subscribe('local.events', {
        onEvent: (event) => {
          received.push(event.type === 'account.status' ? event.data.status : event.type);
        },
        onEnd: resolve,
      });
    });
    expect(received).toEqual(['syncing', 'connected']);
  });

  it('surfaces handler errors and invalid events to the subscriber', async () => {
    const routers = {
      invoke: new IpcInvokeRouter({}),
      streams: new IpcStreamRouter({
        'local.events': async function* () {
          await Promise.resolve();
          yield { type: 'thread.upserted', at: 'not-a-date', data: {} } as unknown as RealtimeEvent;
        },
      }),
    };
    const bridge = createRelayBridge(new InMemoryIpc(routers), nextStreamId);
    const error = await new Promise((resolve) => {
      bridge.subscribe('local.events', { onEvent: () => undefined, onError: resolve });
    });
    expect(error).toEqual({
      code: 'internal',
      message: 'Stream "local.events" produced an invalid event',
    });
  });
});
