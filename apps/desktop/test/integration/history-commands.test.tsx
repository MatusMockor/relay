// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../src/main/native/menu-command-requests';
import {
  type AppCommandWindow,
  trackHistoryCommands,
} from '../../src/main/window/track-history-commands';
import { type SwipeWindow, trackSwipeCommands } from '../../src/main/window/track-swipe-commands';
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

type WindowListener = (event: unknown, value: string) => void;

class FakeWindow implements AppCommandWindow, SwipeWindow {
  private readonly listeners = new Map<string, WindowListener>();

  on(event: 'app-command' | 'swipe', listener: WindowListener): this {
    this.listeners.set(event, listener);
    return this;
  }

  command(name: string): void {
    this.listeners.get('app-command')?.({}, name);
  }

  swipe(direction: string): void {
    this.listeners.get('swipe')?.({}, direction);
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
  trackHistoryCommands(window, (command) => {
    menuCommands.request(command);
  });
  trackSwipeCommands(window, (command) => {
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

describe('window history commands', () => {
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
      setUi({ searchOpen: true });
    });
    act(() => {
      fireEvent.mouseUp(globalThis.window, { button: 3 });
      window.command('browser-backward');
    });
    await settle();
    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('goes forward again after going back', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    const threadId = useUiStore.getState().openThreadId;
    act(() => {
      window.command('browser-backward');
    });
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBeNull();
    });
    act(() => {
      window.command('browser-forward');
    });
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBe(threadId);
    });
  });

  it('steps forward once when the same press arrives as a mouse button and a window command', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      setUi({ searchOpen: true });
    });
    act(() => {
      fireEvent.mouseUp(globalThis.window, { button: 3 });
    });
    act(() => {
      fireEvent.mouseUp(globalThis.window, { button: 3 });
    });
    expect(useUiStore.getState().openThreadId).toBeNull();
    act(() => {
      fireEvent.mouseUp(globalThis.window, { button: 4 });
      window.command('browser-forward');
    });
    await settle();
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(useUiStore.getState().searchOpen).toBe(false);
  });

  it('walks back and forward with the swipes a mouse sends for its side buttons on macOS', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    const threadId = useUiStore.getState().openThreadId;
    act(() => {
      window.swipe('left');
    });
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBeNull();
    });
    act(() => {
      window.swipe('right');
    });
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBe(threadId);
    });
  });

  it('ignores vertical swipes', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      window.swipe('up');
      window.swipe('down');
    });
    await settle();
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('ignores other window commands', async () => {
    const window = await startDesktop();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      window.command('browser-refresh');
    });
    await settle();
    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });
});
