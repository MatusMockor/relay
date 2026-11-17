import type { UpdateStatus } from '@relay/shared/ipc';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { UpdateService } from '../../src/main/updates/update-service';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';
import { InMemoryAppUpdater } from './support/in-memory-app-updater';
import { createTestLogger } from './support/memory-log-sink';

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
  return `update-stream-${String(streamCounter)}`;
};

const setup = () => {
  const updater = new InMemoryAppUpdater();
  const updates = new UpdateService({
    updater,
    availability: { enabled: true },
    logger: createTestLogger().logger,
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, updates })),
    nextStreamId,
  );
  return { updater, updates, bridge };
};

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('update status over IPC', () => {
  it('streams the current status first and then every change to the renderer', async () => {
    const { updater, updates, bridge } = setup();
    const received: UpdateStatus[] = [];
    const unsubscribe = bridge.subscribe('app.update.events', {
      onEvent: (status) => {
        received.push(status);
      },
    });
    await settle();
    updater.publish('0.2.0');
    const checking = updates.check();
    await settle();
    updater.completeDownload();
    await checking;
    await settle();
    unsubscribe();
    expect(received).toEqual([
      { kind: 'idle' },
      { kind: 'downloading', version: '0.2.0', percent: 0 },
      { kind: 'ready', version: '0.2.0' },
    ]);
  });

  it('answers the status and installs only a downloaded update', async () => {
    const { updater, updates, bridge } = setup();
    expect(await bridge.invoke('app.update.status')).toEqual({ ok: true, data: { kind: 'idle' } });
    expect(await bridge.invoke('app.update.install')).toEqual({
      ok: false,
      error: { code: 'conflict', message: 'Aktualizácia ešte nie je pripravená' },
    });
    updater.publish('0.2.0');
    const checking = updates.check();
    await settle();
    updater.completeDownload();
    await checking;
    expect(await bridge.invoke('app.update.install')).toEqual({ ok: true, data: { ok: true } });
    expect(updater.installs).toBe(1);
  });

  it('reports the update channels as not implemented without an update service', async () => {
    const bridge = createRelayBridge(
      new InMemoryIpc(composeIpc({ app: appMetadata })),
      nextStreamId,
    );
    expect(await bridge.invoke('app.update.status')).toMatchObject({
      ok: false,
      error: { code: 'not_implemented' },
    });
  });
});
