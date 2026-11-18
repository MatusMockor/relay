// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import {
  type AppCommandWindow,
  trackBackNavigation,
} from '../../src/main/window/track-back-navigation';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createBrowserPlatform } from '../../src/renderer/src/platform/BrowserPlatform';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../src/renderer/src/platform/Platform';
import { setUi, useUiStore } from '../../src/renderer/src/state/ui-store';
import { openThreadBySubject } from '../../src/renderer/test/features-support';
import { renderApp, resetStores, storageWith } from '../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../main/in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.5',
  isPackaged: true,
  platform: 'win32',
  electronVersion: '45.3.2',
};

class FakeWindow implements AppCommandWindow {
  private listener: (event: unknown, command: string) => void = () => undefined;

  on(_event: 'app-command', listener: (event: unknown, command: string) => void): this {
    this.listener = listener;
    return this;
  }

  command(name: string): void {
    this.listener({}, name);
  }
}

let streams = 0;

const settle = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  });
};

const startDesktop = async () => {
  const window = new FakeWindow();
  const menuCommands = new MenuCommandRequests();
  trackBackNavigation(window, (command) => {
    menuCommands.request(command);
  });
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, menuCommands })),
    () => {
      streams += 1;
      return `back-${String(streams)}`;
    },
  );
  const desktop = createElectronPlatform(bridge);
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    subscribeToMenuCommands: (listener) => desktop.subscribeToMenuCommands(listener),
  };
  renderApp({ platform });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return window;
};

describe('window back command', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('closes the open thread when the mouse back button reaches the window', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      window.command('browser-backward');
    });
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBeNull();
    });
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
  });

  it('steps back once when the same press arrives as a mouse button and a window command', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      setUi({ searchOpen: true, query: 'obed' });
    });
    act(() => {
      fireEvent.mouseUp(globalThis.window, { button: 3 });
      window.command('browser-backward');
    });
    await settle();
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(useUiStore.getState().searchOpen).toBe(true);
  });

  it('ignores other window commands', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      window.command('browser-forward');
    });
    await settle();
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });
});
