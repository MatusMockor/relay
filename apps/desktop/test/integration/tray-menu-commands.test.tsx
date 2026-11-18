// @vitest-environment jsdom
import './support/node-abort-globals';
import { AccountIdSchema, type MenuCommand } from '@relay/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import { RendererView } from '../../src/main/native/renderer-view';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { selectScope } from '../../src/renderer/src/features/mail/navigation';
import { createBrowserPlatform } from '../../src/renderer/src/platform/BrowserPlatform';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../src/renderer/src/platform/Platform';
import { setUi, useUiStore } from '../../src/renderer/src/state/ui-store';
import { renderApp, resetStores, storageWith } from '../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../main/in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.5',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

const WORK = AccountIdSchema.parse('acc-efa');
const FREELANCE = AccountIdSchema.parse('acc-fl');

let streams = 0;

const startDesktop = () => {
  const menuCommands = new MenuCommandRequests();
  const view = new RendererView();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, menuCommands, rendererView: view })),
    () => {
      streams += 1;
      return `tray-${String(streams)}`;
    },
  );
  const desktop = createElectronPlatform(bridge);
  const delivered: MenuCommand[] = [];
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    subscribeToMenuCommands: (listener) =>
      desktop.subscribeToMenuCommands((command) => {
        listener(command);
        delivered.push(command);
      }),
    reportTray: (report) => {
      desktop.reportTray(report);
    },
  };
  return { menuCommands, view, delivered, platform };
};

const renderDesktop = async (desktop: ReturnType<typeof startDesktop>) => {
  renderApp({ platform: desktop.platform });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return desktop;
};

const sender = async (): Promise<string> => {
  const button = await screen.findByRole('button', { name: /^Od: / });
  return button.getAttribute('aria-label') ?? '';
};

describe('tray menu commands in the renderer', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('reports its accounts and active scope to the main process', async () => {
    const { view } = await renderDesktop(startDesktop());
    await waitFor(() => {
      expect(view.accounts().map((account) => account.id)).toContain(FREELANCE);
    });
    expect(view.accounts().find((account) => account.id === FREELANCE)).toMatchObject({
      displayName: 'Freelance',
      email: 'meno@studio.sk',
    });
    expect(view.scope()).toBe('all');
    act(() => {
      selectScope(FREELANCE);
    });
    await waitFor(() => {
      expect(view.scope()).toBe(FREELANCE);
    });
  });

  it('switches to the account picked in the tray and reports it back', async () => {
    const { menuCommands, view } = await renderDesktop(startDesktop());
    act(() => {
      menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    });
    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe(FREELANCE);
    });
    await waitFor(() => {
      expect(view.scope()).toBe(FREELANCE);
    });
  });

  it('opens a new message and the asked settings section', async () => {
    const { menuCommands } = await renderDesktop(startDesktop());
    act(() => {
      menuCommands.request({ command: 'open-settings', section: 'notifications' });
    });
    await waitFor(() => {
      expect(useUiStore.getState().overlay).toEqual({
        kind: 'settings',
        section: 'notifications',
        adding: false,
      });
    });
    act(() => {
      menuCommands.request({ command: 'compose' });
    });
    await waitFor(() => {
      expect(useUiStore.getState().overlay).toEqual({ kind: 'compose', init: {}, scope: 'all' });
    });
  });

  it('keeps a message being written when the tray asks for settings or compose', async () => {
    const { menuCommands, delivered } = await renderDesktop(startDesktop());
    const writing = { kind: 'compose', init: { subject: 'Rozpísané' }, scope: 'all' } as const;
    act(() => {
      setUi({ overlay: writing });
    });
    act(() => {
      menuCommands.request({ command: 'open-settings', section: 'accounts' });
      menuCommands.request({ command: 'compose' });
    });
    await waitFor(() => {
      expect(delivered).toEqual([
        { command: 'open-settings', section: 'accounts' },
        { command: 'compose' },
      ]);
    });
    expect(useUiStore.getState().overlay).toEqual(writing);
  });

  it('keeps the sender of an open message when the tray switches the account', async () => {
    const { menuCommands } = await renderDesktop(startDesktop());
    act(() => {
      selectScope(WORK);
    });
    act(() => {
      menuCommands.request({ command: 'compose' });
    });
    expect(await sender()).toBe('Od: eFabrica, meno@efabrica.sk. Zmeniť účet');
    act(() => {
      menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    });
    await waitFor(() => {
      expect(useUiStore.getState().scope).toBe(FREELANCE);
    });
    expect(await sender()).toBe('Od: eFabrica, meno@efabrica.sk. Zmeniť účet');
  });

  it('applies an account and a new message picked before the window listened', async () => {
    const desktop = startDesktop();
    desktop.menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    desktop.menuCommands.request({ command: 'compose' });
    await renderDesktop(desktop);
    await waitFor(() => {
      expect(desktop.delivered).toEqual([
        { command: 'select-scope', scope: FREELANCE },
        { command: 'compose' },
      ]);
    });
    expect(useUiStore.getState().scope).toBe(FREELANCE);
    expect(await sender()).toBe('Od: Freelance, meno@studio.sk. Zmeniť účet');
  });

  it('keeps the sender picked when compose was asked even if the account changes before boot ends', async () => {
    const desktop = startDesktop();
    desktop.menuCommands.request({ command: 'select-scope', scope: WORK });
    desktop.menuCommands.request({ command: 'compose' });
    desktop.menuCommands.request({ command: 'select-scope', scope: FREELANCE });
    await renderDesktop(desktop);
    await waitFor(() => {
      expect(desktop.delivered).toHaveLength(3);
    });
    expect(useUiStore.getState().scope).toBe(FREELANCE);
    expect(await sender()).toBe('Od: eFabrica, meno@efabrica.sk. Zmeniť účet');
  });
});
