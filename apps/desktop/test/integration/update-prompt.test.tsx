// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { UpdateService } from '../../src/main/updates/update-service';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { renderApp, resetStores } from '../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../main/in-memory-ipc';
import { InMemoryAppUpdater } from '../main/support/in-memory-app-updater';
import { ManualTime } from '../main/support/manual-time';
import { createTestLogger } from '../main/support/memory-log-sink';

const appMetadata = {
  name: 'Relay',
  version: '0.1.0',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streams = 0;

const startDesktop = () => {
  const updater = new InMemoryAppUpdater();
  const time = new ManualTime();
  const updates = new UpdateService({
    updater,
    availability: { enabled: true },
    logger: createTestLogger().logger,
    timers: time,
    clock: time,
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, updates })),
    () => {
      streams += 1;
      return `update-prompt-${String(streams)}`;
    },
  );
  return { updater, updates, platform: createElectronPlatform(bridge) };
};

const downloadUpdate = async (desktop: ReturnType<typeof startDesktop>, version: string) => {
  desktop.updater.publish(version);
  const checking = desktop.updates.check();
  await waitFor(() => {
    expect(desktop.updater.downloading).toBe(true);
  });
  desktop.updater.completeDownload();
  await act(async () => {
    await checking;
  });
};

describe('update prompt', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('stays hidden until an update has been downloaded', async () => {
    const desktop = startDesktop();
    renderApp({ platform: desktop.platform });
    await screen.findByRole('button', { name: /Pokračovať bez účtu/ });
    expect(screen.queryByText('Nová verzia je pripravená')).toBeNull();
    desktop.updater.publish('0.2.0');
    const checking = desktop.updates.check();
    await waitFor(() => {
      expect(desktop.updater.downloading).toBe(true);
    });
    expect(screen.queryByText('Nová verzia je pripravená')).toBeNull();
    desktop.updater.completeDownload();
    await act(async () => {
      await checking;
    });
    expect(await screen.findByText('Nová verzia je pripravená')).toBeDefined();
    expect(screen.getByText('Relay 0.2.0 sa nainštaluje po reštarte.')).toBeDefined();
  });

  it('restarts into the downloaded version from the prompt', async () => {
    const desktop = startDesktop();
    renderApp({ platform: desktop.platform });
    await downloadUpdate(desktop, '0.2.0');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reštartovať' }));
    });
    await waitFor(() => {
      expect(desktop.updater.installs).toBe(1);
    });
    expect(await screen.findByRole('button', { name: 'Reštartujem…' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('tells the user when the downloaded update could not be installed', async () => {
    const desktop = startDesktop();
    renderApp({ platform: desktop.platform });
    await downloadUpdate(desktop, '0.2.0');
    desktop.updater.failInstallWith(new Error('Squirrel rejected the signature'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reštartovať' }));
    });
    expect(await screen.findByText('Aktualizáciu sa nepodarilo nainštalovať')).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Zavrieť' }));
    });
    expect(screen.queryByText('Aktualizáciu sa nepodarilo nainštalovať')).toBeNull();
  });

  it('can be put off until the next version', async () => {
    const desktop = startDesktop();
    renderApp({ platform: desktop.platform });
    await downloadUpdate(desktop, '0.2.0');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Neskôr' }));
    });
    expect(screen.queryByText('Nová verzia je pripravená')).toBeNull();
    expect(desktop.updater.installs).toBe(0);
  });

  it('offers the restart again when the update is ready after a failed install', async () => {
    const desktop = startDesktop();
    renderApp({ platform: desktop.platform });
    await downloadUpdate(desktop, '0.2.0');
    desktop.updater.failInstallWith(new Error('Squirrel rejected the signature'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reštartovať' }));
    });
    expect(await screen.findByText('Aktualizáciu sa nepodarilo nainštalovať')).toBeDefined();
    await downloadUpdate(desktop, '0.2.0');
    expect(await screen.findByText('Nová verzia je pripravená')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reštartovať' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Neskôr' })).toHaveProperty('disabled', false);
  });
});
