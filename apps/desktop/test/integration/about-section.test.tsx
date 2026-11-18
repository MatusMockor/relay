// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import { UpdateService } from '../../src/main/updates/update-service';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createBrowserPlatform } from '../../src/renderer/src/platform/BrowserPlatform';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../src/renderer/src/platform/Platform';
import { hm } from '../../src/renderer/src/lib/dates';
import { setUi, useUiStore } from '../../src/renderer/src/state/ui-store';
import { renderApp, resetStores, storageWith } from '../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../main/in-memory-ipc';
import { InMemoryAppUpdater } from '../main/support/in-memory-app-updater';
import { ManualTime } from '../main/support/manual-time';
import { createTestLogger } from '../main/support/memory-log-sink';

const appMetadata = {
  name: 'Relay',
  version: '0.1.3',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streams = 0;

const startDesktop = () => {
  const updater = new InMemoryAppUpdater();
  const time = new ManualTime('2026-11-18T09:30:00.000Z');
  const updates = new UpdateService({
    updater,
    availability: { enabled: true },
    logger: createTestLogger().logger,
    timers: time,
    clock: time,
  });
  const menuCommands = new MenuCommandRequests();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, updates, menuCommands })),
    () => {
      streams += 1;
      return `about-${String(streams)}`;
    },
  );
  const desktop = createElectronPlatform(bridge);
  const opened: string[] = [];
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    appInfo: () => desktop.appInfo(),
    subscribeToUpdates: (listener) => desktop.subscribeToUpdates(listener),
    checkForUpdates: () => desktop.checkForUpdates(),
    installUpdate: () => desktop.installUpdate(),
    subscribeToMenuCommands: (listener) => desktop.subscribeToMenuCommands(listener),
    openExternal: (url) => {
      opened.push(url);
    },
  };
  return { updater, updates, menuCommands, platform, opened, time };
};

const renderDesktop = async (desktop: ReturnType<typeof startDesktop>) => {
  renderApp({ platform: desktop.platform, now: () => desktop.time.now() });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ leftUser: true });
  });
};

const footer = (): HTMLElement => {
  const nav = screen.getByRole('navigation', { name: 'Priečinky' });
  const foot = nav.querySelector<HTMLElement>('.fold-foot');
  expect(foot).not.toBeNull();
  return foot ?? nav;
};

const openAboutFromSidebar = async () => {
  const version = await within(footer()).findByRole('button', { name: 'Relay 0.1.3' });
  act(() => {
    fireEvent.click(version);
  });
  return screen.getByRole('tabpanel', { name: 'O aplikácii' });
};

const enabledCheckButton = async (about: HTMLElement) => {
  const button = within(about).getByRole('button', { name: 'Skontrolovať aktualizácie' });
  await waitFor(() => {
    expect(button).toHaveProperty('disabled', false);
  });
  return button;
};

describe('about Relay and manual update checks', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('shows the version in the sidebar and opens the about section from it', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    const about = await openAboutFromSidebar();
    expect(within(about).getByRole('heading', { name: 'O aplikácii' })).toBeDefined();
    expect(within(about).getByText('Verzia 0.1.3')).toBeDefined();
    expect(await within(about).findByText('Automatické aktualizácie')).toBeDefined();
  });

  it('checks for updates and reports that Relay is up to date', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    const about = await openAboutFromSidebar();
    const check = await enabledCheckButton(about);
    act(() => {
      fireEvent.click(check);
    });
    expect(await within(about).findByText('Máš najnovšiu verziu')).toBeDefined();
    expect(
      within(about).getByText(`Naposledy skontrolované: ${hm(desktop.time.now())}`),
    ).toBeDefined();
    expect(desktop.updater.checks).toBe(1);
  });

  it('shows the download progress and restarts into the ready update', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    const about = await openAboutFromSidebar();
    desktop.updater.publish('0.2.0');
    const check = await enabledCheckButton(about);
    act(() => {
      fireEvent.click(check);
    });
    await waitFor(() => {
      expect(desktop.updater.downloading).toBe(true);
    });
    act(() => {
      desktop.updater.progress(42);
    });
    expect(await within(about).findByText('Sťahujem verziu 0.2.0 (42 %)')).toBeDefined();
    expect(within(about).getByRole('button', { name: 'Skontrolovať aktualizácie' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(footer()).getByRole('button', { name: 'Sťahujem 42 %' })).toBeDefined();
    act(() => {
      desktop.updater.completeDownload();
    });
    expect(await within(about).findByText('Verzia 0.2.0 je pripravená')).toBeDefined();
    const update = within(footer()).getByRole('button', { name: 'Aktualizovať' });
    expect(update.className).toContain('accent');
    act(() => {
      fireEvent.click(within(about).getByRole('button', { name: 'Reštartovať a aktualizovať' }));
    });
    await waitFor(() => {
      expect(desktop.updater.installs).toBe(1);
    });
  });

  it('installs the ready update from the sidebar footer', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    desktop.updater.publish('0.2.0');
    const checking = desktop.updates.check();
    await waitFor(() => {
      expect(desktop.updater.downloading).toBe(true);
    });
    desktop.updater.completeDownload();
    await act(async () => {
      await checking;
    });
    act(() => {
      fireEvent.click(within(footer()).getByRole('button', { name: 'Aktualizovať' }));
    });
    await waitFor(() => {
      expect(desktop.updater.installs).toBe(1);
    });
  });

  it('opens the about section when the app menu asks for it', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    act(() => {
      desktop.menuCommands.request('open-about');
    });
    await waitFor(() => {
      expect(useUiStore.getState().overlay).toEqual({
        kind: 'settings',
        section: 'about',
        adding: false,
      });
    });
    expect(screen.getByRole('tabpanel', { name: 'O aplikácii' })).toBeDefined();
  });

  it('keeps an open settings section when the app menu asks for about', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'splits', adding: false } });
    });
    act(() => {
      desktop.menuCommands.request('open-about');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(useUiStore.getState().overlay).toEqual({
      kind: 'settings',
      section: 'splits',
      adding: false,
    });
  });

  it('opens the project links outside the app', async () => {
    const desktop = startDesktop();
    await renderDesktop(desktop);
    const about = await openAboutFromSidebar();
    act(() => {
      fireEvent.click(within(about).getByRole('button', { name: 'Otvoriť GitHub' }));
      fireEvent.click(within(about).getByRole('button', { name: 'Otvoriť poznámky' }));
    });
    expect(desktop.opened).toEqual([
      'https://github.com/MatusMockor/relay',
      'https://github.com/MatusMockor/relay/releases',
    ]);
  });
});
