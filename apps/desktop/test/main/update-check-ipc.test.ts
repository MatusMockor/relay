import type { MenuCommand, UpdateStatus } from '@relay/shared/ipc';
import { describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import { createUpdateCheckCommand } from '../../src/main/native/update-check-command';
import { UpdateService } from '../../src/main/updates/update-service';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { InMemoryIpc } from './in-memory-ipc';
import { InMemoryAppUpdater } from './support/in-memory-app-updater';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

const appMetadata = {
  name: 'Relay',
  version: '0.1.3',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streamCounter = 0;
const nextStreamId = () => {
  streamCounter += 1;
  return `update-check-stream-${String(streamCounter)}`;
};

const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const setup = () => {
  const updater = new InMemoryAppUpdater();
  const time = new ManualTime();
  const logger = createTestLogger().logger;
  const updates = new UpdateService({
    updater,
    availability: { enabled: true },
    logger,
    timers: time,
    clock: time,
  });
  const menuCommands = new MenuCommandRequests();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, updates, menuCommands })),
    nextStreamId,
  );
  return { updater, updates, menuCommands, bridge, time, logger };
};

describe('manual update checks over IPC', () => {
  it('answers the app name and version to the renderer', async () => {
    const { bridge } = setup();
    expect(await bridge.invoke('app.getInfo')).toEqual({
      ok: true,
      data: {
        name: 'Relay',
        version: '0.1.3',
        platform: 'macos',
        electronVersion: '45.3.2',
        isPackaged: true,
      },
    });
  });

  it('starts a check without waiting for it and streams the outcome', async () => {
    const { bridge, updater, updates, time } = setup();
    const received: UpdateStatus[] = [];
    const unsubscribe = bridge.subscribe('app.update.events', {
      onEvent: (status) => {
        received.push(status);
      },
    });
    await settle();
    updater.holdChecks();
    expect(await bridge.invoke('app.update.check')).toEqual({ ok: true, data: { ok: true } });
    expect(updater.checkHeld).toBe(true);
    expect(updates.status()).toEqual({ kind: 'checking' });
    const startedAt = time.now().toISOString();
    await time.advance(5_000);
    updater.releaseCheck();
    await settle();
    unsubscribe();
    const finishedAt = time.now().toISOString();
    expect(finishedAt).not.toBe(startedAt);
    expect(received).toEqual([
      { kind: 'idle' },
      { kind: 'checking' },
      { kind: 'current', checkedAt: finishedAt },
    ]);
  });

  it('answers right away while the found update is still downloading', async () => {
    const { bridge, updater, updates } = setup();
    updater.publish('0.2.0');
    expect(await bridge.invoke('app.update.check')).toEqual({ ok: true, data: { ok: true } });
    await settle();
    expect(updates.status()).toEqual({ kind: 'downloading', version: '0.2.0', percent: 0 });
    expect(await bridge.invoke('app.update.check')).toEqual({ ok: true, data: { ok: true } });
    expect(updater.checks).toBe(1);
  });

  it('keeps a menu command until a window starts listening', async () => {
    const { bridge, menuCommands } = setup();
    menuCommands.request('open-about');
    const received: MenuCommand[] = [];
    const unsubscribe = bridge.subscribe('app.menu.command', {
      onEvent: (event) => {
        received.push(event);
      },
    });
    await settle();
    unsubscribe();
    expect(received).toEqual([{ command: 'open-about' }]);
  });

  it('opens the about section and checks when the menu item is used', async () => {
    const { bridge, updater, updates, menuCommands, logger } = setup();
    let shown = 0;
    const command = createUpdateCheckCommand({
      updates,
      showWindow: () => {
        shown += 1;
      },
      openAbout: () => {
        menuCommands.request('open-about');
      },
      logger,
    });
    const received: MenuCommand[] = [];
    const unsubscribe = bridge.subscribe('app.menu.command', {
      onEvent: (event) => {
        received.push(event);
      },
    });
    await settle();
    command();
    await settle();
    unsubscribe();
    expect(shown).toBe(1);
    expect(received).toEqual([{ command: 'open-about' }]);
    expect(updater.checks).toBe(1);
    expect(updates.status().kind).toBe('current');
  });
});
